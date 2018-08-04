import { omitVolatile, FindOutput } from '@ts-app/common'
import { MongoService } from '../src'
import { catchError, concatMap, map, mapTo, tap, toArray } from 'rxjs/operators'
import { of } from 'rxjs'

/* tslint:disable:rxjs-no-unsafe-scope */
describe('MongoService', async () => {
  const localUrl = 'mongodb://localhost:27017'
  let mongoService: MongoService

  type TestData = {
    id: string
    name: string
    age: number
  }

  const createTestData$ = () => {
    const data = [
      { name: 'ali', age: 12 },
      { name: 'bobby', age: 13 },
      { name: 'chelsea', age: 9 },
      { name: 'george', age: 14 },
      { name: 'don', age: 14 },
      { name: 'alan', age: 25 },
      { name: 'faye', age: 7 },
      { name: 'haley', age: 18 }
    ]

    // --- create test data
    return of(...data).pipe(
      concatMap(user => mongoService.create('test', user)),
      toArray()
    )
  }

  beforeEach(done => {
    mongoService = new MongoService(localUrl)
    mongoService.dropCollection('test').pipe(
      // just ignore if cannot drop
      catchError(() => {
        return of(null)
      })
    ).subscribe(() => done())
  })

  afterEach(done => mongoService.close().subscribe(() => done()))

  test('crud', done => {
    type DocSchema = {
      id: string
      title: string
      description: string
    }

    // --- create
    mongoService.create<DocSchema>('test', {
      title: 'test 123',
      description: 'test 123'
    }).pipe(
      map(id => {
        expect(id.length).toBe(24)
        return id
      }),

      // --- read
      concatMap(id => mongoService.get<DocSchema>('test', id).pipe(
        map(doc => ({ doc, id }))
        )
      ),
      map(({ doc, id }) => {
        expect(doc!.id).toBe(id)
        expect(doc!.title).toBe('test 123')
        return id
      }),

      // --- update
      concatMap(id => {
        return mongoService.update('test', id, {
          $set: {
            title: 'changed 456'
          }
        }).pipe(mapTo(id))
      }),
      // TODO: assert update...
      concatMap((id) => mongoService.get<DocSchema>('test', id)),
      map(doc => {
        expect(doc!.title).toBe('changed 456')
        expect(doc!.description).toBe('test 123')
        return doc!.id
      }),

      // -- delete
      concatMap(id => mongoService.remove('test', id)),
      map(deleteResult => {
        expect(deleteResult).toBe(1)
      })
    ).subscribe(() => {
      expect.assertions(6)
      done()
    })
  })

  test('remove() invalid ID', done => {
    mongoService.remove('test', null as any).pipe(
      catchError(e => {
        expect(e).toEqual('Invalid ID or filter')
        return of(null)
      })
    )
      .subscribe(() => {
        expect.assertions(1)
        done()
      })
  })

  test('collectionExist()', done => {
    mongoService.dropCollection('test-collection').pipe(
      // ignore error, just proceed
      catchError(() => of(null)),
      concatMap(() => mongoService.collectionExist('test-collection')),
      map(exist => expect(exist).toBe(false)),
      concatMap(() => mongoService.create('test-collection', { sample: 123 })),
      concatMap(() => mongoService.collectionExist('test-collection'))
    ).subscribe(exist => {
      expect(exist).toBe(true)
      expect.assertions(2)
      done()
    })
  })

  test('get() with options', done => {
    type DocSchema = { name: string, description: string }

    mongoService.create<DocSchema>('test', { name: 'abc', description: 'def' }).pipe(
      // get all fields
      concatMap(() => mongoService.get<DocSchema>('test', { name: 'abc' })),
      map(get => {
        expect(get!.name).toBe('abc')
        expect(get!.description).toBe('def')
      }),

      // only projected fields
      concatMap(() => mongoService.get<DocSchema>('test',
        { name: 'abc' },
        {
          fields: {
            description: 1
          }
        }
      )),
      map(get => {
        expect(get!.name).toBeUndefined()
        expect(get!.description).toBe('def')
      })
    ).subscribe(() => {
      expect.assertions(4)
      done()
    })
  })

  test('create() empty document', done => {
    mongoService.create('test', {})
      .subscribe(
        id => expect(id.length).toBe(24),
        undefined,
        () => {
          expect.assertions(1)
          done()
        }
      )
  })

  test('find() sort, query word starts/ends with', done => {
    // --- create test data
    createTestData$().pipe(
      // --- sort by age, name
      concatMap(() => mongoService.find('test',
        {
          sort: [
            { field: 'age', asc: true },
            { field: 'name', asc: true }
          ],
          project: { _id: 0 }
        }
      )),
      tap(val => expect(val.docs).toMatchSnapshot()),

      // --- sort by age, name desc
      concatMap(() => mongoService.find('test',
        {
          sort: [
            { field: 'age', asc: false },
            { field: 'name', asc: false }
          ],
          project: { _id: 0 }
        }
      )),
      tap(val => expect(val.docs).toMatchSnapshot()),

      // --- query word ends with
      concatMap(() => mongoService.find('test',
        {
          q: 'y',
          project: { _id: 0 }
        },
        [ 'name' ]
      )),
      tap(val => expect(val.docs).toMatchSnapshot()),

      // --- query word starts with
      concatMap(() => mongoService.find('test',
        {
          q: 'f',
          project: { _id: 0 }
        },
        [ 'name' ]
      )),
      tap(val => expect(val.docs).toMatchSnapshot())
    ).subscribe(
      undefined,
      undefined,
      () => {
        expect.assertions(4)
        done()
      }
    )
  })

  test('find() limit, paging with cursor', done => {
    // --- get page 1
    createTestData$().pipe(
      // --- limit page 1 to 3 documents
      concatMap(() => mongoService.find<TestData>('test',
        {
          limit: 3
        }
      )),
      map(val => {
        expect(val.docs.length).toBe(3)
        expect(val.cursor).toBeTruthy()
        return val.cursor
      }),

      // --- get page 2 (with all results)
      concatMap(cursor => mongoService.find<TestData>('test',
        {
          limit: 100,
          cursor,
          project: { _id: 0 }
        })),
      tap(val => expect(val.docs).toMatchSnapshot())
    ).subscribe(
      undefined,
      undefined,
      () => {
        expect.assertions(3)
        done()
      }
    )
  })

  test('find() paging with sorting', done => {
    const removeIdFromDocs = (docs: FindOutput<TestData>) => ({
      ...docs,
      docs: docs.docs.map(doc => omitVolatile(doc))
    })

    const sort = [
      { field: 'name', asc: false }
    ]

    createTestData$().pipe(
      // --- paging with sorting
      concatMap(() => mongoService.find<TestData>('test', {
        limit: 3, sort
      })),
      tap(find => {
        expect(removeIdFromDocs(find).docs).toMatchSnapshot()
        expect(find.cursor.length > 0).toBeTruthy()
      }),
      concatMap(find => mongoService.find<TestData>('test', {
        limit: 3, sort,
        cursor: find.cursor
      })),
      tap(find => {
        expect(removeIdFromDocs(find).docs).toMatchSnapshot()
        expect(find.cursor.length > 0).toBeTruthy()
      }),
      concatMap(find => mongoService.find<TestData>('test', {
        limit: 3, sort,
        cursor: find.cursor
      })),
      tap(find => {
        expect(removeIdFromDocs(find).docs).toMatchSnapshot()
        expect(find.cursor.length > 0).toBeTruthy()
      }),
      concatMap(find => mongoService.find<TestData>('test', {
        limit: 3, sort,
        cursor: find.cursor
      })),
      tap(find => {
        expect(removeIdFromDocs(find).docs).toMatchSnapshot()
        expect(find.cursor).toBeFalsy()
      }),
      // this should cause a 'Error decoding cursor' error log
      concatMap(() => mongoService.find<TestData>('test', {
        limit: 3, sort,
        cursor: 'bad cursor should start from the top'
      })),
      tap(find => {
        expect(removeIdFromDocs(find).docs).toMatchSnapshot()
        expect(find.cursor.length > 0).toBeTruthy()
      })
    ).subscribe(() => {
      expect.assertions(10)
      done()
    })
  })
})

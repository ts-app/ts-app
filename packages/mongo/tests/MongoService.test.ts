import { MongoService } from '../src'
import { catchError, concatMap, map, mapTo } from 'rxjs/operators'
import { of } from 'rxjs'
import { BusinessError } from '../../common/dist'

describe('MongoService', async () => {
  const localUrl = 'mongodb://localhost:27017'
  let mongoService: MongoService

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
      id: '',
      title: 'test 123',
      description: 'test 123'
    }).pipe(
      map<{ error: BusinessError, id?: string }, string>(createResult => {
        expect(createResult.id!.length).toBe(24)
        return createResult.id!
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

  test('create() with null', done => {
    mongoService.create('test', null)
      .subscribe(
        undefined,
        (e: TypeError) => {
          expect(e.message).toMatchSnapshot()
          expect.assertions(1)
          done()
        },
        () => {
          fail('Should not be completing!')
          done()
        }
      )
  })
})

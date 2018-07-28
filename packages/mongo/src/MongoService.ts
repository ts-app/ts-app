import { FindInput, FindOutput, LogService } from '@ts-app/common'
import { Observable, from, of, throwError } from 'rxjs'
import {
  Collection, Cursor, Db, DeleteWriteOpResultObject, FindOneOptions, MongoClient, ObjectId
} from 'mongodb'
import { concatMap, map, mapTo } from 'rxjs/operators'
import { escapeRegex } from '../../common/dist'

/**
 * Returns an object where read/write to "id" property is mapped to Mongo's Object ID.
 */
const toMongoDoc = (doc: any) => {
  if (doc._id !== undefined) {
    return {
      ...doc,
      get id () {
        return doc._id ? doc._id.toString() : undefined
      },
      set id (id: string) {
        this._id = new ObjectId(id)
      }
    }
  } else {
    return doc
  }
}

/**
 * MongoService provides to access MongoDB via promise based functions for common usage patterns such as CRUD and pagination via cursor.
 */
export class MongoService {
  private _db?: Db
  private client!: MongoClient

  constructor (private mongoUrl: string,
               private logService?: LogService) {
  }

  create<T> (collectionName: string, doc: Pick<T, Exclude<keyof T, 'id'>>): Observable<string> {
    return this.collection(collectionName).pipe(
      concatMap(collection => collection.insertOne(doc)),
      concatMap(result => {
        if (result.result.n !== 1) {
          return throwError(`Error creating document in collection [${collectionName}]`)
        } else {
          return of(result.insertedId.toString())
        }
      })
    )
  }

  get<T> (collectionName: string, idOrFilter: string | object, options?: FindOneOptions): Observable<T | null> {
    return this.collection(collectionName).pipe(
      concatMap(collection => {
        // if idOrFilter is string, place it in an object with key of _id
        let filter: any
        if (typeof idOrFilter === 'string') {
          filter = { _id: new ObjectId(idOrFilter) }
        } else {
          filter = idOrFilter
        }

        return collection.findOne(filter, options)
      }),
      map(doc => doc ? toMongoDoc(doc) : null)
    )
  }

  cursor<T> (collectionName: string, query: object): Observable<Cursor<T>> {
    return this.collection(collectionName).pipe(
      map(collection => collection.find(query))
    )
  }

  update (collectionName: string, id: string, update: object): Observable<null> {
    return this.collection(collectionName).pipe(
      concatMap(collection => collection.updateOne({ _id: new ObjectId(id) }, update)),
      concatMap(result => {
        if (result.result.ok !== 1) {
          return throwError(`Error updating document [${id}] in collection [${collectionName}]`)
        } else {
          return of(null)
        }
      })
    )
  }

  remove (collectionName: string, idOrFilter: string | object): Observable<number> {
    if (!idOrFilter) {
      return throwError('Invalid ID or filter')
    }

    return this.collection(collectionName).pipe(
      concatMap(collection => {
        let deleteById = false
        let filter: any
        if (typeof idOrFilter === 'string') {
          filter = { _id: new ObjectId(idOrFilter) }
          deleteById = true
        } else {
          filter = idOrFilter
        }

        if (deleteById) {
          return collection.deleteOne(filter)
        } else {
          return collection.deleteMany(filter)
        }
      }),
      map((result: DeleteWriteOpResultObject | DeleteWriteOpResultObject) => {
        return result.result.n || 0
      })
    )
  }

  collection (collectionName: string): Observable<Collection> {
    return this.db().pipe(
      map((db: Db) => db.collection(collectionName))
    )
  }

  count (collectionName: string): Observable<number> {
    return this.collection(collectionName).pipe(
      concatMap(collection => collection.count())
    )
  }

  dropCollection (collectionName: string): Observable<boolean> {
    return this.collection(collectionName).pipe(
      concatMap((collection: Collection) => collection.drop())
    )
  }

  collectionExist (collectionName: string): Observable<boolean> {
    return this.db().pipe(
      concatMap(db => db.collections()),
      map(collections => !!collections.find(c => c.collectionName === collectionName))
    )
  }

  db (): Observable<Db> {
    if (!this._db) {
      // TODO: parameterize options
      return from(MongoClient.connect(this.mongoUrl)).pipe(
        map(client => this.updateClient(client))
      )
    } else {
      return of(this._db)
    }
  }

  close (): Observable<null> {
    if (this.client) {
      return from(this.client.close()).pipe(mapTo(null))
    } else {
      return of(null)
    }
  }

  findWithCursor<T> (
    collectionName: string, filter: object, limit: number = 10, cursor?: string,
    sort?: { field: string, asc: boolean }[], project?: object): Observable<FindOutput<T>> {
    return this.collection(collectionName).pipe(
      concatMap((collection: Collection) => {
        let filterWithCursor = filter
        if (cursor) {
          filterWithCursor = {
            ...filterWithCursor,
            _id: { $gt: new ObjectId(cursor) }
          }
        }

        let mongoCursor = collection
          .find(filterWithCursor)
          .limit(limit)

        // sort is parsed before passing to sort()
        if (sort) {
          const sortObject = sort.reduce((acc, current) => {
            acc[ current.field ] = current.asc ? 1 : -1
            return acc
          }, {} as any)
          mongoCursor = mongoCursor.sort(sortObject)
        }

        // project is passed directly to Mongo
        if (project) {
          mongoCursor = mongoCursor.project(project)
        }

        this.debug({
          filterWithCursor,
          sort,
          project,
          limit
        })

        return mongoCursor.toArray()
      }),
      map(docs => {
        const mongoDocs = docs.map(doc => toMongoDoc(doc))
        const lastDoc = mongoDocs.length > 0 ? mongoDocs[ mongoDocs.length - 1 ] : null

        return {
          cursor: lastDoc ? lastDoc.id : null,
          docs: mongoDocs
        }
      })
    )
  }

  find<T> (input: FindInput, collectionName: string, findBy: string[], defaultSort?: { field: string, asc: boolean }[]) {
    let filter = {}
    let { sort } = input
    const { q, limit, cursor, project } = input
    if (q && q.trim().length > 0) {
      filter = {
        $or: [
          ...[ findBy.map(name => {
            // why "input.q!"?
            // reason: https://github.com/cartant/rxjs-tslint-rules/issues/54
            return { [ name ]: { $regex: `^${escapeRegex(input.q!)}`, $options: 'i' } }
          }) ]
        ]
      }
    }

    // if sort is not specified in input, determine default sort
    // if default sort is not specified, derive from first findBy field
    if (!sort) {
      if (!defaultSort && findBy.length > 0) {
        defaultSort = [ { field: findBy[ 0 ], asc: true } ]
      }
      sort = defaultSort
    }

    return this.findWithCursor<T>(collectionName, filter, limit, cursor, sort, project)
  }

  private updateClient (client: MongoClient) {
    this.client = client
    this._db = client.db()
    return this._db
  }

  private debug (message: string | object) {
    if (this.logService) {
      this.logService.debug(message)
    }
  }
}

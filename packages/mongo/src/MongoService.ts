import { FindOutput } from '@ts-app/common'
import { Observable, from, of, throwError } from 'rxjs'
import {
  Collection, Cursor, Db, DeleteWriteOpResultObject, FindOneOptions, MongoClient, ObjectId
} from 'mongodb'
import { concatMap, map, mapTo } from 'rxjs/operators'

/**
 * MongoService provides to access MongoDB via promise based functions for common usage patterns such as CRUD and pagination via cursor.
 */
export class MongoService {
  private mongoUrl: string
  private _db?: Db
  private client!: MongoClient

  constructor (mongoUrl: string) {
    this.mongoUrl = mongoUrl
  }

  static mapMongoId<T> (o: any): T {
    if (Array.isArray(o)) {
      o = o.map(doc => {
        doc.id = doc._id.toString()
        return doc
      })
    } else {
      o.id = o._id.toString()
    }
    return o
  }

  create<T = object> (collectionName: string, doc: T): Observable<string> {
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
    let filter: any
    if (typeof idOrFilter === 'string') {
      filter = { _id: new ObjectId(idOrFilter) }
    } else {
      filter = idOrFilter
    }

    return this.collection(collectionName).pipe(
      concatMap(collection => collection.findOne(filter, options)),
      map(doc => doc ? MongoService.mapMongoId(doc) : null)
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

  findWithCursor<T> (collectionName: string, filter: object, limit: number = 10, cursor?: string): Observable<FindOutput<T>> {
    let filterWithCursor = filter
    if (cursor) {
      filterWithCursor = {
        ...filterWithCursor,
        _id: { $gt: new ObjectId(cursor) }
      }
    }

    return this.collection(collectionName).pipe(
      concatMap((collection: Collection) => collection.find(filterWithCursor).limit(limit).toArray()),
      map(docs => {
        const newCursor = docs.length > 0 ? docs[ docs.length - 1 ][ '_id' ] : null
        return {
          cursor: newCursor === null ? null : newCursor.toString(),
          docs: MongoService.mapMongoId<T[]>(docs)
        }
      })
    )
  }

  private updateClient (client: MongoClient) {
    this.client = client
    this._db = client.db()
    return this._db
  }
}

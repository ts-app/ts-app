import * as bcryptjs from 'bcryptjs'
import { SecurityService } from './SecurityService'
import { of, Observable, from, throwError } from 'rxjs'
import {
  ofBusinessError,
  escapeRegex,
  validateEmail,
  User,
  BusinessError,
  FindInput,
  FindOutput,
  UserProfile
} from '@ts-app/common'
import { MongoService } from '@ts-app/mongo'
import { concatMap, map, mapTo } from 'rxjs/operators'

export class MongoSecurityService extends SecurityService {
  constructor (private mongoService: MongoService) {
    super()
  }

  signUp (input: { email: string; password: string }): Observable<{ user?: User; error?: BusinessError }> {
    if (!validateEmail(input.email)) {
      return ofBusinessError('Invalid email')
    }

    return this.mongoService.get('users', { 'emails.email': input.email }).pipe(
      concatMap(emailExist => {
        if (emailExist) {
          return ofBusinessError('User already exist')
        } else {
          return from(bcryptjs.hash(input.password, 8)).pipe(
            concatMap(bcrypt => {
              const makeUser = (bcrypt: string) => ({
                creationDate: new Date(),
                services: {
                  password: { bcrypt }
                },
                emails: [
                  {
                    email: input.email,
                    verified: true
                  }
                ],
                profile: {
                  email: input.email,
                  displayName: input.email.substr(0, input.email.indexOf('@'))
                }
              })
              return this.mongoService.create<Partial<User>>('users', makeUser(bcrypt))
            }),
            concatMap(id => this.mongoService.get('users', id)),
            map(user => user ? { user: user } : { error: `Error loading user [${input.email}]` })
          )
        }
      })
    )
  }

  loginWithEmailPassword (input: { email: string, password: string }):
    Observable<{ user?: User, accessToken?: string, refreshToken?: string, error?: BusinessError }> {
    const filter = {
      emails: {
        email: input.email,
        verified: true
      }
    }

    return this.mongoService.get<User>('users', filter).pipe(
      concatMap(user => {
        const userBcrypt = user && user.services && user.services.password && user.services.password.bcrypt
        if (userBcrypt) {
          return from(bcryptjs.compare(input.password, userBcrypt)).pipe(
            map(passwordMatch => ({ passwordMatch, user }))
          )
        } else {
          return throwError('User password is not set.')
        }
      }),
      concatMap<{ passwordMatch: boolean, user: User }, { user: User }>(({ passwordMatch, user }) => {
        if (passwordMatch) {
          return of({ user })
        } else {
          return ofBusinessError('Invalid login attempt')
        }
      })
    )
  }

  user (id: string): Observable<User | null> {
    return this.mongoService.get<User>('users', id)
  }

  users (input: FindInput): Observable<FindOutput<User>> {
    const { q, limit = 10, cursor } = input
    let filter = {}
    if (q && q.trim().length > 0) {
      filter = {
        $or: [
          { 'profile.email': { $regex: `^${escapeRegex(q)}`, $options: 'i' } },
          { 'profile.email': { $regex: `${escapeRegex(q)}$`, $options: 'i' } },

          { 'profile.displayName': { $regex: `^${escapeRegex(q)}`, $options: 'i' } },
          { 'profile.displayName': { $regex: `${escapeRegex(q)}$`, $options: 'i' } }
        ]
      }
    }

    return this.mongoService.findWithCursor('users', filter, limit, cursor)
  }

  removeUser (id: string): Observable<null> {
    return this.mongoService.remove('users', id).pipe(mapTo(null))
  }

  seedUsers (input?: { force?: boolean; userCount?: number }): Observable<null> {
    return of(null)
  }

  updateProfile<T extends UserProfile> (input: { id: string; profile: T }): Observable<null> {
    const profileWithPrefix = Object.keys(input.profile).reduce((p, key) => {
      p[ `profile.${key}` ] = (input.profile as any)[ key ]
      return p
    }, {} as any)

    return this.mongoService.update('users', input.id, {
      $set: {
        ...profileWithPrefix
      }
    })
  }

  reset (): Observable<null> {
    return this.mongoService.findWithCursor<User>('users', {
      'emails.email': 'admin@test.local'
    }).pipe(
      concatMap(users => {
        if (users.docs.length === 0) {
          return throwError('Pre-requisite to reset not met')
        }

        return this.mongoService.dropCollection('users').pipe(mapTo(null))
      })
    )
  }
}
import * as bcryptjs from 'bcryptjs'
import { SecurityService } from './SecurityService'
import { of, Observable, from, throwError, range } from 'rxjs'
import {
  makeTimestampable,
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
import { concatMap, map, mapTo, toArray } from 'rxjs/operators'
import { TokenService } from './TokenService'
import { UserRefreshTokenRepository } from './UserRefreshTokenRepository'

export class MongoSecurityService extends SecurityService {
  constructor (private mongoService: MongoService,
               private tokenService: TokenService,
               private userRefreshTokenRepository: UserRefreshTokenRepository) {
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
                ...makeTimestampable(),
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
              return this.mongoService.create('users', makeUser(bcrypt))
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
          return this.generateAndRegisterToken(user)
        } else {
          return ofBusinessError('Invalid login attempt')
        }
      })
    )
  }

  /**
   * User login via refresh token.
   */
  loginWithRefreshToken (refreshToken: string): Observable<{ user?: User; accessToken?: string; refreshToken?: string }> {
    return of(null).pipe(
      // --- make sure refresh token is valid and has not expired
      map(() => this.tokenService.verify(refreshToken)),
      // --- make sure token is registered in repository
      concatMap(decodedToken => this.userRefreshTokenRepository.getTokens(decodedToken.userId).pipe(
        concatMap(userTokens => userTokens.has(refreshToken) ?
          of(decodedToken) :
          throwError('Refresh token is not registered or has been revoked.'))
      )),
      // --- load user based on token's user ID
      concatMap(decodedToken => this.mongoService.get<User>('users', decodedToken.userId).pipe(
        concatMap(user => user ? of(user) :
          throwError(`User [${decodedToken.userId}] does not exist`)
        )
      )),
      // --- generate new access token & refresh token for user, and update user token repository
      concatMap(user => this.generateAndRegisterToken(user))
    )
  }

  user (id: string): Observable<User | null> {
    return this.mongoService.get<User>('users', id)
  }

  users (input: FindInput): Observable<FindOutput<User>> {
    let filter = {}
    let { sort } = input
    const { q, limit, cursor, project } = input
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

    if (!sort) {
      sort = [ { field: 'profile.displayName', asc: true } ]
    }

    return this.mongoService.findWithCursor('users', filter, limit, cursor, sort, project)
  }

  userByEmail (email: string): Observable<User | null> {
    const filter = {
      emails: {
        $elemMatch: {
          email
        }
      }
    }

    return this.mongoService.get<User>('users', filter)
  }

  removeUser (id: string): Observable<null> {
    return this.mongoService.remove('users', id).pipe(mapTo(null))
  }

  seedUsers (input: { force?: boolean; userCount?: number }): Observable<null> {
    return of(input.force).pipe(
      // --- if forced, remove any existing seeded test users
      concatMap(force => {
        if (force) {
          return this.mongoService.remove('users', {
            $or: [
              { 'emails.email': { $regex: 'user[0-9]+@test\.local' } },
              { 'emails.email': 'admin@test.local' }
            ]
          })
        }
        return of(null)
      }),
      // --- prevent seeding if users exist (force just remove previously seeded users)
      concatMap(() => this.mongoService.count('users')),
      concatMap(userCount => userCount > 0 ? throwError('Cannot seed database with users') : of(null)),
      // --- seed users
      // create admin
      concatMap(() => this.signUp({ email: 'admin@test.local', password: 'testAdmin' })),
      // throw error if admin sign up error
      concatMap(signUp => signUp.error ? throwError(signUp.error) : of(null)),
      // seed 10 users
      concatMap(() => range(1, 10)),
      concatMap(no => this.signUp({
        email: `user${no}@test.local`,
        password: `testUser${no}`
      })),
      // throw error if user sign up error
      concatMap(signUp => {
        return signUp.error ? throwError(signUp.error) : of(null)
      }),
      toArray(),
      mapTo(null)
    )
  }

  updateProfile<T extends UserProfile> (input: { id: string; profile: Partial<T> }): Observable<null> {
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

  private makeTokenPayload (user: User) {
    return {
      emails: user.emails,
      profile: user.profile,
      roles: user.roles
    }
  }

  private generateAndRegisterToken (user: User) {
    const newToken = this.tokenService.generateUserToken(user.id, this.makeTokenPayload(user))
    return this.userRefreshTokenRepository.register(user.id, newToken.refreshToken).pipe(
      mapTo({
        user,
        accessToken: newToken.accessToken,
        refreshToken: newToken.refreshToken
      })
    )
  }
}

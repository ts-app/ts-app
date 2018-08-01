import { omitVolatile, User } from '@ts-app/common'
import { MongoService } from '@ts-app/mongo'
import { of } from 'rxjs'
import { catchError, concatMap, tap, mergeMap, toArray, mapTo } from 'rxjs/operators'
import { MongoSecurityService, SecurityService } from '../src'

describe('MongoSecurityService', async () => {
  const localUrl = 'mongodb://localhost:27017'
  let mongoService: MongoService
  let securityService: SecurityService

  // --- create test users
  const createTestUsers$ = (displayNames: string[] = [
    'bob',
    'cat',
    'dan',
    'david',
    'edwin',
    'faye'
  ]) => {
    return of(...displayNames).pipe(
      mergeMap(name => securityService.signUp({
        email: `${name}@test.local`,
        password: 'abc123'
      }), 5),
      toArray()
    )
  }

  const omitVolatileUser = (user: User) => {
    const clone = omitVolatile(user)
    delete clone.services.password.bcrypt
    return clone
  }

  beforeEach(done => {
    mongoService = new MongoService(localUrl)
    securityService = new MongoSecurityService(mongoService)
    of('users').pipe(
      concatMap(collection => mongoService.dropCollection(collection)),
      catchError(e => {
        // just ignore if cannot drop
        console.debug(e)
        return of(null)
      })
    ).subscribe(
      undefined,
      e => console.error(e),
      () => done()
    )
  })

  afterEach(done => mongoService.close().subscribe(() => done()))

  test('user sign up & login with email/password (via bcrypt)', done => {
    const emailPassword = { email: 'test@test.com', password: 'abc123' }
    const badLogin = { email: 'test@test.com', password: 'abc123!' }

    // --- user sign up
    securityService.signUp(emailPassword).pipe(
      tap(signUp => {
        expect(signUp.error).toBeFalsy()
        const bcrypt = signUp.user!.services.password.bcrypt
        expect(bcrypt.length > 0).toBeTruthy()
        expect(omitVolatileUser(signUp.user!)).toMatchSnapshot()
      }),

      // --- bad login
      concatMap(() => securityService.loginWithEmailPassword(badLogin)),
      tap(login => expect(login).toMatchSnapshot()),

      // --- good login
      concatMap(() => securityService.loginWithEmailPassword(emailPassword)),
      tap(login => {
        // TODO: assert tokens
        expect(login.error).toBeFalsy()
        expect(omitVolatileUser(login.user!)).toMatchSnapshot()
      }),

      concatMap(login => securityService.user(login.user!.id)),
      tap(user => expect(omitVolatileUser(user!)).toMatchSnapshot()),

      // --- sign up for user that already exist
      concatMap(() => securityService.signUp(emailPassword)),
      tap(signUp => expect(signUp).toMatchSnapshot())
    ).subscribe(() => {
      expect.assertions(8)
      done()
    })
  })

  test('user sign up with invalid email', done => {
    securityService.signUp({
      email: 'bob',
      password: '123'
    }).pipe(
      tap(signUp => expect(signUp).toMatchSnapshot())
    ).subscribe(() => {
      expect.assertions(1)
      done()
    })
  })

  test('find users', done => {
    createTestUsers$().pipe(
      // --- default find behavior
      concatMap(() => securityService.users({})),
      tap(val => expect(val.docs.map(user => omitVolatileUser(user))).toMatchSnapshot()),
      // --- find users name that starts/ends with 'n', sort ascending
      concatMap(() => securityService.users({
        q: 'n',
        sort: [
          { field: 'profile.displayName', asc: true }
        ],
        project: {
          'profile.displayName': 1,
          _id: 0
        }
      })),
      tap(val => expect(val.docs).toMatchSnapshot()),
      // --- find users name that starts/ends with 'n', sort decending
      concatMap(() => securityService.users({
        q: 'n',
        sort: [
          { field: 'profile.displayName', asc: false }
        ],
        project: {
          'profile.displayName': 1,
          _id: 0
        }
      })),
      tap(val => expect(val.docs).toMatchSnapshot())
    ).subscribe(() => {
      expect.assertions(3)
      done()
    })
  })

  test('remove user', done => {
    createTestUsers$().pipe(
      concatMap(users => {
        expect(users.length).toBe(6)
        return of(...users)
      }),
      concatMap(user => securityService.removeUser(user.user!.id)),
      toArray(),
      concatMap(() => securityService.users({})),
      tap(docs => expect(docs).toMatchSnapshot())
    ).subscribe(() => {
      done()
    })
  })

  test('update profile', done => {
    createTestUsers$([ 'bob' ]).pipe(
      concatMap(users => {
        const user = users[ 0 ].user!
        expect(omitVolatileUser(user)).toMatchSnapshot()
        return securityService.updateProfile({
          id: user.id,
          profile: {
            displayName: 'Bobby'
          }
        }).pipe(mapTo(user.id))
      }),
      concatMap(userId => securityService.user(userId)),
      tap(user => expect(omitVolatileUser(user!)).toMatchSnapshot())
    ).subscribe(() => {
      expect.assertions(2)
      done()
    })
  })

  test('seed users', done => {
    // --- can seed users
    securityService.seedUsers({}).pipe(
      concatMap(() => securityService.users({})),
      tap(users => expect(users.docs.map(user => omitVolatileUser(user))).toMatchSnapshot()),

      // cannot re-seed users
      concatMap(() => securityService.seedUsers({})),
      catchError(e => {
        expect(e).toBe('Cannot seed database with users')
        return of(null)
      }),

      // can force re-seed of users
      concatMap(() => securityService.seedUsers({ force: true })),
      tap(val => expect(val).toBeNull())
    ).subscribe(() => {
      expect.assertions(3)
      done()
    })
  })

  test('reset users', done => {
    // cannot reset empty collection
    securityService.reset().pipe(
      catchError(e => {
        expect(e).toBe('Pre-requisite to reset not met')
        return of(null)
      }),
      // ok to reset users when pre-requisite met (i.e. has seed users)
      concatMap(() => securityService.seedUsers({})),
      concatMap(() => securityService.reset()),
      tap(reset => expect(reset).toBeNull()),

      // cannot reset users if it contains non-seeded users
      concatMap(() => createTestUsers$([ 'bob' ])),
      concatMap(() => securityService.reset()),
      catchError(e => {
        expect(e).toBe('Pre-requisite to reset not met')
        return of(null)
      })
    ).subscribe(() => {
      expect.assertions(3)
      done()
    })
  })
})

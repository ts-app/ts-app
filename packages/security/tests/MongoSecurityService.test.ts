import { MongoService } from '@ts-app/mongo'
import { of } from 'rxjs'
import { catchError, concatMap, tap } from 'rxjs/operators'
import { MongoSecurityService, SecurityService } from '../src'
import { omitVolatile } from '../../common/src'

describe('MongoSecurityService', async () => {
  const localUrl = 'mongodb://localhost:27017'
  let mongoService: MongoService
  let securityService: SecurityService

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
        delete signUp.user!.services.password.bcrypt
        expect(omitVolatile(signUp.user!)).toMatchSnapshot()
      }),

      // --- bad login
      concatMap(() => securityService.loginWithEmailPassword(badLogin)),
      tap(login => expect(login).toMatchSnapshot()),

      // --- good login
      concatMap(() => securityService.loginWithEmailPassword(emailPassword)),
      tap(login => {
        // TODO: assert tokens
        expect(login.error).toBeFalsy()
        delete login.user!.services.password.bcrypt
        expect(omitVolatile(login.user!)).toMatchSnapshot()
      }),

      concatMap(login => securityService.user(login.user!.id)),
      tap(user => {
        delete user!.services.password.bcrypt
        expect(omitVolatile(user!)).toMatchSnapshot()
      }),

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
})

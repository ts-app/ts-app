import { of } from 'rxjs'
import { tap, map, delay, finalize } from 'rxjs/operators'
import { TokenService } from '../src/TokenService'
import { TokenExpiredError } from 'jsonwebtoken'

describe('TokenService', () => {
  const service = new TokenService('just-a-key', 'just-a-key')

  it('can generate and verify tokens', () => {
    const token = service.generateUserToken('bob-id', { user: 'bob' })
    const verifiedAccessToken = service.verify(token.accessToken)
    expect(verifiedAccessToken.payload[ 'user' ]).toEqual('bob')
    const verifiedRefreshToken = service.verify(token.refreshToken)
    expect(verifiedRefreshToken.payload[ 'user' ]).toEqual('bob')
  })

  it('can generate new access token from refresh token', done => {
    of(null).pipe(
      map(() => service.generateUserToken(
        'bob-id',
        { user: 'bob' },
        { accessTokenExpiresIn: '1s' }
      )),
      delay(1100),
      map(token => {
        const verifiedRefreshToken = service.verify(token.refreshToken)
        return service.generateUserToken(verifiedRefreshToken.userId, verifiedRefreshToken.payload)
      }),
      tap(token => {
        expect(service.verify(token.accessToken).payload[ 'user' ]).toEqual('bob')
        expect(service.verify(token.accessToken).userId).toEqual('bob-id')
      }),
      finalize(() => done())
    ).subscribe(
      undefined,
      e => {
        throw new Error(e)
      }
    )
  })

  it('will not validate expired token', done => {
    of(null).pipe(
      map(() => service.generateUserToken(
        'bob-id',
        { user: 'bob' },
        { accessTokenExpiresIn: '1s' }
      )),
      delay(1100),
      tap(token => service.verify(token.accessToken)),
      finalize(() => {
        expect.assertions(1)
        done()
      })
    ).subscribe(
      undefined,
      e => expect(e).toBeInstanceOf(TokenExpiredError))
  })
})

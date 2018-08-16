import * as crypto from 'crypto'
import * as jwt from 'jsonwebtoken'

type VerifyPayload = {
  payload: any
  userId: string
  exp: number
  iat: number
  jti: number
}
type GenerateOptions = {
  secretOrPrivateKey?: string
  accessTokenExpiresIn?: string
  refreshTokenExpiresIn?: string
}
type VerifyOptions = {
  secretOrPublicKey?: string
}

export class TokenService {
  constructor (
    private secretOrPrivateKey: string,
    private secretOrPublicKey: string,
    private accessTokenExpiresIn = '10m',
    private refreshTokenExpiresIn = '30d') {

  }

  generateUserToken (userId: string, payload: { [ key: string ]: any }, options: GenerateOptions = {}) {
    const secretOrKey = options.secretOrPrivateKey || this.secretOrPrivateKey
    const accessTokenExpiresIn = options.accessTokenExpiresIn || this.accessTokenExpiresIn
    const refreshTokenExpiresIn = options.refreshTokenExpiresIn || this.refreshTokenExpiresIn

    const accessToken = jwt.sign({ payload, userId }, secretOrKey, {
      expiresIn: accessTokenExpiresIn,
      jwtid: this.uuid()
    })
    const refreshToken = jwt.sign({ payload, userId }, secretOrKey, {
      expiresIn: refreshTokenExpiresIn,
      jwtid: this.uuid()
    })

    return { accessToken, refreshToken }
  }

  verify (token: string, options: VerifyOptions = {}) {
    return jwt.verify(token, options.secretOrPublicKey || this.secretOrPublicKey) as VerifyPayload
  }

  private uuid () {
    return crypto.randomBytes(16).toString('hex')
  }
}

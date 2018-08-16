import { of } from 'rxjs'
import { UserRefreshTokenRepository } from './UserRefreshTokenRepository'

export class InMemoryUserRefreshTokenRepository extends UserRefreshTokenRepository {
  tokens: {
    [ key: string ]: Set<string>
  } = {}

  register (userId: string, refreshToken: string) {
    if (!this.tokens[ userId ]) {
      this.tokens[ userId ] = new Set()
    }

    this.tokens[ userId ].add(refreshToken)
    return of(null)
  }

  getTokens (userId: string) {
    if (!this.tokens[ userId ]) {
      this.tokens[ userId ] = new Set()
    }

    return of(this.tokens[ userId ])
  }

  clearTokens (userId?: string) {
    if (!userId) {
      this.tokens = {}
    } else {
      const userTokens = this.tokens[ userId ]
      if (userTokens) {
        userTokens.clear()
      }
    }
    return of(null)
  }
}

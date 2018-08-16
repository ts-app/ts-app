import { Observable } from 'rxjs'

export abstract class UserRefreshTokenRepository {
  abstract register (userId: string, refreshToken: string): Observable<null>

  abstract getTokens (userId: string): Observable<Set<string>>

  abstract clearTokens (userId?: string): Observable<null>
}

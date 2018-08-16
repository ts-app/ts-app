import { Observable } from 'rxjs'
import { User, UserProfile, BusinessError, FindInput, FindOutput } from '@ts-app/common'

export abstract class SecurityService {
  abstract signUp (input: { email: string, password: string }): Observable<{
    user?: User
    error?: BusinessError
  }>

  abstract loginWithEmailPassword (input: { email: string, password: string }): Observable<{
    user?: User
    accessToken?: string
    refreshToken?: string
    error?: BusinessError
  }>

  abstract loginWithRefreshToken (refreshToken: string): Observable<{
    user?: User
    accessToken?: string
    refreshToken?: string
  }>

  abstract user (id: string): Observable<User | null>

  abstract users (input: FindInput): Observable<FindOutput<User>>

  abstract userByEmail (email: string): Observable<User | null>

  abstract removeUser (id: string): Observable<null>

  abstract seedUsers (input: {
    force?: boolean
    userCount?: number
  }): Observable<null>

  abstract updateProfile<T extends UserProfile> (input: {
    id: string
    profile: Partial<T>
  }): Observable<null>

  abstract reset (): Observable<null>
}

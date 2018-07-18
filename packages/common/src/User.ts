import { Timestampable } from './Timestampable'
import { UserProfile } from './UserProfile'

export interface User<T = UserProfile> extends Timestampable {
  id: string
  emails: {
    email: string
    verified: boolean
  }[]
  profile: T
  roles: {
    role: string
    group: string
  }[]
  services: {
    password: {
      bcrypt: string
    }
  }
}

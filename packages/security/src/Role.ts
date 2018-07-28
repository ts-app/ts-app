import { Timestampable } from '@ts-app/common'

export interface Role extends Timestampable {
  id: string
  name: string
}

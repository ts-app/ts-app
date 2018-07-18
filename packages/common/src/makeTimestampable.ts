import { Timestampable } from './Timestampable'

/**
 * Returns an Timestampable object based on current date.
 */
export const makeTimestampable = (): Timestampable => {
  const now = new Date()
  return {
    creationDate: now,
    modifiedDate: now
  }
}

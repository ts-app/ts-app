/**
 * A convenience function to omit volatile keys. This function was created to ease snapshot testing.
 */
export const omitVolatile = (
  obj: { [ key: string ]: any },
  keysToOmit: string[] = [
    'id', '_id',
    'creationDate',
    'modifiedDate'
  ]) => {
  const clone = { ...obj }
  keysToOmit.map(key => delete clone[ key ])
  return clone
}

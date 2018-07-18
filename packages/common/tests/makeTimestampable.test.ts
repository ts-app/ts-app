import { makeTimestampable } from '../src'

describe('makeTimestampable', () => {
  it('can create object', () => {
    const obj = makeTimestampable()
    expect(obj.creationDate instanceof Date).toBeTruthy()
    expect(obj.modifiedDate instanceof Date).toBeTruthy()
  })
})

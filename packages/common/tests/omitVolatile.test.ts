import { makeTimestampable, omitVolatile } from '../src'

describe('omitVolatile', () => {
  it('by default, can omit id, creationDate and modifiedDate', () => {
    const src = {
      _id: 123,
      id: 123,
      ...makeTimestampable(),
      name: 'bob',
      amount: 123
    }
    expect(omitVolatile(src)).toEqual({
      name: 'bob',
      amount: 123
    })
  })
})

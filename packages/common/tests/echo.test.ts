import { echo } from '../src'

describe('echo', () => {
  it('echo hello', () => {
    expect(echo('hello')).toEqual('>>> hello')
  })
})

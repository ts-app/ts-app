import { ofBusinessError } from '../src'

describe('ofBusinessError', () => {
  it('works', done => {
    ofBusinessError('bob').subscribe(
      val => expect(val).toMatchSnapshot(),
      undefined,
      () => done()
    )
  })
})

import { deserialize, serialize } from '../src'

describe('serialize() & deserialize() in various modes', () => {
  it('works', () => {
    const source = {
      dob: new Date(1990, 10, 12, 10, 20, 30),
      name: 'bob',
      height: 123,
      weight: 50.88
    }

    let data = serialize(source)
    expect(data).toEqual('{"dob":"1990-11-12T02:20:30.000Z","name":"bob","height":123,"weight":50.88}')
    expect(data.length).toBe(75)
    expect(deserialize(data)).toEqual(source)

    data = serialize(source, { mode: 'compress' })
    expect(data.length).toBe(38)
    expect(deserialize(data, { mode: 'decompress' })).toEqual(source)

    data = serialize(source, { mode: 'compressToBase64' })
    expect(data.length).toBe(104)
    expect(deserialize(data, { mode: 'decompressToBase64' })).toEqual(source)

    data = serialize(source, { mode: 'compressToEncodedURIComponent' })
    expect(data.length).toBe(102)
    expect(deserialize(data, { mode: 'decompressToEncodedURIComponent' })).toEqual(source)

    data = serialize(source, { mode: 'compressToUTF16' })
    expect(data.length).toBe(42)
    expect(deserialize(data, { mode: 'decompressToUTF16' })).toEqual(source)
  })
})

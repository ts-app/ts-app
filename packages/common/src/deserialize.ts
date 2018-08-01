import * as LZString from 'lz-string'

export function deserialize (data: any, options?: {
  mode:
    'direct' |
    'decompress' |
    'decompressToUTF16' |
    'decompressToBase64' |
    'decompressToEncodedURIComponent'
}) {
  const reviver = (key: any, data: any) => {
    if (typeof data === 'string' && /^\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d.\d\d\dZ$/.test(data)) {
      return new Date(data)
    }
    return data
  }

  const mode = options && options.mode || 'direct'
  let val: any

  switch (mode) {
    case 'direct':
      val = data
      break
    case 'decompress':
      val = LZString.decompress(data)
      break
    case 'decompressToUTF16':
      val = LZString.decompressFromUTF16(data)
      break
    case 'decompressToBase64':
      val = LZString.decompressFromBase64(data)
      break
    case 'decompressToEncodedURIComponent':
      val = LZString.decompressFromEncodedURIComponent(data)
      break
    default:
      throw new Error(`Unknown deserialization mode [${mode}]`)
  }

  return JSON.parse(val, reviver)
}

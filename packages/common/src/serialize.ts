import * as LZString from 'lz-string'

export function serialize (data: any, options?: {
  mode:
    'direct' |
    'compress' |
    'compressToUTF16' |
    'compressToBase64' |
    'compressToEncodedURIComponent'
}) {
  const mode = options && options.mode || 'direct'
  const stringData = JSON.stringify(data)

  switch (mode) {
    case 'direct':
      return stringData
    case 'compress':
      return LZString.compress(stringData)
    case 'compressToUTF16':
      return LZString.compressToUTF16(stringData)
    case 'compressToBase64':
      return LZString.compressToBase64(stringData)
    case 'compressToEncodedURIComponent':
      return LZString.compressToEncodedURIComponent(stringData)
    default:
      throw new Error(`Unknown serialization mode [${mode}]`)
  }
}

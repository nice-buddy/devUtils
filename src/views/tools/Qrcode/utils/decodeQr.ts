import jsQR from 'jsqr'

export interface QrImageData {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface QrDecodeResult {
  text: string
  version: number
  bytes: number
}

export function decodeQr(image: QrImageData): QrDecodeResult | null {
  const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })
  if (!result || !result.data) return null
  return {
    text: result.data,
    version: result.version,
    bytes: new TextEncoder().encode(result.data).length
  }
}

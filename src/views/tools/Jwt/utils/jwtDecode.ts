export interface DecodedJwt {
  header: Record<string, any>
  payload: Record<string, any>
  rawHeader: string
  rawPayload: string
  rawSignature: string
  signingInput: string
}

const decoder = new TextDecoder()

export function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeJwt(token: string): { value?: DecodedJwt; error?: string } {
  const parts = token.trim().split('.')
  if (parts.length !== 3) return { error: 'JWT 必须由 3 段组成（header.payload.signature）' }
  const [rawHeader, rawPayload, rawSignature] = parts
  let header: Record<string, any>
  let payload: Record<string, any>
  try {
    header = JSON.parse(decoder.decode(base64UrlToBytes(rawHeader)))
  } catch {
    return { error: 'Header 不是合法的 base64url JSON' }
  }
  try {
    payload = JSON.parse(decoder.decode(base64UrlToBytes(rawPayload)))
  } catch {
    return { error: 'Payload 不是合法的 base64url JSON' }
  }
  return {
    value: {
      header,
      payload,
      rawHeader,
      rawPayload,
      rawSignature,
      signingInput: `${rawHeader}.${rawPayload}`
    }
  }
}

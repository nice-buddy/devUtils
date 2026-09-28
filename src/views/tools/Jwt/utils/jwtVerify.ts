import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { base64UrlToBytes, bytesToBase64Url } from './jwtDecode'

const encoder = new TextEncoder()

// PKCS#1 v1.5 里 SHA-256 的 DigestInfo 前缀
const SHA256_DIGEST_INFO_PREFIX = new Uint8Array([
  0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20
])

function secretBytes(secret: string, isBase64: boolean): Uint8Array {
  if (!isBase64) return encoder.encode(secret)
  const binary = atob(secret.trim())
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function hmacSign(signingInput: string, secret: string, secretIsBase64: boolean): string {
  const mac = hmac(sha256, secretBytes(secret, secretIsBase64), encoder.encode(signingInput))
  return bytesToBase64Url(mac)
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

export function verifyHs256(signingInput: string, signature: string, secret: string, secretIsBase64: boolean): boolean {
  try {
    const expected = hmac(sha256, secretBytes(secret, secretIsBase64), encoder.encode(signingInput))
    return timingSafeEqual(expected, base64UrlToBytes(signature))
  } catch {
    return false
  }
}

interface RsaJwk {
  kty?: string
  n: string
  e: string
  kid?: string
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)
  return value
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length)
  let rest = value
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = Number(rest & 0xffn)
    rest >>= 8n
  }
  return out
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n
  let b = base % modulus
  let e = exponent
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus
    b = (b * b) % modulus
    e >>= 1n
  }
  return result
}

function pickJwk(publicKeyJson: string, kid?: string): { jwk?: RsaJwk; error?: string } {
  let parsed: any
  try {
    parsed = JSON.parse(publicKeyJson)
  } catch {
    return { error: '公钥不是合法 JSON' }
  }
  const candidates: RsaJwk[] = Array.isArray(parsed?.keys) ? parsed.keys : [parsed]
  const rsa = candidates.filter(k => k && typeof k.n === 'string' && typeof k.e === 'string')
  if (!rsa.length) return { error: '公钥里没有 RSA JWK（需要 n 与 e）' }
  if (kid) {
    const matched = rsa.find(k => k.kid === kid)
    if (matched) return { jwk: matched }
  }
  return { jwk: rsa[0] }
}

export function verifyRs256(
  signingInput: string,
  signature: string,
  publicKeyJson: string,
  kid?: string
): { valid: boolean; error?: string } {
  const { jwk, error } = pickJwk(publicKeyJson, kid)
  if (!jwk) return { valid: false, error }
  try {
    const n = bytesToBigInt(base64UrlToBytes(jwk.n))
    const e = bytesToBigInt(base64UrlToBytes(jwk.e))
    const sig = base64UrlToBytes(signature)
    const s = bytesToBigInt(sig)
    if (s >= n) return { valid: false }
    const m = bigIntToBytes(modPow(s, e, n), sig.length)
    const digest = sha256(encoder.encode(signingInput))
    const minLength = 2 + 8 + 1 + SHA256_DIGEST_INFO_PREFIX.length + digest.length
    if (m.length < minLength) return { valid: false }
    if (m[0] !== 0x00 || m[1] !== 0x01) return { valid: false }
    const separator = m.length - 1 - digest.length - SHA256_DIGEST_INFO_PREFIX.length
    if (separator - 2 < 8) return { valid: false }
    for (let i = 2; i < separator; i += 1) {
      if (m[i] !== 0xff) return { valid: false }
    }
    if (m[separator] !== 0x00) return { valid: false }
    for (let i = 0; i < SHA256_DIGEST_INFO_PREFIX.length; i += 1) {
      if (m[separator + 1 + i] !== SHA256_DIGEST_INFO_PREFIX[i]) return { valid: false }
    }
    for (let i = 0; i < digest.length; i += 1) {
      if (m[separator + 1 + SHA256_DIGEST_INFO_PREFIX.length + i] !== digest[i]) return { valid: false }
    }
    return { valid: true }
  } catch {
    return { valid: false, error: '公钥解析失败' }
  }
}

import { sha256 } from '@noble/hashes/sha2.js'
import { md5 } from '@noble/hashes/legacy.js'

export interface ParsedPublicKey {
  line: number
  type: string
  bits?: number
  curve?: string
  comment: string
  rawLine: string
  sha256: string
  md5: string
}

export interface SshParseIssue {
  line: number
  message: string
}

export interface SshParseResult {
  keys: ParsedPublicKey[]
  issues: SshParseIssue[]
}

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/

const CURVE_BITS: Record<string, number> = {
  nistp256: 256,
  nistp384: 384,
  nistp521: 521
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

// 读取 SSH wire format 的长度前缀字符串
function readField(bytes: Uint8Array, offset: number): { value: Uint8Array; next: number } {
  if (offset + 4 > bytes.length) throw new Error('密钥数据在读取长度时截断')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = view.getUint32(offset)
  const start = offset + 4
  const end = start + length
  if (end > bytes.length) throw new Error('密钥数据在读取字段时截断')
  return { value: bytes.subarray(start, end), next: end }
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function describeKey(blob: Uint8Array): { type: string; bits?: number; curve?: string } {
  const typeField = readField(blob, 0)
  const type = decodeText(typeField.value)
  const offset = typeField.next

  if (type === 'ssh-rsa') {
    const exponent = readField(blob, offset)
    const modulus = readField(blob, exponent.next)
    let value = modulus.value
    while (value.length > 1 && value[0] === 0) value = value.subarray(1)
    return { type, bits: value.length * 8 }
  }

  if (type === 'ssh-ed25519') {
    const key = readField(blob, offset)
    if (key.value.length !== 32) throw new Error('ED25519 公钥长度异常')
    return { type }
  }

  if (type.startsWith('ecdsa-sha2-')) {
    const curveField = readField(blob, offset)
    const point = readField(blob, curveField.next)
    const curve = decodeText(curveField.value)
    if (point.value.length === 0) throw new Error('ECDSA 公钥点为空')
    return { type, curve, bits: CURVE_BITS[curve] }
  }

  if (type === 'sk-ssh-ed25519@openssh.com') {
    const key = readField(blob, offset)
    if (key.value.length !== 32) throw new Error('SK ED25519 公钥长度异常')
    return { type }
  }

  if (type === 'sk-ecdsa-sha2-nistp256@openssh.com') {
    const curveField = readField(blob, offset)
    const curve = decodeText(curveField.value)
    return { type, curve, bits: CURVE_BITS[curve] }
  }

  throw new Error(`不支持的密钥类型 ${type}`)
}

export function fingerprintSha256(blob: Uint8Array): string {
  return `SHA256:${bytesToBase64(sha256(blob)).replace(/=+$/, '')}`
}

export function fingerprintMd5(blob: Uint8Array): string {
  const digest = md5(blob)
  const hex = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join(':')
  return `MD5:${hex}`
}

export function parsePublicKeys(text: string): SshParseResult {
  const keys: ParsedPublicKey[] = []
  const issues: SshParseIssue[] = []

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#')) return

    const tokens = trimmed.split(/\s+/)
    // 用「像 base64 的 token」定位 blob，这样带空格的 options 前缀（如 command="..."）也不会错位
    const blobIndex = tokens.findIndex(token => token.length > 16 && BASE64_RE.test(token))
    if (blobIndex <= 0) {
      issues.push({ line, message: '无法识别的公钥行：缺少 base64 密钥数据' })
      return
    }

    const declaredType = tokens[blobIndex - 1]
    try {
      const blob = base64ToBytes(tokens[blobIndex])
      const described = describeKey(blob)
      if (described.type !== declaredType) {
        throw new Error(`声明的类型 ${declaredType} 与密钥数据 ${described.type} 不一致`)
      }
      keys.push({
        line,
        type: described.type,
        bits: described.bits,
        curve: described.curve,
        comment: tokens.slice(blobIndex + 1).join(' '),
        rawLine: trimmed,
        sha256: fingerprintSha256(blob),
        md5: fingerprintMd5(blob)
      })
    } catch (err) {
      issues.push({ line, message: err instanceof Error ? err.message : '解析失败' })
    }
  })

  return { keys, issues }
}

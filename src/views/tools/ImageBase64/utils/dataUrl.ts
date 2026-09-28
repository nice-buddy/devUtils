import { base64ToBytes, bytesToBase64 } from '@/utils/base64'

export { base64ToBytes, bytesToBase64 }

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/

export function toDataUrl(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`
}

export function parseDataUrl(input: string): { mime?: string; base64: string; error?: string } {
  const text = input.trim()
  if (!text) return { base64: '', error: '请输入 DataURL 或 Base64' }
  let mime: string | undefined
  let payload = text
  if (text.startsWith('data:')) {
    const comma = text.indexOf(',')
    if (comma < 0) return { base64: '', error: 'DataURL 缺少逗号分隔符' }
    const meta = text.slice(5, comma)
    if (!meta.includes('base64')) return { base64: '', error: '仅支持 base64 编码的 DataURL' }
    mime = meta.split(';')[0] || undefined
    payload = text.slice(comma + 1)
  }
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  if (!payload || !BASE64_RE.test(padded)) return { base64: '', error: 'Base64 内容非法' }
  try {
    base64ToBytes(padded)
  } catch {
    return { base64: '', error: 'Base64 解码失败' }
  }
  return { mime, base64: padded }
}

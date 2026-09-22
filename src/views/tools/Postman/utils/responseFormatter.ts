import { LosslessJSON } from '@/views/tools/JsonSuite/utils/losslessJson'

export const LARGE_RESPONSE_THRESHOLD_BYTES = 1024 * 1024 // 1MB

/**
 * 格式化 HTTP 响应文本
 * 采用 LosslessJSON 解析，确保 19 位雪花数值字面量与纳秒时间戳 100% 精度不丢失
 * 若数据超过 1MB 阈值，则跳过繁重的 AST 解析以保护主线程流畅度
 */
export function formatResponseBody(body: string, isLarge: boolean = false): string {
  if (!body) return ''
  if (isLarge || body.length > LARGE_RESPONSE_THRESHOLD_BYTES) return body

  const trimmed = body.trim()
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      const parsed = LosslessJSON.parse(trimmed)
      return LosslessJSON.stringify(parsed, null, 2)
    } catch {
      return body
    }
  }
  return body
}

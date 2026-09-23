import { LosslessJSON } from '@/views/tools/JsonSuite/utils/losslessJson'

export interface JsonParseResult {
  value: unknown
  error?: string
}

export function parseJsonSource(text: string): JsonParseResult {
  if (!text.trim()) return { value: null }
  try {
    return { value: LosslessJSON.parse(text) }
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message : 'JSON 语法错误' }
  }
}

export function stringifyJsonSource(value: unknown): string {
  return LosslessJSON.stringify(value, null, 2)
}

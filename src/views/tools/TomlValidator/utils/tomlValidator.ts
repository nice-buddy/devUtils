import { parseTomlSource, stringifyTomlSource } from '@/utils/tomlAdapter'

export interface TomlValidateResult {
  valid: boolean
  error?: string
  line?: number
  column?: number
  output: string
}

export function validateToml(text: string): TomlValidateResult {
  if (!text.trim()) return { valid: true, output: '' }

  const outcome = parseTomlSource(text)
  if (outcome.error) {
    return {
      valid: false,
      error: outcome.error.message,
      line: outcome.error.line,
      column: outcome.error.column,
      output: ''
    }
  }
  try {
    return { valid: true, output: stringifyTomlSource(outcome.value) }
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'TOML 序列化失败',
      output: ''
    }
  }
}

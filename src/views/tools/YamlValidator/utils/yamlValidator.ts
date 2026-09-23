import { parseYamlSource, stringifyYamlSource } from '@/utils/yamlAdapter'

export type YamlOutputMode = 'pretty' | 'compact'

export interface YamlValidateResult {
  valid: boolean
  error?: string
  line?: number
  column?: number
  warnings: string[]
  output: string
}

export function validateYaml(text: string, mode: YamlOutputMode = 'pretty'): YamlValidateResult {
  const outcome = parseYamlSource(text)
  if (outcome.error) {
    return {
      valid: false,
      error: outcome.error.message,
      line: outcome.error.line,
      column: outcome.error.column,
      warnings: outcome.warnings,
      output: ''
    }
  }
  if (!text.trim()) return { valid: true, warnings: outcome.warnings, output: '' }
  return {
    valid: true,
    warnings: outcome.warnings,
    output: stringifyYamlSource(outcome.value, mode)
  }
}

import { parseYamlSource, stringifyYamlSource } from '@/utils/yamlAdapter'

export interface YamlParseResult {
  value: unknown
  error?: string
  line?: number
  column?: number
  warnings: string[]
}

export function parseYaml(text: string): YamlParseResult {
  const outcome = parseYamlSource(text)
  if (outcome.error) {
    return {
      value: null,
      error: outcome.error.message,
      line: outcome.error.line,
      column: outcome.error.column,
      warnings: outcome.warnings
    }
  }
  return { value: outcome.value, warnings: outcome.warnings }
}

export function stringifyYaml(value: unknown): string {
  return stringifyYamlSource(value, 'pretty')
}

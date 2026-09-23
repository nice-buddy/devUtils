import { parseProperties, stringifyProperties } from './properties'
import { parseJsonSource, stringifyJsonSource } from './jsonConvert'
import { parseYaml, stringifyYaml } from './yamlConvert'

export type SourceFormat = 'json' | 'yaml' | 'properties'

export interface ConvertOutcome {
  json: string
  yaml: string
  properties: string
  error?: string
  warnings: string[]
}

export const EMPTY_CONVERT_OUTCOME: ConvertOutcome = {
  json: '',
  yaml: '',
  properties: '',
  warnings: []
}

export function formatIssue(message: string, line?: number, column?: number): string {
  if (line === undefined) return message
  return column === undefined ? `第 ${line} 行：${message}` : `第 ${line} 行第 ${column} 列：${message}`
}

export function convertFrom(source: SourceFormat, text: string): ConvertOutcome {
  if (!text.trim()) return { ...EMPTY_CONVERT_OUTCOME, warnings: [] }

  let value: unknown = null
  const warnings: string[] = []

  if (source === 'json') {
    const parsed = parseJsonSource(text)
    if (parsed.error) return { ...EMPTY_CONVERT_OUTCOME, error: parsed.error, warnings }
    value = parsed.value
  } else if (source === 'yaml') {
    const parsed = parseYaml(text)
    warnings.push(...parsed.warnings)
    if (parsed.error) {
      return { ...EMPTY_CONVERT_OUTCOME, error: formatIssue(parsed.error, parsed.line, parsed.column), warnings }
    }
    value = parsed.value
  } else {
    const parsed = parseProperties(text)
    warnings.push(...parsed.warnings)
    if (parsed.error) return { ...EMPTY_CONVERT_OUTCOME, error: parsed.error, warnings }
    value = parsed.value
  }

  try {
    return {
      json: stringifyJsonSource(value),
      yaml: stringifyYaml(value),
      properties: stringifyProperties(value),
      warnings
    }
  } catch (err) {
    return {
      ...EMPTY_CONVERT_OUTCOME,
      error: err instanceof Error ? err.message : '转换失败',
      warnings
    }
  }
}

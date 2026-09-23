import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml'
import type { ParseIssue } from './yamlAdapter'

export interface TomlParseOutcome {
  value: unknown
  error?: ParseIssue
}

interface TomlErrorLike {
  message?: string
  line?: number
  column?: number
}

function toIssue(raw: unknown): ParseIssue {
  const err = raw as TomlErrorLike
  return {
    message: (err?.message ?? 'TOML 解析失败').split('\n')[0],
    line: typeof err?.line === 'number' ? err.line : undefined,
    column: typeof err?.column === 'number' ? err.column : undefined
  }
}

export function parseTomlSource(text: string): TomlParseOutcome {
  if (!text.trim()) return { value: null }
  try {
    return { value: tomlParse(text) }
  } catch (err) {
    return { value: null, error: toIssue(err) }
  }
}

export function stringifyTomlSource(value: unknown): string {
  return tomlStringify(value as Record<string, unknown>).trimEnd()
}

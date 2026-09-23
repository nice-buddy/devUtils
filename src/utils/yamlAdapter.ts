import { LineCounter, parseAllDocuments, stringify as yamlStringify, visit } from 'yaml'

export interface ParseIssue {
  message: string
  line?: number
  column?: number
}

export interface YamlParseOutcome {
  value: unknown
  error?: ParseIssue
  warnings: string[]
}

interface YamlErrorLike {
  message?: string
  linePos?: { line?: number; col?: number }[]
}

// 只有这些标准 tag 能被无损映射到 JSON。`!!binary` / `!!set` / `!custom` 之类
// 由库静默解析成 Buffer / Set / 未知对象，必须在这里显式拦下。
const JSON_SAFE_TAGS = new Set([
  'tag:yaml.org,2002:null',
  'tag:yaml.org,2002:bool',
  'tag:yaml.org,2002:int',
  'tag:yaml.org,2002:float',
  'tag:yaml.org,2002:str',
  'tag:yaml.org,2002:timestamp'
])

function toIssue(raw: unknown): ParseIssue {
  const err = raw as YamlErrorLike
  const pos = err?.linePos?.[0]
  return {
    message: (err?.message ?? 'YAML 解析失败').split('\n')[0],
    line: pos?.line,
    column: pos?.col
  }
}

function findUnsupportedTag(doc: Parameters<typeof visit>[0], lineCounter: LineCounter): ParseIssue | undefined {
  let issue: ParseIssue | undefined
  const check = (node: { tag?: unknown; range?: readonly number[] | null } | null | undefined) => {
    if (issue || !node) return
    const tag = node.tag
    if (typeof tag !== 'string' || JSON_SAFE_TAGS.has(tag)) return
    const pos = lineCounter.linePos(node.range?.[0] ?? 0)
    issue = {
      message: `不支持的 YAML tag ${tag}，无法转换为 JSON`,
      line: pos.line,
      column: pos.col
    }
  }
  visit(doc, {
    Scalar: (_key, node) => check(node),
    Collection: (_key, node) => check(node)
  })
  return issue
}

// 宽松模式：把库解析出的 Date 统一降级为 ISO 字符串，并记录被改写的路径。
function normalizeDates(value: unknown, path: string, warnings: string[]): unknown {
  if (value instanceof Date) {
    warnings.push(`${path || '根节点'} 是日期时间，已转为 ISO 8601 字符串`)
    return value.toISOString()
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeDates(item, `${path}[${index}]`, warnings))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = normalizeDates(item, path ? `${path}.${key}` : key, warnings)
    }
    return out
  }
  return value
}

export function parseYamlSource(text: string): YamlParseOutcome {
  const warnings: string[] = []
  if (!text.trim()) return { value: null, warnings }

  const lineCounter = new LineCounter()
  let docs: ReturnType<typeof parseAllDocuments>
  try {
    docs = parseAllDocuments(text, { intAsBigInt: true, lineCounter })
  } catch (err) {
    return { value: null, error: toIssue(err), warnings }
  }
  if (docs.length === 0) return { value: null, warnings }
  if (docs.length > 1) warnings.push(`输入包含 ${docs.length} 个文档，仅解析第一个`)

  const doc = docs[0]
  if (doc.errors.length > 0) {
    return { value: null, error: toIssue(doc.errors[0]), warnings }
  }
  const tagIssue = findUnsupportedTag(doc, lineCounter)
  if (tagIssue) return { value: null, error: tagIssue, warnings }
  for (const warning of doc.warnings) warnings.push(warning.message)

  const raw = doc.toJS()
  return { value: normalizeDates(raw, '', warnings), warnings }
}

export function stringifyYamlSource(value: unknown, mode: 'pretty' | 'compact' = 'pretty'): string {
  if (mode === 'compact') return yamlStringify(value, { collectionStyle: 'flow' }).trimEnd()
  return yamlStringify(value, { indent: 2 }).trimEnd()
}

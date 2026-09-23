export interface PropertiesParseResult {
  value: unknown
  error?: string
  warnings: string[]
}

interface Segment {
  key: string
  index?: number
}

interface Entry {
  segments: Segment[]
  value: string
}

function unescapeKey(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (ch === '\\' && i + 1 < raw.length && (raw[i + 1] === '.' || raw[i + 1] === '\\')) {
      out += raw[i + 1]
      i += 1
      continue
    }
    out += ch
  }
  return out
}

function escapeKey(key: string): string {
  return key.replace(/\\/g, '\\\\').replace(/\./g, '\\.')
}

function unescapeValue(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (ch !== '\\' || i + 1 >= raw.length) {
      out += ch
      continue
    }
    const next = raw[i + 1]
    if (next === 'n') out += '\n'
    else if (next === 'r') out += '\r'
    else if (next === 't') out += '\t'
    else if (next === '\\') out += '\\'
    else out += next
    i += 1
  }
  return out
}

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/([=:#!])/g, '\\$1')
}

// 把 a.b[0].c 拆成 [{key:'a'},{key:'b'},{index:0},{key:'c'}]；
// 纯数字段（a.0.b）同样按索引处理。
function parseKeyPath(rawKey: string): Segment[] {
  const segments: Segment[] = []
  let buffer = ''
  let i = 0
  const flush = () => {
    if (!buffer) return
    const text = unescapeKey(buffer)
    buffer = ''
    if (/^\d+$/.test(text)) segments.push({ key: '', index: Number(text) })
    else segments.push({ key: text })
  }
  while (i < rawKey.length) {
    const ch = rawKey[i]
    if (ch === '\\' && i + 1 < rawKey.length) {
      buffer += ch + rawKey[i + 1]
      i += 2
      continue
    }
    if (ch === '.') {
      flush()
      i += 1
      continue
    }
    if (ch === '[') {
      const close = rawKey.indexOf(']', i + 1)
      const indexText = close < 0 ? '' : rawKey.slice(i + 1, close)
      if (/^\d+$/.test(indexText)) {
        flush()
        segments.push({ key: '', index: Number(indexText) })
        i = close + 1
        continue
      }
    }
    buffer += ch
    i += 1
  }
  flush()
  return segments
}

function findSeparator(line: string): number {
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '\\') {
      i += 1
      continue
    }
    if (ch === '=' || ch === ':') return i
  }
  return -1
}

function buildFromEntries(entries: Entry[]): { value: unknown; error?: string } {
  const root: Record<string, unknown> = {}
  for (const entry of entries) {
    let node: any = root
    for (let i = 0; i < entry.segments.length; i += 1) {
      const seg = entry.segments[i]
      const isLast = i === entry.segments.length - 1
      const nextIsIndex = entry.segments[i + 1]?.index !== undefined

      if (seg.index !== undefined) {
        if (!Array.isArray(node)) return { value: null, error: '键路径冲突：数组索引出现在非数组位置' }
        if (isLast) {
          node[seg.index] = entry.value
          break
        }
        if (node[seg.index] === undefined) node[seg.index] = nextIsIndex ? [] : {}
        else if (typeof node[seg.index] !== 'object' || node[seg.index] === null) {
          return { value: null, error: `键路径冲突：${seg.index} 既是标量又是对象` }
        }
        node = node[seg.index]
        continue
      }

      const key = seg.key
      if (isLast) {
        const existing = node[key]
        if (existing !== undefined && typeof existing === 'object' && existing !== null) {
          return { value: null, error: `键路径冲突：${key} 既是标量又是对象` }
        }
        node[key] = entry.value
        break
      }
      if (node[key] === undefined) node[key] = nextIsIndex ? [] : {}
      else if (typeof node[key] !== 'object' || node[key] === null) {
        return { value: null, error: `键路径冲突：${key} 既是标量又是对象` }
      }
      node = node[key]
    }
  }
  return { value: root }
}

export function parseProperties(text: string): PropertiesParseResult {
  const warnings: string[] = []
  if (!text.trim()) return { value: {}, warnings }

  const entries: Entry[] = []
  let commentCount = 0
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#') || trimmed.startsWith('!')) {
      commentCount += 1
      continue
    }
    const sep = findSeparator(trimmed)
    const rawKey = sep < 0 ? trimmed : trimmed.slice(0, sep)
    const rawValue = sep < 0 ? '' : trimmed.slice(sep + 1).trim()
    entries.push({ segments: parseKeyPath(rawKey.trim()), value: unescapeValue(rawValue) })
  }
  if (commentCount > 0) warnings.push(`已忽略 ${commentCount} 行注释`)

  const built = buildFromEntries(entries)
  return built.error ? { value: null, error: built.error, warnings } : { value: built.value, warnings }
}

function walk(node: unknown, prefix: string, lines: string[]): void {
  if (node === null || typeof node !== 'object') {
    if (!prefix) return
    lines.push(`${prefix}=${escapeValue(node === null || node === undefined ? '' : String(node))}`)
    return
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => walk(item, `${prefix}[${index}]`, lines))
    return
  }
  const entries = Object.entries(node as Record<string, unknown>)
  if (entries.length === 0) {
    if (prefix) lines.push(`${prefix}=`)
    return
  }
  for (const [key, item] of entries) {
    const next = prefix ? `${prefix}.${escapeKey(key)}` : escapeKey(key)
    walk(item, next, lines)
  }
}

export function stringifyProperties(value: unknown): string {
  const lines: string[] = []
  walk(value, '', lines)
  return lines.join('\n')
}

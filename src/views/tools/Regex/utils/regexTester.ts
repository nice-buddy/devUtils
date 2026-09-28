export interface RegexGroup {
  name?: string
  index: number
  value: string | undefined
}

export interface RegexMatch {
  index: number
  value: string
  groups: RegexGroup[]
}

export interface RegexRunResult {
  matches: RegexMatch[]
  truncated: boolean
  error?: string
}

export const DEFAULT_MATCH_LIMIT = 5000

export function compileRegex(pattern: string, flags: string): { regex?: RegExp; error?: string } {
  if (!pattern) return { error: '请输入正则表达式' }
  try {
    return { regex: new RegExp(pattern, flags) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '正则表达式非法' }
  }
}

function collectGroups(match: RegExpExecArray): RegexGroup[] {
  const groups: RegexGroup[] = []
  for (let i = 1; i < match.length; i += 1) {
    groups.push({ index: i, value: match[i] })
  }
  if (match.groups) {
    for (const [name, value] of Object.entries(match.groups)) {
      groups.push({ name, index: -1, value })
    }
  }
  return groups
}

// 高亮与匹配列表始终按全局语义迭代：未勾 g 时内部补 g；
// 勾了粘性 y 时保持粘性语义（不补 g），遇到第一个不连续匹配即停止。
function toIterationRegex(regex: RegExp): RegExp {
  if (regex.flags.includes('y')) return new RegExp(regex.source, regex.flags)
  if (regex.flags.includes('g')) return new RegExp(regex.source, regex.flags)
  return new RegExp(regex.source, regex.flags + 'g')
}

export function runMatches(text: string, regex: RegExp, limit = DEFAULT_MATCH_LIMIT): RegexRunResult {
  if (!text) return { matches: [], truncated: false }
  const re = toIterationRegex(regex)
  const matches: RegexMatch[] = []
  let truncated = false
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    matches.push({ index: match.index, value: match[0], groups: collectGroups(match) })
    // 零长度匹配必须手动前进，否则 lastIndex 不变会死循环
    if (match[0] === '') re.lastIndex += 1
    if (matches.length >= limit) {
      truncated = true
      break
    }
  }
  return { matches, truncated }
}

export function applyReplace(text: string, regex: RegExp, replacement: string): string {
  return text.replace(toIterationRegex(regex), replacement)
}

export function buildSegments(text: string, matches: RegexMatch[]): { text: string; matchIndex: number }[] {
  const segments: { text: string; matchIndex: number }[] = []
  let cursor = 0
  matches.forEach((match, index) => {
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index), matchIndex: -1 })
    }
    if (match.value.length > 0) {
      segments.push({ text: match.value, matchIndex: index })
    }
    cursor = match.index + match.value.length
  })
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), matchIndex: -1 })
  }
  return segments
}

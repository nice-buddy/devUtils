export type SortMode = 'none' | 'asc' | 'desc'

export interface LineOptions {
  trimEdge: boolean
  dropBlank: boolean
  dedupe: boolean
  sort: SortMode
  ignoreCase: boolean
  prefix: string
  suffix: string
}

export interface LineResult {
  lines: string[]
  text: string
  inputCount: number
  outputCount: number
}

export const DEFAULT_LINE_OPTIONS: LineOptions = {
  trimEdge: true,
  dropBlank: true,
  dedupe: false,
  sort: 'none',
  ignoreCase: false,
  prefix: '',
  suffix: ''
}

// 固定管道：切行（兼容 CRLF）→ trimEdge → dropBlank → dedupe → sort → 拼接前后缀。
export function processLines(input: string, options: LineOptions): LineResult {
  const rawLines = input ? input.split(/\r?\n/) : []
  const inputCount = rawLines.length
  let lines = [...rawLines]
  if (options.trimEdge) lines = lines.map(line => line.trim())
  if (options.dropBlank) lines = lines.filter(line => line.length > 0)
  if (options.dedupe) {
    const seen = new Set<string>()
    lines = lines.filter(line => {
      const key = options.ignoreCase ? line.toLowerCase() : line
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  if (options.sort !== 'none') {
    lines = [...lines].sort((a, b) => {
      const left = options.ignoreCase ? a.toLowerCase() : a
      const right = options.ignoreCase ? b.toLowerCase() : b
      const result = left < right ? -1 : left > right ? 1 : 0
      return options.sort === 'desc' ? -result : result
    })
  }
  lines = lines.map(line => `${options.prefix}${line}${options.suffix}`)
  return { lines, text: lines.join('\n'), inputCount, outputCount: lines.length }
}

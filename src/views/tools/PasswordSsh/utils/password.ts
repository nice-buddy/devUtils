export interface PasswordOptions {
  length: number
  upper: boolean
  lower: boolean
  digits: boolean
  symbols: boolean
  excludeAmbiguous: boolean
  count: number
}

export const CHAR_CLASSES = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/|'
} as const

export const AMBIGUOUS_CHARS = '0O1lI|'

export interface CharsetResult {
  charset: string
  classes: string[]
  droppedClasses: string[]
  error?: string
}

export function buildCharset(options: PasswordOptions): CharsetResult {
  const enabled: [string, string][] = []
  if (options.upper) enabled.push(['大写字母', CHAR_CLASSES.upper])
  if (options.lower) enabled.push(['小写字母', CHAR_CLASSES.lower])
  if (options.digits) enabled.push(['数字', CHAR_CLASSES.digits])
  if (options.symbols) enabled.push(['符号', CHAR_CLASSES.symbols])
  const classes: string[] = []
  const droppedClasses: string[] = []
  for (const [name, chars] of enabled) {
    const filtered = options.excludeAmbiguous
      ? chars.split('').filter(char => !AMBIGUOUS_CHARS.includes(char)).join('')
      : chars
    if (filtered) classes.push(filtered)
    else droppedClasses.push(name)
  }
  if (!classes.length) return { charset: '', classes, droppedClasses, error: '请至少启用一个字符集' }
  return { charset: classes.join(''), classes, droppedClasses }
}

type Rng = (bytes: Uint8Array) => void

const defaultRng: Rng = bytes => crypto.getRandomValues(bytes)

// 拒绝采样：丢弃落在尾部的取值，避免取模偏置。
function randomInt(max: number, rng: Rng): number {
  if (max <= 1) return 0
  const limit = Math.floor(4294967296 / max) * max
  const buffer = new Uint32Array(1)
  const bytes = new Uint8Array(buffer.buffer)
  let value = 0
  do {
    rng(bytes)
    value = buffer[0]
  } while (value >= limit)
  return value % max
}

export function generatePasswords(options: PasswordOptions, rng: Rng = defaultRng): { passwords: string[]; error?: string } {
  if (options.length < 4 || options.length > 128) return { passwords: [], error: '密码长度需在 4 ~ 128 之间' }
  if (options.count < 1 || options.count > 20) return { passwords: [], error: '生成数量需在 1 ~ 20 之间' }
  const { charset, classes, error } = buildCharset(options)
  if (error) return { passwords: [], error }
  if (options.length < classes.length) {
    return { passwords: [], error: '长度小于已启用字符类别数，无法保证每类至少一个字符' }
  }
  const passwords: string[] = []
  for (let index = 0; index < options.count; index += 1) {
    const chars = classes.map(set => set[randomInt(set.length, rng)])
    while (chars.length < options.length) chars.push(charset[randomInt(charset.length, rng)])
    for (let cursor = chars.length - 1; cursor > 0; cursor -= 1) {
      const swap = randomInt(cursor + 1, rng)
      const temp = chars[cursor]
      chars[cursor] = chars[swap]
      chars[swap] = temp
    }
    passwords.push(chars.join(''))
  }
  return { passwords }
}

export function estimateEntropy(options: PasswordOptions): { bits: number; level: 'weak' | 'medium' | 'strong' } {
  const { charset } = buildCharset(options)
  const bits = charset.length > 1 ? Math.round(options.length * Math.log2(charset.length) * 10) / 10 : 0
  const level = bits < 60 ? 'weak' : bits <= 90 ? 'medium' : 'strong'
  return { bits, level }
}

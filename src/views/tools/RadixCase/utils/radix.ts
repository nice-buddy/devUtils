export type Radix = 2 | 8 | 10 | 16

export const RADIXES: Radix[] = [2, 8, 10, 16]

const DIGIT_PATTERN: Record<Radix, RegExp> = {
  2: /^[01]+$/,
  8: /^[0-7]+$/,
  10: /^[0-9]+$/,
  16: /^[0-9a-fA-F]+$/
}

const PREFIX: Record<Radix, string> = { 2: '0b', 8: '0o', 10: '', 16: '0x' }

export interface ConvertOptions {
  prefix: boolean
  upper: boolean
}

export interface ParseResult {
  value: bigint | null
  error?: string
  errorIndex?: number
}

export function emptyValues(): Record<Radix, string> {
  return { 2: '', 8: '', 10: '', 16: '' }
}

export function parseRadixInput(input: string, from: Radix): ParseResult {
  const text = input.trim()
  if (!text) return { value: null }
  let negative = false
  let body = text
  if (body.startsWith('-')) {
    negative = true
    body = body.slice(1)
  }
  const prefix = PREFIX[from]
  if (prefix && body.toLowerCase().startsWith(prefix)) body = body.slice(prefix.length)
  const digits = body.replace(/_/g, '')
  if (!digits) return { value: null, error: '请输入数字', errorIndex: 0 }
  const invalid = digits.split('').findIndex(char => !DIGIT_PATTERN[from].test(char))
  if (invalid >= 0) {
    const char = digits[invalid]
    const errorIndex = text.indexOf(char)
    return {
      value: null,
      error: `第 ${errorIndex + 1} 位字符 “${char}” 不是合法的 ${from} 进制数字`,
      errorIndex
    }
  }
  let value = 0n
  const base = BigInt(from)
  for (const char of digits.toLowerCase()) value = value * base + BigInt(parseInt(char, from))
  return { value: negative ? -value : value }
}

export function convertAll(
  input: string,
  from: Radix,
  options: ConvertOptions
): { values: Record<Radix, string>; error?: string; errorIndex?: number } {
  const parsed = parseRadixInput(input, from)
  if (parsed.error) return { values: emptyValues(), error: parsed.error, errorIndex: parsed.errorIndex }
  if (parsed.value === null) return { values: emptyValues() }
  const negative = parsed.value < 0n
  const abs = negative ? -parsed.value : parsed.value
  const values = emptyValues()
  for (const radix of RADIXES) {
    const digits = abs.toString(radix)
    const text = radix === 16 && options.upper ? digits.toUpperCase() : digits
    const prefix = options.prefix ? PREFIX[radix] : ''
    values[radix] = `${negative ? '-' : ''}${prefix}${text}`
  }
  return { values }
}

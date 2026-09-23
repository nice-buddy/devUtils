export type CaseStyle = 'camel' | 'pascal' | 'snake' | 'screamingSnake' | 'kebab' | 'dot' | 'title'

export const CASE_STYLES: { value: CaseStyle; label: string }[] = [
  { value: 'camel', label: 'camelCase' },
  { value: 'pascal', label: 'PascalCase' },
  { value: 'snake', label: 'snake_case' },
  { value: 'screamingSnake', label: 'SCREAMING_SNAKE_CASE' },
  { value: 'kebab', label: 'kebab-case' },
  { value: 'dot', label: 'dot.case' },
  { value: 'title', label: 'Title Case' }
]

function upperFirst(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function lowerFirst(word: string): string {
  return word.charAt(0).toLowerCase() + word.slice(1)
}

// 规则：分隔符切分 → 小写/数字→大写→连续大写后接小写（最后一个大写归下一段）。
export function splitWords(input: string): string[] {
  const words: string[] = []
  for (const chunk of input.split(/[^A-Za-z0-9]+/)) {
    if (!chunk) continue
    const parts = chunk
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(' ')
      .filter(Boolean)
    words.push(...parts)
  }
  return words
}

export function toCase(input: string, style: CaseStyle): string {
  const words = splitWords(input)
  if (!words.length) return ''
  const lower = words.map(word => word.toLowerCase())
  switch (style) {
    case 'camel':
      return lowerFirst(lower[0]) + lower.slice(1).map(upperFirst).join('')
    case 'pascal':
      return lower.map(upperFirst).join('')
    case 'snake':
      return lower.join('_')
    case 'screamingSnake':
      return lower.join('_').toUpperCase()
    case 'kebab':
      return lower.join('-')
    case 'dot':
      return lower.join('.')
    default:
      return lower.map(upperFirst).join(' ')
  }
}

export function convertAllCases(input: string): { style: CaseStyle; label: string; value: string }[] {
  return CASE_STYLES.map(item => ({ ...item, value: toCase(input, item.value) }))
}

import type { Language } from '../typeInfer'

const RUST_KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else', 'enum', 'extern', 'false', 'fn',
  'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'static',
  'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while'
])

const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default',
  'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
  'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public',
  'record', 'return', 'sealed', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw',
  'throws', 'transient', 'try', 'var', 'void', 'volatile', 'while', 'yield'
])

export function splitWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function prefixIfNumeric(name: string): string {
  return /^[0-9]/.test(name) ? `_${name}` : name
}

export function toPascal(input: string): string {
  const words = splitWords(input)
  if (!words.length) return 'Field'
  return prefixIfNumeric(words.map(capitalize).join(''))
}

export function toCamel(input: string): string {
  const words = splitWords(input)
  if (!words.length) return 'field'
  const [first, ...rest] = words
  return prefixIfNumeric(first.toLowerCase() + rest.map(capitalize).join(''))
}

export function toSnake(input: string): string {
  const words = splitWords(input)
  if (!words.length) return 'field'
  return prefixIfNumeric(words.map(word => word.toLowerCase()).join('_'))
}

export function escapeIdentifier(lang: Language, key: string): string {
  if (lang === 'ts') return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key)
  if (lang === 'go') return toPascal(key)
  if (lang === 'java') {
    const name = toCamel(key)
    return JAVA_KEYWORDS.has(name) ? `${name}_` : name
  }
  const name = toSnake(key)
  return RUST_KEYWORDS.has(name) ? `${name}_` : name
}

export function uniqueTypeName(registry: Set<string>, name: string): string {
  let candidate = name
  let index = 2
  while (registry.has(candidate)) {
    candidate = `${name}${index}`
    index += 1
  }
  registry.add(candidate)
  return candidate
}

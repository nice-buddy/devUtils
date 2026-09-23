import { LosslessJSON } from '@/views/tools/JsonSuite/utils/losslessJson'

export type Language = 'ts' | 'go' | 'java' | 'rust'

export type PrimitiveName = 'string' | 'integer' | 'number' | 'boolean' | 'null' | 'any'

export interface ObjectField {
  key: string
  type: TypeNode
  optional: boolean
  note?: string
}

export type TypeNode =
  | { kind: 'primitive'; name: PrimitiveName; big?: boolean; maxAbs?: string }
  | { kind: 'array'; element: TypeNode }
  | { kind: 'object'; fields: ObjectField[] }
  | { kind: 'union'; options: TypeNode[] }

export type PrimitiveNode = Extract<TypeNode, { kind: 'primitive' }>
export type ObjectNode = Extract<TypeNode, { kind: 'object' }>

const INT64_MAX = '9223372036854775807'

export function fitsInt64(maxAbs?: string): boolean {
  if (!maxAbs) return true
  const digits = maxAbs.replace(/^0+(?=\d)/, '')
  if (digits.length !== INT64_MAX.length) return digits.length < INT64_MAX.length
  return digits <= INT64_MAX
}

export function containsBigInt(node: TypeNode): boolean {
  if (node.kind === 'union') return node.options.some(containsBigInt)
  if (node.kind === 'array') return containsBigInt(node.element)
  if (node.kind === 'object') return node.fields.some(field => containsBigInt(field.type))
  return node.name === 'integer' && !!node.big
}

export function containsOutOfInt64(node: TypeNode): boolean {
  if (node.kind === 'union') return node.options.some(containsOutOfInt64)
  if (node.kind === 'array') return containsOutOfInt64(node.element)
  if (node.kind === 'object') return node.fields.some(field => containsOutOfInt64(field.type))
  return node.name === 'integer' && !!node.big && !fitsInt64(node.maxAbs)
}

function anyNode(): TypeNode {
  return { kind: 'primitive', name: 'any' }
}

function isNullNode(node: TypeNode): boolean {
  return node.kind === 'primitive' && node.name === 'null'
}

export function inferType(value: unknown): TypeNode {
  if (value === null) return { kind: 'primitive', name: 'null' }
  if (Array.isArray(value)) return { kind: 'array', element: inferArrayElement(value) }
  if (typeof value === 'object') return { kind: 'object', fields: buildFields(value as Record<string, unknown>) }
  return primitiveOf(value)
}

function inferArrayElement(values: unknown[]): TypeNode {
  if (values.length === 0) return anyNode()
  let merged = inferType(values[0])
  for (let i = 1; i < values.length; i += 1) merged = mergeTypes(merged, inferType(values[i]))
  return stripNull(merged).type
}

function primitiveOf(value: unknown): TypeNode {
  if (typeof value === 'bigint') {
    const abs = value < 0n ? -value : value
    return { kind: 'primitive', name: 'integer', big: true, maxAbs: abs.toString() }
  }
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value)) return { kind: 'primitive', name: 'integer', maxAbs: Math.abs(value).toString() }
    return { kind: 'primitive', name: 'number' }
  }
  if (typeof value === 'string') return { kind: 'primitive', name: 'string' }
  if (typeof value === 'boolean') return { kind: 'primitive', name: 'boolean' }
  return anyNode()
}

function buildFields(obj: Record<string, unknown>): ObjectField[] {
  return Object.keys(obj).map(key => normalizeField(key, inferType(obj[key]), false))
}

function normalizeField(key: string, type: TypeNode, optional: boolean): ObjectField {
  const { type: clean, nullable } = stripNull(type)
  const field: ObjectField = { key, type: clean, optional: optional || nullable }
  if (nullable) field.note = '可能为 null'
  return field
}

function stripNull(node: TypeNode): { type: TypeNode; nullable: boolean } {
  const options = flatten(node)
  const nonNull = options.filter(option => !isNullNode(option))
  if (nonNull.length === options.length) return { type: node, nullable: false }
  if (nonNull.length === 0) return { type: anyNode(), nullable: true }
  return { type: makeUnion(nonNull), nullable: true }
}

function flatten(node: TypeNode): TypeNode[] {
  return node.kind === 'union' ? node.options.flatMap(flatten) : [node]
}

function makeUnion(options: TypeNode[]): TypeNode {
  const unique: TypeNode[] = []
  for (const option of options.flatMap(flatten)) {
    if (!unique.some(existing => typeEquals(existing, option))) unique.push(option)
  }
  if (unique.length === 0) return anyNode()
  if (unique.length === 1) return unique[0]
  return { kind: 'union', options: unique }
}

export function mergeTypes(a: TypeNode, b: TypeNode): TypeNode {
  if (a.kind === 'object' && b.kind === 'object') return mergeObjects(a, b)
  if (a.kind === 'array' && b.kind === 'array') {
    return { kind: 'array', element: mergeTypes(a.element, b.element) }
  }
  return collapse([...flatten(a), ...flatten(b)])
}

function collapse(options: TypeNode[]): TypeNode {
  const nonNull = options.filter(option => !isNullNode(option))
  const hasNull = nonNull.length !== options.length
  const merged: TypeNode[] = []
  let numericIndex = -1
  for (const option of nonNull) {
    if (option.kind === 'primitive' && (option.name === 'integer' || option.name === 'number')) {
      if (numericIndex < 0) {
        numericIndex = merged.length
        merged.push(option)
      } else {
        merged[numericIndex] = mergeNumeric(merged[numericIndex] as PrimitiveNode, option)
      }
      continue
    }
    const index = merged.findIndex(
      existing =>
        (existing.kind === 'object' && option.kind === 'object') ||
        (existing.kind === 'array' && option.kind === 'array')
    )
    if (index < 0) merged.push(option)
    else merged[index] = mergeTypes(merged[index], option)
  }
  const result = makeUnion(merged)
  return hasNull ? makeUnion([result, { kind: 'primitive', name: 'null' }]) : result
}

function mergeNumeric(a: PrimitiveNode, b: PrimitiveNode): PrimitiveNode {
  if (a.name === 'number' || b.name === 'number') return { kind: 'primitive', name: 'number' }
  const node: PrimitiveNode = {
    kind: 'primitive',
    name: 'integer',
    maxAbs: maxDecimal(a.maxAbs, b.maxAbs)
  }
  if (a.big || b.big) node.big = true
  return node
}

function maxDecimal(a?: string, b?: string): string | undefined {
  if (!a) return b
  if (!b) return a
  const left = a.replace(/^0+(?=\d)/, '')
  const right = b.replace(/^0+(?=\d)/, '')
  if (left.length !== right.length) return left.length > right.length ? left : right
  return left >= right ? left : right
}

function mergeObjects(a: ObjectNode, b: ObjectNode): ObjectNode {
  const keys = [
    ...a.fields.map(field => field.key),
    ...b.fields.map(field => field.key).filter(key => !a.fields.some(field => field.key === key))
  ]
  const fields = keys.map(key => {
    const left = a.fields.find(field => field.key === key)
    const right = b.fields.find(field => field.key === key)
    if (left && right) {
      return normalizeField(key, mergeTypes(left.type, right.type), left.optional || right.optional)
    }
    const only = (left ?? right) as ObjectField
    return normalizeField(key, only.type, true)
  })
  return { kind: 'object', fields }
}

export function typeEquals(a: TypeNode, b: TypeNode): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'primitive' && b.kind === 'primitive') {
    return a.name === b.name && !!a.big === !!b.big
  }
  if (a.kind === 'array' && b.kind === 'array') return typeEquals(a.element, b.element)
  if (a.kind === 'union' && b.kind === 'union') {
    return (
      a.options.length === b.options.length && a.options.every((option, i) => typeEquals(option, b.options[i]))
    )
  }
  if (a.kind === 'object' && b.kind === 'object') {
    return (
      a.fields.length === b.fields.length &&
      a.fields.every((field, i) => {
        const other = b.fields[i]
        return (
          !!other && field.key === other.key && field.optional === other.optional && typeEquals(field.type, other.type)
        )
      })
    )
  }
  return false
}

export function inferFromJson(raw: string): { root: TypeNode | null; error?: string } {
  if (!raw.trim()) return { root: null }
  try {
    return { root: inferType(LosslessJSON.parse(raw)) }
  } catch (err) {
    return { root: null, error: err instanceof Error ? err.message : 'JSON 语法错误' }
  }
}

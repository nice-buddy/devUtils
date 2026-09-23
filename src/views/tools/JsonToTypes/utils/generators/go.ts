import type { ObjectField, ObjectNode, TypeNode } from '../typeInfer'
import { containsOutOfInt64, fitsInt64 } from '../typeInfer'
import { escapeIdentifier, toPascal, uniqueTypeName } from './naming'

interface Ctx {
  registry: Set<string>
  blocks: string[]
}

export function generate(root: TypeNode, rootName = 'RootObject'): string {
  const ctx: Ctx = { registry: new Set<string>([rootName]), blocks: [] }
  if (root.kind === 'object' && root.fields.length > 0) {
    pushStruct(ctx, root, rootName)
    return ctx.blocks.join('\n\n')
  }
  if (root.kind === 'array' && root.element.kind === 'object' && root.element.fields.length > 0) {
    const itemName = uniqueTypeName(ctx.registry, `${rootName}Item`)
    pushStruct(ctx, root.element, itemName)
    ctx.blocks.push(`type ${rootName} []${itemName}`)
    return ctx.blocks.join('\n\n')
  }
  const alias = renderType(root, `${rootName}Item`, ctx)
  ctx.blocks.push(`type ${rootName} ${alias}`)
  return ctx.blocks.join('\n\n')
}

function pushStruct(ctx: Ctx, node: ObjectNode, name: string): void {
  const lines = node.fields.map(field => {
    const base = renderType(field.type, `${name}${toPascal(field.key)}`, ctx)
    const pointer = field.optional && !base.startsWith('[]') && base !== 'interface{}' ? '*' : ''
    const tag = `json:"${field.key}${field.optional ? ',omitempty' : ''}"`
    return `\t${escapeIdentifier('go', field.key)} ${pointer}${base} \`${tag}\`${commentFor(field)}`
  })
  ctx.blocks.push(`type ${name} struct {\n${lines.join('\n')}\n}`)
}

function renderType(node: TypeNode, suggestedName: string, ctx: Ctx): string {
  if (node.kind === 'union') return 'interface{}'
  if (node.kind === 'array') return `[]${renderType(node.element, suggestedName, ctx)}`
  if (node.kind === 'object') {
    if (node.fields.length === 0) return 'interface{}'
    const name = uniqueTypeName(ctx.registry, suggestedName)
    pushStruct(ctx, node, name)
    return name
  }
  if (node.name === 'integer') return node.big && !fitsInt64(node.maxAbs) ? 'string' : 'int64'
  if (node.name === 'number') return 'float64'
  if (node.name === 'string') return 'string'
  if (node.name === 'boolean') return 'bool'
  return 'interface{}'
}

function commentFor(field: ObjectField): string {
  const notes: string[] = []
  if (field.note) notes.push(field.note)
  if (containsOutOfInt64(field.type)) notes.push('原值超出 int64 范围，已按字符串处理')
  return notes.length ? ` // ${notes.join('；')}` : ''
}

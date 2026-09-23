import type { ObjectField, ObjectNode, TypeNode } from '../typeInfer'
import { containsBigInt } from '../typeInfer'
import { escapeIdentifier, toPascal, uniqueTypeName } from './naming'

interface Ctx {
  registry: Set<string>
  blocks: string[]
}

export function generate(root: TypeNode, rootName = 'RootObject'): string {
  const ctx: Ctx = { registry: new Set<string>([rootName]), blocks: [] }
  if (root.kind === 'object' && root.fields.length > 0) {
    pushObject(ctx, root, rootName)
    return ctx.blocks.join('\n\n')
  }
  if (root.kind === 'array' && root.element.kind === 'object' && root.element.fields.length > 0) {
    const itemName = uniqueTypeName(ctx.registry, `${rootName}Item`)
    pushObject(ctx, root.element, itemName)
    ctx.blocks.push(`export type ${rootName} = ${itemName}[]`)
    return ctx.blocks.join('\n\n')
  }
  const alias = renderType(root, `${rootName}Item`, ctx)
  ctx.blocks.push(`export type ${rootName} = ${alias}`)
  return ctx.blocks.join('\n\n')
}

function pushObject(ctx: Ctx, node: ObjectNode, name: string): void {
  const lines = node.fields.map(field => {
    const type = renderType(field.type, `${name}${toPascal(field.key)}`, ctx)
    const comment = commentFor(field)
    return `  ${escapeIdentifier('ts', field.key)}${field.optional ? '?' : ''}: ${type};${comment}`
  })
  ctx.blocks.push(`export interface ${name} {\n${lines.join('\n')}\n}`)
}

function renderType(node: TypeNode, suggestedName: string, ctx: Ctx): string {
  if (node.kind === 'union') return node.options.map(option => renderType(option, suggestedName, ctx)).join(' | ')
  if (node.kind === 'array') return `${renderType(node.element, suggestedName, ctx)}[]`
  if (node.kind === 'object') {
    if (node.fields.length === 0) return 'any'
    const name = uniqueTypeName(ctx.registry, suggestedName)
    pushObject(ctx, node, name)
    return name
  }
  if (node.name === 'integer') return node.big ? 'string' : 'number'
  if (node.name === 'number') return 'number'
  if (node.name === 'string') return 'string'
  if (node.name === 'boolean') return 'boolean'
  return 'any'
}

function commentFor(field: ObjectField): string {
  const notes: string[] = []
  if (field.note) notes.push(field.note)
  if (containsBigInt(field.type)) notes.push('原值超出 JS 安全整数范围，已按字符串处理')
  return notes.length ? ` // ${notes.join('；')}` : ''
}

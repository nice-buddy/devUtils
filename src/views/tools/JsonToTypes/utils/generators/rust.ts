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
    return withHeader(ctx.blocks)
  }
  if (root.kind === 'array' && root.element.kind === 'object' && root.element.fields.length > 0) {
    const itemName = uniqueTypeName(ctx.registry, `${rootName}Item`)
    pushStruct(ctx, root.element, itemName)
    ctx.blocks.push(`pub type ${rootName} = Vec<${itemName}>;`)
    return withHeader(ctx.blocks)
  }
  const alias = renderType(root, `${rootName}Item`, ctx)
  ctx.blocks.push(`pub type ${rootName} = ${alias};`)
  return withHeader(ctx.blocks)
}

function withHeader(blocks: string[]): string {
  return `use serde::{Deserialize, Serialize};\n\n${blocks.join('\n\n')}`
}

function pushStruct(ctx: Ctx, node: ObjectNode, name: string): void {
  const members = node.fields.map(field => {
    const fieldName = escapeIdentifier('rust', field.key)
    const base = renderType(field.type, `${name}${toPascal(field.key)}`, ctx)
    const type = field.optional ? `Option<${base}>` : base
    const lines: string[] = []
    if (fieldName !== field.key) lines.push(`    #[serde(rename = ${JSON.stringify(field.key)})]`)
    lines.push(`    pub ${fieldName}: ${type},${commentFor(field)}`)
    return lines.join('\n')
  })
  ctx.blocks.push(`#[derive(Serialize, Deserialize)]\npub struct ${name} {\n${members.join('\n\n')}\n}`)
}

function renderType(node: TypeNode, suggestedName: string, ctx: Ctx): string {
  if (node.kind === 'union') return 'serde_json::Value'
  if (node.kind === 'array') return `Vec<${renderType(node.element, suggestedName, ctx)}>`
  if (node.kind === 'object') {
    if (node.fields.length === 0) return 'serde_json::Value'
    const name = uniqueTypeName(ctx.registry, suggestedName)
    pushStruct(ctx, node, name)
    return name
  }
  if (node.name === 'integer') return node.big && !fitsInt64(node.maxAbs) ? 'String' : 'i64'
  if (node.name === 'number') return 'f64'
  if (node.name === 'string') return 'String'
  if (node.name === 'boolean') return 'bool'
  return 'serde_json::Value'
}

function commentFor(field: ObjectField): string {
  const notes: string[] = []
  if (field.note) notes.push(field.note)
  if (containsOutOfInt64(field.type)) notes.push('原值超出 int64 范围，已按字符串处理')
  return notes.length ? ` // ${notes.join('；')}` : ''
}

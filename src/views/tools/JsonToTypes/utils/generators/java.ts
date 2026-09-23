import type { ObjectField, ObjectNode, TypeNode } from '../typeInfer'
import { containsOutOfInt64, fitsInt64 } from '../typeInfer'
import { escapeIdentifier, toPascal, uniqueTypeName } from './naming'

const HEADER = [
  'import java.util.List;',
  '',
  'import com.fasterxml.jackson.annotation.JsonProperty;',
  'import org.jetbrains.annotations.Nullable;'
].join('\n')

export function generate(root: TypeNode, rootName = 'RootObject'): string {
  const registry = new Set<string>([rootName])
  const classes: string[] = []
  if (root.kind === 'object' && root.fields.length > 0) {
    classes.push(renderClass(root, rootName, registry))
  } else if (root.kind === 'array' && root.element.kind === 'object' && root.element.fields.length > 0) {
    const itemName = uniqueTypeName(registry, `${rootName}Item`)
    classes.push(renderClass(root.element, itemName, registry))
    classes.push(
      [
        '// JSON 根是数组，Java 没有类型别名，这里给出包装类。',
        `public class ${rootName} {`,
        '    @JsonProperty("items")',
        `    private List<${itemName}> items;`,
        '}'
      ].join('\n')
    )
  } else {
    const type = renderType(root, `${rootName}Item`, registry, [])
    classes.push(
      [
        '// JSON 根不是对象，Java 没有类型别名，这里给出包装类。',
        `public class ${rootName} {`,
        '    @JsonProperty("value")',
        `    private ${type} value;`,
        '}'
      ].join('\n')
    )
  }
  return `${HEADER}\n\n${classes.join('\n\n')}\n`
}

function renderClass(node: ObjectNode, name: string, registry: Set<string>, isStatic = false): string {
  const nested: string[] = []
  const members = node.fields.map(field => {
    const type = renderType(field.type, `${name}${toPascal(field.key)}`, registry, nested)
    const annotations = field.optional ? ['    @Nullable', `    @JsonProperty(${JSON.stringify(field.key)})`] : [`    @JsonProperty(${JSON.stringify(field.key)})`]
    return `${annotations.join('\n')}\n    private ${type} ${escapeIdentifier('java', field.key)};${commentFor(field)}`
  })
  const nestedIndented = nested.map(block => block.split('\n').map(line => `    ${line}`).join('\n'))
  return `public ${isStatic ? 'static ' : ''}class ${name} {\n${[...members, ...nestedIndented].join('\n\n')}\n}`
}

function renderType(node: TypeNode, suggestedName: string, registry: Set<string>, nested: string[]): string {
  if (node.kind === 'union') return 'Object'
  if (node.kind === 'array') return `List<${renderType(node.element, suggestedName, registry, nested)}>`
  if (node.kind === 'object') {
    if (node.fields.length === 0) return 'Object'
    const name = uniqueTypeName(registry, suggestedName)
    nested.push(renderClass(node, name, registry, true))
    return name
  }
  if (node.name === 'integer') return node.big && !fitsInt64(node.maxAbs) ? 'String' : 'Long'
  if (node.name === 'number') return 'Double'
  if (node.name === 'string') return 'String'
  if (node.name === 'boolean') return 'Boolean'
  return 'Object'
}

function commentFor(field: ObjectField): string {
  const notes: string[] = []
  if (field.note) notes.push(field.note)
  if (containsOutOfInt64(field.type)) notes.push('原值超出 int64 范围，已按字符串处理')
  return notes.length ? ` // ${notes.join('；')}` : ''
}

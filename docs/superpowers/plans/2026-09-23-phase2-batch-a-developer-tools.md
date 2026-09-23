# 第二阶段批次 A 实施计划：零依赖纯前端工具集

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用真实实现替换 5 个 `ToolPlaceholder` 占位工具（`json-to-types`、`url-parser`、`radix-case`、`chmod-calc`、`password-ssh` 的密码生成），业务逻辑全部下沉到可单测的 `utils`，并按第一期约定把输入与视图选项持久化到 SQLite 快照。

**Architecture:** 每个工具一个目录 `src/views/tools/<ToolName>/`：`utils/*.ts` 放纯函数（TDD，Vitest 覆盖），`<ToolName>.vue` 只做状态绑定与渲染。`src/App.vue` 用 `defineAsyncComponent` 注册 5 个视图并在 `resolveBaseComponent` 中同时兼容连字符与下划线 id。快照回填走 `props.initialSnapshot?.x ?? 默认值`，落库走 `tabStore.updateTabSnapshot(props.tabId, {...})`。

**Tech Stack:** Vue 3 (`<script setup lang="ts">`) + Naive UI + Tailwind + CodeMirror 6（仅 json-to-types 输入区）+ Vitest；大整数无损解析复用 `src/views/tools/JsonSuite/utils/losslessJson.ts` 的 `LosslessJSON`。

**Spec:** `docs/superpowers/specs/2026-09-23-phase2-batch-a-design.md`

## Global Constraints

- 零新增 npm 依赖：`package.json` 与 lock 文件不得改动；不引入图标库，图标一律内联 SVG。
- 不改 `src-tauri/` 下任何文件；不改 `src/types/tool.ts` 的工具 id、文案与分类。
- 组件 Props 契约固定：`defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()`。
- 快照：回填 `props.initialSnapshot?.x ?? <默认值>`；落库 `tabStore.updateTabSnapshot(props.tabId, {...})`；普通文本输入 250ms 防抖；关闭密码「持久化生成结果」开关时必须绕过防抖立即写库。
- 错误处理：非法输入用 `NAlert` 就地提示并保留上一次有效结果；空输入只显示空态不报错；单个文本输入超过 1MB 时关闭实时推导、改为手动触发生成。
- 大整数绝不经过 `Number`：`LosslessJSON` 是 `useNativeBigInt: true`，超安全整数以原生 `bigint` 出现，判定必须用 `typeof value === 'bigint'`；`int64` 范围比较用十进制字符串完成。
- 每个任务结束都要 `npm test` 与 `npm run build` 通过，并单独提交一次 git。
- 平台相关文案走 `src/utils/platform.ts`，不要手写 `Ctrl` / `⌘`。

---

### Task 1: json-to-types 类型推导（utils/typeInfer.ts）

**Files:**
- Create: `src/views/tools/JsonToTypes/utils/typeInfer.ts`
- Test: `src/views/tools/JsonToTypes/__tests__/typeInfer.spec.ts`

**Interfaces:**
- Consumes: `LosslessJSON` from `@/views/tools/JsonSuite/utils/losslessJson`
- Produces:
  - `type Language = 'ts' | 'go' | 'java' | 'rust'`
  - `type TypeNode = { kind: 'primitive'; name: 'string' | 'integer' | 'number' | 'boolean' | 'null' | 'any'; big?: boolean; maxAbs?: string } | { kind: 'array'; element: TypeNode } | { kind: 'object'; fields: ObjectField[] } | { kind: 'union'; options: TypeNode[] }`
  - `interface ObjectField { key: string; type: TypeNode; optional: boolean; note?: string }`
  - `inferType(value: unknown): TypeNode`
  - `inferFromJson(raw: string): { root: TypeNode | null; error?: string }`
  - `mergeTypes(a: TypeNode, b: TypeNode): TypeNode`
  - `typeEquals(a: TypeNode, b: TypeNode): boolean`
  - `fitsInt64(maxAbs?: string): boolean`
  - `containsBigInt(node: TypeNode): boolean`
  - `containsOutOfInt64(node: TypeNode): boolean`

说明：`maxAbs` 保存该整数字段见过的最大绝对值（十进制字符串），供生成器判断是否落在 `int64` 范围；`big = true` 表示该值来自 `bigint`（即超出 JS 安全整数）。

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/JsonToTypes/__tests__/typeInfer.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  containsBigInt,
  containsOutOfInt64,
  fitsInt64,
  inferFromJson,
  inferType,
  mergeTypes
} from '../utils/typeInfer'

describe('json-to-types 类型推导', () => {
  it('区分整数与小数，并按 bigint 判定超大整数', () => {
    expect(inferType(7)).toEqual({ kind: 'primitive', name: 'integer', maxAbs: '7' })
    expect(inferType(7.5)).toEqual({ kind: 'primitive', name: 'number' })
    expect(inferType(true)).toEqual({ kind: 'primitive', name: 'boolean' })
    expect(inferType('a')).toEqual({ kind: 'primitive', name: 'string' })
    expect(inferType(10n ** 30n)).toEqual({
      kind: 'primitive',
      name: 'integer',
      big: true,
      maxAbs: '1000000000000000000000000000000'
    })
  })

  it('从 JSON 文本推导时能识别 19 位雪花 ID 为 bigint 分支', () => {
    const { root, error } = inferFromJson('{"id":1892837482910293847}')
    expect(error).toBeUndefined()
    expect(root).toEqual({
      kind: 'object',
      fields: [
        {
          key: 'id',
          type: { kind: 'primitive', name: 'integer', big: true, maxAbs: '1892837482910293847' },
          optional: false
        }
      ]
    })
  })

  it('数组全量合并元素，缺 key 的字段标记为可选', () => {
    const { root } = inferFromJson('[{"a":1},{"b":"x"}]')
    expect(root).toEqual({
      kind: 'array',
      element: {
        kind: 'object',
        fields: [
          { key: 'a', type: { kind: 'primitive', name: 'integer', maxAbs: '1' }, optional: true },
          { key: 'b', type: { kind: 'primitive', name: 'string' }, optional: true }
        ]
      }
    })
  })

  it('类型冲突得到联合类型，integer 与 number 收敛为 number', () => {
    const { root: mixed } = inferFromJson('[1,"a"]')
    expect(mixed).toEqual({
      kind: 'array',
      element: {
        kind: 'union',
        options: [
          { kind: 'primitive', name: 'integer', maxAbs: '1' },
          { kind: 'primitive', name: 'string' }
        ]
      }
    })

    const { root: numeric } = inferFromJson('[1,1.5]')
    expect(numeric).toEqual({ kind: 'array', element: { kind: 'primitive', name: 'number' } })
  })

  it('null 不单独成类型，转成可选字段并附注释', () => {
    const { root } = inferFromJson('{"a":null}')
    expect(root).toEqual({
      kind: 'object',
      fields: [{ key: 'a', type: { kind: 'primitive', name: 'any' }, optional: true, note: '可能为 null' }]
    })

    const { root: arrayWithNull } = inferFromJson('[1,null]')
    expect(arrayWithNull).toEqual({
      kind: 'array',
      element: { kind: 'primitive', name: 'integer', maxAbs: '1' }
    })
  })

  it('空数组与空对象退化为 any / 空字段表', () => {
    const { root: emptyArray } = inferFromJson('[]')
    expect(emptyArray).toEqual({ kind: 'array', element: { kind: 'primitive', name: 'any' } })
    const { root: emptyObject } = inferFromJson('{}')
    expect(emptyObject).toEqual({ kind: 'object', fields: [] })
  })

  it('合并时保留 big 标记与最大绝对值', () => {
    const merged = mergeTypes(
      { kind: 'primitive', name: 'integer', maxAbs: '7' },
      { kind: 'primitive', name: 'integer', big: true, maxAbs: '9223372036854775808' }
    )
    expect(merged).toEqual({
      kind: 'primitive',
      name: 'integer',
      big: true,
      maxAbs: '9223372036854775808'
    })
  })

  it('非法 JSON 返回错误而不是抛异常', () => {
    expect(inferFromJson('{"a":}').error).toBeTruthy()
    expect(inferFromJson('   ')).toEqual({ root: null })
  })

  it('int64 范围判断与 big 识别走十进制字符串', () => {
    expect(fitsInt64('9223372036854775807')).toBe(true)
    expect(fitsInt64('9223372036854775808')).toBe(false)
    expect(fitsInt64(undefined)).toBe(true)
    expect(containsBigInt({ kind: 'primitive', name: 'integer', big: true, maxAbs: '1' })).toBe(true)
    expect(containsOutOfInt64({ kind: 'primitive', name: 'integer', big: true, maxAbs: '7' })).toBe(false)
    expect(
      containsOutOfInt64({
        kind: 'array',
        element: { kind: 'primitive', name: 'integer', big: true, maxAbs: '9223372036854775808' }
      })
    ).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/JsonToTypes/__tests__/typeInfer.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../utils/typeInfer"`。

- [ ] **Step 3: 实现 typeInfer.ts**

创建 `src/views/tools/JsonToTypes/utils/typeInfer.ts`：

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/JsonToTypes/__tests__/typeInfer.spec.ts`
Expected: PASS（9 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/JsonToTypes/utils/typeInfer.ts src/views/tools/JsonToTypes/__tests__/typeInfer.spec.ts
git commit -m "feat(json-to-types): 新增 JSON 类型推导 IR 与单测"
```

---

### Task 2: json-to-types 四语言生成器（utils/generators/）

**Files:**
- Create: `src/views/tools/JsonToTypes/utils/generators/naming.ts`
- Create: `src/views/tools/JsonToTypes/utils/generators/typescript.ts`
- Create: `src/views/tools/JsonToTypes/utils/generators/go.ts`
- Create: `src/views/tools/JsonToTypes/utils/generators/java.ts`
- Create: `src/views/tools/JsonToTypes/utils/generators/rust.ts`
- Create: `src/views/tools/JsonToTypes/utils/generators/index.ts`
- Test: `src/views/tools/JsonToTypes/__tests__/generators.spec.ts`

**Interfaces:**
- Consumes: `TypeNode` / `ObjectNode` / `PrimitiveNode` / `fitsInt64` / `containsBigInt` / `containsOutOfInt64` from `../typeInfer`
- Produces:
  - `naming.ts`: `splitWords(input: string): string[]`、`toPascal(input: string): string`、`toCamel(input: string): string`、`toSnake(input: string): string`、`escapeIdentifier(lang: Language, key: string): string`、`uniqueTypeName(registry: Set<string>, name: string): string`
  - 各语言文件：`generate(root: TypeNode, rootName?: string): string`
  - `index.ts`: `generators: Record<Language, (root: TypeNode, rootName: string) => string>`

断言策略：生成器测试断言「具体行」而不是整文件快照，兼顾精确性与可维护性。

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/JsonToTypes/__tests__/generators.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { inferFromJson } from '../utils/typeInfer'
import { generators } from '../utils/generators'
import { escapeIdentifier, toCamel, toPascal, toSnake, uniqueTypeName } from '../utils/generators/naming'

function rootOf(raw: string) {
  const { root, error } = inferFromJson(raw)
  expect(error).toBeUndefined()
  return root!
}

describe('json-to-types 命名工具', () => {
  it('按 key 生成各语言标识符', () => {
    expect(toPascal('user_name')).toBe('UserName')
    expect(toCamel('user_name')).toBe('userName')
    expect(toSnake('userName')).toBe('user_name')
    expect(escapeIdentifier('ts', 'user-name')).toBe('"user-name"')
    expect(escapeIdentifier('go', 'user_name')).toBe('UserName')
    expect(escapeIdentifier('java', 'class')).toBe('class_')
    expect(escapeIdentifier('rust', 'type')).toBe('type_')
    expect(escapeIdentifier('rust', '2fa_enabled')).toBe('_2fa_enabled')
  })

  it('类型名撞车时追加数字后缀', () => {
    const registry = new Set<string>(['User'])
    expect(uniqueTypeName(registry, 'User')).toBe('User2')
    expect(uniqueTypeName(registry, 'User')).toBe('User3')
    expect(registry.has('User2')).toBe(true)
  })
})

describe('json-to-types 生成器', () => {
  const sample = '{"id":1892837482910293847,"name":"devutils","tags":["a"],"owner":{"id":1},"type":"x"}'

  it('生成 TypeScript：大整数转 string 并附注释，保留字属性加引号', () => {
    const out = generators.ts(rootOf(sample), 'RootObject')
    expect(out).toContain('export interface RootObject {')
    expect(out).toContain('  id: string; // 原值超出 JS 安全整数范围，已按字符串处理')
    expect(out).toContain('  name: string;')
    expect(out).toContain('  tags: string[];')
    expect(out).toContain('  owner: RootObjectOwner;')
    expect(out).toContain('export interface RootObjectOwner {')
  })

  it('生成 Go：int64 范围内的大整数用 int64，超出范围回退 string 并附注释', () => {
    const inRange = generators.go(rootOf('{"id":1892837482910293847}'), 'RootObject')
    expect(inRange).toContain('type RootObject struct {')
    expect(inRange).toContain('\tId int64 `json:"id"`')

    const outOfRange = generators.go(rootOf('{"id":9223372036854775808}'), 'RootObject')
    expect(outOfRange).toContain('\tId string `json:"id"` // 原值超出 int64 范围，已按字符串处理')
  })

  it('生成 Go：可选字段加指针与 omitempty，切片不加指针', () => {
    const out = generators.go(rootOf('[{"a":1,"tags":["x"]},{"tags":["y"]}]'), 'RootObject')
    expect(out).toContain('\tA *int64 `json:"a,omitempty"`')
    expect(out).toContain('\tTags []string `json:"tags"`')
    expect(out).toContain('type RootObject []RootObjectItem')
  })

  it('生成 Java：私有字段 + @JsonProperty + @Nullable，嵌套为静态内部类', () => {
    const out = generators.java(rootOf('{"user":{"name":"a"},"nickname":null}'), 'RootObject')
    expect(out).toContain('import com.fasterxml.jackson.annotation.JsonProperty;')
    expect(out).toContain('public class RootObject {')
    expect(out).toContain('    @JsonProperty("user")')
    expect(out).toContain('    private RootObjectUser user;')
    expect(out).toContain('    @Nullable')
    expect(out).toContain('    private Object nickname;')
    expect(out).toContain('    public static class RootObjectUser {')
  })

  it('生成 Rust：snake_case + serde rename，可选字段为 Option', () => {
    const out = generators.rust(rootOf('{"userName":"a","type":1}'), 'RootObject')
    expect(out).toContain('use serde::{Deserialize, Serialize};')
    expect(out).toContain('#[derive(Serialize, Deserialize)]')
    expect(out).toContain('pub struct RootObject {')
    expect(out).toContain('    #[serde(rename = "userName")]')
    expect(out).toContain('    pub user_name: String,')
    expect(out).toContain('    pub type_: i64,')
  })

  it('生成 Rust：超出 int64 的大整数回退 String', () => {
    const out = generators.rust(rootOf('{"id":9223372036854775808}'), 'RootObject')
    expect(out).toContain('    pub id: String, // 原值超出 int64 范围，已按字符串处理')
  })

  it('根为对象数组时输出 Item 类型与根别名', () => {
    const ts = generators.ts(rootOf('[{"id":1}]'), 'RootObject')
    expect(ts).toContain('export interface RootObjectItem {')
    expect(ts).toContain('export type RootObject = RootObjectItem[]')
    const rust = generators.rust(rootOf('[{"id":1}]'), 'RootObject')
    expect(rust).toContain('pub type RootObject = Vec<RootObjectItem>;')
    const java = generators.java(rootOf('[{"id":1}]'), 'RootObject')
    expect(java).toContain('private List<RootObjectItem> items;')
  })

  it('嵌套类型同名时追加后缀，避免重复声明', () => {
    const out = generators.ts(rootOf('{"ab":{"x":1},"a_b":{"y":2}}'), 'RootObject')
    expect(out).toContain('export interface RootObjectAb {')
    expect(out).toContain('export interface RootObjectAb2 {')
  })

  it('空对象与空数组退化为 any / interface{}', () => {
    expect(generators.ts(rootOf('{"a":{},"b":[]}'), 'RootObject')).toContain('  a: any;')
    expect(generators.ts(rootOf('{"a":{},"b":[]}'), 'RootObject')).toContain('  b: any[];')
    expect(generators.go(rootOf('{"a":{},"b":[]}'), 'RootObject')).toContain('\tA interface{} `json:"a"`')
    expect(generators.go(rootOf('{"a":{},"b":[]}'), 'RootObject')).toContain('\tB []interface{} `json:"b"`')
  })
})
```

注意：`nested 同名后缀` 用例里 `ab` 与 `a_b` 归一后都是 `RootObjectAb`，第二个会拿到 `RootObjectAb2`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/JsonToTypes/__tests__/generators.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../utils/generators"`。

- [ ] **Step 3: 实现 naming.ts**

创建 `src/views/tools/JsonToTypes/utils/generators/naming.ts`：

```ts
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
```

- [ ] **Step 4: 实现 typescript.ts**

创建 `src/views/tools/JsonToTypes/utils/generators/typescript.ts`：

```ts
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
```

- [ ] **Step 5: 实现 go.ts**

创建 `src/views/tools/JsonToTypes/utils/generators/go.ts`：

```ts
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
```

- [ ] **Step 6: 实现 java.ts**

创建 `src/views/tools/JsonToTypes/utils/generators/java.ts`：

```ts
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
  return `public ${isStatic ? 'static ' : ''}class ${name} {\n${[...members, ...nested].join('\n\n')}\n}`
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
```

- [ ] **Step 7: 实现 rust.ts**

创建 `src/views/tools/JsonToTypes/utils/generators/rust.ts`：

```ts
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
```

- [ ] **Step 8: 实现 index.ts**

创建 `src/views/tools/JsonToTypes/utils/generators/index.ts`：

```ts
import type { Language, TypeNode } from '../typeInfer'
import { generate as generateGo } from './go'
import { generate as generateJava } from './java'
import { generate as generateRust } from './rust'
import { generate as generateTypescript } from './typescript'

export const generators: Record<Language, (root: TypeNode, rootName: string) => string> = {
  ts: generateTypescript,
  go: generateGo,
  java: generateJava,
  rust: generateRust
}
```

- [ ] **Step 9: 运行测试确认通过**

Run: `npx vitest run src/views/tools/JsonToTypes/__tests__/generators.spec.ts`
Expected: PASS（11 个用例全绿）。若行内容不匹配，以断言里给出的目标行为为准修正生成器实现，不要放宽断言。

- [ ] **Step 10: 跑全量测试并提交**

Run: `npm test`
Expected: 既有用例 + 新增用例全部 PASS。

```bash
git add src/views/tools/JsonToTypes/utils/generators src/views/tools/JsonToTypes/__tests__/generators.spec.ts
git commit -m "feat(json-to-types): 新增 TS/Go/Java/Rust 四语言生成器与单测"
```

---

### Task 3: json-to-types 视图与 App.vue 注册

**Files:**
- Create: `src/views/tools/JsonToTypes/JsonToTypes.vue`
- Modify: `src/App.vue`（异步组件声明 + `resolveBaseComponent` 分支）

**Interfaces:**
- Consumes: `inferFromJson` / `Language` / `TypeNode`（Task 1）、`generators`（Task 2）、`useTabStore`、`useThemeStore`
- Produces: 可被 `App.vue` 异步加载的 `JsonToTypes.vue`，Props 为 `{ tabId, initialSnapshot }`，快照字段 `{ raw, language, rootName }`

- [ ] **Step 1: 创建视图组件**

创建 `src/views/tools/JsonToTypes/JsonToTypes.vue`（编辑器主题函数与第一期 `JsonSuite.vue` 一致，按既有习惯在本文件内局部定义）：

```vue
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NRadioButton, NRadioGroup, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { json } from '@codemirror/lang-json'
import { EditorState } from '@codemirror/state'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { inferFromJson, type Language, type TypeNode } from './utils/typeInfer'
import { generators } from './utils/generators'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

const SAMPLE = ['{', '  "id": 1892837482910293847,', '  "name": "devutils",', '  "tags": ["json", "types"],', '  "owner": { "id": 1, "email": null }', '}'].join('\n')

const languages = [
  { label: 'TypeScript', value: 'ts' },
  { label: 'Go', value: 'go' },
  { label: 'Java', value: 'java' },
  { label: 'Rust', value: 'rust' }
]

const language = ref<Language>(props.initialSnapshot?.language ?? 'ts')
const rootName = ref<string>(props.initialSnapshot?.rootName ?? 'RootObject')
const root = ref<TypeNode | null>(null)
const errorMessage = ref<string>('')
const manualMode = ref<boolean>(false)
const editorEl = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let inferTimer: ReturnType<typeof setTimeout> | null = null

const output = computed(() => (root.value ? generators[language.value](root.value, rootName.value) : ''))
const languageLabel = computed(() => languages.find(item => item.value === language.value)?.label ?? '')

function getInput(): string {
  return editorView ? editorView.state.doc.toString() : ''
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    raw: getInput(),
    language: language.value,
    rootName: rootName.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function runInference() {
  const { root: inferred, error } = inferFromJson(getInput())
  if (error) {
    errorMessage.value = error
    return
  }
  errorMessage.value = ''
  root.value = inferred
}

function handleDocChange() {
  manualMode.value = getInput().length > 1024 * 1024
  scheduleSnapshot()
  if (manualMode.value) return
  if (inferTimer) clearTimeout(inferTimer)
  inferTimer = setTimeout(runInference, 300)
}

function getEditorTheme(isDark: boolean) {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: '13px',
        backgroundColor: isDark ? '#090d16' : '#ffffff',
        color: isDark ? '#e2e8f0' : '#1e293b'
      },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        lineHeight: '1.6'
      },
      '.cm-gutters': {
        backgroundColor: isDark ? '#070a10' : '#f8fafc',
        color: isDark ? '#475569' : '#94a3b8',
        borderRight: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0'
      }
    },
    { dark: isDark }
  )
}

onMounted(async () => {
  await nextTick()
  if (!editorEl.value) return
  const initialDoc = props.initialSnapshot?.raw ?? SAMPLE
  manualMode.value = initialDoc.length > 1024 * 1024
  editorView = new EditorView({
    state: EditorState.create({
      doc: initialDoc,
      extensions: [
        basicSetup,
        json(),
        getEditorTheme(themeStore.isDark),
        EditorView.updateListener.of(update => {
          if (update.docChanged) handleDocChange()
        })
      ]
    }),
    parent: editorEl.value
  })
  runInference()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  if (inferTimer) clearTimeout(inferTimer)
  saveSnapshot()
  editorView?.destroy()
  editorView = null
})

watch([language, rootName], () => saveSnapshot())

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value)
  message.success('已复制生成结果')
}
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">JSON 转强类型结构体</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">单文档全量数组合并推导，19 位大整数无损识别</p>
      </div>
      <div class="flex items-center gap-3">
        <NInput v-model:value="rootName" size="small" class="w-40" placeholder="根类型名" />
        <NRadioGroup v-model:value="language" size="small">
          <NRadioButton v-for="item in languages" :key="item.value" :value="item.value">{{ item.label }}</NRadioButton>
        </NRadioGroup>
      </div>
    </header>

    <div v-if="errorMessage" class="px-4 pt-3 shrink-0">
      <NAlert type="error" :bordered="false">{{ errorMessage }}</NAlert>
    </div>
    <div v-else-if="manualMode" class="px-4 pt-3 shrink-0">
      <NAlert type="warning" :bordered="false">输入超过 1MB，已关闭实时推导，请手动点击「生成」。</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">JSON 输入</span>
          <NButton v-if="manualMode" size="tiny" type="primary" @click="runInference">生成</NButton>
        </div>
        <div ref="editorEl" class="flex-1 min-h-0 overflow-hidden"></div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">{{ languageLabel }} 输出</span>
          <NButton size="tiny" @click="copyOutput">复制</NButton>
        </div>
        <pre class="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono leading-relaxed text-slate-800 dark:text-slate-100">{{ output }}</pre>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 在 App.vue 注册**

`src/App.vue` 异步组件声明区追加（放在 `TimestampCron` 声明之后）：

```ts
const JsonToTypes = defineAsyncComponent(() => import('@/views/tools/JsonToTypes/JsonToTypes.vue'))
```

`resolveBaseComponent` 内、`return ToolPlaceholder` 之前追加：

```ts
  if (toolId === 'json-to-types' || toolId === 'json_to_types') {
    return JsonToTypes
  }
```

- [ ] **Step 3: 类型检查与构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，Vite 产出 `dist/assets/JsonToTypes-*.js`。

- [ ] **Step 4: 界面自检（本地 dev 服务）**

在已运行的 dev 服务（`http://localhost:1420`）侧栏点击「JSON 转强类型结构体」：
Expected: 显示双栏视图与示例 JSON 推导结果；切成 Go / Java / Rust 时输出同步切换；输入 `{"a":}` 时出现红色错误提示且右侧保留上一次结果。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/JsonToTypes/JsonToTypes.vue src/App.vue
git commit -m "feat(json-to-types): 新增 JSON 转强类型结构体视图并注册工具入口"
```

---

### Task 4: url-parser 解析与构造（utils/urlParser.ts）

**Files:**
- Create: `src/views/tools/UrlParser/utils/urlParser.ts`
- Test: `src/views/tools/UrlParser/__tests__/urlParser.spec.ts`

**Interfaces:**
- Produces:
  - `interface QueryEntry { key: string; value: string; enabled: boolean; hasEquals: boolean }`
  - `interface ParsedUrl { protocol: string; username: string; password: string; host: string; port: string; path: string; hash: string; entries: QueryEntry[]; valid: boolean; error?: string; schemeInserted: boolean }`
  - `EMPTY_PARSED_URL: ParsedUrl`
  - `parseQuery(search: string, autoDecode: boolean): QueryEntry[]`
  - `parseUrl(input: string, autoDecode?: boolean): ParsedUrl`
  - `buildUrl(parts: ParsedUrl, autoDecode?: boolean): string`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/UrlParser/__tests__/urlParser.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { buildUrl, parseQuery, parseUrl } from '../utils/urlParser'

describe('url-parser 解析与构造', () => {
  it('拆解复杂 URL 的各个部分并保留重复 key 与无值参数', () => {
    const parsed = parseUrl('https://user:pass@example.com:8443/a/b?x=1&x=2&flag#frag')
    expect(parsed.valid).toBe(true)
    expect(parsed.protocol).toBe('https')
    expect(parsed.username).toBe('user')
    expect(parsed.password).toBe('pass')
    expect(parsed.host).toBe('example.com')
    expect(parsed.port).toBe('8443')
    expect(parsed.path).toBe('/a/b')
    expect(parsed.hash).toBe('frag')
    expect(parsed.entries).toEqual([
      { key: 'x', value: '1', enabled: true, hasEquals: true },
      { key: 'x', value: '2', enabled: true, hasEquals: true },
      { key: 'flag', value: '', enabled: true, hasEquals: false }
    ])
  })

  it('缺协议时按 https 试解析并打标', () => {
    const parsed = parseUrl('example.com/p?q=1')
    expect(parsed.valid).toBe(true)
    expect(parsed.schemeInserted).toBe(true)
    expect(parsed.protocol).toBe('https')
    expect(parsed.host).toBe('example.com')
  })

  it('支持 IPv6 主机与端口', () => {
    const parsed = parseUrl('https://[2001:db8::1]:8080/p')
    expect(parsed.host).toBe('2001:db8::1')
    expect(buildUrl(parsed)).toBe('https://[2001:db8::1]:8080/p')
  })

  it('非法 URL 返回错误标记而不是抛异常', () => {
    const parsed = parseUrl('http://')
    expect(parsed.valid).toBe(false)
    expect(parsed.error).toBeTruthy()
  })

  it('解码后的值重新拼装是幂等的', () => {
    const raw = 'https://example.com/search?q=a+b&tag=%E4%B8%AD%E6%96%87#top'
    const once = parseUrl(raw)
    expect(once.entries[0]).toEqual({ key: 'q', value: 'a b', enabled: true, hasEquals: true })
    expect(parseUrl(buildUrl(once))).toEqual(once)
  })

  it('字面量 %20 不会被当成已编码序列放行', () => {
    const parsed = parseUrl('https://example.com/?q=foo%2520bar')
    expect(parsed.entries[0].value).toBe('foo%20bar')
    expect(buildUrl(parsed)).toBe('https://example.com/?q=foo%2520bar')
  })

  it('autoDecode=false 时原样保留编码文本', () => {
    const parsed = parseUrl('https://example.com/?q=a%20b', false)
    expect(parsed.entries[0].value).toBe('a%20b')
    expect(buildUrl(parsed, false)).toBe('https://example.com/?q=a%20b')
  })

  it('停用的参数不参与拼装，无值参数保持不带等号', () => {
    const parsed = parseUrl('https://example.com/?a=1&flag')
    parsed.entries[0].enabled = false
    expect(buildUrl(parsed)).toBe('https://example.com/?flag')
  })

  it('空 query 与空输入都有确定行为', () => {
    expect(parseQuery('', true)).toEqual([])
    expect(parseUrl('').valid).toBe(true)
    expect(buildUrl(parseUrl(''))).toBe('')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/UrlParser/__tests__/urlParser.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../utils/urlParser"`。

- [ ] **Step 3: 实现 urlParser.ts**

创建 `src/views/tools/UrlParser/utils/urlParser.ts`：

```ts
export interface QueryEntry {
  key: string
  value: string
  enabled: boolean
  hasEquals: boolean
}

export interface ParsedUrl {
  protocol: string
  username: string
  password: string
  host: string
  port: string
  path: string
  hash: string
  entries: QueryEntry[]
  valid: boolean
  error?: string
  schemeInserted: boolean
}

export const EMPTY_PARSED_URL: ParsedUrl = {
  protocol: '',
  username: '',
  password: '',
  host: '',
  port: '',
  path: '',
  hash: '',
  entries: [],
  valid: true,
  schemeInserted: false
}

const SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//

function decodePart(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '))
  } catch {
    return text
  }
}

export function parseQuery(search: string, autoDecode: boolean): QueryEntry[] {
  const raw = search.startsWith('?') ? search.slice(1) : search
  if (!raw) return []
  return raw
    .split('&')
    .filter(part => part.length > 0)
    .map(part => {
      const eq = part.indexOf('=')
      if (eq < 0) {
        return { key: autoDecode ? decodePart(part) : part, value: '', enabled: true, hasEquals: false }
      }
      const key = part.slice(0, eq)
      const value = part.slice(eq + 1)
      return {
        key: autoDecode ? decodePart(key) : key,
        value: autoDecode ? decodePart(value) : value,
        enabled: true,
        hasEquals: true
      }
    })
}

export function parseUrl(input: string, autoDecode = true): ParsedUrl {
  const text = input.trim()
  if (!text) return { ...EMPTY_PARSED_URL, entries: [] }
  const hasScheme = SCHEME_PATTERN.test(text)
  let url: URL
  try {
    url = new URL(hasScheme ? text : `https://${text}`)
  } catch {
    return {
      ...EMPTY_PARSED_URL,
      entries: [],
      valid: false,
      error: 'URL 解析失败：请检查协议、主机与端口是否完整',
      schemeInserted: !hasScheme
    }
  }
  const segments = url.pathname.split('/')
  const path = autoDecode ? segments.map(segment => decodePart(segment)).join('/') : url.pathname
  return {
    protocol: url.protocol.replace(/:$/, ''),
    username: autoDecode ? decodePart(url.username) : url.username,
    password: autoDecode ? decodePart(url.password) : url.password,
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: url.port,
    path,
    hash: autoDecode ? decodePart(url.hash.replace(/^#/, '')) : url.hash.replace(/^#/, ''),
    entries: parseQuery(url.search, autoDecode),
    valid: true,
    schemeInserted: !hasScheme
  }
}

export function buildUrl(parts: ParsedUrl, autoDecode = true): string {
  const encode = (text: string) => (autoDecode ? encodeURIComponent(text) : text)
  let result = ''
  if (parts.protocol) result += `${parts.protocol}://`
  if (parts.username) {
    result += encode(parts.username)
    if (parts.password) result += `:${encode(parts.password)}`
    result += '@'
  }
  result += parts.host.includes(':') && !parts.host.startsWith('[') ? `[${parts.host}]` : parts.host
  if (parts.port) result += `:${parts.port}`
  const query = parts.entries
    .filter(entry => entry.enabled)
    .map(entry => (entry.hasEquals ? `${encode(entry.key)}=${encode(entry.value)}` : encode(entry.key)))
    .join('&')
  if (parts.path && parts.path !== '/') {
    const path = parts.path.startsWith('/') ? parts.path : `/${parts.path}`
    result += path.split('/').map(segment => encode(segment)).join('/')
  } else if (parts.host && (parts.path === '/' || query)) {
    result += '/'
  }
  if (query) result += `?${query}`
  if (parts.hash) result += `#${encode(parts.hash)}`
  return result
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/UrlParser/__tests__/urlParser.spec.ts`
Expected: PASS（9 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/UrlParser/utils/urlParser.ts src/views/tools/UrlParser/__tests__/urlParser.spec.ts
git commit -m "feat(url-parser): 新增 URL 解析与构造纯函数与单测"
```

---

### Task 5: url-parser 视图与注册

**Files:**
- Create: `src/views/tools/UrlParser/UrlParser.vue`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `parseUrl` / `buildUrl` / `ParsedUrl` / `QueryEntry`（Task 4）
- Produces: `UrlParser.vue`，快照字段 `{ rawUrl, autoDecode }`

- [ ] **Step 1: 创建视图组件**

创建 `src/views/tools/UrlParser/UrlParser.vue`（URL 文本是唯一真源：字段与参数表格的编辑都先写回 URL 文本）：

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NSwitch, useMessage } from 'naive-ui'
import { useTabStore } from '@/stores/tabStore'
import { buildUrl, parseUrl, type ParsedUrl, type QueryEntry } from './utils/urlParser'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

const rawUrl = ref<string>(props.initialSnapshot?.rawUrl ?? 'https://api.example.com:8443/v1/search?q=devutils&page=1')
const autoDecode = ref<boolean>(props.initialSnapshot?.autoDecode ?? true)
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const parsed = ref<ParsedUrl>(parseUrl(rawUrl.value, autoDecode.value))
const builtUrl = computed(() => buildUrl(parsed.value, autoDecode.value))
const fields = [
  { key: 'protocol', label: '协议' },
  { key: 'username', label: '用户名' },
  { key: 'password', label: '密码' },
  { key: 'host', label: '主机' },
  { key: 'port', label: '端口' },
  { key: 'path', label: '路径' },
  { key: 'hash', label: '锚点' }
] as const

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, { rawUrl: rawUrl.value, autoDecode: autoDecode.value })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function cloneParsed(): ParsedUrl {
  return { ...parsed.value, entries: parsed.value.entries.map(entry => ({ ...entry })) }
}

function applyDraft(mutate: (draft: ParsedUrl) => void) {
  const draft = cloneParsed()
  mutate(draft)
  rawUrl.value = buildUrl(draft, autoDecode.value)
}

function updateField(key: (typeof fields)[number]['key'], value: string) {
  applyDraft(draft => {
    draft[key] = value
  })
}

function updateEntry(index: number, patch: Partial<QueryEntry>) {
  applyDraft(draft => {
    const current = draft.entries[index]
    const nextHasEquals = patch.hasEquals ?? (patch.value !== undefined ? true : current.hasEquals)
    draft.entries[index] = { ...current, ...patch, hasEquals: nextHasEquals }
  })
}

function addEntry() {
  applyDraft(draft => {
    draft.entries.push({ key: '', value: '', enabled: true, hasEquals: true })
  })
}

function removeEntry(index: number) {
  applyDraft(draft => {
    draft.entries.splice(index, 1)
  })
}

function copyBuiltUrl() {
  if (!builtUrl.value) return
  navigator.clipboard.writeText(builtUrl.value)
  message.success('已复制拼装结果')
}

watch([rawUrl, autoDecode], () => {
  const next = parseUrl(rawUrl.value, autoDecode.value)
  // 非法输入保留上一次有效解析结果，只更新错误信息，避免输出区闪空。
  parsed.value = next.valid ? next : { ...parsed.value, valid: false, error: next.error, schemeInserted: next.schemeInserted }
  scheduleSnapshot()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">URL 解析与构造器</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">结构化拆解与 Query 参数双向表格编辑</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-500 dark:text-slate-400">自动解码</span>
        <NSwitch v-model:value="autoDecode" size="small" />
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0">
      <NInput v-model:value="rawUrl" type="text" placeholder="https://example.com/path?a=1" />
    </div>

    <div class="px-4 pt-2 shrink-0">
      <NAlert v-if="!parsed.valid" type="error" :bordered="false">{{ parsed.error }}</NAlert>
      <NAlert v-else-if="parsed.schemeInserted" type="warning" :bordered="false">输入未包含协议，已按 https 解析。</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">结构字段</div>
        <div class="flex-1 min-h-0 overflow-auto p-3 space-y-2">
          <div v-for="field in fields" :key="field.key" class="flex items-center gap-2">
            <span class="w-16 text-xs text-slate-500 dark:text-slate-400">{{ field.label }}</span>
            <NInput :value="parsed[field.key]" size="small" @update:value="value => updateField(field.key, value)" />
          </div>
        </div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">Query 参数（{{ parsed.entries.length }}）</span>
          <NButton size="tiny" @click="addEntry">新增参数</NButton>
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-3 space-y-2">
          <div v-for="(entry, index) in parsed.entries" :key="index" class="flex items-center gap-2">
            <NSwitch :value="entry.enabled" size="small" @update:value="value => updateEntry(index, { enabled: value })" />
            <NInput :value="entry.key" size="small" placeholder="key" @update:value="value => updateEntry(index, { key: value })" />
            <NInput :value="entry.value" size="small" placeholder="value" @update:value="value => updateEntry(index, { value })" />
            <NButton size="tiny" quaternary @click="removeEntry(index)">删除</NButton>
          </div>
          <p v-if="!parsed.entries.length" class="text-xs text-slate-400">暂无 Query 参数</p>
        </div>
      </section>
    </div>

    <footer class="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-500 dark:text-slate-400 shrink-0">拼装结果</span>
        <code class="flex-1 truncate text-xs font-mono">{{ builtUrl }}</code>
        <NButton size="tiny" @click="copyBuiltUrl">复制</NButton>
      </div>
    </footer>
  </div>
</template>
```

- [ ] **Step 2: 在 App.vue 注册**

```ts
const UrlParser = defineAsyncComponent(() => import('@/views/tools/UrlParser/UrlParser.vue'))
```

`resolveBaseComponent` 内（`json-to-types` 分支之后）追加：

```ts
  if (toolId === 'url-parser' || toolId === 'url_parser') {
    return UrlParser
  }
```

- [ ] **Step 3: 类型检查与界面自检**

Run: `npm run build`
Expected: 构建通过，产出 `dist/assets/UrlParser-*.js`。随后在 dev 服务点击「URL 解析与构造器」：修改 Query 参数后底部拼装结果同步变化；输入 `http://` 时出现红色错误提示。

- [ ] **Step 4: 提交**

```bash
git add src/views/tools/UrlParser/UrlParser.vue src/App.vue
git commit -m "feat(url-parser): 新增 URL 解析与构造器视图并注册工具入口"
```

---

### Task 6: radix-case 三个纯函数模块（radix / caseConvert / textLines）

**Files:**
- Create: `src/views/tools/RadixCase/utils/radix.ts`
- Create: `src/views/tools/RadixCase/utils/caseConvert.ts`
- Create: `src/views/tools/RadixCase/utils/textLines.ts`
- Test: `src/views/tools/RadixCase/__tests__/radix.spec.ts`
- Test: `src/views/tools/RadixCase/__tests__/caseConvert.spec.ts`
- Test: `src/views/tools/RadixCase/__tests__/textLines.spec.ts`

**Interfaces:**
- `radix.ts`: `type Radix = 2 | 8 | 10 | 16`、`RADIXES: Radix[]`、`interface ConvertOptions { prefix: boolean; upper: boolean }`、`parseRadixInput(input: string, from: Radix): { value: bigint | null; error?: string; errorIndex?: number }`、`convertAll(input: string, from: Radix, options: ConvertOptions): { values: Record<Radix, string>; error?: string; errorIndex?: number }`
- `caseConvert.ts`: `type CaseStyle`、`CASE_STYLES`、`splitWords(input: string): string[]`、`toCase(input: string, style: CaseStyle): string`、`convertAllCases(input: string): { style: CaseStyle; label: string; value: string }[]`
- `textLines.ts`: `type SortMode = 'none' | 'asc' | 'desc'`、`interface LineOptions`、`DEFAULT_LINE_OPTIONS`、`processLines(input: string, options: LineOptions): { lines: string[]; text: string; inputCount: number; outputCount: number }`

- [ ] **Step 1: 写三个失败测试文件**

创建 `src/views/tools/RadixCase/__tests__/radix.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { convertAll } from '../utils/radix'

describe('radix-case 进制转换', () => {
  it('同时输出四种进制，并支持前缀与大小写选项', () => {
    expect(convertAll('255', 10, { prefix: false, upper: false }).values).toEqual({
      2: '11111111',
      8: '377',
      10: '255',
      16: 'ff'
    })
    const prefixed = convertAll('255', 10, { prefix: true, upper: true })
    expect(prefixed.values[16]).toBe('0xFF')
    expect(prefixed.values[2]).toBe('0b11111111')
  })

  it('支持超过 64 位的大数与负数（数学符号表示）', () => {
    const big = convertAll('18446744073709551616', 10, { prefix: false, upper: false })
    expect(big.values[16]).toBe('10000000000000000')
    const negative = convertAll('-FF', 16, { prefix: true, upper: false })
    expect(negative.values[10]).toBe('-255')
    expect(negative.values[16]).toBe('-0xff')
  })

  it('容忍进制前缀与下划线分隔符', () => {
    expect(convertAll('0x_ff', 16, { prefix: false, upper: false }).values[10]).toBe('255')
  })

  it('非法字符给出错误信息且不输出结果', () => {
    const result = convertAll('12z', 10, { prefix: false, upper: false })
    expect(result.error).toContain('z')
    expect(result.errorIndex).toBe(2)
    expect(result.values[10]).toBe('')
  })

  it('空输入返回空结果且不报错', () => {
    const result = convertAll('   ', 10, { prefix: false, upper: false })
    expect(result.error).toBeUndefined()
    expect(result.values[10]).toBe('')
  })
})
```

创建 `src/views/tools/RadixCase/__tests__/caseConvert.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { convertAllCases, splitWords, toCase } from '../utils/caseConvert'

describe('radix-case 命名风格', () => {
  it('按标准边界切词', () => {
    expect(splitWords('HTTPServer')).toEqual(['HTTP', 'Server'])
    expect(splitWords('getHTTPResponse')).toEqual(['get', 'HTTP', 'Response'])
    expect(splitWords('XML2JSON')).toEqual(['XML2', 'JSON'])
    expect(splitWords('user2Id')).toEqual(['user2', 'Id'])
    // 规则 3 优先：IPv4 按连续大写规则切为 I + Pv4（spec 5.7 的 ip_v4_address 已作废）。
    expect(splitWords('IPv4Address')).toEqual(['I', 'Pv4', 'Address'])
    expect(splitWords('snake_case-name.dot')).toEqual(['snake', 'case', 'name', 'dot'])
  })

  it('输出七种命名风格', () => {
    const result = convertAllCases('HTTPServer')
    expect(result.map(item => item.value)).toEqual([
      'httpServer',
      'HttpServer',
      'http_server',
      'HTTP_SERVER',
      'http-server',
      'http.server',
      'Http Server'
    ])
  })

  it('空输入返回空字符串', () => {
    expect(toCase('', 'snake')).toBe('')
    expect(convertAllCases('   ').every(item => item.value === '')).toBe(true)
  })
})
```

创建 `src/views/tools/RadixCase/__tests__/textLines.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_LINE_OPTIONS, processLines, type LineOptions } from '../utils/textLines'

const base: LineOptions = { ...DEFAULT_LINE_OPTIONS, trimEdge: false, dropBlank: false }

describe('radix-case 文本行处理', () => {
  it('兼容 CRLF 与 LF，输出统一为 LF', () => {
    const result = processLines('a\r\nb\nc', base)
    expect(result.text).toBe('a\nb\nc')
    expect(result.inputCount).toBe(3)
  })

  it('管道顺序为 trimEdge → dropBlank → dedupe → sort → 拼接前后缀', () => {
    const result = processLines('  b  \r\n\r\n  a  \r\n  a  \r\n', {
      ...base,
      trimEdge: true,
      dropBlank: true,
      dedupe: true,
      sort: 'asc',
      prefix: '-',
      suffix: '!'
    })
    expect(result.lines).toEqual(['-a!', '-b!'])
    expect(result.outputCount).toBe(2)
  })

  it('去重与排序受 ignoreCase 控制', () => {
    expect(processLines('b\nA\na', { ...base, dedupe: true, ignoreCase: true }).lines).toEqual(['b', 'A'])
    expect(processLines('b\nA\na', { ...base, sort: 'asc', ignoreCase: true }).lines).toEqual(['A', 'a', 'b'])
  })

  it('降序排序与空输入都有确定行为', () => {
    expect(processLines('a\nc\nb', { ...base, sort: 'desc' }).lines).toEqual(['c', 'b', 'a'])
    expect(processLines('', base).text).toBe('')
    expect(processLines('', base).inputCount).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/RadixCase`
Expected: FAIL，报三个 `Failed to resolve import`。

- [ ] **Step 3: 实现 radix.ts**

创建 `src/views/tools/RadixCase/utils/radix.ts`：

```ts
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
```

- [ ] **Step 4: 实现 caseConvert.ts**

创建 `src/views/tools/RadixCase/utils/caseConvert.ts`：

```ts
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
```

- [ ] **Step 5: 实现 textLines.ts**

创建 `src/views/tools/RadixCase/utils/textLines.ts`：

```ts
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
```

- [ ] **Step 6: 运行三个测试文件确认通过**

Run: `npx vitest run src/views/tools/RadixCase`
Expected: PASS（12 个用例全绿）。

- [ ] **Step 7: 提交**

```bash
git add src/views/tools/RadixCase/utils src/views/tools/RadixCase/__tests__
git commit -m "feat(radix-case): 新增进制转换、命名风格与文本行处理纯函数与单测"
```

---

### Task 7: radix-case 视图与注册

**Files:**
- Create: `src/views/tools/RadixCase/RadixCase.vue`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `convertAll` / `RADIXES` / `Radix`（Task 6）、`convertAllCases`（Task 6）、`processLines` / `DEFAULT_LINE_OPTIONS` / `SortMode`（Task 6）
- Produces: `RadixCase.vue`，快照字段 `{ panel, radix: { input, from, prefix, upper }, caseInput, lines: { input, options } }`

- [ ] **Step 1: 创建视图组件**

创建 `src/views/tools/RadixCase/RadixCase.vue`：

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NRadioButton, NRadioGroup, NSelect, NSwitch, useMessage } from 'naive-ui'
import { useTabStore } from '@/stores/tabStore'
import { convertAll, RADIXES, type Radix } from './utils/radix'
import { convertAllCases } from './utils/caseConvert'
import { DEFAULT_LINE_OPTIONS, processLines, type LineOptions, type SortMode } from './utils/textLines'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

type Panel = 'radix' | 'case' | 'lines'

const panel = ref<Panel>(props.initialSnapshot?.panel ?? 'radix')
const radixInput = ref<string>(props.initialSnapshot?.radix?.input ?? '255')
const radixFrom = ref<Radix>(props.initialSnapshot?.radix?.from ?? 10)
const radixPrefix = ref<boolean>(props.initialSnapshot?.radix?.prefix ?? false)
const radixUpper = ref<boolean>(props.initialSnapshot?.radix?.upper ?? false)
const caseInput = ref<string>(props.initialSnapshot?.caseInput ?? 'devUtils_HTTPClient')
const linesInput = ref<string>(props.initialSnapshot?.lines?.input ?? '')
const lineOptions = ref<LineOptions>({ ...DEFAULT_LINE_OPTIONS, ...(props.initialSnapshot?.lines?.options ?? {}) })
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const radixOptions = RADIXES.map(value => ({ label: `${value} 进制`, value }))
const sortOptions: { label: string; value: SortMode }[] = [
  { label: '保持原序', value: 'none' },
  { label: '升序', value: 'asc' },
  { label: '降序', value: 'desc' }
]

const radixResult = computed(() =>
  convertAll(radixInput.value, radixFrom.value, { prefix: radixPrefix.value, upper: radixUpper.value })
)
// 非法输入只更新错误信息，保留上一次有效的四种进制结果。
const lastRadixValues = ref(radixResult.value.values)
const radixValues = computed(() => (radixResult.value.error ? lastRadixValues.value : radixResult.value.values))
watch(radixResult, value => {
  if (!value.error) lastRadixValues.value = value.values
})
const caseResult = computed(() => convertAllCases(caseInput.value))
const lineResult = computed(() => processLines(linesInput.value, lineOptions.value))

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    panel: panel.value,
    radix: {
      input: radixInput.value,
      from: radixFrom.value,
      prefix: radixPrefix.value,
      upper: radixUpper.value
    },
    caseInput: caseInput.value,
    lines: { input: linesInput.value, options: { ...lineOptions.value } }
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

watch([panel, radixInput, radixFrom, radixPrefix, radixUpper, caseInput, linesInput, lineOptions], scheduleSnapshot, {
  deep: true
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
})

function copyText(text: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success('已复制')
}
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">进制与命名风格转换</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">BigInt 无损进制换算、命名风格切换与文本行批处理</p>
      </div>
      <NRadioGroup v-model:value="panel" size="small">
        <NRadioButton value="radix">进制转换</NRadioButton>
        <NRadioButton value="case">命名风格</NRadioButton>
        <NRadioButton value="lines">文本行处理</NRadioButton>
      </NRadioGroup>
    </header>

    <div class="flex-1 min-h-0 overflow-auto p-4 space-y-4">
      <section v-if="panel === 'radix'" class="space-y-3">
        <div class="flex items-center gap-3">
          <NInput v-model:value="radixInput" class="w-72" placeholder="输入数值，支持 0x / 0b / 0o 前缀与下划线" />
          <NSelect v-model:value="radixFrom" class="w-32" :options="radixOptions" />
          <span class="text-xs text-slate-500 dark:text-slate-400">前缀</span>
          <NSwitch v-model:value="radixPrefix" size="small" />
          <span class="text-xs text-slate-500 dark:text-slate-400">十六进制大写</span>
          <NSwitch v-model:value="radixUpper" size="small" />
        </div>
        <NAlert v-if="radixResult.error" type="error" :bordered="false">{{ radixResult.error }}</NAlert>
        <div v-for="radix in RADIXES" :key="radix" class="flex items-center gap-3">
          <span class="w-20 text-xs text-slate-500 dark:text-slate-400">{{ radix }} 进制</span>
          <NInput :value="radixValues[radix]" readonly />
          <NButton size="tiny" @click="copyText(radixValues[radix])">复制</NButton>
        </div>
      </section>

      <section v-else-if="panel === 'case'" class="space-y-3">
        <NInput v-model:value="caseInput" placeholder="输入词组，如 devUtils_HTTPClient" />
        <div v-for="item in caseResult" :key="item.style" class="flex items-center gap-3">
          <span class="w-48 text-xs text-slate-500 dark:text-slate-400">{{ item.label }}</span>
          <NInput :value="item.value" readonly />
          <NButton size="tiny" @click="copyText(item.value)">复制</NButton>
        </div>
      </section>

      <section v-else class="space-y-3">
        <NInput v-model:value="linesInput" type="textarea" :autosize="{ minRows: 6, maxRows: 12 }" placeholder="粘贴待处理的多行文本" />
        <div class="flex flex-wrap items-center gap-4">
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="lineOptions.trimEdge" size="small" />去除行首尾空白</span>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="lineOptions.dropBlank" size="small" />删除空行</span>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="lineOptions.dedupe" size="small" />去重</span>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="lineOptions.ignoreCase" size="small" />忽略大小写</span>
          <NSelect v-model:value="lineOptions.sort" class="w-32" size="small" :options="sortOptions" />
        </div>
        <div class="flex items-center gap-3">
          <NInput v-model:value="lineOptions.prefix" placeholder="每行前缀" />
          <NInput v-model:value="lineOptions.suffix" placeholder="每行后缀" />
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-slate-500 dark:text-slate-400">{{ lineResult.inputCount }} 行 → {{ lineResult.outputCount }} 行</span>
          <NButton size="tiny" @click="copyText(lineResult.text)">复制结果</NButton>
        </div>
        <NInput :value="lineResult.text" type="textarea" readonly :autosize="{ minRows: 6, maxRows: 14 }" />
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 在 App.vue 注册**

```ts
const RadixCase = defineAsyncComponent(() => import('@/views/tools/RadixCase/RadixCase.vue'))
```

`resolveBaseComponent` 内（`url-parser` 分支之后）追加：

```ts
  if (toolId === 'radix-case' || toolId === 'radix_case') {
    return RadixCase
  }
```

- [ ] **Step 3: 类型检查与界面自检**

Run: `npm run build`
Expected: 构建通过。dev 服务中三个面板均可切换，进制输入 `12z` 出现错误提示，行处理面板粘贴含 `\r\n` 的文本后结果统一为 LF。

- [ ] **Step 4: 提交**

```bash
git add src/views/tools/RadixCase/RadixCase.vue src/App.vue
git commit -m "feat(radix-case): 新增进制/命名/文本行三面板视图并注册工具入口"
```

---

### Task 8: chmod-calc 纯函数（utils/chmod.ts）

**Files:**
- Create: `src/views/tools/ChmodCalc/utils/chmod.ts`
- Test: `src/views/tools/ChmodCalc/__tests__/chmod.spec.ts`

**Interfaces:**
- Produces:
  - `interface PermBits { owner: number; group: number; other: number; setuid: boolean; setgid: boolean; sticky: boolean }`
  - `DEFAULT_BITS: PermBits`（644）
  - `octalToBits(octal: string): { bits: PermBits } | { error: string }`
  - `bitsToOctal(bits: PermBits): string`
  - `bitsToSymbolic(bits: PermBits, withType?: boolean): string`
  - `symbolicToBits(symbolic: string): { bits: PermBits } | { error: string }`
  - `toCommand(bits: PermBits, options: { path?: string; recursive?: boolean }): string`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/ChmodCalc/__tests__/chmod.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  bitsToOctal,
  bitsToSymbolic,
  octalToBits,
  symbolicToBits,
  toCommand,
  type PermBits
} from '../utils/chmod'

function bits(raw: string): PermBits {
  const result = octalToBits(raw)
  if ('error' in result) throw new Error(result.error)
  return result.bits
}

describe('chmod-calc 权限换算', () => {
  it('数字权限与符号位双向转换', () => {
    expect(bitsToOctal(bits('755'))).toBe('755')
    expect(bitsToSymbolic(bits('755'))).toBe('-rwxr-xr-x')
    expect(bitsToSymbolic(bits('644'))).toBe('-rw-r--r--')
    const parsed = symbolicToBits('rwxr-xr-x')
    expect('bits' in parsed && bitsToOctal(parsed.bits)).toBe('755')
    const withType = symbolicToBits('-rw-r--r--')
    expect('bits' in withType && bitsToOctal(withType.bits)).toBe('644')
  })

  it('处理 setuid / setgid / sticky 四位权限', () => {
    expect(bitsToOctal(bits('4755'))).toBe('4755')
    expect(bitsToSymbolic(bits('4755'))).toBe('-rwsr-xr-x')
    expect(bitsToSymbolic(bits('1777'))).toBe('-rwxrwxrwt')
    expect(bitsToSymbolic(bits('4644'))).toBe('-rwSr--r--')
    const parsed = symbolicToBits('rwsr-xr-x')
    expect('bits' in parsed && parsed.bits.setuid).toBe(true)
  })

  it('非法输入只返回错误，不产生 bits（供视图不回填）', () => {
    expect('error' in octalToBits('789')).toBe(true)
    expect('error' in octalToBits('7')).toBe(true)
    expect('error' in symbolicToBits('rwx')).toBe(true)
    expect('error' in symbolicToBits('rwxrwxrwz')).toBe(true)
  })

  it('命令拼装包含 -R 与路径引用', () => {
    expect(toCommand(bits('755'), {})).toBe('chmod 755')
    expect(toCommand(bits('755'), { path: '/var/www', recursive: true })).toBe('chmod -R 755 /var/www')
    expect(toCommand(bits('600'), { path: '/tmp/my file' })).toBe("chmod 600 '/tmp/my file'")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/ChmodCalc/__tests__/chmod.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../utils/chmod"`。

- [ ] **Step 3: 实现 chmod.ts**

创建 `src/views/tools/ChmodCalc/utils/chmod.ts`：

```ts
export interface PermBits {
  owner: number
  group: number
  other: number
  setuid: boolean
  setgid: boolean
  sticky: boolean
}

export const DEFAULT_BITS: PermBits = {
  owner: 6,
  group: 4,
  other: 4,
  setuid: false,
  setgid: false,
  sticky: false
}

export function octalToBits(octal: string): { bits: PermBits } | { error: string } {
  const text = octal.trim()
  if (!/^[0-7]{3,4}$/.test(text)) return { error: '八进制权限必须是 3 ~ 4 位、每位数 0-7' }
  const digits = text.padStart(4, '0')
  const special = Number(digits[0])
  return {
    bits: {
      owner: Number(digits[1]),
      group: Number(digits[2]),
      other: Number(digits[3]),
      setuid: (special & 4) !== 0,
      setgid: (special & 2) !== 0,
      sticky: (special & 1) !== 0
    }
  }
}

export function bitsToOctal(bits: PermBits): string {
  const special = (bits.setuid ? 4 : 0) + (bits.setgid ? 2 : 0) + (bits.sticky ? 1 : 0)
  const core = `${bits.owner}${bits.group}${bits.other}`
  return special ? `${special}${core}` : core
}

export function bitsToSymbolic(bits: PermBits, withType = true): string {
  const triplet = (value: number, hasSpecial: boolean, specialChar: 's' | 't') => {
    const read = (value & 4) !== 0 ? 'r' : '-'
    const write = (value & 2) !== 0 ? 'w' : '-'
    const executable = (value & 1) !== 0
    const execute = hasSpecial ? (executable ? specialChar : specialChar.toUpperCase()) : executable ? 'x' : '-'
    return `${read}${write}${execute}`
  }
  const body = [
    triplet(bits.owner, bits.setuid, 's'),
    triplet(bits.group, bits.setgid, 's'),
    triplet(bits.other, bits.sticky, 't')
  ].join('')
  return withType ? `-${body}` : body
}

export function symbolicToBits(symbolic: string): { bits: PermBits } | { error: string } {
  const text = symbolic.trim()
  const body = text.length === 10 ? text.slice(1) : text
  if (!/^[rwxstST-]{9}$/.test(body)) {
    return { error: '符号权限必须是 9 位（如 rwxr-xr-x）或 10 位（含首位类型字符）' }
  }
  const parseTriplet = (chunk: string, specialChar: 's' | 't') => {
    let value = 0
    if (chunk[0] === 'r') value += 4
    if (chunk[1] === 'w') value += 2
    const execute = chunk[2]
    const hasSpecial = execute === specialChar || execute === specialChar.toUpperCase()
    if (execute === 'x' || execute === specialChar) value += 1
    return { value, hasSpecial }
  }
  const owner = parseTriplet(body.slice(0, 3), 's')
  const group = parseTriplet(body.slice(3, 6), 's')
  const other = parseTriplet(body.slice(6, 9), 't')
  return {
    bits: {
      owner: owner.value,
      group: group.value,
      other: other.value,
      setuid: owner.hasSpecial,
      setgid: group.hasSpecial,
      sticky: other.hasSpecial
    }
  }
}

export function toCommand(bits: PermBits, options: { path?: string; recursive?: boolean }): string {
  const parts = ['chmod']
  if (options.recursive) parts.push('-R')
  parts.push(bitsToOctal(bits))
  const path = options.path?.trim()
  if (path) parts.push(/[\s'"]/.test(path) ? `'${path.replace(/'/g, "'\\''")}'` : path)
  return parts.join(' ')
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/ChmodCalc/__tests__/chmod.spec.ts`
Expected: PASS（4 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/ChmodCalc/utils/chmod.ts src/views/tools/ChmodCalc/__tests__/chmod.spec.ts
git commit -m "feat(chmod-calc): 新增权限矩阵与数字/符号互转纯函数与单测"
```

---

### Task 9: chmod-calc 视图与注册

**Files:**
- Create: `src/views/tools/ChmodCalc/ChmodCalc.vue`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `octalToBits` / `symbolicToBits` / `bitsToOctal` / `bitsToSymbolic` / `toCommand` / `DEFAULT_BITS` / `PermBits`（Task 8）
- Produces: `ChmodCalc.vue`，快照字段 `{ bits, filePath, recursive }`

- [ ] **Step 1: 创建视图组件**

创建 `src/views/tools/ChmodCalc/ChmodCalc.vue`（矩阵是唯一状态源；两个输入框只在失焦 / 回车时提交）：

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NAlert, NButton, NCheckbox, NInput, NSwitch, useMessage } from 'naive-ui'
import { useTabStore } from '@/stores/tabStore'
import {
  bitsToOctal,
  bitsToSymbolic,
  DEFAULT_BITS,
  octalToBits,
  symbolicToBits,
  toCommand,
  type PermBits
} from './utils/chmod'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

const roles = [
  { key: 'owner', label: '属主 u' },
  { key: 'group', label: '属组 g' },
  { key: 'other', label: '其它 o' }
] as const
const permissions = [
  { mask: 4, label: '读 r' },
  { mask: 2, label: '写 w' },
  { mask: 1, label: '执行 x' }
] as const
const specials = [
  { key: 'setuid', label: 'setuid (SUID)' },
  { key: 'setgid', label: 'setgid (SGID)' },
  { key: 'sticky', label: 'sticky (SBIT)' }
] as const

const bits = ref<PermBits>({ ...DEFAULT_BITS, ...(props.initialSnapshot?.bits ?? {}) })
const filePath = ref<string>(props.initialSnapshot?.filePath ?? '')
const recursive = ref<boolean>(props.initialSnapshot?.recursive ?? false)
const octalInput = ref<string>('')
const symbolicInput = ref<string>('')
const octalError = ref<string>('')
const symbolicError = ref<string>('')
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const octal = computed(() => bitsToOctal(bits.value))
const symbolic = computed(() => bitsToSymbolic(bits.value))
const command = computed(() => toCommand(bits.value, { path: filePath.value, recursive: recursive.value }))

function hasPermission(role: 'owner' | 'group' | 'other', mask: number): boolean {
  return (bits.value[role] & mask) !== 0
}

function togglePermission(role: 'owner' | 'group' | 'other', mask: number, checked: boolean) {
  const current = bits.value[role]
  bits.value = { ...bits.value, [role]: checked ? current | mask : current & ~mask }
}

function commitOctal() {
  const result = octalToBits(octalInput.value)
  if ('error' in result) {
    octalError.value = result.error
    return
  }
  octalError.value = ''
  bits.value = result.bits
}

function commitSymbolic() {
  const result = symbolicToBits(symbolicInput.value)
  if ('error' in result) {
    symbolicError.value = result.error
    return
  }
  symbolicError.value = ''
  bits.value = result.bits
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    bits: { ...bits.value },
    filePath: filePath.value,
    recursive: recursive.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

watch([bits, filePath, recursive], scheduleSnapshot, { deep: true })

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
})

function copyText(text: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success('已复制')
}
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 shrink-0">
      <h1 class="text-sm font-bold tracking-tight">Linux chmod 权限计算器</h1>
      <p class="text-[11px] text-slate-500 dark:text-slate-400">权限矩阵、八进制与符号位的双向换算</p>
    </header>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-auto">
      <section class="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
        <div v-for="role in roles" :key="role.key" class="space-y-2">
          <div class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ role.label }}</div>
          <div class="flex items-center gap-4">
            <NCheckbox
              v-for="permission in permissions"
              :key="permission.mask"
              :checked="hasPermission(role.key, permission.mask)"
              @update:checked="checked => togglePermission(role.key, permission.mask, checked)"
            >
              {{ permission.label }}
            </NCheckbox>
          </div>
        </div>
        <div class="flex items-center gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
          <span v-for="item in specials" :key="item.key" class="flex items-center gap-2 text-xs">
            <NSwitch :value="bits[item.key]" size="small" @update:value="value => (bits = { ...bits, [item.key]: value })" />
            {{ item.label }}
          </span>
        </div>
      </section>

      <section class="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div class="space-y-1">
          <span class="text-xs text-slate-500 dark:text-slate-400">数字权限（失焦 / 回车提交）</span>
          <NInput v-model:value="octalInput" placeholder="755 或 4755" @blur="commitOctal" @keyup.enter="commitOctal" />
          <NAlert v-if="octalError" type="error" :bordered="false">{{ octalError }}</NAlert>
        </div>
        <div class="space-y-1">
          <span class="text-xs text-slate-500 dark:text-slate-400">符号权限（失焦 / 回车提交）</span>
          <NInput v-model:value="symbolicInput" placeholder="rwxr-xr-x" @blur="commitSymbolic" @keyup.enter="commitSymbolic" />
          <NAlert v-if="symbolicError" type="error" :bordered="false">{{ symbolicError }}</NAlert>
        </div>
        <div class="flex items-center gap-3">
          <span class="w-20 text-xs text-slate-500 dark:text-slate-400">八进制</span>
          <NInput :value="octal" readonly />
          <NButton size="tiny" @click="copyText(octal)">复制</NButton>
        </div>
        <div class="flex items-center gap-3">
          <span class="w-20 text-xs text-slate-500 dark:text-slate-400">符号位</span>
          <NInput :value="symbolic" readonly />
          <NButton size="tiny" @click="copyText(symbolic)">复制</NButton>
        </div>
        <div class="flex items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <NInput v-model:value="filePath" placeholder="目标路径（可选）" />
          <span class="flex items-center gap-2 text-xs whitespace-nowrap"><NSwitch v-model:value="recursive" size="small" />递归 -R</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="w-20 text-xs text-slate-500 dark:text-slate-400">命令</span>
          <NInput :value="command" readonly />
          <NButton size="tiny" @click="copyText(command)">复制</NButton>
        </div>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 在 App.vue 注册**

```ts
const ChmodCalc = defineAsyncComponent(() => import('@/views/tools/ChmodCalc/ChmodCalc.vue'))
```

`resolveBaseComponent` 内（`radix-case` 分支之后）追加：

```ts
  if (toolId === 'chmod-calc' || toolId === 'chmod_calc') {
    return ChmodCalc
  }
```

- [ ] **Step 3: 类型检查与界面自检**

Run: `npm run build`
Expected: 构建通过。dev 服务中勾选矩阵会同步更新八进制/符号位/命令；数字框输入 `7` 后失焦只报错、矩阵不变；输入 `755` 后失焦矩阵回填。

- [ ] **Step 4: 提交**

```bash
git add src/views/tools/ChmodCalc/ChmodCalc.vue src/App.vue
git commit -m "feat(chmod-calc): 新增权限计算器视图并注册工具入口"
```

---

### Task 10: password-ssh 密码生成纯函数（utils/password.ts）

**Files:**
- Create: `src/views/tools/PasswordSsh/utils/password.ts`
- Test: `src/views/tools/PasswordSsh/__tests__/password.spec.ts`

**Interfaces:**
- Produces:
  - `interface PasswordOptions { length: number; upper: boolean; lower: boolean; digits: boolean; symbols: boolean; excludeAmbiguous: boolean; count: number }`
  - `CHAR_CLASSES`、`AMBIGUOUS_CHARS = '0O1lI|'`
  - `buildCharset(options: PasswordOptions): { charset: string; classes: string[]; droppedClasses: string[]; error?: string }`
  - `generatePasswords(options: PasswordOptions, rng?: (bytes: Uint8Array) => void): { passwords: string[]; error?: string }`
  - `estimateEntropy(options: PasswordOptions): { bits: number; level: 'weak' | 'medium' | 'strong' }`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/PasswordSsh/__tests__/password.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  AMBIGUOUS_CHARS,
  buildCharset,
  estimateEntropy,
  generatePasswords,
  type PasswordOptions
} from '../utils/password'

// 确定性 RNG：始终返回 0，用于断言长度、字符集与每类至少一个字符。
const zeroRng = (bytes: Uint8Array) => bytes.fill(0)

const base: PasswordOptions = {
  length: 16,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false,
  count: 1
}

describe('password-ssh 密码生成', () => {
  it('排除易混淆字符后字符集不再包含这些字符', () => {
    const { charset } = buildCharset({ ...base, excludeAmbiguous: true })
    for (const char of AMBIGUOUS_CHARS) expect(charset).not.toContain(char)
  })

  it('生成长度正确且每类至少一个字符', () => {
    const { passwords, error } = generatePasswords({ ...base, count: 3 }, zeroRng)
    expect(error).toBeUndefined()
    expect(passwords).toHaveLength(3)
    for (const password of passwords) {
      expect(password).toHaveLength(16)
      expect(/[A-Z]/.test(password)).toBe(true)
      expect(/[a-z]/.test(password)).toBe(true)
      expect(/[0-9]/.test(password)).toBe(true)
    }
  })

  it('关闭的字符类别不会出现在结果里', () => {
    const { passwords } = generatePasswords({ ...base, upper: false, symbols: false }, zeroRng)
    expect(passwords[0]).toMatch(/^[a-z0-9]+$/)
  })

  it('长度与数量越界、未启用任何字符集都返回错误', () => {
    expect(generatePasswords({ ...base, length: 3 }, zeroRng).error).toBeTruthy()
    expect(generatePasswords({ ...base, count: 0 }, zeroRng).error).toBeTruthy()
    expect(
      generatePasswords({ ...base, upper: false, lower: false, digits: false, symbols: false }, zeroRng).error
    ).toBeTruthy()
  })

  it('熵值按排除易混淆后的实际字符集计算', () => {
    const withAmbiguous = estimateEntropy({ ...base, excludeAmbiguous: false })
    const withoutAmbiguous = estimateEntropy({ ...base, excludeAmbiguous: true })
    expect(withoutAmbiguous.bits).toBeLessThan(withAmbiguous.bits)
    expect(withAmbiguous.level).toBe('strong')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/PasswordSsh/__tests__/password.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../utils/password"`。

- [ ] **Step 3: 实现 password.ts**

创建 `src/views/tools/PasswordSsh/utils/password.ts`：

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/PasswordSsh/__tests__/password.spec.ts`
Expected: PASS（5 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/PasswordSsh/utils/password.ts src/views/tools/PasswordSsh/__tests__/password.spec.ts
git commit -m "feat(password-ssh): 新增强密码生成纯函数与单测"
```

---

### Task 11: password-ssh 视图与注册

**Files:**
- Create: `src/views/tools/PasswordSsh/PasswordSsh.vue`
- Modify: `src/App.vue`

**Interfaces:**
- Consumes: `generatePasswords` / `estimateEntropy` / `PasswordOptions`（Task 10）
- Produces: `PasswordSsh.vue`，快照字段 `{ panel, length, charsets, excludeAmbiguous, count, persistResults, results? }`（`results` 仅在开关开启时写入）

- [ ] **Step 1: 创建视图组件**

创建 `src/views/tools/PasswordSsh/PasswordSsh.vue`：

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  NAlert,
  NButton,
  NInputNumber,
  NRadioButton,
  NRadioGroup,
  NSlider,
  NSwitch,
  NTag,
  useMessage
} from 'naive-ui'
import { useTabStore } from '@/stores/tabStore'
import { estimateEntropy, generatePasswords, type PasswordOptions } from './utils/password'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

type Panel = 'password' | 'ssh'

const panel = ref<Panel>(props.initialSnapshot?.panel ?? 'password')
const length = ref<number>(props.initialSnapshot?.length ?? 16)
const charsets = ref({
  upper: props.initialSnapshot?.charsets?.upper ?? true,
  lower: props.initialSnapshot?.charsets?.lower ?? true,
  digits: props.initialSnapshot?.charsets?.digits ?? true,
  symbols: props.initialSnapshot?.charsets?.symbols ?? true
})
const excludeAmbiguous = ref<boolean>(props.initialSnapshot?.excludeAmbiguous ?? true)
const count = ref<number>(props.initialSnapshot?.count ?? 1)
const persistResults = ref<boolean>(props.initialSnapshot?.persistResults ?? false)
const results = ref<string[]>(props.initialSnapshot?.results ?? [])
const errorMessage = ref<string>('')
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const options = computed<PasswordOptions>(() => ({
  length: length.value,
  upper: charsets.value.upper,
  lower: charsets.value.lower,
  digits: charsets.value.digits,
  symbols: charsets.value.symbols,
  excludeAmbiguous: excludeAmbiguous.value,
  count: count.value
}))

const entropy = computed(() => estimateEntropy(options.value))
const strengthLabel = computed(() => ({ weak: '弱', medium: '中', strong: '强' })[entropy.value.level])

function snapshotPayload(): Record<string, any> {
  const payload: Record<string, any> = {
    panel: panel.value,
    length: length.value,
    charsets: { ...charsets.value },
    excludeAmbiguous: excludeAmbiguous.value,
    count: count.value,
    persistResults: persistResults.value
  }
  if (persistResults.value) payload.results = [...results.value]
  return payload
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, snapshotPayload())
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function generate() {
  const { passwords, error } = generatePasswords(options.value)
  if (error) {
    errorMessage.value = error
    return
  }
  errorMessage.value = ''
  results.value = passwords
  saveSnapshot()
}

function copyText(text: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success('已复制')
}

watch([panel, length, charsets, excludeAmbiguous, count], scheduleSnapshot, { deep: true })
// 敏感开关不走防抖：关闭时立即写库，快照里不再携带 results。
watch(persistResults, () => saveSnapshot())

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">强密码生成与 SSH Key</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">crypto.getRandomValues 随机源，每个字符类别至少落一个</p>
      </div>
      <NRadioGroup v-model:value="panel" size="small">
        <NRadioButton value="password">密码生成</NRadioButton>
        <NRadioButton value="ssh">SSH Key</NRadioButton>
      </NRadioGroup>
    </header>

    <div class="flex-1 min-h-0 overflow-auto p-4 space-y-4">
      <section v-if="panel === 'password'" class="space-y-4">
        <div class="flex items-center gap-3">
          <span class="w-20 text-xs text-slate-500 dark:text-slate-400">长度</span>
          <NSlider v-model:value="length" class="max-w-md" :min="4" :max="128" />
          <NInputNumber v-model:value="length" class="w-24" size="small" :min="4" :max="128" />
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="charsets.upper" size="small" />大写 A-Z</span>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="charsets.lower" size="small" />小写 a-z</span>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="charsets.digits" size="small" />数字 0-9</span>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="charsets.symbols" size="small" />符号</span>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="excludeAmbiguous" size="small" />排除易混淆字符 0O1lI|</span>
        </div>
        <div class="flex items-center gap-4">
          <span class="flex items-center gap-2 text-xs">
            数量
            <NInputNumber v-model:value="count" class="w-20" size="small" :min="1" :max="20" />
          </span>
          <NButton type="primary" size="small" @click="generate">生成</NButton>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="persistResults" size="small" />持久化生成结果</span>
        </div>
        <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
        <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>强度：{{ entropy.bits }} bits</span>
          <NTag size="small" :type="entropy.level === 'strong' ? 'success' : entropy.level === 'medium' ? 'warning' : 'error'">
            {{ strengthLabel }}
          </NTag>
        </div>
        <div class="space-y-2">
          <div v-for="(password, index) in results" :key="`${index}-${password}`" class="flex items-center gap-3">
            <code class="flex-1 font-mono text-xs break-all">{{ password }}</code>
            <NButton size="tiny" @click="copyText(password)">复制</NButton>
          </div>
          <p v-if="!results.length" class="text-xs text-slate-400">点击「生成」创建密码</p>
        </div>
      </section>

      <section v-else class="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500 dark:text-slate-400">
        SSH Key 指纹解析将在第二阶段批次 C 交付（需要引入成熟的密钥解析能力）。
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 在 App.vue 注册**

```ts
const PasswordSsh = defineAsyncComponent(() => import('@/views/tools/PasswordSsh/PasswordSsh.vue'))
```

`resolveBaseComponent` 内（`chmod-calc` 分支之后）追加：

```ts
  if (toolId === 'password-ssh' || toolId === 'password_ssh') {
    return PasswordSsh
  }
```

- [ ] **Step 3: 类型检查与界面自检**

Run: `npm run build`
Expected: 构建通过。dev 服务中点「生成」得到指定长度的密码；关闭全部字符集开关时出现错误提示；切到 SSH Key 页签看到批次 C 占位说明。

- [ ] **Step 4: 提交**

```bash
git add src/views/tools/PasswordSsh/PasswordSsh.vue src/App.vue
git commit -m "feat(password-ssh): 新增强密码生成视图与 SSH 页签占位并注册入口"
```

---

### Task 12: 全量回归与验收

**Files:** 无新增（只跑验证；若发现回归，修正对应任务的文件后重跑）

- [ ] **Step 1: 前端全量测试与构建**

Run: `npm test`
Expected: 第一期既有用例 + 批次 A 新增的 5 组用例全部 PASS。

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，`dist/assets/` 下能看到 5 个新工具各自的 chunk。

- [ ] **Step 2: Rust 回归（批次 A 不涉及 Rust 改动，仅确认未破）**

Run: `cargo clippy --all-targets -- -D warnings`（工作目录 `src-tauri`）
Expected: 无 warning。

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部通过。

- [ ] **Step 3: 人工验收清单（dev 服务 `http://localhost:1420`）**

1. 侧边栏依次打开 5 个工具，均不再出现 `ToolPlaceholder` 占位页。
2. `json-to-types`：输入 `{"id":1892837482910293847}`，切 Go 看 `int64`、切 TS 看 `string` 带注释；关闭 Tab 再打开，输入内容与语言选择均还原。
3. `url-parser`：改一个 Query 参数后底部拼装结果同步变化；关闭 Tab 再打开，URL 与「自动解码」开关均还原。
4. `radix-case`：三个面板内容、行处理选项、前后缀在重开 Tab 后均还原。
5. `chmod-calc`：勾选矩阵后，数字框输入 `755` 能回填；重开 Tab 后矩阵与路径还原。
6. `password-ssh`：默认「持久化生成结果」关闭，生成后关闭再打开 Tab 不应出现旧密码；打开开关后生成，重开 Tab 能恢复结果。

- [ ] **Step 4: 确认提交历史与工作区状态**

Run: `git log --oneline -12`
Expected: 看到本计划各任务的提交记录。

Run: `git status --short`
Expected: 无未提交改动。

- [ ] **Step 5: 向用户汇报**

汇报内容：新增的 5 个工具与各自 utils/测试文件、快照字段、跑过的验证命令与结果、以及批次 B / 批次 C 的衔接点（YAML/TOML 解析依赖、SSH 指纹、SQL 格式化）。

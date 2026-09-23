# 第二阶段批次 B 实施计划：YAML / Properties / TOML 工具集

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 3 个真实工具——`yaml-prop-json`（JSON / YAML / Properties 三向互转）、`yaml-validator`、`toml-validator`（语法校验 + 行列定位 + 格式化），业务逻辑全部下沉到可单测的 `utils`，并按前两期约定把输入与视图选项持久化到 SQLite 快照。

**Architecture:** 每个工具一个目录 `src/views/tools/<ToolName>/`：`utils/*.ts` 放纯函数（TDD，Vitest 覆盖），`<ToolName>.vue` 只做状态绑定与渲染。两个第三方解析库（`yaml`、`smol-toml`）统一收敛到共享适配层 `src/utils/yamlAdapter.ts` / `src/utils/tomlAdapter.ts`，把库特有的选项名、错误字段、API 差异隔离在两个文件里，其余代码只依赖我们自己定义的 `ParseIssue` 结构。`src/App.vue` 用 `defineAsyncComponent` 注册 3 个视图并在 `resolveBaseComponent` 中同时兼容连字符与下划线 id。

**Tech Stack:** Vue 3 (`<script setup lang="ts">`) + Naive UI + Tailwind + CodeMirror 6 + Vitest；YAML 解析用 `yaml`，TOML 解析用 `smol-toml`，大整数无损 JSON 复用 `src/views/tools/JsonSuite/utils/losslessJson.ts` 的 `LosslessJSON`。

**Spec:** `docs/superpowers/specs/2026-09-23-phase2-batch-b-design.md`

## Global Constraints

- 新增依赖仅 `yaml` 与 `smol-toml` 两个；除此之外 `package.json` 与 lock 文件不得改动。
- 不改 `src-tauri/` 下任何文件。
- `src/types/tool.ts` 只新增 `yaml-validator` 与 `toml-validator` 两条定义；`yaml-prop-json` 与其余既有工具定义不得改动。
- 组件 Props 契约固定：`defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()`。
- 快照：回填 `props.initialSnapshot?.x ?? <默认值>`；落库 `tabStore.updateTabSnapshot(props.tabId, {...})`；文本输入 250ms 防抖；只持久化输入与视图选项，不持久化派生结果与错误信息。
- 错误处理：非法输入用 `NAlert` 就地提示并保留上一次有效结果；空输入只显示空态不报错。
- 输入规模护栏：`yaml-prop-json` 的实时派生在输入超过 1MB 时关闭，改为手动点击「转换」按钮；两个校验器本就是手动触发，不受此限制。
- 大整数绝不经过 `Number`：YAML 侧以 `intAsBigInt: true` 解析成原生 `bigint`，JSON 侧由 `LosslessJSON` 原样序列化为**数字字面量**（不转字符串），保证 `JSON → YAML → JSON` 与 `YAML → JSON → YAML` 类型与数值都不变。
- YAML 宽松模式：日期/时间戳转 ISO 8601 字符串并 warning；锚点就地展开；多文档只取首个并 warning；`!!binary` 等非常规 tag 报错并保留上次有效结果。
- Properties 值一律按字符串处理，不做类型推断；键冲突（同一路径既是标量又是对象）报错并保留上次有效结果。
- 每个任务结束都要 `npm test` 与 `npm run build` 通过，并单独提交一次 git。

---

### Task 1: 依赖安装与共享解析适配层

**Files:**
- Modify: `package.json`（新增 `dependencies`）
- Create: `src/utils/yamlAdapter.ts`
- Create: `src/utils/tomlAdapter.ts`
- Test: `src/utils/__tests__/yamlAdapter.spec.ts`
- Test: `src/utils/__tests__/tomlAdapter.spec.ts`

**Interfaces:**
- Produces:
  - `interface ParseIssue { message: string; line?: number; column?: number }`
  - `interface YamlParseOutcome { value: unknown; error?: ParseIssue; warnings: string[] }`
  - `parseYamlSource(text: string): YamlParseOutcome`
  - `stringifyYamlSource(value: unknown, mode?: 'pretty' | 'compact'): string`
  - `interface TomlParseOutcome { value: unknown; error?: ParseIssue }`
  - `parseTomlSource(text: string): TomlParseOutcome`
  - `stringifyTomlSource(value: unknown): string`

说明：后续所有任务只依赖上面这些签名，不直接调用 `yaml` / `smol-toml`。库特有的选项名与错误字段只在本文件里出现。

- [ ] **Step 1: 安装依赖**

Run: `npm install yaml smol-toml`
Expected: 两个包写入 `package.json` 的 `dependencies` 与 lock 文件。（该命令需要联网；若沙箱拒绝网络，请申请联网权限后重跑。）

- [ ] **Step 2: 探测两个库的实际 API 表面**

Run:
```bash
node --input-type=module -e "import { stringify } from 'yaml'; console.log(JSON.stringify(stringify({a:{b:[1,2]}}, {collectionStyle:'flow'})))"
```
Expected: 输出单行 flow 风格，形如 `"{\"a\": {\"b\": [1, 2]}}\n"`。若该选项报错或输出仍是多行，读 `node_modules/yaml/dist/options.d.ts` 里 `StringifyOptions` 的实际选项名（例如 `flowLevel`），并在 Step 4 中改用确认后的名字。

Run:
```bash
node --input-type=module -e "import { parse } from 'smol-toml'; try { parse('a = ') } catch (e) { console.log(JSON.stringify({keys:Object.keys(e), line:e.line, column:e.column, message:e.message})) }"
```
Expected: `keys` 里包含 `line` 与 `column`。若字段名不同，读 `node_modules/smol-toml/dist/index.d.ts` 确认后调整 Step 6 的 `toIssue`。

- [ ] **Step 3: 写失败测试**

创建 `src/utils/__tests__/yamlAdapter.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { parseYamlSource, stringifyYamlSource } from '../yamlAdapter'

describe('yamlAdapter 解析', () => {
  it('解析普通 YAML 并把超限整数保留为 bigint', () => {
    const { value, error } = parseYamlSource('id: 1892837482910293847')
    expect(error).toBeUndefined()
    expect(value).toEqual({ id: 1892837482910293847n })
  })

  it('多文档只取第一个并给出 warning', () => {
    const { value, warnings } = parseYamlSource('a: 1\n---\nb: 2')
    expect(value).toEqual({ a: 1 })
    expect(warnings.some(item => item.includes('文档'))).toBe(true)
  })

  it('锚点与引用就地展开为独立副本', () => {
    const { value } = parseYamlSource('base: &b\n  x: 1\ncopy: *b')
    expect(value).toEqual({ base: { x: 1 }, copy: { x: 1 } })
  })

  it('非常规 tag 报错而不是抛异常', () => {
    const { error } = parseYamlSource('data: !!binary "aGk="')
    expect(error).toBeTruthy()
  })

  it('非法语法返回行列定位', () => {
    const { error } = parseYamlSource('a: [1, 2')
    expect(error).toBeTruthy()
    expect(error?.line).toBe(1)
  })

  it('空输入返回空值且不报错', () => {
    const { value, error, warnings } = parseYamlSource('   ')
    expect(value).toBeNull()
    expect(error).toBeUndefined()
    expect(warnings).toEqual([])
  })
})

describe('yamlAdapter 序列化', () => {
  it('pretty 模式输出多行缩进 YAML', () => {
    const out = stringifyYamlSource({ a: { b: 1 } }, 'pretty')
    expect(out).toBe('a:\n  b: 1')
  })

  it('compact 模式输出单行 flow 风格', () => {
    const out = stringifyYamlSource({ a: { b: [1, 2] } }, 'compact')
    expect(out.includes('\n')).toBe(false)
    expect(out).toContain('{')
  })
})
```

创建 `src/utils/__tests__/tomlAdapter.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { parseTomlSource, stringifyTomlSource } from '../tomlAdapter'

describe('tomlAdapter', () => {
  it('解析 TOML 表与数组表', () => {
    const { value, error } = parseTomlSource('[a]\nb = 1\n\n[[c]]\nd = 2')
    expect(error).toBeUndefined()
    expect(value).toEqual({ a: { b: 1 }, c: [{ d: 2 }] })
  })

  it('非法语法返回行列定位', () => {
    const { error } = parseTomlSource('a = ')
    expect(error).toBeTruthy()
    expect(typeof error?.line).toBe('number')
  })

  it('空输入返回空值且不报错', () => {
    const { value, error } = parseTomlSource('   ')
    expect(value).toBeNull()
    expect(error).toBeUndefined()
  })

  it('序列化输出规范化 TOML', () => {
    const out = stringifyTomlSource({ a: { b: 1 } })
    expect(out).toContain('[a]')
    expect(out).toContain('b = 1')
  })
})
```

- [ ] **Step 4: 运行测试确认失败**

Run: `npx vitest run src/utils/__tests__`
Expected: FAIL，报 `Failed to resolve import "../yamlAdapter"` 与 `"../tomlAdapter"`。

- [ ] **Step 5: 实现 yamlAdapter.ts**

创建 `src/utils/yamlAdapter.ts`：

```ts
import { parseAllDocuments, stringify as yamlStringify } from 'yaml'

export interface ParseIssue {
  message: string
  line?: number
  column?: number
}

export interface YamlParseOutcome {
  value: unknown
  error?: ParseIssue
  warnings: string[]
}

interface YamlErrorLike {
  message?: string
  linePos?: { line?: number; col?: number }[]
}

function toIssue(raw: unknown): ParseIssue {
  const err = raw as YamlErrorLike
  const pos = err?.linePos?.[0]
  return {
    message: (err?.message ?? 'YAML 解析失败').split('\n')[0],
    line: pos?.line,
    column: pos?.col
  }
}

// 宽松模式：把库解析出的 Date 统一降级为 ISO 字符串，并记录被改写的路径。
function normalizeDates(value: unknown, path: string, warnings: string[]): unknown {
  if (value instanceof Date) {
    warnings.push(`${path || '根节点'} 是日期时间，已转为 ISO 8601 字符串`)
    return value.toISOString()
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeDates(item, `${path}[${index}]`, warnings))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = normalizeDates(item, path ? `${path}.${key}` : key, warnings)
    }
    return out
  }
  return value
}

export function parseYamlSource(text: string): YamlParseOutcome {
  const warnings: string[] = []
  if (!text.trim()) return { value: null, warnings }

  let docs: ReturnType<typeof parseAllDocuments>
  try {
    docs = parseAllDocuments(text, { intAsBigInt: true })
  } catch (err) {
    return { value: null, error: toIssue(err), warnings }
  }
  if (docs.length === 0) return { value: null, warnings }
  if (docs.length > 1) warnings.push(`输入包含 ${docs.length} 个文档，仅解析第一个`)

  const doc = docs[0]
  if (doc.errors.length > 0) {
    return { value: null, error: toIssue(doc.errors[0]), warnings }
  }
  for (const warning of doc.warnings) warnings.push(warning.message)

  const raw = doc.toJS()
  return { value: normalizeDates(raw, '', warnings), warnings }
}

export function stringifyYamlSource(value: unknown, mode: 'pretty' | 'compact' = 'pretty'): string {
  if (mode === 'compact') return yamlStringify(value, { collectionStyle: 'flow' }).trimEnd()
  return yamlStringify(value, { indent: 2 }).trimEnd()
}
```

- [ ] **Step 6: 实现 tomlAdapter.ts**

创建 `src/utils/tomlAdapter.ts`：

```ts
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml'
import type { ParseIssue } from './yamlAdapter'

export interface TomlParseOutcome {
  value: unknown
  error?: ParseIssue
}

interface TomlErrorLike {
  message?: string
  line?: number
  column?: number
}

function toIssue(raw: unknown): ParseIssue {
  const err = raw as TomlErrorLike
  return {
    message: (err?.message ?? 'TOML 解析失败').split('\n')[0],
    line: typeof err?.line === 'number' ? err.line : undefined,
    column: typeof err?.column === 'number' ? err.column : undefined
  }
}

export function parseTomlSource(text: string): TomlParseOutcome {
  if (!text.trim()) return { value: null }
  try {
    return { value: tomlParse(text) }
  } catch (err) {
    return { value: null, error: toIssue(err) }
  }
}

export function stringifyTomlSource(value: unknown): string {
  return tomlStringify(value as Record<string, unknown>).trimEnd()
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run src/utils/__tests__`
Expected: PASS（12 个用例全绿）。若 `compact` 或行列断言的期望值不符，以 Step 2 探测到的真实 API 行为为准修正**适配层实现**，不要放宽断言。

- [ ] **Step 8: 跑全量测试并提交**

Run: `npm test`
Expected: 既有用例 + 新增用例全部 PASS。

```bash
git add package.json package-lock.json src/utils/yamlAdapter.ts src/utils/tomlAdapter.ts src/utils/__tests__
git commit -m "feat(deps): 引入 yaml 与 smol-toml 并新增共享解析适配层与单测"
```

---

### Task 2: yaml-prop-json 的 Properties 解析与生成（utils/properties.ts）

**Files:**
- Create: `src/views/tools/YamlPropJson/utils/properties.ts`
- Test: `src/views/tools/YamlPropJson/__tests__/properties.spec.ts`

**Interfaces:**
- Produces:
  - `interface PropertiesParseResult { value: unknown; error?: string; warnings: string[] }`
  - `parseProperties(text: string): PropertiesParseResult`
  - `stringifyProperties(value: unknown): string`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/YamlPropJson/__tests__/properties.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { parseProperties, stringifyProperties } from '../utils/properties'

describe('yaml-prop-json 的 Properties 解析', () => {
  it('点分键展开为嵌套对象', () => {
    const { value, error } = parseProperties('a.b.c=1')
    expect(error).toBeUndefined()
    expect(value).toEqual({ a: { b: { c: '1' } } })
  })

  it('中括号与纯数字两种数组写法等价', () => {
    const bracket = parseProperties('servers[0].url=a\nservers[1].url=b')
    const dotted = parseProperties('servers.0.url=a\nservers.1.url=b')
    expect(bracket.value).toEqual({ servers: [{ url: 'a' }, { url: 'b' }] })
    expect(dotted.value).toEqual(bracket.value)
  })

  it('忽略注释行并统计被丢弃的行数', () => {
    const { value, warnings } = parseProperties('# c1\n! c2\na=1')
    expect(value).toEqual({ a: '1' })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('2')
  })

  it('无等号键按空值处理，转义点号不拆层', () => {
    expect(parseProperties('flag').value).toEqual({ flag: '' })
    expect(parseProperties('a\\.b=1').value).toEqual({ 'a.b': '1' })
  })

  it('键冲突报错而不是覆盖', () => {
    const { error } = parseProperties('a=1\na.b=2')
    expect(error).toBeTruthy()
  })

  it('值一律保持字符串，不做类型推断', () => {
    expect(parseProperties('n=123\nb=true').value).toEqual({ n: '123', b: 'true' })
  })

  it('空输入返回空对象', () => {
    expect(parseProperties('   ').value).toEqual({})
  })
})

describe('yaml-prop-json 的 Properties 生成', () => {
  it('嵌套对象压平为点分键', () => {
    expect(stringifyProperties({ a: { b: '1' } })).toBe('a.b=1')
  })

  it('数组统一输出中括号风格', () => {
    expect(stringifyProperties({ servers: [{ url: 'a' }, { url: 'b' }] })).toBe('servers[0].url=a\nservers[1].url=b')
  })

  it('往返无损', () => {
    const text = 'a.b=1\nservers[0].url=x\nflag='
    expect(stringifyProperties(parseProperties(text).value)).toBe(text)
  })

  it('空对象与空值都有确定输出', () => {
    expect(stringifyProperties({})).toBe('')
    expect(stringifyProperties({ a: '' })).toBe('a=')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/YamlPropJson/__tests__/properties.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../utils/properties"`。

- [ ] **Step 3: 实现 properties.ts**

创建 `src/views/tools/YamlPropJson/utils/properties.ts`：

```ts
export interface PropertiesParseResult {
  value: unknown
  error?: string
  warnings: string[]
}

interface Segment {
  key: string
  index?: number
}

interface Entry {
  segments: Segment[]
  value: string
}

function unescapeKey(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (ch === '\\' && i + 1 < raw.length && (raw[i + 1] === '.' || raw[i + 1] === '\\')) {
      out += raw[i + 1]
      i += 1
      continue
    }
    out += ch
  }
  return out
}

function escapeKey(key: string): string {
  return key.replace(/\\/g, '\\\\').replace(/\./g, '\\.')
}

function unescapeValue(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (ch !== '\\' || i + 1 >= raw.length) {
      out += ch
      continue
    }
    const next = raw[i + 1]
    if (next === 'n') out += '\n'
    else if (next === 'r') out += '\r'
    else if (next === 't') out += '\t'
    else if (next === '\\') out += '\\'
    else out += next
    i += 1
  }
  return out
}

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/([=:#!])/g, '\\$1')
}

// 把 a.b[0].c 拆成 [{key:'a'},{key:'b'},{key:'',index:0},{key:'c'}]；
// 纯数字段（a.0.b）同样按索引处理。
function parseKeyPath(rawKey: string): Segment[] {
  const segments: Segment[] = []
  let buffer = ''
  let i = 0
  const flush = () => {
    if (!buffer) return
    const text = unescapeKey(buffer)
    buffer = ''
    if (/^\d+$/.test(text)) segments.push({ key: '', index: Number(text) })
    else segments.push({ key: text })
  }
  while (i < rawKey.length) {
    const ch = rawKey[i]
    if (ch === '\\' && i + 1 < rawKey.length) {
      buffer += ch + rawKey[i + 1]
      i += 2
      continue
    }
    if (ch === '.') {
      flush()
      i += 1
      continue
    }
    if (ch === '[') {
      const close = rawKey.indexOf(']', i + 1)
      const indexText = close < 0 ? '' : rawKey.slice(i + 1, close)
      if (/^\d+$/.test(indexText)) {
        flush()
        segments.push({ key: '', index: Number(indexText) })
        i = close + 1
        continue
      }
    }
    buffer += ch
    i += 1
  }
  flush()
  return segments
}

function findSeparator(line: string): number {
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '\\') {
      i += 1
      continue
    }
    if (ch === '=' || ch === ':') return i
  }
  return -1
}

function buildFromEntries(entries: Entry[]): { value: unknown; error?: string } {
  const root: Record<string, unknown> = {}
  for (const entry of entries) {
    let node: any = root
    for (let i = 0; i < entry.segments.length; i += 1) {
      const seg = entry.segments[i]
      const isLast = i === entry.segments.length - 1
      const nextIsIndex = entry.segments[i + 1]?.index !== undefined

      if (seg.index !== undefined) {
        if (!Array.isArray(node)) return { value: null, error: '键路径冲突：数组索引出现在非数组位置' }
        if (isLast) {
          node[seg.index] = entry.value
          break
        }
        if (node[seg.index] === undefined) node[seg.index] = nextIsIndex ? [] : {}
        else if (typeof node[seg.index] !== 'object' || node[seg.index] === null) {
          return { value: null, error: `键路径冲突：${seg.index} 既是标量又是对象` }
        }
        node = node[seg.index]
        continue
      }

      const key = seg.key
      if (isLast) {
        const existing = node[key]
        if (existing !== undefined && typeof existing === 'object' && existing !== null) {
          return { value: null, error: `键路径冲突：${key} 既是标量又是对象` }
        }
        node[key] = entry.value
        break
      }
      if (node[key] === undefined) node[key] = nextIsIndex ? [] : {}
      else if (typeof node[key] !== 'object' || node[key] === null) {
        return { value: null, error: `键路径冲突：${key} 既是标量又是对象` }
      }
      node = node[key]
    }
  }
  return { value: root }
}

export function parseProperties(text: string): PropertiesParseResult {
  const warnings: string[] = []
  if (!text.trim()) return { value: {}, warnings }

  const entries: Entry[] = []
  let commentCount = 0
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#') || trimmed.startsWith('!')) {
      commentCount += 1
      continue
    }
    const sep = findSeparator(trimmed)
    const rawKey = sep < 0 ? trimmed : trimmed.slice(0, sep)
    const rawValue = sep < 0 ? '' : trimmed.slice(sep + 1).trim()
    entries.push({ segments: parseKeyPath(rawKey.trim()), value: unescapeValue(rawValue) })
  }
  if (commentCount > 0) warnings.push(`已忽略 ${commentCount} 行注释`)

  const built = buildFromEntries(entries)
  return built.error ? { value: null, error: built.error, warnings } : { value: built.value, warnings }
}

function walk(node: unknown, prefix: string, lines: string[]): void {
  if (node === null || typeof node !== 'object') {
    if (!prefix) return
    lines.push(`${prefix}=${escapeValue(node === null || node === undefined ? '' : String(node))}`)
    return
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => walk(item, `${prefix}[${index}]`, lines))
    return
  }
  const entries = Object.entries(node as Record<string, unknown>)
  if (entries.length === 0) {
    if (prefix) lines.push(`${prefix}=`)
    return
  }
  for (const [key, item] of entries) {
    const next = prefix ? `${prefix}.${escapeKey(key)}` : escapeKey(key)
    walk(item, next, lines)
  }
}

export function stringifyProperties(value: unknown): string {
  const lines: string[] = []
  walk(value, '', lines)
  return lines.join('\n')
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/YamlPropJson/__tests__/properties.spec.ts`
Expected: PASS（11 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/YamlPropJson/utils/properties.ts src/views/tools/YamlPropJson/__tests__/properties.spec.ts
git commit -m "feat(yaml-prop-json): 新增 Properties 点分键解析与生成纯函数与单测"
```

---

### Task 3: yaml-prop-json 的三向转换（jsonConvert / yamlConvert / convert）

**Files:**
- Create: `src/views/tools/YamlPropJson/utils/jsonConvert.ts`
- Create: `src/views/tools/YamlPropJson/utils/yamlConvert.ts`
- Create: `src/views/tools/YamlPropJson/utils/convert.ts`
- Test: `src/views/tools/YamlPropJson/__tests__/convert.spec.ts`

**Interfaces:**
- Consumes: `parseProperties` / `stringifyProperties`（Task 2）、`parseYamlSource` / `stringifyYamlSource`（Task 1）、`LosslessJSON` from `@/views/tools/JsonSuite/utils/losslessJson`
- Produces:
  - `parseJsonSource(text: string): { value: unknown; error?: string }`
  - `stringifyJsonSource(value: unknown): string`
  - `parseYaml(text: string): { value: unknown; error?: string; line?: number; column?: number; warnings: string[] }`
  - `stringifyYaml(value: unknown): string`
  - `type SourceFormat = 'json' | 'yaml' | 'properties'`
  - `interface ConvertOutcome { json: string; yaml: string; properties: string; error?: string; warnings: string[] }`
  - `EMPTY_CONVERT_OUTCOME: ConvertOutcome`
  - `convertFrom(source: SourceFormat, text: string): ConvertOutcome`
  - `formatIssue(message: string, line?: number, column?: number): string`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/YamlPropJson/__tests__/convert.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { convertFrom, formatIssue } from '../utils/convert'

describe('yaml-prop-json 三向转换', () => {
  it('JSON 源同时产出 YAML 与 Properties', () => {
    const out = convertFrom('json', '{"app":{"name":"devutils"},"port":8080}')
    expect(out.error).toBeUndefined()
    expect(out.yaml).toContain('name: devutils')
    expect(out.properties).toBe('app.name=devutils\nport=8080')
  })

  it('YAML 源同时产出 JSON 与 Properties', () => {
    const out = convertFrom('yaml', 'app:\n  name: devutils')
    expect(out.error).toBeUndefined()
    expect(out.json).toBe('{\n  "app": {\n    "name": "devutils"\n  }\n}')
    expect(out.properties).toBe('app.name=devutils')
  })

  it('Properties 源同时产出 JSON 与 YAML', () => {
    const out = convertFrom('properties', 'servers[0].url=https://a.example.com')
    expect(out.error).toBeUndefined()
    expect(out.json).toContain('https://a.example.com')
    expect(out.yaml).toContain('- url: https://a.example.com')
  })

  it('YAML 超限整数在 JSON 侧原样保留为数字字面量', () => {
    const out = convertFrom('yaml', 'id: 1892837482910293847')
    expect(out.error).toBeUndefined()
    expect(out.json).toContain('1892837482910293847')
    expect(out.json).not.toContain('"1892837482910293847"')
  })

  it('JSON 超限整数经 YAML 往返后类型与数值都不变', () => {
    const once = convertFrom('json', '{"id":1892837482910293847}')
    const back = convertFrom('yaml', once.yaml)
    expect(back.error).toBeUndefined()
    expect(back.json).toBe('{\n  "id": 1892837482910293847\n}')
  })

  it('多文档与注释分别给出 warning', () => {
    const yamlOut = convertFrom('yaml', 'a: 1\n---\nb: 2')
    expect(yamlOut.warnings.some(item => item.includes('文档'))).toBe(true)
    const propOut = convertFrom('properties', '# note\na=1')
    expect(propOut.warnings.some(item => item.includes('注释'))).toBe(true)
  })

  it('非法输入返回 error 且不产出内容', () => {
    const bad = convertFrom('json', '{"a":}')
    expect(bad.error).toBeTruthy()
    expect(bad.yaml).toBe('')
    expect(bad.properties).toBe('')
  })

  it('空输入返回空结果且不报错', () => {
    const out = convertFrom('json', '   ')
    expect(out.error).toBeUndefined()
    expect(out.json).toBe('')
    expect(out.warnings).toEqual([])
  })

  it('formatIssue 组合行列信息', () => {
    expect(formatIssue('缩进错误', 3, 5)).toBe('第 3 行第 5 列：缩进错误')
    expect(formatIssue('缩进错误', 3)).toBe('第 3 行：缩进错误')
    expect(formatIssue('缩进错误')).toBe('缩进错误')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/YamlPropJson/__tests__/convert.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../utils/convert"`。

- [ ] **Step 3: 实现 jsonConvert.ts**

创建 `src/views/tools/YamlPropJson/utils/jsonConvert.ts`：
本文件导出的 `parseJsonSource` / `stringifyJsonSource` 带 `Source` 后缀，用于区别于共享适配层的 `parseYamlSource` / `parseTomlSource`；行为与 spec §3.5 的 `parseJson` / `stringifyJson` 一致。

```ts
import { LosslessJSON } from '@/views/tools/JsonSuite/utils/losslessJson'

export interface JsonParseResult {
  value: unknown
  error?: string
}

export function parseJsonSource(text: string): JsonParseResult {
  if (!text.trim()) return { value: null }
  try {
    return { value: LosslessJSON.parse(text) }
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message : 'JSON 语法错误' }
  }
}

export function stringifyJsonSource(value: unknown): string {
  return LosslessJSON.stringify(value, null, 2)
}
```

- [ ] **Step 4: 实现 yamlConvert.ts**

创建 `src/views/tools/YamlPropJson/utils/yamlConvert.ts`：

```ts
import { parseYamlSource, stringifyYamlSource } from '@/utils/yamlAdapter'

export interface YamlParseResult {
  value: unknown
  error?: string
  line?: number
  column?: number
  warnings: string[]
}

export function parseYaml(text: string): YamlParseResult {
  const outcome = parseYamlSource(text)
  if (outcome.error) {
    return {
      value: null,
      error: outcome.error.message,
      line: outcome.error.line,
      column: outcome.error.column,
      warnings: outcome.warnings
    }
  }
  return { value: outcome.value, warnings: outcome.warnings }
}

export function stringifyYaml(value: unknown): string {
  return stringifyYamlSource(value, 'pretty')
}
```

- [ ] **Step 5: 实现 convert.ts**

创建 `src/views/tools/YamlPropJson/utils/convert.ts`：

```ts
import { parseProperties, stringifyProperties } from './properties'
import { parseJsonSource, stringifyJsonSource } from './jsonConvert'
import { parseYaml, stringifyYaml } from './yamlConvert'

export type SourceFormat = 'json' | 'yaml' | 'properties'

export interface ConvertOutcome {
  json: string
  yaml: string
  properties: string
  error?: string
  warnings: string[]
}

export const EMPTY_CONVERT_OUTCOME: ConvertOutcome = {
  json: '',
  yaml: '',
  properties: '',
  warnings: []
}

export function formatIssue(message: string, line?: number, column?: number): string {
  if (line === undefined) return message
  return column === undefined ? `第 ${line} 行：${message}` : `第 ${line} 行第 ${column} 列：${message}`
}

export function convertFrom(source: SourceFormat, text: string): ConvertOutcome {
  if (!text.trim()) return { ...EMPTY_CONVERT_OUTCOME, warnings: [] }

  let value: unknown = null
  const warnings: string[] = []

  if (source === 'json') {
    const parsed = parseJsonSource(text)
    if (parsed.error) return { ...EMPTY_CONVERT_OUTCOME, error: parsed.error, warnings }
    value = parsed.value
  } else if (source === 'yaml') {
    const parsed = parseYaml(text)
    warnings.push(...parsed.warnings)
    if (parsed.error) {
      return { ...EMPTY_CONVERT_OUTCOME, error: formatIssue(parsed.error, parsed.line, parsed.column), warnings }
    }
    value = parsed.value
  } else {
    const parsed = parseProperties(text)
    warnings.push(...parsed.warnings)
    if (parsed.error) return { ...EMPTY_CONVERT_OUTCOME, error: parsed.error, warnings }
    value = parsed.value
  }

  try {
    return {
      json: stringifyJsonSource(value),
      yaml: stringifyYaml(value),
      properties: stringifyProperties(value),
      warnings
    }
  } catch (err) {
    return {
      ...EMPTY_CONVERT_OUTCOME,
      error: err instanceof Error ? err.message : '转换失败',
      warnings
    }
  }
}
```

注意：`LosslessJSON.stringify` 在 `useNativeBigInt: true` 配置下会直接把原生 `bigint` 写成数字字面量。若 Step 6 的「超限整数原样保留」用例失败，说明该版本需要用 `replacer` 把 `bigint` 显式转成 `LosslessJSON` 认可的形式——先读 `node_modules/json-bigint/lib/stringify.js` 确认，再改 `stringifyJsonSource`，不要改成字符串。

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run src/views/tools/YamlPropJson/__tests__/convert.spec.ts`
Expected: PASS（9 个用例全绿）。

- [ ] **Step 7: 提交**

```bash
git add src/views/tools/YamlPropJson/utils src/views/tools/YamlPropJson/__tests__/convert.spec.ts
git commit -m "feat(yaml-prop-json): 新增 JSON/YAML/Properties 三向转换纯函数与单测"
```

---

### Task 4: yaml-prop-json 视图与 App.vue 注册

**Files:**
- Create: `src/views/tools/YamlPropJson/YamlPropJson.vue`
- Modify: `src/App.vue`（异步组件声明 + `resolveBaseComponent` 分支）

**Interfaces:**
- Consumes: `convertFrom` / `SourceFormat`（Task 3）、`useTabStore`、`useThemeStore`
- Produces: 可被 `App.vue` 异步加载的 `YamlPropJson.vue`，Props 为 `{ tabId, initialSnapshot }`，快照字段 `{ source, json, yaml, properties }`

- [ ] **Step 1: 创建视图组件**

创建 `src/views/tools/YamlPropJson/YamlPropJson.vue`（编辑器主题函数与批次 A `JsonToTypes.vue` 一致，按既有习惯在本文件内局部定义）：

```vue
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { NAlert, NButton, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { convertFrom, type SourceFormat } from './utils/convert'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

const SAMPLE_JSON = [
  '{',
  '  "app": {',
  '    "name": "devutils",',
  '    "servers": [{ "url": "https://a.example.com" }]',
  '  }',
  '}'
].join('\n')

const FORMATS: { key: SourceFormat; label: string }[] = [
  { key: 'json', label: 'JSON' },
  { key: 'yaml', label: 'YAML' },
  { key: 'properties', label: 'Properties' }
]

const source = ref<SourceFormat>(props.initialSnapshot?.source ?? 'json')
const errorMessage = ref<string>('')
const warningText = ref<string>('')
const manualMode = ref<boolean>(false)
const paneEls: Record<SourceFormat, HTMLElement | null> = { json: null, yaml: null, properties: null }
const editors: Partial<Record<SourceFormat, EditorView>> = {}
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let convertTimer: ReturnType<typeof setTimeout> | null = null
let applying = false

function setPaneRef(format: SourceFormat, el: unknown) {
  paneEls[format] = (el as HTMLElement | null) ?? null
}

function paneText(format: SourceFormat): string {
  return editors[format]?.state.doc.toString() ?? ''
}

function setPaneText(format: SourceFormat, text: string) {
  const view = editors[format]
  if (!view || view.state.doc.toString() === text) return
  applying = true
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
  applying = false
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    source: source.value,
    json: paneText('json'),
    yaml: paneText('yaml'),
    properties: paneText('properties')
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function runConvert() {
  const active = source.value
  const outcome = convertFrom(active, paneText(active))
  if (outcome.error) {
    errorMessage.value = outcome.error
    return
  }
  errorMessage.value = ''
  warningText.value = outcome.warnings.join('；')
  for (const { key } of FORMATS) {
    if (key === active) continue
    setPaneText(key, outcome[key])
  }
}

function scheduleConvert() {
  if (convertTimer) clearTimeout(convertTimer)
  convertTimer = setTimeout(runConvert, 250)
}

function resetPanes() {
  setPaneText('json', SAMPLE_JSON)
  setPaneText('yaml', '')
  setPaneText('properties', '')
  source.value = 'json'
  manualMode.value = false
  runConvert()
}

function handleChange(format: SourceFormat) {
  source.value = format
  manualMode.value = paneText(format).length > 1024 * 1024
  scheduleSnapshot()
  if (manualMode.value) return
  scheduleConvert()
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

function copyPane(format: SourceFormat) {
  const text = paneText(format)
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success('已复制')
}

onMounted(async () => {
  await nextTick()
  const initial: Record<SourceFormat, string> = {
    json: props.initialSnapshot?.json ?? SAMPLE_JSON,
    yaml: props.initialSnapshot?.yaml ?? '',
    properties: props.initialSnapshot?.properties ?? ''
  }
  for (const { key } of FORMATS) {
    const parent = paneEls[key]
    if (!parent) continue
    editors[key] = new EditorView({
      state: EditorState.create({
        doc: initial[key],
        extensions: [
          basicSetup,
          getEditorTheme(themeStore.isDark),
          EditorView.updateListener.of(update => {
            if (!update.docChanged || applying) return
            handleChange(key)
          })
        ]
      }),
      parent
    })
  }
  runConvert()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  if (convertTimer) clearTimeout(convertTimer)
  saveSnapshot()
  for (const view of Object.values(editors)) view?.destroy()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">YAML / Properties / JSON 互转</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">编辑任意一栏，其余两栏自动派生</p>
      </div>
      <div class="flex items-center gap-2">
        <NButton size="small" @click="resetPanes">重置</NButton>
        <NButton v-if="manualMode" size="small" type="primary" @click="runConvert">转换</NButton>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
      <NAlert v-else-if="warningText" type="warning" :bordered="false">{{ warningText }}</NAlert>
      <NAlert v-if="manualMode" type="warning" :bordered="false">输入超过 1MB，已关闭自动派生，请手动点击「转换」。</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-3 gap-3 p-3">
      <section
        v-for="format in FORMATS"
        :key="format.key"
        class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900"
      >
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">{{ format.label }}</span>
          <NButton size="tiny" @click="copyPane(format.key)">复制</NButton>
        </div>
        <div :ref="el => setPaneRef(format.key, el)" class="flex-1 min-h-0 overflow-hidden"></div>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 在 App.vue 注册**

`src/App.vue` 异步组件声明区追加（放在 `PasswordSsh` 声明之后）：

```ts
const YamlPropJson = defineAsyncComponent(() => import('@/views/tools/YamlPropJson/YamlPropJson.vue'))
```

`resolveBaseComponent` 内、`return ToolPlaceholder` 之前追加：

```ts
  if (toolId === 'yaml-prop-json' || toolId === 'yaml_prop_json') {
    return YamlPropJson
  }
```

- [ ] **Step 3: 类型检查与构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，Vite 产出 `dist/assets/YamlPropJson-*.js`。

- [ ] **Step 4: 提交**

```bash
git add src/views/tools/YamlPropJson/YamlPropJson.vue src/App.vue
git commit -m "feat(yaml-prop-json): 新增三栏联动互转视图并注册工具入口"
```

---

### Task 5: yaml-validator 纯函数（utils/yamlValidator.ts）

**Files:**
- Create: `src/views/tools/YamlValidator/utils/yamlValidator.ts`
- Test: `src/views/tools/YamlValidator/__tests__/yamlValidator.spec.ts`

**Interfaces:**
- Consumes: `parseYamlSource` / `stringifyYamlSource`（Task 1）
- Produces:
  - `type YamlOutputMode = 'pretty' | 'compact'`
  - `interface YamlValidateResult { valid: boolean; error?: string; line?: number; column?: number; warnings: string[]; output: string }`
  - `validateYaml(text: string, mode?: YamlOutputMode): YamlValidateResult`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/YamlValidator/__tests__/yamlValidator.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { validateYaml } from '../utils/yamlValidator'

describe('yaml-validator 校验与格式化', () => {
  it('合法 YAML 通过校验并输出规范化结果', () => {
    const result = validateYaml('a:   1\nb:\n    c: 2')
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.output).toBe('a: 1\nb:\n  c: 2')
  })

  it('非法 YAML 返回行列定位且不输出内容', () => {
    const result = validateYaml('a: [1, 2')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
    expect(result.line).toBe(1)
    expect(result.output).toBe('')
  })

  it('缩进错误能被定位到具体行', () => {
    const result = validateYaml('a:\n  b: 1\n c: 2')
    expect(result.valid).toBe(false)
    expect(typeof result.line).toBe('number')
  })

  it('compact 模式输出单行 flow 风格', () => {
    const result = validateYaml('a:\n  b:\n    - 1\n    - 2', 'compact')
    expect(result.valid).toBe(true)
    expect(result.output.includes('\n')).toBe(false)
  })

  it('多文档给出 warning 并只校验首个', () => {
    const result = validateYaml('a: 1\n---\nb: 2')
    expect(result.valid).toBe(true)
    expect(result.warnings.some(item => item.includes('文档'))).toBe(true)
  })

  it('空输入通过校验且不产出内容', () => {
    const result = validateYaml('   ')
    expect(result.valid).toBe(true)
    expect(result.output).toBe('')
    expect(result.warnings).toEqual([])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/YamlValidator/__tests__/yamlValidator.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../utils/yamlValidator"`。

- [ ] **Step 3: 实现 yamlValidator.ts**

创建 `src/views/tools/YamlValidator/utils/yamlValidator.ts`：

```ts
import { parseYamlSource, stringifyYamlSource } from '@/utils/yamlAdapter'

export type YamlOutputMode = 'pretty' | 'compact'

export interface YamlValidateResult {
  valid: boolean
  error?: string
  line?: number
  column?: number
  warnings: string[]
  output: string
}

export function validateYaml(text: string, mode: YamlOutputMode = 'pretty'): YamlValidateResult {
  const outcome = parseYamlSource(text)
  if (outcome.error) {
    return {
      valid: false,
      error: outcome.error.message,
      line: outcome.error.line,
      column: outcome.error.column,
      warnings: outcome.warnings,
      output: ''
    }
  }
  if (!text.trim()) return { valid: true, warnings: outcome.warnings, output: '' }
  return {
    valid: true,
    warnings: outcome.warnings,
    output: stringifyYamlSource(outcome.value, mode)
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/YamlValidator/__tests__/yamlValidator.spec.ts`
Expected: PASS（6 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/YamlValidator/utils/yamlValidator.ts src/views/tools/YamlValidator/__tests__/yamlValidator.spec.ts
git commit -m "feat(yaml-validator): 新增 YAML 校验与格式化纯函数与单测"
```

---

### Task 6: yaml-validator 视图与注册

**Files:**
- Create: `src/views/tools/YamlValidator/YamlValidator.vue`
- Modify: `src/App.vue`（异步组件声明 + `resolveBaseComponent` 分支）
- Modify: `src/types/tool.ts`（在 `yaml-prop-json` 定义之后新增工具定义）

**Interfaces:**
- Consumes: `validateYaml` / `YamlOutputMode`（Task 5）
- Produces: `YamlValidator.vue`，快照字段 `{ input, mode }`

- [ ] **Step 1: 在 src/types/tool.ts 新增工具定义**

在 `yaml-prop-json` 定义之后插入：

```ts
  {
    id: 'yaml-validator',
    name: 'YAML 语法校验器',
    description: 'YAML 语法校验、行列错误定位与格式化 / 压缩输出',
    category: 'format',
    icon: 'CheckCircle',
    keywords: ['yaml', 'yml', 'validate', 'lint', '校验']
  },
```

- [ ] **Step 2: 创建视图组件**

创建 `src/views/tools/YamlValidator/YamlValidator.vue`：

```vue
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NRadioButton, NRadioGroup, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { validateYaml, type YamlOutputMode } from './utils/yamlValidator'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

const SAMPLE = ['app:', '  name: devutils', '  servers:', '    - url: https://a.example.com'].join('\n')

const mode = ref<YamlOutputMode>(props.initialSnapshot?.mode ?? 'pretty')
const errorMessage = ref<string>('')
const warningText = ref<string>('')
const output = ref<string>('')
const editorEl = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

function getInput(): string {
  return editorView ? editorView.state.doc.toString() : ''
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, { input: getInput(), mode: mode.value })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function runValidate() {
  const result = validateYaml(getInput(), mode.value)
  warningText.value = result.warnings.join('；')
  if (!result.valid) {
    errorMessage.value = result.line === undefined
      ? (result.error ?? 'YAML 校验失败')
      : `第 ${result.line} 行${result.column === undefined ? '' : `第 ${result.column} 列`}：${result.error}`
    return
  }
  errorMessage.value = ''
  output.value = result.output
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

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value)
  message.success('已复制')
}

onMounted(async () => {
  await nextTick()
  if (!editorEl.value) return
  editorView = new EditorView({
    state: EditorState.create({
      doc: props.initialSnapshot?.input ?? SAMPLE,
      extensions: [
        basicSetup,
        getEditorTheme(themeStore.isDark),
        EditorView.updateListener.of(update => {
          if (update.docChanged) scheduleSnapshot()
        })
      ]
    }),
    parent: editorEl.value
  })
  runValidate()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
  editorView?.destroy()
  editorView = null
})

watch(mode, () => {
  saveSnapshot()
  runValidate()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">YAML 语法校验器</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">语法校验、行列错误定位与格式化 / 压缩输出</p>
      </div>
      <div class="flex items-center gap-3">
        <NRadioGroup v-model:value="mode" size="small">
          <NRadioButton value="pretty">格式化</NRadioButton>
          <NRadioButton value="compact">压缩</NRadioButton>
        </NRadioGroup>
        <NButton size="small" type="primary" @click="runValidate">校验</NButton>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
      <NAlert v-else-if="warningText" type="warning" :bordered="false">{{ warningText }}</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">YAML 输入</div>
        <div ref="editorEl" class="flex-1 min-h-0 overflow-hidden"></div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">规范化输出</span>
          <NButton size="tiny" @click="copyOutput">复制</NButton>
        </div>
        <pre class="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono leading-relaxed">{{ output }}</pre>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 在 App.vue 注册**

```ts
const YamlValidator = defineAsyncComponent(() => import('@/views/tools/YamlValidator/YamlValidator.vue'))
```

`resolveBaseComponent` 内（`yaml-prop-json` 分支之后）追加：

```ts
  if (toolId === 'yaml-validator' || toolId === 'yaml_validator') {
    return YamlValidator
  }
```

- [ ] **Step 4: 类型检查与构建**

Run: `npm run build`
Expected: 构建通过，产出 `dist/assets/YamlValidator-*.js`。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/YamlValidator/YamlValidator.vue src/App.vue src/types/tool.ts
git commit -m "feat(yaml-validator): 新增 YAML 校验器视图并注册工具入口"
```

---

### Task 7: toml-validator 纯函数（utils/tomlValidator.ts）

**Files:**
- Create: `src/views/tools/TomlValidator/utils/tomlValidator.ts`
- Test: `src/views/tools/TomlValidator/__tests__/tomlValidator.spec.ts`

**Interfaces:**
- Consumes: `parseTomlSource` / `stringifyTomlSource`（Task 1）
- Produces:
  - `interface TomlValidateResult { valid: boolean; error?: string; line?: number; column?: number; output: string }`
  - `validateToml(text: string): TomlValidateResult`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/TomlValidator/__tests__/tomlValidator.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { validateToml } from '../utils/tomlValidator'

describe('toml-validator 校验与格式化', () => {
  it('合法 TOML 通过校验并输出规范化结果', () => {
    const result = validateToml('[a]\nb=1')
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.output).toContain('[a]')
    expect(result.output).toContain('b = 1')
  })

  it('支持内联表与数组表', () => {
    const result = validateToml('point = { x = 1, y = 2 }\n\n[[items]]\nid = 1')
    expect(result.valid).toBe(true)
    expect(result.output).toContain('x = 1')
    expect(result.output).toContain('[[items]]')
  })

  it('未闭合字符串报错并定位', () => {
    const result = validateToml('a = "unterminated')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
    expect(typeof result.line).toBe('number')
    expect(result.output).toBe('')
  })

  it('重复键报错', () => {
    const result = validateToml('[a]\nb = 1\nb = 2')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('空输入通过校验且不产出内容', () => {
    const result = validateToml('   ')
    expect(result.valid).toBe(true)
    expect(result.output).toBe('')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/TomlValidator/__tests__/tomlValidator.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../utils/tomlValidator"`。

- [ ] **Step 3: 实现 tomlValidator.ts**

创建 `src/views/tools/TomlValidator/utils/tomlValidator.ts`：

```ts
import { parseTomlSource, stringifyTomlSource } from '@/utils/tomlAdapter'

export interface TomlValidateResult {
  valid: boolean
  error?: string
  line?: number
  column?: number
  output: string
}

export function validateToml(text: string): TomlValidateResult {
  if (!text.trim()) return { valid: true, output: '' }

  const outcome = parseTomlSource(text)
  if (outcome.error) {
    return {
      valid: false,
      error: outcome.error.message,
      line: outcome.error.line,
      column: outcome.error.column,
      output: ''
    }
  }
  try {
    return { valid: true, output: stringifyTomlSource(outcome.value) }
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'TOML 序列化失败',
      output: ''
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/TomlValidator/__tests__/tomlValidator.spec.ts`
Expected: PASS（5 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/TomlValidator/utils/tomlValidator.ts src/views/tools/TomlValidator/__tests__/tomlValidator.spec.ts
git commit -m "feat(toml-validator): 新增 TOML 校验与格式化纯函数与单测"
```

---

### Task 8: toml-validator 视图与注册

**Files:**
- Create: `src/views/tools/TomlValidator/TomlValidator.vue`
- Modify: `src/App.vue`（异步组件声明 + `resolveBaseComponent` 分支）
- Modify: `src/types/tool.ts`（在 `yaml-validator` 定义之后新增工具定义）

**Interfaces:**
- Consumes: `validateToml`（Task 7）
- Produces: `TomlValidator.vue`，快照字段 `{ input }`

- [ ] **Step 1: 在 src/types/tool.ts 新增工具定义**

在 `yaml-validator` 定义之后插入：

```ts
  {
    id: 'toml-validator',
    name: 'TOML 语法校验器',
    description: 'TOML 语法校验、行列错误定位与格式化输出',
    category: 'format',
    icon: 'CheckCircle',
    keywords: ['toml', 'validate', 'lint', '校验']
  },
```

- [ ] **Step 2: 创建视图组件**

创建 `src/views/tools/TomlValidator/TomlValidator.vue`：

```vue
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { NAlert, NButton, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { validateToml } from './utils/tomlValidator'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

const SAMPLE = ['[app]', 'name = "devutils"', 'port = 8080', '', '[[app.servers]]', 'url = "https://a.example.com"'].join('\n')

const errorMessage = ref<string>('')
const output = ref<string>('')
const editorEl = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

function getInput(): string {
  return editorView ? editorView.state.doc.toString() : ''
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, { input: getInput() })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function runValidate() {
  const result = validateToml(getInput())
  if (!result.valid) {
    errorMessage.value = result.line === undefined
      ? (result.error ?? 'TOML 校验失败')
      : `第 ${result.line} 行${result.column === undefined ? '' : `第 ${result.column} 列`}：${result.error}`
    return
  }
  errorMessage.value = ''
  output.value = result.output
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

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value)
  message.success('已复制')
}

onMounted(async () => {
  await nextTick()
  if (!editorEl.value) return
  editorView = new EditorView({
    state: EditorState.create({
      doc: props.initialSnapshot?.input ?? SAMPLE,
      extensions: [
        basicSetup,
        getEditorTheme(themeStore.isDark),
        EditorView.updateListener.of(update => {
          if (update.docChanged) scheduleSnapshot()
        })
      ]
    }),
    parent: editorEl.value
  })
  runValidate()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
  editorView?.destroy()
  editorView = null
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">TOML 语法校验器</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">语法校验、行列错误定位与格式化输出</p>
      </div>
      <NButton size="small" type="primary" @click="runValidate">校验</NButton>
    </header>

    <div v-if="errorMessage" class="px-4 pt-3 shrink-0">
      <NAlert type="error" :bordered="false">{{ errorMessage }}</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">TOML 输入</div>
        <div ref="editorEl" class="flex-1 min-h-0 overflow-hidden"></div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">规范化输出</span>
          <NButton size="tiny" @click="copyOutput">复制</NButton>
        </div>
        <pre class="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono leading-relaxed">{{ output }}</pre>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 在 App.vue 注册**

```ts
const TomlValidator = defineAsyncComponent(() => import('@/views/tools/TomlValidator/TomlValidator.vue'))
```

`resolveBaseComponent` 内（`yaml-validator` 分支之后）追加：

```ts
  if (toolId === 'toml-validator' || toolId === 'toml_validator') {
    return TomlValidator
  }
```

- [ ] **Step 4: 类型检查与构建**

Run: `npm run build`
Expected: 构建通过，产出 `dist/assets/TomlValidator-*.js`。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/TomlValidator/TomlValidator.vue src/App.vue src/types/tool.ts
git commit -m "feat(toml-validator): 新增 TOML 校验器视图并注册工具入口"
```

---

### Task 9: 全量回归与验收

**Files:** 无新增（只跑验证；若发现回归，修正对应任务的文件后重跑）

- [ ] **Step 1: 前端全量测试与构建**

Run: `npm test`
Expected: 既有用例 + 批次 B 新增的 5 组用例全部 PASS。

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，`dist/assets/` 下能看到 `YamlPropJson-*.js`、`YamlValidator-*.js`、`TomlValidator-*.js`。

- [ ] **Step 2: Rust 回归（批次 B 不涉及 Rust 改动，仅确认未破）**

Run: `cargo clippy --all-targets -- -D warnings`（工作目录 `src-tauri`）
Expected: 无 warning。

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部通过。注意：`test_http` 组用例会在沙箱内因禁止绑定本地回环端口而失败，属环境限制；需在沙箱外重跑 `cargo test --manifest-path Cargo.toml --test test_http` 确认 6 个用例全绿。

- [ ] **Step 3: 依赖与约束核对**

Run: `git diff HEAD --stat -- package.json src-tauri/ src/types/tool.ts`
Expected: 只有 `package.json`（新增两个依赖）与 `src/types/tool.ts`（新增两条工具定义）出现在改动里；`src-tauri/` 无改动。

Run: `node -e "const p=require('./package.json'); console.log(Object.keys(p.dependencies).filter(k=>!['@codemirror/lang-json','@codemirror/language','@codemirror/state','@codemirror/view','@tauri-apps/api','@tauri-apps/plugin-window-state','codemirror','json-bigint','naive-ui','nanoid','pinia','vue'].includes(k)))"`
Expected: 输出里只包含 `smol-toml` 与 `yaml`（以及任何项目原有的其它依赖）。

- [ ] **Step 4: 人工验收清单（dev 服务）**

启动 `npm run dev`（默认 1420），逐项确认：

1. 侧栏点击 3 个工具均打开真实实现，`yaml-prop-json` 不再是占位页。
2. `yaml-prop-json`：在 JSON 栏改内容 → YAML / Properties 两栏同步更新；在 Properties 栏改 `servers[0].url=x` → JSON / YAML 同步更新；连续编辑不出现互相改写的抖动。
3. `yaml-validator`：粘贴缩进错误的 YAML → 出现带行列的错误提示；修正后点「校验」→ 输出规范化结果；切到「压缩」→ 输出单行。
4. `toml-validator`：粘贴 `a = "unterminated` → 出现带行列的错误提示；修正后点「校验」→ 输出规范化结果。
5. 关闭 Tab 再打开，三栏内容与校验器输入/模式均还原。

- [ ] **Step 5: 确认提交历史与工作区状态**

Run: `git log --oneline -12`
Expected: 看到本计划各任务的提交记录。

Run: `git status --short`
Expected: 无未提交改动。

- [ ] **Step 6: 向用户汇报**

汇报内容：新增的 3 个工具与各自 utils/测试文件、快照字段、新增的两个依赖、跑过的验证命令与结果、以及批次 C 的衔接点（SSH 指纹、SQL 格式化）。
spec §4.4 把校验与格式化拆成 `validateYaml` + `formatYaml` 两个函数；本计划合并为单个 `validateYaml(text, mode)`，因为格式化输出只在解析成功后产生，合并后避免重复解析一次。
spec §5.4 把校验与格式化拆成 `validateToml` + `formatToml` 两个函数；本计划合并为单个 `validateToml(text)`，理由同上。

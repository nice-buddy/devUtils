# 第三阶段批次 A 实施计划：零依赖纯前端工具集

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付第三阶段批次 A 的四个零新增依赖工具——`regex`（正则表达式测试）、`color-converter`（颜色转换与拾取）、`mock-data`（UUID / 雪花 ID / Mock 数据）、`tabular-convert`（Excel / CSV 转 JSON 与 SQL），业务逻辑全部下沉到可单测的 `utils`。

**Architecture:** 四个工具都遵循既有目录契约（`<ToolName>.vue` + `utils/*.ts` + `__tests__/*.spec.ts`），视图只做状态绑定，算法放 `utils`。`src/types/tool.ts` 新增三条注册项，`src/App.vue` 用 `defineAsyncComponent` 注册四个组件并兼容连字符/下划线 id。随机源统一 `crypto.getRandomValues` 且支持注入 rng；`tabular-convert` 的 SQL 生成按 6 方言做标识符引用与值转义。

**Tech Stack:** Vue 3 (`<script setup lang="ts">`) + Naive UI + Tailwind + CodeMirror 6 + Vitest；复用已有 `nanoid`，不新增任何依赖。

**Spec:** `docs/superpowers/specs/2026-09-28-phase3-batch-a-design.md`

## Global Constraints

- 新增依赖为零：`package.json` 的 `dependencies` 与 `devDependencies` 均不得改动。
- 不改 `src-tauri/` 下任何文件、不改数据库 schema。
- `src/types/tool.ts` 本批次**允许且仅允许**新增三条工具注册项（`mock-data` / `color-converter` / `tabular-convert`），不得改动既有条目。
- 组件 Props 契约固定：`defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()`。
- 快照：回填 `props.initialSnapshot?.x ?? <默认值>`；落库 `tabStore.updateTabSnapshot(props.tabId, {...})`；文本输入 250ms 防抖；只持久化输入与视图选项，派生结果不入库。
- 派生结果在 `onMounted` 用回填输入重算一次（`regex` / `tabular-convert` / `color-converter`）；`mock-data` 的生成结果不重算、不持久化，重开为空。
- 随机源一律 `crypto.getRandomValues`；**禁止 `Math.random`**。所有生成函数接受 `rng` 形参以便注入确定性随机源。
- 错误处理：非法输入用 `NAlert` 就地提示并保留上一次有效结果；空输入只显示空态不报错。
- 输入规模护栏：文本输入超过 1MB 关闭自动派生，改为手动按钮；`regex` 的自动运行阈值收紧到 256KB。
- 高亮渲染禁止 `v-html`，一律用分段数组 + `v-for`。
- 每个任务结束都要 `npm test` 与 `npm run build` 通过，并单独提交一次 git。

---

### Task 1: 工具注册与路由接入

**Files:**
- Modify: `src/types/tool.ts`（`TOOLS` 数组新增三条）
- Modify: `src/App.vue`（4 个 `defineAsyncComponent` + `resolveBaseComponent` 4 个分支）

**Interfaces:**
- Produces: 侧边栏四个工具入口能解析到真实组件；`regex` 不再落 `ToolPlaceholder`。

- [ ] **Step 1: 在 `src/types/tool.ts` 的 `TOOLS` 数组里、`regex` 条目之后新增三条**

```ts
  {
    id: 'mock-data',
    name: 'UUID / 雪花 ID / Mock 数据',
    description: 'UUID v1/v4/v7、NanoID、雪花 ID 与中文测试 Mock 数据批量生成',
    category: 'dev',
    icon: 'Sparkles',
    keywords: ['uuid', 'snowflake', 'nanoid', 'mock', 'faker', 'random', 'id']
  },
  {
    id: 'color-converter',
    name: '颜色转换与拾取',
    description: 'HEX / RGB / HSL 互转与取色器',
    category: 'dev',
    icon: 'Palette',
    keywords: ['color', 'hex', 'rgb', 'hsl', 'picker', 'eyedropper']
  },
  {
    id: 'tabular-convert',
    name: 'Excel / CSV 转 JSON 与 SQL',
    description: '粘贴或导入 TSV/CSV，推导类型并生成 JSON 数组或多方言批量 INSERT',
    category: 'format',
    icon: 'Table',
    keywords: ['excel', 'csv', 'tsv', 'json', 'sql', 'insert', 'table']
  }
```

- [ ] **Step 2: 在 `src/App.vue` 的异步组件声明区追加（放在 `SqlFormatter` 声明之后）**

```ts
const RegexTester = defineAsyncComponent(() => import('@/views/tools/Regex/Regex.vue'))
const MockData = defineAsyncComponent(() => import('@/views/tools/MockData/MockData.vue'))
const ColorConverter = defineAsyncComponent(() => import('@/views/tools/ColorConverter/ColorConverter.vue'))
const TabularConvert = defineAsyncComponent(() => import('@/views/tools/TabularConvert/TabularConvert.vue'))
```

- [ ] **Step 3: 在 `resolveBaseComponent` 内、`return ToolPlaceholder` 之前追加分支**

```ts
  if (toolId === 'regex') {
    return RegexTester
  }
  if (toolId === 'mock-data' || toolId === 'mock_data') {
    return MockData
  }
  if (toolId === 'color-converter' || toolId === 'color_converter') {
    return ColorConverter
  }
  if (toolId === 'tabular-convert' || toolId === 'tabular_convert') {
    return TabularConvert
  }
```

- [ ] **Step 4: 占位组件兜底（先让构建通过）**

四个视图文件在后续任务里才会创建，本步骤先创建四个最小可渲染的占位组件，保证本任务结束时构建可用；后续任务逐个替换为真实实现：

`src/views/tools/Regex/Regex.vue`、`src/views/tools/MockData/MockData.vue`、`src/views/tools/ColorConverter/ColorConverter.vue`、`src/views/tools/TabularConvert/TabularConvert.vue`，每个内容为：

```vue
<script setup lang="ts">
defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()
</script>

<template>
  <div class="h-full flex items-center justify-center text-xs text-slate-400">待实现</div>
</template>
```

- [ ] **Step 5: 验证构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，`dist/assets/` 下出现 `Regex-*.js`、`MockData-*.js`、`ColorConverter-*.js`、`TabularConvert-*.js`。

- [ ] **Step 6: 提交**

```bash
git add src/types/tool.ts src/App.vue src/views/tools/Regex/Regex.vue src/views/tools/MockData/MockData.vue src/views/tools/ColorConverter/ColorConverter.vue src/views/tools/TabularConvert/TabularConvert.vue
git commit -m "feat(phase3-a): 注册 regex/mock-data/color-converter/tabular-convert 四个工具入口"
```

---

### Task 2: color-converter 纯函数（utils/colorConvert.ts）

**Files:**
- Create: `src/views/tools/ColorConverter/utils/colorConvert.ts`
- Test: `src/views/tools/ColorConverter/__tests__/colorConvert.spec.ts`

**Interfaces:**
- Produces:
  - `interface Rgba { r: number; g: number; b: number; a: number }`
  - `parseColor(input: string): { value?: Rgba; error?: string }`
  - `toHex(c: Rgba): string`
  - `toRgbString(c: Rgba): string`
  - `toHslString(c: Rgba): string`
  - `rgbToHsl(c: Rgba): { h: number; s: number; l: number }`
  - `hslToRgb(h: number, s: number, l: number, a?: number): Rgba`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/ColorConverter/__tests__/colorConvert.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { hslToRgb, parseColor, rgbToHsl, toHex, toHslString, toRgbString } from '../utils/colorConvert'

const ok = (input: string) => {
  const r = parseColor(input)
  if (!r.value) throw new Error(`解析失败: ${input} -> ${r.error}`)
  return r.value
}

describe('color-converter 颜色转换', () => {
  it('解析 6 位与 3 位 HEX，输出统一小写', () => {
    expect(ok('#FF0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(toHex(ok('#FF0000'))).toBe('#ff0000')
  })

  it('解析 8 位与 4 位 HEX 的 alpha 通道', () => {
    expect(ok('#ff000080').a).toBeCloseTo(128 / 255, 5)
    expect(ok('#f008').a).toBeCloseTo(136 / 255, 5)
    expect(toHex(ok('#ff000080'))).toBe('#ff000080')
  })

  it('解析 rgb() 与 rgba()，支持百分比分量', () => {
    expect(ok('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok('rgb(100%, 0%, 0%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok('rgba(0, 0, 255, 0.5)')).toEqual({ r: 0, g: 0, b: 255, a: 0.5 })
  })

  it('解析 hsl() 与 hsla()，H=360 与 H=0 等价', () => {
    expect(ok('hsl(0, 100%, 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok('hsl(360, 100%, 50%)')).toEqual(ok('hsl(0, 100%, 50%)'))
    expect(ok('hsla(240, 100%, 50%, 0.25)').a).toBe(0.25)
  })

  it('解析 16 个基础命名色', () => {
    expect(ok('red')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(ok('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseColor('chartreuse').error).toBeTruthy()
  })

  it('往返：HEX -> RGB -> HSL -> RGB -> HEX 保持一致', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#123456']) {
      const c = ok(hex)
      const hsl = rgbToHsl(c)
      const back = hslToRgb(hsl.h, hsl.s, hsl.l, c.a)
      expect(toHex(back)).toBe(hex)
    }
  })

  it('格式化：alpha 为 1 时省略 alpha 通道', () => {
    expect(toRgbString(ok('#ff0000'))).toBe('rgb(255, 0, 0)')
    expect(toRgbString(ok('rgba(255, 0, 0, 0.5)'))).toBe('rgba(255, 0, 0, 0.5)')
    expect(toHslString(ok('#ff0000'))).toBe('hsl(0, 100%, 50%)')
    expect(toHslString(ok('rgba(255, 0, 0, 0.5)'))).toBe('hsla(0, 100%, 50%, 0.5)')
  })

  it('非法输入返回 error 而不是抛异常', () => {
    for (const bad of ['#12345', 'rgb(300, 0, 0)', 'hsl(400, 50%, 50%)', 'rgb(1,2)', '', '  ', '#gg0000']) {
      expect(parseColor(bad).error, bad).toBeTruthy()
      expect(parseColor(bad).value).toBeUndefined()
    }
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/ColorConverter/__tests__/colorConvert.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../utils/colorConvert"`。

- [ ] **Step 3: 实现 colorConvert.ts**

创建 `src/views/tools/ColorConverter/utils/colorConvert.ts`：

```ts
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

const NAMED: Record<string, string> = {
  black: '#000000',
  silver: '#c0c0c0',
  gray: '#808080',
  white: '#ffffff',
  maroon: '#800000',
  red: '#ff0000',
  purple: '#800080',
  fuchsia: '#ff00ff',
  green: '#008000',
  lime: '#00ff00',
  olive: '#808000',
  yellow: '#ffff00',
  navy: '#000080',
  blue: '#0000ff',
  teal: '#008080',
  aqua: '#00ffff'
}

function clamp255(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)))
}

function parseHex(raw: string): Rgba | null {
  const match = /^#?([0-9a-f]+)$/i.exec(raw.trim())
  if (!match) return null
  const hex = match[1]
  if (![3, 4, 6, 8].includes(hex.length)) return null
  const one = (c: string) => parseInt(c + c, 16)
  if (hex.length === 3 || hex.length === 4) {
    return {
      r: one(hex[0]),
      g: one(hex[1]),
      b: one(hex[2]),
      a: hex.length === 4 ? one(hex[3]) / 255 : 1
    }
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
  }
}

// RGB 分量：0-255 或百分比
function parseChannel(raw: string): number | null {
  const text = raw.trim()
  if (!text) return null
  if (text.endsWith('%')) {
    const value = Number(text.slice(0, -1))
    if (!Number.isFinite(value) || value < 0 || value > 100) return null
    return (value / 100) * 255
  }
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0 || value > 255) return null
  return value
}

// alpha：0-1 或百分比
function parseAlpha(raw: string): number | null {
  const text = raw.trim()
  if (!text) return null
  if (text.endsWith('%')) {
    const value = Number(text.slice(0, -1))
    if (!Number.isFinite(value) || value < 0 || value > 100) return null
    return value / 100
  }
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0 || value > 1) return null
  return value
}

// HSL 的 S/L：0-100 百分比
function parsePercent(raw: string): number | null {
  const text = raw.trim().replace(/%$/, '')
  const value = Number(text)
  if (!Number.isFinite(value) || value < 0 || value > 100) return null
  return value
}

function splitArgs(body: string): string[] {
  return body.split(',').map(part => part.trim())
}

function parseRgbFunction(text: string): Rgba | null {
  const match = /^rgba?\(([^)]*)\)$/.exec(text)
  if (!match) return null
  const parts = splitArgs(match[1])
  if (parts.length !== 3 && parts.length !== 4) return null
  const [r, g, b] = parts.slice(0, 3).map(parseChannel)
  if (r === null || g === null || b === null) return null
  const a = parts.length === 4 ? parseAlpha(parts[3]) : 1
  if (a === null) return null
  return { r, g, b, a }
}

function parseHslFunction(text: string): Rgba | null {
  const match = /^hsla?\(([^)]*)\)$/.exec(text)
  if (!match) return null
  const parts = splitArgs(match[1])
  if (parts.length !== 3 && parts.length !== 4) return null
  const hueText = parts[0].replace(/deg$/i, '').trim()
  const h = Number(hueText)
  if (!Number.isFinite(h) || h < 0 || h > 360) return null
  const s = parsePercent(parts[1])
  const l = parsePercent(parts[2])
  if (s === null || l === null) return null
  const a = parts.length === 4 ? parseAlpha(parts[3]) : 1
  if (a === null) return null
  return hslToRgb(h, s, l, a)
}

export function parseColor(input: string): { value?: Rgba; error?: string } {
  const text = input.trim().toLowerCase()
  if (!text) return { error: '请输入颜色值' }
  if (NAMED[text]) return { value: parseHex(NAMED[text]) as Rgba }
  if (text.startsWith('#')) {
    const value = parseHex(text)
    return value ? { value } : { error: `无法解析的 HEX 颜色：${input}` }
  }
  const rgb = parseRgbFunction(text)
  if (rgb) return { value: rgb }
  const hsl = parseHslFunction(text)
  if (hsl) return { value: hsl }
  return { error: `无法识别的颜色格式：${input}` }
}

export function rgbToHsl(c: Rgba): { h: number; s: number; l: number } {
  const r = clamp255(c.r) / 255
  const g = clamp255(c.g) / 255
  const b = clamp255(c.b) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToRgb(h: number, s: number, l: number, a = 1): Rgba {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = ln - c / 2
  return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255), a }
}

function hex2(n: number): string {
  return clamp255(n).toString(16).padStart(2, '0')
}

function alphaSuffix(a: number): string {
  return String(Math.round(a * 100) / 100)
}

export function toHex(c: Rgba): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`
  if (c.a >= 1) return base
  return `${base}${hex2(c.a * 255)}`
}

export function toRgbString(c: Rgba): string {
  const r = clamp255(c.r)
  const g = clamp255(c.g)
  const b = clamp255(c.b)
  if (c.a >= 1) return `rgb(${r}, ${g}, ${b})`
  return `rgba(${r}, ${g}, ${b}, ${alphaSuffix(c.a)})`
}

export function toHslString(c: Rgba): string {
  const { h, s, l } = rgbToHsl(c)
  if (c.a >= 1) return `hsl(${h}, ${s}%, ${l}%)`
  return `hsla(${h}, ${s}%, ${l}%, ${alphaSuffix(c.a)})`
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/ColorConverter/__tests__/colorConvert.spec.ts`
Expected: PASS（8 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/ColorConverter/utils/colorConvert.ts src/views/tools/ColorConverter/__tests__/colorConvert.spec.ts
git commit -m "feat(color-converter): 新增 HEX/RGB/HSL 解析与格式化纯函数与单测"
```

---

### Task 3: color-converter 视图

**Files:**
- Modify: `src/views/tools/ColorConverter/ColorConverter.vue`（替换占位实现）

**Interfaces:**
- Consumes: `parseColor` / `toHex` / `toRgbString` / `toHslString` / `Rgba`（Task 2）
- Produces: 视图，快照字段 `{ input, recent }`

- [ ] **Step 1: 写视图实现**

替换 `src/views/tools/ColorConverter/ColorConverter.vue` 全文为：

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NInputNumber, NSlider, useMessage } from 'naive-ui'
import { useTabStore } from '@/stores/tabStore'
import { hslToRgb, parseColor, rgbToHsl, toHex, toHslString, toRgbString, type Rgba } from './utils/colorConvert'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

const input = ref<string>(props.initialSnapshot?.input ?? '#6366f1')
const recent = ref<string[]>(props.initialSnapshot?.recent ?? [])
const errorMessage = ref<string>('')
const current = ref<Rgba | null>(null)
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window

const hexValue = computed(() => (current.value ? toHex(current.value) : ''))
const rgbValue = computed(() => (current.value ? toRgbString(current.value) : ''))
const hslValue = computed(() => (current.value ? toHslString(current.value) : ''))
const hsl = computed(() => (current.value ? rgbToHsl(current.value) : { h: 0, s: 0, l: 0 }))

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, { input: input.value, recent: [...recent.value] })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function pushRecent(hex: string) {
  const next = [hex, ...recent.value.filter(item => item !== hex)].slice(0, 12)
  recent.value = next
}

function runParse(record = false) {
  const result = parseColor(input.value)
  if (result.error) {
    errorMessage.value = result.error
    return
  }
  errorMessage.value = ''
  current.value = result.value ?? null
  if (record && result.value) pushRecent(toHex(result.value))
}

function applyRgba(next: Rgba) {
  current.value = next
  errorMessage.value = ''
  input.value = toHex(next)
  pushRecent(input.value)
}

function updateChannel(key: 'r' | 'g' | 'b', value: number | null) {
  if (!current.value) return
  applyRgba({ ...current.value, [key]: value ?? 0 })
}

function updateAlpha(value: number) {
  if (!current.value) return
  applyRgba({ ...current.value, a: value / 100 })
}

function updateHsl(key: 'h' | 's' | 'l', value: number | null) {
  if (!current.value) return
  const next = { ...hsl.value, [key]: value ?? 0 }
  applyRgba(hslToRgb(next.h, next.s, next.l, current.value.a))
}

function onNativeColor(event: Event) {
  const value = (event.target as HTMLInputElement).value
  input.value = value
  runParse(true)
}

function copy(text: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success('已复制')
}

async function pickWithEyeDropper() {
  const Ctor = (window as any).EyeDropper
  if (!Ctor) return
  try {
    const result = await new Ctor().open()
    input.value = result.sRGBHex
    runParse(true)
  } catch {
    // 用户取消取色，静默忽略
  }
}

onMounted(() => runParse())

watch(input, () => {
  runParse(true)
  scheduleSnapshot()
})

watch(recent, scheduleSnapshot, { deep: true })
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 shrink-0">
      <h1 class="text-sm font-bold tracking-tight">颜色转换与拾取</h1>
      <p class="text-[11px] text-slate-500 dark:text-slate-400">HEX / RGB / HSL 互转，支持 #RGB、#RRGGBBAA、rgb()、hsl() 与 16 个基础命名色</p>
    </header>

    <div class="flex-1 min-h-0 overflow-auto p-4 space-y-4">
      <div class="flex items-center gap-3">
        <NInput v-model:value="input" class="max-w-md" size="small" placeholder="#6366f1" />
        <input
          type="color"
          class="h-7 w-10 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
          :value="hexValue.slice(0, 7) || '#000000'"
          @input="onNativeColor"
        />
        <NButton v-if="hasEyeDropper" size="small" @click="pickWithEyeDropper">吸管</NButton>
      </div>

      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>

      <div v-if="current" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="space-y-3">
          <div class="h-24 rounded-lg border border-slate-200 dark:border-slate-800" :style="{ backgroundColor: hexValue }"></div>
          <div class="flex items-center gap-2">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">HEX</span>
            <code class="flex-1 text-xs font-mono">{{ hexValue }}</code>
            <NButton size="tiny" @click="copy(hexValue)">复制</NButton>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">RGB</span>
            <code class="flex-1 text-xs font-mono">{{ rgbValue }}</code>
            <NButton size="tiny" @click="copy(rgbValue)">复制</NButton>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">HSL</span>
            <code class="flex-1 text-xs font-mono">{{ hslValue }}</code>
            <NButton size="tiny" @click="copy(hslValue)">复制</NButton>
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">R</span>
            <NSlider class="flex-1" :min="0" :max="255" :value="current.r" @update:value="updateChannel('r', $event)" />
            <NInputNumber class="w-20" size="small" :min="0" :max="255" :value="current.r" @update:value="updateChannel('r', $event)" />
          </div>
          <div class="flex items-center gap-3">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">G</span>
            <NSlider class="flex-1" :min="0" :max="255" :value="current.g" @update:value="updateChannel('g', $event)" />
            <NInputNumber class="w-20" size="small" :min="0" :max="255" :value="current.g" @update:value="updateChannel('g', $event)" />
          </div>
          <div class="flex items-center gap-3">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">B</span>
            <NSlider class="flex-1" :min="0" :max="255" :value="current.b" @update:value="updateChannel('b', $event)" />
            <NInputNumber class="w-20" size="small" :min="0" :max="255" :value="current.b" @update:value="updateChannel('b', $event)" />
          </div>
          <div class="flex items-center gap-3">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">Alpha</span>
            <NSlider class="flex-1" :min="0" :max="100" :value="Math.round(current.a * 100)" @update:value="updateAlpha" />
            <span class="w-20 text-xs text-right">{{ Math.round(current.a * 100) }}%</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">H</span>
            <NSlider class="flex-1" :min="0" :max="360" :value="hsl.h" @update:value="updateHsl('h', $event)" />
            <NInputNumber class="w-20" size="small" :min="0" :max="360" :value="hsl.h" @update:value="updateHsl('h', $event)" />
          </div>
          <div class="flex items-center gap-3">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">S</span>
            <NSlider class="flex-1" :min="0" :max="100" :value="hsl.s" @update:value="updateHsl('s', $event)" />
            <NInputNumber class="w-20" size="small" :min="0" :max="100" :value="hsl.s" @update:value="updateHsl('s', $event)" />
          </div>
          <div class="flex items-center gap-3">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">L</span>
            <NSlider class="flex-1" :min="0" :max="100" :value="hsl.l" @update:value="updateHsl('l', $event)" />
            <NInputNumber class="w-20" size="small" :min="0" :max="100" :value="hsl.l" @update:value="updateHsl('l', $event)" />
          </div>
        </div>
      </div>

      <div class="space-y-2">
        <span class="text-xs text-slate-500 dark:text-slate-400">最近使用色</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="item in recent"
            :key="item"
            class="h-7 w-7 rounded border border-slate-300 dark:border-slate-700"
            :style="{ backgroundColor: item }"
            :title="item"
            @click="input = item; runParse(true)"
          ></button>
          <span v-if="!recent.length" class="text-xs text-slate-400">暂无记录</span>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 类型检查与构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错。

- [ ] **Step 3: 提交**

```bash
git add src/views/tools/ColorConverter/ColorConverter.vue
git commit -m "feat(color-converter): 新增颜色转换与拾取视图"
```

---

### Task 4: regex 纯函数（utils/regexTester.ts + utils/regexPresets.ts）

**Files:**
- Create: `src/views/tools/Regex/utils/regexTester.ts`
- Create: `src/views/tools/Regex/utils/regexPresets.ts`
- Test: `src/views/tools/Regex/__tests__/regexTester.spec.ts`

**Interfaces:**
- Produces:
  - `interface RegexMatch { index: number; value: string; groups: { name?: string; index: number; value: string | undefined }[] }`
  - `interface RegexRunResult { matches: RegexMatch[]; truncated: boolean; error?: string }`
  - `interface RegexPreset { name: string; pattern: string; flags: string; sample: string; description: string }`
  - `compileRegex(pattern: string, flags: string): { regex?: RegExp; error?: string }`
  - `runMatches(text: string, regex: RegExp, limit?: number): RegexRunResult`
  - `applyReplace(text: string, regex: RegExp, replacement: string): string`
  - `buildSegments(text: string, matches: RegexMatch[]): { text: string; matchIndex: number }[]`
  - `REGEX_PRESETS: RegexPreset[]`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/Regex/__tests__/regexTester.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { applyReplace, buildSegments, compileRegex, runMatches } from '../utils/regexTester'
import { REGEX_PRESETS } from '../utils/regexPresets'

const must = (pattern: string, flags = '') => {
  const { regex, error } = compileRegex(pattern, flags)
  if (!regex) throw new Error(`编译失败: ${error}`)
  return regex
}

describe('regex 测试器', () => {
  it('非法正则返回 error 而不是抛异常', () => {
    const { regex, error } = compileRegex('([a-z', 'g')
    expect(regex).toBeUndefined()
    expect(error).toBeTruthy()
    expect(compileRegex('', 'g').error).toBe('请输入正则表达式')
  })

  it('未指定 g 时内部补 g，列出全部匹配', () => {
    const result = runMatches('a1 b2 c3', must('\\d'))
    expect(result.error).toBeUndefined()
    expect(result.matches.map(m => m.value)).toEqual(['1', '2', '3'])
    expect(result.matches.map(m => m.index)).toEqual([1, 4, 7])
  })

  it('收集编号与命名捕获组', () => {
    const result = runMatches('2026-09-28', must('(?<y>\\d{4})-(?<m>\\d{2})-(?<d>\\d{2})'))
    const groups = result.matches[0].groups
    expect(groups.find(g => g.index === 1)?.value).toBe('2026')
    expect(groups.find(g => g.name === 'm')?.value).toBe('09')
  })

  it('零长度匹配不会死循环', () => {
    const result = runMatches('abc', must('x*'))
    expect(result.matches.length).toBe(4)
    expect(result.truncated).toBe(false)
  })

  it('粘性 y 按连续语义匹配，遇到不连续即停止', () => {
    const result = runMatches('aaXaa', must('a', 'y'))
    expect(result.matches.map(m => m.index)).toEqual([0, 1])
  })

  it('超过上限时截断并标记 truncated', () => {
    const result = runMatches('aaaaaaaaaa', must('a'), 3)
    expect(result.matches).toHaveLength(3)
    expect(result.truncated).toBe(true)
  })

  it('空文本返回空结果且不报错', () => {
    expect(runMatches('', must('a'))).toEqual({ matches: [], truncated: false })
  })

  it('替换支持 $1 / $& / $$', () => {
    expect(applyReplace('a1b2', must('(\\d)'), '[$1]')).toBe('a[1]b[2]')
    expect(applyReplace('a1b2', must('\\d'), '<$&>')).toBe('a<1>b<2>')
    expect(applyReplace('a1', must('\\d'), '$$')).toBe('a$')
    expect(applyReplace('abc', must('\\d'), 'X')).toBe('abc')
  })

  it('buildSegments 拼回原文与输入完全一致', () => {
    for (const text of ['a1b22c', 'abc', '', ' 1 ']) {
      const matches = runMatches(text, must('\\d+')).matches
      const joined = buildSegments(text, matches).map(s => s.text).join('')
      expect(joined).toBe(text)
    }
  })

  it('内置规则库能匹配各自样例', () => {
    expect(REGEX_PRESETS.length).toBeGreaterThanOrEqual(4)
    for (const preset of REGEX_PRESETS) {
      const { regex, error } = compileRegex(preset.pattern, preset.flags)
      expect(error, preset.name).toBeUndefined()
      expect(regex?.test(preset.sample), preset.name).toBe(true)
    }
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/Regex/__tests__/regexTester.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../utils/regexTester"`。

- [ ] **Step 3: 实现 regexTester.ts 与 regexPresets.ts**

创建 `src/views/tools/Regex/utils/regexTester.ts`：

```ts
export interface RegexGroup {
  name?: string
  index: number
  value: string | undefined
}

export interface RegexMatch {
  index: number
  value: string
  groups: RegexGroup[]
}

export interface RegexRunResult {
  matches: RegexMatch[]
  truncated: boolean
  error?: string
}

export const DEFAULT_MATCH_LIMIT = 5000

export function compileRegex(pattern: string, flags: string): { regex?: RegExp; error?: string } {
  if (!pattern) return { error: '请输入正则表达式' }
  try {
    return { regex: new RegExp(pattern, flags) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '正则表达式非法' }
  }
}

function collectGroups(match: RegExpExecArray): RegexGroup[] {
  const groups: RegexGroup[] = []
  for (let i = 1; i < match.length; i += 1) {
    groups.push({ index: i, value: match[i] })
  }
  if (match.groups) {
    for (const [name, value] of Object.entries(match.groups)) {
      groups.push({ name, index: -1, value })
    }
  }
  return groups
}

// 高亮与匹配列表始终按全局语义迭代：未勾 g 时内部补 g；
// 勾了粘性 y 时保持粘性语义（不补 g），遇到第一个不连续匹配即停止。
function toIterationRegex(regex: RegExp): RegExp {
  if (regex.flags.includes('y')) return new RegExp(regex.source, regex.flags)
  if (regex.flags.includes('g')) return new RegExp(regex.source, regex.flags)
  return new RegExp(regex.source, regex.flags + 'g')
}

export function runMatches(text: string, regex: RegExp, limit = DEFAULT_MATCH_LIMIT): RegexRunResult {
  if (!text) return { matches: [], truncated: false }
  const re = toIterationRegex(regex)
  const matches: RegexMatch[] = []
  let truncated = false
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    matches.push({ index: match.index, value: match[0], groups: collectGroups(match) })
    // 零长度匹配必须手动前进，否则 lastIndex 不变会死循环
    if (match[0] === '') re.lastIndex += 1
    if (matches.length >= limit) {
      truncated = true
      break
    }
  }
  return { matches, truncated }
}

export function applyReplace(text: string, regex: RegExp, replacement: string): string {
  return text.replace(toIterationRegex(regex), replacement)
}

export function buildSegments(text: string, matches: RegexMatch[]): { text: string; matchIndex: number }[] {
  const segments: { text: string; matchIndex: number }[] = []
  let cursor = 0
  matches.forEach((match, index) => {
    if (match.index > cursor) {
      segments.push({ text: text.slice(cursor, match.index), matchIndex: -1 })
    }
    if (match.value.length > 0) {
      segments.push({ text: match.value, matchIndex: index })
    }
    cursor = match.index + match.value.length
  })
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), matchIndex: -1 })
  }
  return segments
}
```

创建 `src/views/tools/Regex/utils/regexPresets.ts`：

```ts
export interface RegexPreset {
  name: string
  pattern: string
  flags: string
  sample: string
  description: string
}

export const REGEX_PRESETS: RegexPreset[] = [
  {
    name: '手机号（中国大陆）',
    pattern: '^1[3-9]\\d{9}$',
    flags: 'g',
    sample: '13800138000',
    description: '11 位，1 开头，第二位 3-9'
  },
  {
    name: '身份证号（18 位）',
    pattern: '^\\d{17}[\\dXx]$',
    flags: 'g',
    sample: '11010519491231002X',
    description: '仅做格式校验，不校验校验位'
  },
  {
    name: '统一社会信用代码',
    pattern: '^[0-9A-HJ-NPQRTUWXY]{2}\\d{6}[0-9A-HJ-NPQRTUWXY]{10}$',
    flags: 'g',
    sample: '91350100M000100Y43',
    description: '字符集排除 I、O、S、V、Z'
  },
  {
    name: '银行卡号',
    pattern: '^\\d{16,19}$',
    flags: 'g',
    sample: '6222021234567890123',
    description: '仅校验长度与数字，不做 Luhn'
  }
]
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/Regex/__tests__/regexTester.spec.ts`
Expected: PASS（10 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/Regex/utils/regexTester.ts src/views/tools/Regex/utils/regexPresets.ts src/views/tools/Regex/__tests__/regexTester.spec.ts
git commit -m "feat(regex): 新增正则匹配/替换/分段纯函数与内置规则库及单测"
```

---

### Task 5: regex 视图

**Files:**
- Modify: `src/views/tools/Regex/Regex.vue`（替换占位实现）

**Interfaces:**
- Consumes: `compileRegex` / `runMatches` / `applyReplace` / `buildSegments` / `REGEX_PRESETS`（Task 4）
- Produces: 视图，快照字段 `{ pattern, flags, testText, replacement }`

- [ ] **Step 1: 写视图实现**

替换 `src/views/tools/Regex/Regex.vue` 全文为：

```vue
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NCheckbox, NCheckboxGroup, NInput, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { Compartment, EditorState } from '@codemirror/state'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { applyReplace, buildSegments, compileRegex, runMatches, type RegexMatch } from './utils/regexTester'
import { REGEX_PRESETS } from './utils/regexPresets'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

const AUTO_RUN_MAX_BYTES = 256 * 1024

const pattern = ref<string>(props.initialSnapshot?.pattern ?? '\\d+')
const flags = ref<string[]>(props.initialSnapshot?.flags ?? ['g'])
const testText = ref<string>(props.initialSnapshot?.testText ?? '订单 2026-09-28 金额 1280 元，编号 42')
const replacement = ref<string>(props.initialSnapshot?.replacement ?? '')
const errorMessage = ref<string>('')
const matches = ref<RegexMatch[]>([])
const truncated = ref<boolean>(false)
const manualMode = ref<boolean>(false)
const editorEl = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let runTimer: ReturnType<typeof setTimeout> | null = null

const themeCompartment = new Compartment()

const flagString = computed(() => flags.value.join(''))
const segments = computed(() => buildSegments(testText.value, matches.value))
const replaceOutput = computed(() => {
  const { regex } = compileRegex(pattern.value, flagString.value)
  if (!regex || !replacement.value) return ''
  return applyReplace(testText.value, regex, replacement.value)
})

function getTestText(): string {
  return editorView ? editorView.state.doc.toString() : testText.value
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    pattern: pattern.value,
    flags: [...flags.value],
    testText: getTestText(),
    replacement: replacement.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function run() {
  const { regex, error } = compileRegex(pattern.value, flagString.value)
  if (error) {
    errorMessage.value = error
    matches.value = []
    truncated.value = false
    return
  }
  errorMessage.value = ''
  const result = runMatches(getTestText(), regex as RegExp)
  matches.value = result.matches
  truncated.value = result.truncated
}

function scheduleRun() {
  manualMode.value = getTestText().length > AUTO_RUN_MAX_BYTES
  if (manualMode.value) return
  if (runTimer) clearTimeout(runTimer)
  runTimer = setTimeout(run, 250)
}

function handleDocChange() {
  testText.value = getTestText()
  scheduleSnapshot()
  scheduleRun()
}

function loadPreset(index: number) {
  const preset = REGEX_PRESETS[index]
  if (!preset) return
  pattern.value = preset.pattern
  flags.value = preset.flags.split('')
  if (editorView) {
    editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: preset.sample } })
    testText.value = preset.sample
  }
  run()
  saveSnapshot()
}

function copyReplaceOutput() {
  if (!replaceOutput.value) return
  navigator.clipboard.writeText(replaceOutput.value)
  message.success('已复制')
}

function getEditorTheme(isDark: boolean) {
  return EditorView.theme(
    {
      '&': { height: '100%', fontSize: '13px', backgroundColor: isDark ? '#090d16' : '#ffffff', color: isDark ? '#e2e8f0' : '#1e293b' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', lineHeight: '1.6' },
      '.cm-gutters': { backgroundColor: isDark ? '#070a10' : '#f8fafc', color: isDark ? '#475569' : '#94a3b8', borderRight: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0' }
    },
    { dark: isDark }
  )
}

onMounted(async () => {
  await nextTick()
  if (editorEl.value) {
    editorView = new EditorView({
      state: EditorState.create({
        doc: testText.value,
        extensions: [
          basicSetup,
          themeCompartment.of(getEditorTheme(themeStore.isDark)),
          EditorView.updateListener.of(update => {
            if (update.docChanged) handleDocChange()
          })
        ]
      }),
      parent: editorEl.value
    })
  }
  run()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  if (runTimer) clearTimeout(runTimer)
  saveSnapshot()
  editorView?.destroy()
  editorView = null
})

watch([pattern, flags], () => {
  run()
  scheduleSnapshot()
}, { deep: true })

watch(replacement, scheduleSnapshot)

watch(
  () => themeStore.isDark,
  dark => {
    if (editorView) editorView.dispatch({ effects: themeCompartment.reconfigure(getEditorTheme(dark)) })
  }
)
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 shrink-0 space-y-2">
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-400">/</span>
        <NInput v-model:value="pattern" size="small" class="flex-1" placeholder="正则表达式" />
        <span class="text-xs text-slate-400">/{{ flagString }}</span>
        <NButton v-if="manualMode" size="small" type="primary" @click="run">运行</NButton>
      </div>
      <div class="flex items-center gap-3">
        <NCheckboxGroup v-model:value="flags" size="small">
          <NCheckbox v-for="flag in ['g', 'i', 'm', 's', 'u', 'y']" :key="flag" :value="flag">{{ flag }}</NCheckbox>
        </NCheckboxGroup>
        <span class="text-xs text-slate-400">{{ matches.length }} 个匹配<span v-if="truncated">（已截断到上限）</span></span>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
      <NAlert v-if="manualMode" type="warning" :bordered="false">测试文本超过 256KB，已关闭自动运行，请手动点击「运行」。</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">测试文本</div>
        <div ref="editorEl" class="flex-1 min-h-0 overflow-hidden"></div>
        <div class="border-t border-slate-200 dark:border-slate-800 p-2 space-y-2 shrink-0">
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-500 dark:text-slate-400 shrink-0">替换为</span>
            <NInput v-model:value="replacement" size="tiny" placeholder="支持 $1 / $& / $$ / $<name>" />
            <NButton size="tiny" @click="copyReplaceOutput">复制结果</NButton>
          </div>
          <pre class="max-h-24 overflow-auto text-xs font-mono whitespace-pre-wrap">{{ replaceOutput }}</pre>
        </div>
      </section>

      <section class="flex flex-col min-h-0 gap-3">
        <div class="flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 flex flex-col">
          <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">高亮预览</div>
          <div class="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono whitespace-pre-wrap break-all">
            <span
              v-for="(segment, index) in segments"
              :key="index"
              :class="segment.matchIndex >= 0 ? 'bg-amber-200/70 dark:bg-amber-500/30 text-amber-900 dark:text-amber-100 rounded-sm' : ''"
            >{{ segment.text }}</span>
          </div>
        </div>

        <div class="h-2/5 min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 flex flex-col">
          <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">匹配明细</div>
          <div class="flex-1 min-h-0 overflow-auto p-2 space-y-1">
            <div v-for="(match, index) in matches" :key="index" class="text-xs border-b border-slate-100 dark:border-slate-800 pb-1">
              <div class="flex items-center gap-2">
                <span class="text-slate-400">#{{ index + 1 }}</span>
                <span class="text-slate-400">@{{ match.index }}</span>
                <code class="font-mono break-all">{{ match.value || '(空匹配)' }}</code>
              </div>
              <div v-for="group in match.groups" :key="`${index}-${group.index}-${group.name ?? ''}`" class="pl-4 text-slate-500 dark:text-slate-400">
                {{ group.name ? `$${group.name}` : `$${group.index}` }} = <code class="font-mono">{{ group.value ?? '(未匹配)' }}</code>
              </div>
            </div>
            <p v-if="!matches.length" class="text-xs text-slate-400">暂无匹配</p>
          </div>
        </div>

        <div class="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shrink-0">
          <div class="text-xs font-medium mb-1">内置规则库</div>
          <div class="flex flex-wrap gap-1">
            <NButton v-for="(preset, index) in REGEX_PRESETS" :key="preset.name" size="tiny" @click="loadPreset(index)">
              {{ preset.name }}
            </NButton>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 类型检查与构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错。

- [ ] **Step 3: 提交**

```bash
git add src/views/tools/Regex/Regex.vue
git commit -m "feat(regex): 新增正则测试视图（分段高亮 / 捕获组 / 替换预览 / 规则库）"
```

---

### Task 6: mock-data 纯函数（random / uuid / snowflake / mockData）

**Files:**
- Create: `src/views/tools/MockData/utils/random.ts`
- Create: `src/views/tools/MockData/utils/uuid.ts`
- Create: `src/views/tools/MockData/utils/snowflake.ts`
- Create: `src/views/tools/MockData/utils/mockData.ts`
- Test: `src/views/tools/MockData/__tests__/uuid.spec.ts`
- Test: `src/views/tools/MockData/__tests__/snowflake.spec.ts`
- Test: `src/views/tools/MockData/__tests__/mockData.spec.ts`

**Interfaces:**
- Produces:
  - `type Rng = (bytes: Uint8Array) => void`
  - `defaultRng: Rng`、`randomInt(rng, maxExclusive): number`、`pick<T>(rng, items: T[]): T`
  - `uuidV4(rng?): string`、`uuidV7(now?: number, rng?): string`、`uuidV1(now?: number, rng?): string`
  - `interface SnowflakeState { lastTimestamp: number; sequence: number }`
  - `nextSnowflake(state: SnowflakeState, machineId: number, epoch: bigint, now: number): bigint`
  - `decodeSnowflake(id: bigint, epoch: bigint): { timestamp: number; machineId: number; sequence: number }`
  - `idCardCheckDigit(first17: string): string`、`luhnCheckDigit(digits: string): string`
  - `randomName(rng)`、`randomPhone(rng)`、`randomIdCard(rng)`、`randomBankCard(rng)`、`randomEmail(rng)`、`randomAddress(rng)`、`randomCompany(rng)`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/MockData/__tests__/uuid.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { uuidV1, uuidV4, uuidV7 } from '../utils/uuid'

const seqRng = (start = 0) => {
  let counter = start
  return (bytes: Uint8Array) => {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (counter + i) & 0xff
    counter = (counter + bytes.length) & 0xff
  }
}

const version = (id: string) => id[14]
const variant = (id: string) => id[19]

describe('mock-data UUID', () => {
  it('v4 版本位与变体位正确，且同 rng 下输出确定', () => {
    const a = uuidV4(seqRng(0))
    const b = uuidV4(seqRng(0))
    expect(a).toBe(b)
    expect(version(a)).toBe('4')
    expect(['8', '9', 'a', 'b']).toContain(variant(a))
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('v7 版本位正确，时间前缀随毫秒递增', () => {
    const early = uuidV7(1_700_000_000_000, seqRng(0))
    const later = uuidV7(1_700_000_001_000, seqRng(0))
    expect(version(early)).toBe('7')
    expect(['8', '9', 'a', 'b']).toContain(variant(early))
    expect(early.slice(0, 12) < later.slice(0, 12)).toBe(true)
  })

  it('v1 版本位正确且 node 多播位置位', () => {
    const id = uuidV1(1_700_000_000_000, seqRng(0))
    expect(version(id)).toBe('1')
    expect(['8', '9', 'a', 'b']).toContain(variant(id))
    const nodeFirstByte = parseInt(id.replace(/-/g, '').slice(20, 22), 16)
    expect(nodeFirstByte & 0x01).toBe(1)
  })
})
```

创建 `src/views/tools/MockData/__tests__/snowflake.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { decodeSnowflake, nextSnowflake, type SnowflakeState } from '../utils/snowflake'

const EPOCH = 1288834974657n

describe('mock-data 雪花 ID', () => {
  it('同一毫秒内序列自增且 ID 互不相同', () => {
    const state: SnowflakeState = { lastTimestamp: 0, sequence: 0 }
    const ids = [0, 1, 2].map(() => nextSnowflake(state, 7, EPOCH, 1_700_000_000_000))
    expect(new Set(ids.map(String)).size).toBe(3)
    expect(ids[1] - ids[0]).toBe(1n)
  })

  it('序列用满 4096 后推进到下一毫秒', () => {
    const state: SnowflakeState = { lastTimestamp: 1_700_000_000_000, sequence: 4095 }
    nextSnowflake(state, 7, EPOCH, 1_700_000_000_000)
    expect(state.lastTimestamp).toBe(1_700_000_000_001)
    expect(state.sequence).toBe(0)
  })

  it('decode 往返得到时间戳 / 机器号 / 序列', () => {
    const state: SnowflakeState = { lastTimestamp: 0, sequence: 0 }
    const now = 1_700_000_000_000
    const id = nextSnowflake(state, 123, EPOCH, now)
    expect(decodeSnowflake(id, EPOCH)).toEqual({ timestamp: now, machineId: 123, sequence: 0 })
  })

  it('批量 1000 条互不相同', () => {
    const state: SnowflakeState = { lastTimestamp: 0, sequence: 0 }
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i += 1) ids.add(String(nextSnowflake(state, 1, EPOCH, 1_700_000_000_000)))
    expect(ids.size).toBe(1000)
  })
})
```

创建 `src/views/tools/MockData/__tests__/mockData.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { AREA_CODES, GIVEN_CHARS, SURNAMES, idCardCheckDigit, luhnCheckDigit, randomBankCard, randomIdCard, randomName, randomPhone } from '../utils/mockData'

const seqRng = (start = 0) => {
  let counter = start
  return (bytes: Uint8Array) => {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (counter + i * 7) & 0xff
    counter = (counter + 13) & 0xff
  }
}

describe('mock-data Mock 数据', () => {
  it('词表规模与内容符合规范', () => {
    expect(AREA_CODES).toHaveLength(31)
    for (const code of AREA_CODES) {
      expect(code).toMatch(/^\d{6}$/)
      expect(['11', '12', '13', '14', '15', '21', '22', '23', '31', '32', '33', '34', '35', '36', '37', '41', '42', '43', '44', '45', '46', '50', '51', '52', '53', '54', '61', '62', '63', '64', '65']).toContain(code.slice(0, 2))
    }
    expect(SURNAMES.length).toBeGreaterThanOrEqual(60)
    expect(GIVEN_CHARS.length).toBeGreaterThanOrEqual(80)
    for (const char of [...SURNAMES, ...GIVEN_CHARS]) expect(char).toMatch(/^[\u4e00-\u9fa5]$/)
  })

  it('身份证校验位可自洽重算，出生日期在允许区间', () => {
    for (let i = 0; i < 20; i += 1) {
      const id = randomIdCard(seqRng(i))
      expect(id).toMatch(/^\d{17}[\dX]$/)
      expect(idCardCheckDigit(id.slice(0, 17))).toBe(id[17])
      const year = Number(id.slice(6, 10))
      expect(year).toBeGreaterThanOrEqual(1940)
      expect(year).toBeLessThanOrEqual(2006)
      expect(AREA_CODES).toContain(id.slice(0, 6))
    }
  })

  it('银行卡号通过 Luhn 校验', () => {
    for (let i = 0; i < 20; i += 1) {
      const card = randomBankCard(seqRng(i))
      expect(card).toMatch(/^\d{16,19}$/)
      expect(luhnCheckDigit(card.slice(0, -1))).toBe(card[card.length - 1])
    }
  })

  it('姓名与手机号格式正确', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(randomName(seqRng(i))).toMatch(/^[\u4e00-\u9fa5]{2,4}$/)
      expect(randomPhone(seqRng(i))).toMatch(/^1[3-9]\d{9}$/)
    }
  })

  it('已知样本的校验位算法正确', () => {
    expect(idCardCheckDigit('11010519491231002')).toBe('X')
    expect(idCardCheckDigit('44052418800101001')).toBe('4')
    expect(luhnCheckDigit('7992739871')).toBe('3')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/MockData`
Expected: FAIL，报无法解析 `../utils/uuid`、`../utils/snowflake`、`../utils/mockData`。

- [ ] **Step 3: 实现 random.ts / uuid.ts / snowflake.ts / mockData.ts**

创建 `src/views/tools/MockData/utils/random.ts`：

```ts
export type Rng = (bytes: Uint8Array) => void

export const defaultRng: Rng = bytes => crypto.getRandomValues(bytes)

export function randomInt(rng: Rng, maxExclusive: number): number {
  if (maxExclusive <= 0) return 0
  const buf = new Uint8Array(4)
  rng(buf)
  const value = ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0
  return value % maxExclusive
}

export function pick<T>(rng: Rng, items: T[]): T {
  return items[randomInt(rng, items.length)]
}
```

创建 `src/views/tools/MockData/utils/uuid.ts`：

```ts
import { defaultRng, type Rng } from './random'

// 1582-10-15 到 1970-01-01 之间的 100ns 数
const UUID_EPOCH_OFFSET = 122192928000000000n

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

function format(bytes: Uint8Array): string {
  const h = hex(bytes)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function uuidV4(rng: Rng = defaultRng): string {
  const bytes = new Uint8Array(16)
  rng(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return format(bytes)
}

export function uuidV7(now: number = Date.now(), rng: Rng = defaultRng): string {
  const bytes = new Uint8Array(16)
  rng(bytes)
  let ts = BigInt(Math.floor(now))
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = Number(ts & 0xffn)
    ts >>= 8n
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return format(bytes)
}

export function uuidV1(now: number = Date.now(), rng: Rng = defaultRng): string {
  const rand = new Uint8Array(8)
  rng(rand)
  const timestamp = UUID_EPOCH_OFFSET + BigInt(Math.floor(now)) * 10000n
  const timeLow = Number(timestamp & 0xffffffffn)
  const timeMid = Number((timestamp >> 32n) & 0xffffn)
  const timeHi = Number((timestamp >> 48n) & 0x0fffn)
  const clockSeq = ((rand[0] << 8) | rand[1]) & 0x3fff
  const bytes = new Uint8Array(16)
  bytes[0] = (timeLow >>> 24) & 0xff
  bytes[1] = (timeLow >>> 16) & 0xff
  bytes[2] = (timeLow >>> 8) & 0xff
  bytes[3] = timeLow & 0xff
  bytes[4] = (timeMid >>> 8) & 0xff
  bytes[5] = timeMid & 0xff
  bytes[6] = ((timeHi >>> 8) & 0x0f) | 0x10
  bytes[7] = timeHi & 0xff
  bytes[8] = ((clockSeq >>> 8) & 0x3f) | 0x80
  bytes[9] = clockSeq & 0xff
  for (let i = 0; i < 6; i += 1) bytes[10 + i] = rand[2 + (i % 6)]
  bytes[10] |= 0x01
  return format(bytes)
}
```

创建 `src/views/tools/MockData/utils/snowflake.ts`：

```ts
export const DEFAULT_EPOCH = 1288834974657n

export interface SnowflakeState {
  lastTimestamp: number
  sequence: number
}

export interface SnowflakeParts {
  timestamp: number
  machineId: number
  sequence: number
}

// 41 位毫秒 + 10 位机器号 + 12 位序列；同毫秒序列自增，用满 4096 推进到下一毫秒
export function nextSnowflake(state: SnowflakeState, machineId: number, epoch: bigint, now: number): bigint {
  let timestamp = Math.max(Math.floor(now), state.lastTimestamp)
  if (timestamp === state.lastTimestamp) {
    state.sequence += 1
    if (state.sequence > 0xfff) {
      timestamp += 1
      state.sequence = 0
    }
  } else {
    state.sequence = 0
  }
  state.lastTimestamp = timestamp
  return ((BigInt(timestamp) - epoch) << 22n) | (BigInt(machineId & 0x3ff) << 12n) | BigInt(state.sequence)
}

export function decodeSnowflake(id: bigint, epoch: bigint): SnowflakeParts {
  return {
    timestamp: Number((id >> 22n) + epoch),
    machineId: Number((id >> 12n) & 0x3ffn),
    sequence: Number(id & 0xfffn)
  }
}
```

创建 `src/views/tools/MockData/utils/mockData.ts`：

```ts
import { defaultRng, pick, randomInt, type Rng } from './random'

// 大陆 31 个省级行政区各取 1 个真实 6 位区划码
export const AREA_CODES: string[] = [
  '110101', '120101', '130102', '140105', '150102', '210102', '220102', '230102',
  '310101', '320102', '330102', '340102', '350102', '360102', '370102', '410102',
  '420102', '430102', '440103', '450102', '460105', '500101', '510104', '520102',
  '530102', '540102', '610102', '620102', '630102', '640104', '650102'
]

export const SURNAMES: string[] = [
  '赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈', '褚', '卫', '蒋', '沈', '韩', '杨',
  '朱', '秦', '尤', '许', '何', '吕', '施', '张', '孔', '曹', '严', '华', '金', '魏', '陶', '姜',
  '戚', '谢', '邹', '喻', '柏', '水', '窦', '章', '云', '苏', '潘', '葛', '奚', '范', '彭', '郎',
  '鲁', '韦', '昌', '马', '苗', '凤', '花', '方', '俞', '任', '袁', '柳', '唐', '罗', '薛', '伍'
]

export const GIVEN_CHARS: string[] = [
  '伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明',
  '超', '秀', '霞', '平', '刚', '桂', '英', '华', '建', '文', '斌', '辉', '鹏', '飞', '宇', '浩',
  '然', '睿', '泽', '轩', '晨', '阳', '琳', '雪', '悦', '欣', '怡', '婷', '佳', '嘉', '琪', '瑶',
  '子', '一', '小', '大', '天', '安', '宁', '康', '乐', '思', '语', '心', '若', '书', '博', '远',
  '志', '海', '江', '山', '云', '风', '雨', '雪', '松', '竹', '梅', '兰', '春', '秋', '冬', '夏'
]

export const CITY_PREFIXES: string[] = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '西安', '南京', '苏州']
export const STREETS: string[] = ['中山路', '人民路', '建设路', '解放路', '文化路', '长江路', '科技路', '花园街', '和平街', '望江路']
export const COMPANY_WORDS: string[] = ['云图', '恒信', '星辰', '同创', '天工', '远景', '嘉合', '智联', '长风', '沃德']
export const COMPANY_SUFFIXES: string[] = ['科技有限公司', '网络技术有限公司', '信息技术有限公司', '数据服务有限公司']
export const EMAIL_WORDS: string[] = ['user', 'test', 'dev', 'admin', 'demo', 'qa', 'ops', 'hello', 'team', 'mail']

const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const ID_CHECK_MAP = '10X98765432'

export function idCardCheckDigit(first17: string): string {
  let sum = 0
  for (let i = 0; i < 17; i += 1) sum += Number(first17[i]) * ID_WEIGHTS[i]
  return ID_CHECK_MAP[sum % 11]
}

export function luhnCheckDigit(digits: string): string {
  let sum = 0
  let double = true
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = Number(digits[i])
    if (double) {
      value *= 2
      if (value > 9) value -= 9
    }
    sum += value
    double = !double
  }
  return String((10 - (sum % 10)) % 10)
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

export function randomName(rng: Rng = defaultRng): string {
  const surname = pick(rng, SURNAMES)
  const length = randomInt(rng, 2) + 1
  let given = ''
  for (let i = 0; i < length; i += 1) given += pick(rng, GIVEN_CHARS)
  return surname + given
}

export function randomPhone(rng: Rng = defaultRng): string {
  const second = 3 + randomInt(rng, 7)
  let tail = ''
  for (let i = 0; i < 8; i += 1) tail += randomInt(rng, 10)
  return `1${second}${tail}`
}

export function randomIdCard(rng: Rng = defaultRng): string {
  const area = pick(rng, AREA_CODES)
  const year = 1940 + randomInt(rng, 67)
  const month = 1 + randomInt(rng, 12)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = 1 + randomInt(rng, daysInMonth)
  const seq = pad(randomInt(rng, 1000), 3)
  const first17 = `${area}${year}${pad(month, 2)}${pad(day, 2)}${seq}`
  return first17 + idCardCheckDigit(first17)
}

export function randomBankCard(rng: Rng = defaultRng): string {
  const length = 16 + randomInt(rng, 4)
  let prefix = ''
  for (let i = 0; i < length - 1; i += 1) prefix += randomInt(rng, 10)
  return prefix + luhnCheckDigit(prefix)
}

export function randomEmail(rng: Rng = defaultRng): string {
  const domains = ['example.com', 'test.com', 'example.org']
  const user = `${pick(rng, EMAIL_WORDS)}${randomInt(rng, 1000)}`
  return `${user}@${pick(rng, domains)}`
}

export function randomAddress(rng: Rng = defaultRng): string {
  return `${pick(rng, CITY_PREFIXES)}市${pick(rng, STREETS)}${randomInt(rng, 200) + 1}号`
}

export function randomCompany(rng: Rng = defaultRng): string {
  return `${pick(rng, CITY_PREFIXES)}${pick(rng, COMPANY_WORDS)}${pick(rng, COMPANY_SUFFIXES)}`
}
```

> 说明：邮箱本地部分用独立的英文词表 `EMAIL_WORDS`，不用中文公司词表，避免生成非 ASCII 邮箱；`AREA_CODES` 的 31 条覆盖大陆 31 个省级行政区，前两位落在省级代码集合内（单测断言）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/MockData`
Expected: PASS（三个文件全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/MockData/utils src/views/tools/MockData/__tests__
git commit -m "feat(mock-data): 新增 UUID/雪花 ID/Mock 数据生成纯函数与单测"
```

---

### Task 7: mock-data 视图

**Files:**
- Modify: `src/views/tools/MockData/MockData.vue`（替换占位实现）

**Interfaces:**
- Consumes: `uuidV1` / `uuidV4` / `uuidV7`（Task 6）、`nextSnowflake` / `DEFAULT_EPOCH`（Task 6）、`randomName` 等（Task 6）、`customAlphabet`（`nanoid`）
- Produces: 视图，快照字段 `{ type, count, nanoidLength, nanoidAlphabet, epoch, machineId, splitMachineId, fields, outputFormat, uppercase }`

- [ ] **Step 1: 写视图实现**

替换 `src/views/tools/MockData/MockData.vue` 全文为：

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { NAlert, NButton, NCheckbox, NCheckboxGroup, NInput, NInputNumber, NRadioButton, NRadioGroup, NSwitch, useMessage } from 'naive-ui'
import { customAlphabet } from 'nanoid'
import { useTabStore } from '@/stores/tabStore'
import { DEFAULT_EPOCH, nextSnowflake, type SnowflakeState } from './utils/snowflake'
import { uuidV1, uuidV4, uuidV7 } from './utils/uuid'
import { randomAddress, randomBankCard, randomCompany, randomEmail, randomIdCard, randomName, randomPhone } from './utils/mockData'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

type GenType = 'uuid-v4' | 'uuid-v7' | 'uuid-v1' | 'nanoid' | 'snowflake' | 'mock'

const TYPES: { label: string; value: GenType }[] = [
  { label: 'UUID v4', value: 'uuid-v4' },
  { label: 'UUID v7', value: 'uuid-v7' },
  { label: 'UUID v1', value: 'uuid-v1' },
  { label: 'NanoID', value: 'nanoid' },
  { label: '雪花 ID', value: 'snowflake' },
  { label: 'Mock 数据', value: 'mock' }
]

const MOCK_FIELDS = [
  { label: '姓名', value: 'name' },
  { label: '手机号', value: 'phone' },
  { label: '身份证', value: 'idCard' },
  { label: '邮箱', value: 'email' },
  { label: '地址', value: 'address' },
  { label: '公司名', value: 'company' },
  { label: '银行卡号', value: 'bankCard' }
]

const type = ref<GenType>(props.initialSnapshot?.type ?? 'uuid-v4')
const count = ref<number>(props.initialSnapshot?.count ?? 5)
const nanoidLength = ref<number>(props.initialSnapshot?.nanoidLength ?? 21)
const nanoidAlphabet = ref<string>(props.initialSnapshot?.nanoidAlphabet ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-')
const epoch = ref<string>(props.initialSnapshot?.epoch ?? String(DEFAULT_EPOCH))
const machineId = ref<number>(props.initialSnapshot?.machineId ?? 1)
const splitMachineId = ref<boolean>(props.initialSnapshot?.splitMachineId ?? false)
const fields = ref<string[]>(props.initialSnapshot?.fields ?? ['name', 'phone', 'email'])
const outputFormat = ref<'list' | 'json'>(props.initialSnapshot?.outputFormat ?? 'list')
const uppercase = ref<boolean>(props.initialSnapshot?.uppercase ?? false)
const results = ref<string[]>([])
const errorMessage = ref<string>('')
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    type: type.value,
    count: count.value,
    nanoidLength: nanoidLength.value,
    nanoidAlphabet: nanoidAlphabet.value,
    epoch: epoch.value,
    machineId: machineId.value,
    splitMachineId: splitMachineId.value,
    fields: [...fields.value],
    outputFormat: outputFormat.value,
    uppercase: uppercase.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function mockRow(): Record<string, string> {
  const row: Record<string, string> = {}
  for (const field of fields.value) {
    if (field === 'name') row.name = randomName()
    if (field === 'phone') row.phone = randomPhone()
    if (field === 'idCard') row.idCard = randomIdCard()
    if (field === 'email') row.email = randomEmail()
    if (field === 'address') row.address = randomAddress()
    if (field === 'company') row.company = randomCompany()
    if (field === 'bankCard') row.bankCard = randomBankCard()
  }
  return row
}

function generate() {
  const size = Math.max(1, Math.min(1000, count.value))
  errorMessage.value = ''
  try {
    if (type.value === 'mock') {
      const rows = Array.from({ length: size }, () => mockRow())
      results.value = outputFormat.value === 'json'
        ? [JSON.stringify(rows, null, 2)]
        : rows.map(row => Object.values(row).join('\t'))
      return
    }
    if (type.value === 'snowflake') {
      let epochValue: bigint
      try {
        epochValue = BigInt(epoch.value.trim())
      } catch {
        errorMessage.value = '纪元必须是整数（毫秒）'
        return
      }
      const state: SnowflakeState = { lastTimestamp: 0, sequence: 0 }
      const machine = splitMachineId.value ? (machineId.value & 0x3ff) : (machineId.value & 0x1f)
      const ids: string[] = []
      for (let i = 0; i < size; i += 1) {
        ids.push(String(nextSnowflake(state, machine, epochValue, Date.now())))
      }
      results.value = ids
      return
    }
    if (type.value === 'nanoid') {
      if (!nanoidAlphabet.value) {
        errorMessage.value = '自定义字母表不能为空'
        return
      }
      const length = Math.max(1, Math.min(128, nanoidLength.value))
      const gen = customAlphabet(nanoidAlphabet.value, length)
      results.value = Array.from({ length: size }, () => gen())
      return
    }
    const gen = type.value === 'uuid-v4' ? uuidV4 : type.value === 'uuid-v7' ? uuidV7 : uuidV1
    results.value = Array.from({ length: size }, () => (uppercase.value ? gen().toUpperCase() : gen()))
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '生成失败'
  }
}

function copyAll() {
  if (!results.value.length) return
  navigator.clipboard.writeText(results.value.join('\n'))
  message.success('已复制')
}

function copyOne(item: string) {
  navigator.clipboard.writeText(item)
  message.success('已复制')
}

watch([type, count, nanoidLength, nanoidAlphabet, epoch, machineId, splitMachineId, fields, outputFormat, uppercase], scheduleSnapshot, { deep: true })
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 shrink-0">
      <h1 class="text-sm font-bold tracking-tight">UUID / 雪花 ID / Mock 数据</h1>
      <p class="text-[11px] text-slate-500 dark:text-slate-400">crypto.getRandomValues 随机源，生成结果不落库，重开需重新生成</p>
    </header>

    <div class="flex-1 min-h-0 overflow-auto p-4 space-y-4">
      <NRadioGroup v-model:value="type" size="small">
        <NRadioButton v-for="item in TYPES" :key="item.value" :value="item.value">{{ item.label }}</NRadioButton>
      </NRadioGroup>

      <div class="flex flex-wrap items-center gap-4">
        <span class="flex items-center gap-2 text-xs">
          数量
          <NInputNumber v-model:value="count" class="w-24" size="small" :min="1" :max="1000" />
        </span>
        <span v-if="type === 'nanoid'" class="flex items-center gap-2 text-xs">
          长度
          <NInputNumber v-model:value="nanoidLength" class="w-20" size="small" :min="1" :max="128" />
        </span>
        <span v-if="type === 'snowflake'" class="flex items-center gap-2 text-xs">
          机器号
          <NInputNumber v-model:value="machineId" class="w-24" size="small" :min="0" :max="1023" />
          <NSwitch v-model:value="splitMachineId" size="small" />按 5+5 拆分
        </span>
        <span v-if="type === 'uuid-v1' || type === 'uuid-v4' || type === 'uuid-v7'" class="flex items-center gap-2 text-xs">
          <NSwitch v-model:value="uppercase" size="small" />大写
        </span>
        <NButton type="primary" size="small" @click="generate">生成</NButton>
        <NButton size="small" @click="copyAll">复制全部</NButton>
      </div>

      <div v-if="type === 'nanoid'" class="flex items-center gap-2">
        <span class="w-20 text-xs text-slate-500 dark:text-slate-400">字母表</span>
        <NInput v-model:value="nanoidAlphabet" size="small" class="max-w-xl" />
      </div>

      <div v-if="type === 'snowflake'" class="flex items-center gap-2">
        <span class="w-20 text-xs text-slate-500 dark:text-slate-400">纪元</span>
        <NInput v-model:value="epoch" size="small" class="max-w-xs" />
        <span class="text-[11px] text-slate-400">默认 1288834974657（Twitter 纪元）</span>
      </div>

      <div v-if="type === 'mock'" class="space-y-2">
        <div class="flex items-center gap-3">
          <span class="text-xs text-slate-500 dark:text-slate-400">字段</span>
          <NCheckboxGroup v-model:value="fields">
            <NCheckbox v-for="item in MOCK_FIELDS" :key="item.value" :value="item.value">{{ item.label }}</NCheckbox>
          </NCheckboxGroup>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-slate-500 dark:text-slate-400">输出</span>
          <NRadioGroup v-model:value="outputFormat" size="small">
            <NRadioButton value="list">制表符列表</NRadioButton>
            <NRadioButton value="json">JSON 数组</NRadioButton>
          </NRadioGroup>
        </div>
        <p class="text-[11px] text-amber-600 dark:text-amber-400">测试号段与模拟身份证仅供本地测试，请勿用于真实业务。</p>
      </div>

      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>

      <div class="space-y-1">
        <div v-for="(item, index) in results" :key="index" class="flex items-center gap-2">
          <code class="flex-1 text-xs font-mono break-all">{{ item }}</code>
          <NButton size="tiny" @click="copyOne(item)">复制</NButton>
        </div>
        <p v-if="!results.length" class="text-xs text-slate-400">点击「生成」创建数据</p>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 类型检查与构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错。

- [ ] **Step 3: 提交**

```bash
git add src/views/tools/MockData/MockData.vue
git commit -m "feat(mock-data): 新增 UUID/雪花 ID/Mock 数据生成视图"
```

---

### Task 8: tabular-convert 纯函数

**Files:**
- Create: `src/views/tools/TabularConvert/utils/delimiter.ts`
- Create: `src/views/tools/TabularConvert/utils/parseTable.ts`
- Create: `src/views/tools/TabularConvert/utils/inferType.ts`
- Create: `src/views/tools/TabularConvert/utils/toJson.ts`
- Create: `src/views/tools/TabularConvert/utils/toSql.ts`
- Test: `src/views/tools/TabularConvert/__tests__/parseTable.spec.ts`
- Test: `src/views/tools/TabularConvert/__tests__/inferType.spec.ts`
- Test: `src/views/tools/TabularConvert/__tests__/toJson.spec.ts`
- Test: `src/views/tools/TabularConvert/__tests__/toSql.spec.ts`

**Interfaces:**
- Produces:
  - `type CellValue = string | number | boolean | null`
  - `detectDelimiter(text: string): string`
  - `interface ParsedTable { headers: string[]; rows: string[][]; skippedBlankLines: number; warnings: { line: number; message: string }[] }`
  - `parseDelimitedText(text: string, options: { delimiter?: string; hasHeader: boolean }): ParsedTable`
  - `inferCell(raw: string, options: { emptyAsNull: boolean }): CellValue`
  - `rowsToJsonArray(headers, rows, options): string`、`rowsToArrayOfArrays(rows, options): string`
  - `type SqlInsertDialect = 'sql' | 'mysql' | 'postgresql' | 'sqlite' | 'transactsql' | 'plsql'`
  - `rowsToInsertSql(dialect, table, headers, rows, options: { multiRow: boolean; batchSize?: number }): string`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/TabularConvert/__tests__/parseTable.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { detectDelimiter } from '../utils/delimiter'
import { parseDelimitedText } from '../utils/parseTable'

describe('tabular-convert 解析', () => {
  it('探测制表符 / 逗号 / 分号 / 竖线', () => {
    expect(detectDelimiter('a\tb\nc\td')).toBe('\t')
    expect(detectDelimiter('a,b\nc,d')).toBe(',')
    expect(detectDelimiter('a;b\nc;d')).toBe(';')
    expect(detectDelimiter('a|b\nc|d')).toBe('|')
  })

  it('单列文本不误判为多列', () => {
    expect(parseDelimitedText('name\n张三\n李四', { hasHeader: true }).headers).toEqual(['name'])
  })

  it('解析带引号字段与 "" 转义', () => {
    const table = parseDelimitedText('a,b\n"x,1","say ""hi"""', { delimiter: ',', hasHeader: true })
    expect(table.rows).toEqual([['x,1', 'say "hi"']])
  })

  it('字段内换行与 CRLF 被正确处理', () => {
    const table = parseDelimitedText('a,b\r\n"line1\nline2",2\r\n', { delimiter: ',', hasHeader: true })
    expect(table.rows).toEqual([['line1\nline2', '2']])
  })

  it('跳过完全空行并计数', () => {
    const table = parseDelimitedText('a,b\n\n1,2\n\n', { delimiter: ',', hasHeader: true })
    expect(table.rows).toEqual([['1', '2']])
    expect(table.skippedBlankLines).toBeGreaterThanOrEqual(1)
  })

  it('列数不足按空值补齐，列数超出记告警', () => {
    const table = parseDelimitedText('a,b,c\n1,2\n1,2,3,4', { delimiter: ',', hasHeader: true })
    expect(table.rows[0]).toEqual(['1', '2', ''])
    expect(table.warnings[0].message).toContain('列数')
  })

  it('表头为空回退 colN，重复表头追加 _2', () => {
    const table = parseDelimitedText('a,,a\n1,2,3', { delimiter: ',', hasHeader: true })
    expect(table.headers).toEqual(['a', 'col2', 'a_2'])
  })

  it('关闭表头开关时列名为 col1..colN', () => {
    const table = parseDelimitedText('1,2\n3,4', { delimiter: ',', hasHeader: false })
    expect(table.headers).toEqual(['col1', 'col2'])
    expect(table.rows).toHaveLength(2)
  })
})
```

创建 `src/views/tools/TabularConvert/__tests__/inferType.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { inferCell } from '../utils/inferType'

const opts = { emptyAsNull: true }

describe('tabular-convert 类型推导', () => {
  it('布尔与空值', () => {
    expect(inferCell('true', opts)).toBe(true)
    expect(inferCell('FALSE', opts)).toBe(false)
    expect(inferCell('', opts)).toBe(null)
    expect(inferCell('', { emptyAsNull: false })).toBe('')
  })

  it('整数与小数转为数值', () => {
    expect(inferCell('42', opts)).toBe(42)
    expect(inferCell('-3.5', opts)).toBe(-3.5)
    expect(inferCell('+7', opts)).toBe(7)
  })

  it('大整数与带前导零的字符串保持字符串', () => {
    expect(inferCell('00123', opts)).toBe('00123')
    expect(inferCell('1892837482910293847', opts)).toBe('1892837482910293847')
    expect(inferCell('9007199254740993', opts)).toBe('9007199254740993')
    expect(inferCell('123456789012345', opts)).toBe(123456789012345)
  })

  it('科学计数法与普通文本保持字符串', () => {
    expect(inferCell('1e5', opts)).toBe('1e5')
    expect(inferCell('abc', opts)).toBe('abc')
  })
})
```

创建 `src/views/tools/TabularConvert/__tests__/toJson.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { rowsToArrayOfArrays, rowsToJsonArray } from '../utils/toJson'

describe('tabular-convert JSON 输出', () => {
  it('对象数组按表头为键', () => {
    const output = rowsToJsonArray(['id', 'name'], [['1', '张三']], { emptyAsNull: true })
    expect(output).toBe('[\n  {\n    "id": 1,\n    "name": "张三"\n  }\n]')
  })

  it('数组的数组可选输出表头', () => {
    expect(rowsToArrayOfArrays([['1', '2']], { emptyAsNull: true, includeHeader: false })).toBe('[\n  [\n    1,\n    2\n  ]\n]')
    expect(rowsToArrayOfArrays([['1', '2']], { emptyAsNull: true, includeHeader: true, headers: ['a', 'b'] })).toBe('[\n  [\n    "a",\n    "b"\n  ],\n  [\n    1,\n    2\n  ]\n]')
  })
})
```

创建 `src/views/tools/TabularConvert/__tests__/toSql.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { rowsToInsertSql } from '../utils/toSql'

const headers = ['id', 'name']
const rows = [['1', 'a'], ['2', 'b']]

describe('tabular-convert SQL 输出', () => {
  it('MySQL 用反引号引用标识符，布尔用 TRUE/FALSE', () => {
    expect(rowsToInsertSql('mysql', 't', ['flag'], [['true']], { multiRow: false })).toBe('INSERT INTO `t` (`flag`) VALUES (TRUE);')
  })

  it('SQL Server 用方括号引用标识符，布尔用 1/0', () => {
    expect(rowsToInsertSql('transactsql', 't', ['flag'], [['false']], { multiRow: false })).toBe('INSERT INTO [t] ([flag]) VALUES (0);')
  })

  it('PostgreSQL 用双引号，null 输出 NULL', () => {
    expect(rowsToInsertSql('postgresql', 't', ['a'], [['']], { multiRow: false })).toBe('INSERT INTO "t" ("a") VALUES (NULL);')
  })

  it('单引号双写，MySQL 额外转义反斜杠', () => {
    expect(rowsToInsertSql('sqlite', 't', ['a'], [["it's"]], { multiRow: false })).toBe("INSERT INTO \"t\" (\"a\") VALUES ('it''s');")
    expect(rowsToInsertSql('mysql', 't', ['a'], [['a\\b']], { multiRow: false })).toBe("INSERT INTO `t` (`a`) VALUES ('a\\\\b');")
  })

  it('标识符内的引用符按方言双写', () => {
    expect(rowsToInsertSql('postgresql', 't', ['a"b'], [['1']], { multiRow: false })).toBe('INSERT INTO "t" ("a""b") VALUES (1);')
    expect(rowsToInsertSql('transactsql', 't', ['a]b'], [['1']], { multiRow: false })).toBe('INSERT INTO [t] ([a]]b]) VALUES (1);')
  })

  it('多行批量按 batchSize 分块', () => {
    const sql = rowsToInsertSql('mysql', 't', headers, rows, { multiRow: true, batchSize: 2 })
    expect(sql).toBe('INSERT INTO `t` (`id`, `name`) VALUES (1, \'a\'), (2, \'b\');')
  })

  it('六种方言都能生成语句', () => {
    for (const dialect of ['sql', 'mysql', 'postgresql', 'sqlite', 'transactsql', 'plsql'] as const) {
      const sql = rowsToInsertSql(dialect, 't', headers, [rows[0]], { multiRow: false })
      expect(sql.startsWith('INSERT INTO')).toBe(true)
      expect(sql.endsWith(';')).toBe(true)
    }
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/TabularConvert`
Expected: FAIL，报无法解析 `../utils/parseTable` 等模块。

- [ ] **Step 3: 实现五个 utils 模块**

创建 `src/views/tools/TabularConvert/utils/delimiter.ts`：

```ts
const CANDIDATES = ['\t', ',', ';', '|']

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// 取「首 20 个非空行的字段数中位数最大」的候选分隔符；都不足 2 列时返回 \t（按单列处理）
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '').slice(0, 20)
  if (!lines.length) return '\t'
  let best = '\t'
  let bestScore = 0
  for (const candidate of CANDIDATES) {
    const score = median(lines.map(line => line.split(candidate).length))
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return bestScore >= 2 ? best : '\t'
}
```

创建 `src/views/tools/TabularConvert/utils/parseTable.ts`：

```ts
import { detectDelimiter } from './delimiter'

export interface ParsedTable {
  headers: string[]
  rows: string[][]
  skippedBlankLines: number
  warnings: { line: number; message: string }[]
}

export function parseDelimitedText(text: string, options: { delimiter?: string; hasHeader: boolean }): ParsedTable {
  const normalized = text.replace(/\r\n?/g, '\n')
  const delimiter = options.delimiter || detectDelimiter(normalized)
  const rawRows: { cells: string[]; line: number }[] = []
  let field = ''
  let cells: string[] = []
  let inQuotes = false
  let line = 1
  let rowStartLine = 1
  let i = 0

  while (i < normalized.length) {
    const ch = normalized[i]
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      if (ch === '\n') line += 1
      field += ch
      i += 1
      continue
    }
    if (ch === '"' && field === '') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === delimiter) {
      cells.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\n') {
      cells.push(field)
      rawRows.push({ cells, line: rowStartLine })
      cells = []
      field = ''
      line += 1
      rowStartLine = line
      i += 1
      continue
    }
    field += ch
    i += 1
  }
  if (field !== '' || cells.length > 0) {
    cells.push(field)
    rawRows.push({ cells, line: rowStartLine })
  }

  let skippedBlankLines = 0
  const rows = rawRows.filter(row => {
    if (row.cells.every(cell => cell === '')) {
      skippedBlankLines += 1
      return false
    }
    return true
  })

  const warnings: { line: number; message: string }[] = []
  const headerRow = options.hasHeader ? rows.shift() : undefined
  const columnCount = Math.max(
    headerRow ? headerRow.cells.length : 0,
    ...rows.map(row => row.cells.length),
    0
  )

  const headers: string[] = []
  const used = new Map<string, number>()
  for (let index = 0; index < columnCount; index += 1) {
    const raw = headerRow ? (headerRow.cells[index] ?? '').trim() : ''
    let name = raw || `col${index + 1}`
    const seen = used.get(name)
    if (seen === undefined) {
      used.set(name, 1)
    } else {
      used.set(name, seen + 1)
      name = `${name}_${seen + 1}`
      used.set(name, 1)
    }
    headers.push(name)
  }

  const normalizedRows = rows.map(row => {
    if (row.cells.length > columnCount) {
      warnings.push({ line: row.line, message: `第 ${row.line} 行列数（${row.cells.length}）超过表头列数（${columnCount}），多余列已忽略` })
      return row.cells.slice(0, columnCount)
    }
    if (row.cells.length < columnCount) {
      return [...row.cells, ...Array(columnCount - row.cells.length).fill('')]
    }
    return row.cells
  })

  return { headers, rows: normalizedRows, skippedBlankLines, warnings }
}
```

创建 `src/views/tools/TabularConvert/utils/inferType.ts`：

```ts
export type CellValue = string | number | boolean | null

const MAX_SAFE_DIGITS = 15

export function inferCell(raw: string, options: { emptyAsNull: boolean }): CellValue {
  const text = raw.trim()
  if (text === '') return options.emptyAsNull ? null : ''
  if (/^true$/i.test(text)) return true
  if (/^false$/i.test(text)) return false

  if (/^[+-]?\d+$/.test(text)) {
    const digits = text.replace(/^[+-]/, '')
    // 前导零、超 15 位有效数字、超安全整数一律保持字符串
    if (/^0\d/.test(digits) || digits.length > MAX_SAFE_DIGITS) return raw
    const value = Number(text)
    return Number.isSafeInteger(value) ? value : raw
  }

  if (/^[+-]?(\d+\.\d*|\.\d+)$/.test(text)) {
    const digits = text.replace(/^[+-]/, '').replace('.', '').replace(/^0+/, '')
    if (digits.length > MAX_SAFE_DIGITS) return raw
    return Number(text)
  }

  return raw
}
```

创建 `src/views/tools/TabularConvert/utils/toJson.ts`：

```ts
import { inferCell, type CellValue } from './inferType'

export function rowsToJsonArray(headers: string[], rows: string[][], options: { emptyAsNull: boolean }): string {
  const objects = rows.map(row => {
    const entry: Record<string, CellValue> = {}
    headers.forEach((header, index) => {
      entry[header] = inferCell(row[index] ?? '', options)
    })
    return entry
  })
  return JSON.stringify(objects, null, 2)
}

export function rowsToArrayOfArrays(
  rows: string[][],
  options: { emptyAsNull: boolean; includeHeader: boolean; headers?: string[] }
): string {
  const arrays: CellValue[][] = rows.map(row => row.map(cell => inferCell(cell, options)))
  if (options.includeHeader) arrays.unshift([...(options.headers ?? [])])
  return JSON.stringify(arrays, null, 2)
}
```

创建 `src/views/tools/TabularConvert/utils/toSql.ts`：

```ts
import { inferCell, type CellValue } from './inferType'

export type SqlInsertDialect = 'sql' | 'mysql' | 'postgresql' | 'sqlite' | 'transactsql' | 'plsql'

const QUOTE_PAIRS: Record<SqlInsertDialect, [string, string]> = {
  sql: ['"', '"'],
  mysql: ['`', '`'],
  postgresql: ['"', '"'],
  sqlite: ['"', '"'],
  transactsql: ['[', ']'],
  plsql: ['"', '"']
}

const BOOL_LITERALS: Record<SqlInsertDialect, [string, string]> = {
  sql: ['1', '0'],
  mysql: ['TRUE', 'FALSE'],
  postgresql: ['TRUE', 'FALSE'],
  sqlite: ['TRUE', 'FALSE'],
  transactsql: ['1', '0'],
  plsql: ['1', '0']
}

function quoteIdentifier(dialect: SqlInsertDialect, name: string): string {
  const [open, close] = QUOTE_PAIRS[dialect]
  if (dialect === 'transactsql') return `${open}${name.replace(/]/g, ']]')}${close}`
  const escaped = name.split(open).join(open + open)
  return `${open}${escaped}${close}`
}

function quoteString(dialect: SqlInsertDialect, value: string): string {
  let escaped = value.split("'").join("''")
  if (dialect === 'mysql') escaped = escaped.split('\\').join('\\\\')
  return `'${escaped}'`
}

function renderValue(dialect: SqlInsertDialect, value: CellValue): string {
  if (value === null) return 'NULL'
  if (typeof value === 'boolean') return value ? BOOL_LITERALS[dialect][0] : BOOL_LITERALS[dialect][1]
  if (typeof value === 'number') return String(value)
  return quoteString(dialect, value)
}

export function rowsToInsertSql(
  dialect: SqlInsertDialect,
  table: string,
  headers: string[],
  rows: string[][],
  options: { multiRow: boolean; batchSize?: number }
): string {
  const target = table.trim() || 'my_table'
  const columns = headers.map(header => quoteIdentifier(dialect, header)).join(', ')
  const prefix = `INSERT INTO ${quoteIdentifier(dialect, target)} (${columns}) VALUES `
  const renderRow = (row: string[]) =>
    `(${headers.map((_, index) => renderValue(dialect, inferCell(row[index] ?? '', { emptyAsNull: true }))).join(', ')})`

  if (!options.multiRow) {
    return rows.map(row => `${prefix}${renderRow(row)};`).join('\n')
  }

  const batchSize = options.batchSize ?? 100
  const statements: string[] = []
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize).map(renderRow).join(', ')
    statements.push(`${prefix}${chunk};`)
  }
  return statements.join('\n')
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/TabularConvert`
Expected: PASS（四个文件全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/TabularConvert/utils src/views/tools/TabularConvert/__tests__
git commit -m "feat(tabular-convert): 新增 TSV/CSV 解析、类型推导与 JSON/SQL 生成纯函数及单测"
```

---

### Task 9: tabular-convert 视图

**Files:**
- Modify: `src/views/tools/TabularConvert/TabularConvert.vue`（替换占位实现）

**Interfaces:**
- Consumes: `parseDelimitedText` / `detectDelimiter` / `inferCell` / `rowsToJsonArray` / `rowsToArrayOfArrays` / `rowsToInsertSql`（Task 8）
- Produces: 视图，快照字段 `{ input, delimiter, hasHeader, emptyAsNull, outputMode, dialect, table, multiRow }`

- [ ] **Step 1: 写视图实现**

替换 `src/views/tools/TabularConvert/TabularConvert.vue` 全文为：

```vue
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NRadioButton, NRadioGroup, NSelect, NSwitch, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { Compartment, EditorState } from '@codemirror/state'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { parseDelimitedText, type ParsedTable } from './utils/parseTable'
import { rowsToArrayOfArrays, rowsToJsonArray } from './utils/toJson'
import { rowsToInsertSql, type SqlInsertDialect } from './utils/toSql'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

const AUTO_RUN_MAX_BYTES = 1024 * 1024

const SAMPLE = ['id\tname\tactive', '1\t张三\ttrue', '2\t李四\tfalse'].join('\n')

const DELIMITERS = [
  { label: '自动探测', value: '' },
  { label: '制表符 (TSV)', value: '\t' },
  { label: '逗号 (CSV)', value: ',' },
  { label: '分号', value: ';' },
  { label: '竖线', value: '|' }
]

const DIALECTS: { label: string; value: SqlInsertDialect }[] = [
  { label: '标准 SQL', value: 'sql' },
  { label: 'MySQL', value: 'mysql' },
  { label: 'PostgreSQL', value: 'postgresql' },
  { label: 'SQLite', value: 'sqlite' },
  { label: 'SQL Server', value: 'transactsql' },
  { label: 'Oracle', value: 'plsql' }
]

const input = ref<string>(props.initialSnapshot?.input ?? SAMPLE)
const delimiter = ref<string>(props.initialSnapshot?.delimiter ?? '')
const hasHeader = ref<boolean>(props.initialSnapshot?.hasHeader ?? true)
const emptyAsNull = ref<boolean>(props.initialSnapshot?.emptyAsNull ?? true)
const outputMode = ref<'json' | 'array' | 'sql'>(props.initialSnapshot?.outputMode ?? 'json')
const dialect = ref<SqlInsertDialect>(props.initialSnapshot?.dialect ?? 'mysql')
const table = ref<string>(props.initialSnapshot?.table ?? 'my_table')
const multiRow = ref<boolean>(props.initialSnapshot?.multiRow ?? false)
const parsed = ref<ParsedTable | null>(null)
const output = ref<string>('')
const manualMode = ref<boolean>(false)
const editorEl = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let runTimer: ReturnType<typeof setTimeout> | null = null

const themeCompartment = new Compartment()

const outputLabel = computed(() => (outputMode.value === 'sql' ? 'SQL 输出' : 'JSON 输出'))

function getInput(): string {
  return editorView ? editorView.state.doc.toString() : input.value
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    input: getInput(),
    delimiter: delimiter.value,
    hasHeader: hasHeader.value,
    emptyAsNull: emptyAsNull.value,
    outputMode: outputMode.value,
    dialect: dialect.value,
    table: table.value,
    multiRow: multiRow.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function runConvert() {
  const text = getInput()
  if (!text.trim()) {
    parsed.value = null
    output.value = ''
    return
  }
  const result = parseDelimitedText(text, {
    delimiter: delimiter.value || undefined,
    hasHeader: hasHeader.value
  })
  parsed.value = result
  if (outputMode.value === 'json') {
    output.value = rowsToJsonArray(result.headers, result.rows, { emptyAsNull: emptyAsNull.value })
    return
  }
  if (outputMode.value === 'array') {
    output.value = rowsToArrayOfArrays(result.rows, {
      emptyAsNull: emptyAsNull.value,
      includeHeader: hasHeader.value,
      headers: result.headers
    })
    return
  }
  output.value = rowsToInsertSql(dialect.value, table.value, result.headers, result.rows, { multiRow: multiRow.value })
}

function scheduleRun() {
  manualMode.value = getInput().length > AUTO_RUN_MAX_BYTES
  if (manualMode.value) return
  if (runTimer) clearTimeout(runTimer)
  runTimer = setTimeout(runConvert, 250)
}

function handleDocChange() {
  input.value = getInput()
  scheduleSnapshot()
  scheduleRun()
}

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value)
  message.success('已复制')
}

async function importFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const text = await file.text()
  if (editorView) {
    editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: text } })
  }
  input.value = text
  runConvert()
  saveSnapshot()
  // 允许重复选择同一个文件
  ;(event.target as HTMLInputElement).value = ''
}

function getEditorTheme(isDark: boolean) {
  return EditorView.theme(
    {
      '&': { height: '100%', fontSize: '13px', backgroundColor: isDark ? '#090d16' : '#ffffff', color: isDark ? '#e2e8f0' : '#1e293b' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', lineHeight: '1.6' },
      '.cm-gutters': { backgroundColor: isDark ? '#070a10' : '#f8fafc', color: isDark ? '#475569' : '#94a3b8', borderRight: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0' }
    },
    { dark: isDark }
  )
}

onMounted(async () => {
  await nextTick()
  if (editorEl.value) {
    editorView = new EditorView({
      state: EditorState.create({
        doc: input.value,
        extensions: [
          basicSetup,
          themeCompartment.of(getEditorTheme(themeStore.isDark)),
          EditorView.updateListener.of(update => {
            if (update.docChanged) handleDocChange()
          })
        ]
      }),
      parent: editorEl.value
    })
  }
  runConvert()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  if (runTimer) clearTimeout(runTimer)
  saveSnapshot()
  editorView?.destroy()
  editorView = null
})

watch([delimiter, hasHeader, emptyAsNull, outputMode, dialect, table, multiRow], () => {
  runConvert()
  scheduleSnapshot()
})

watch(
  () => themeStore.isDark,
  dark => {
    if (editorView) editorView.dispatch({ effects: themeCompartment.reconfigure(getEditorTheme(dark)) })
  }
)
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 shrink-0 space-y-2">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-sm font-bold tracking-tight">Excel / CSV 转 JSON 与 SQL</h1>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">粘贴 TSV/CSV 或选择文件，自动推导类型并生成 JSON 或多方言 INSERT</p>
        </div>
        <div class="flex items-center gap-2">
          <label class="text-xs">
            <input type="file" accept=".csv,.tsv,.txt" class="hidden" @change="importFile" />
            <span class="inline-flex items-center px-2 py-1 rounded border border-slate-300 dark:border-slate-700 cursor-pointer text-xs">选择文件…</span>
          </label>
          <NButton v-if="manualMode" size="small" type="primary" @click="runConvert">转换</NButton>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <NSelect v-model:value="delimiter" class="w-36" size="small" :options="DELIMITERS" />
        <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="hasHeader" size="small" />首行为表头</span>
        <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="emptyAsNull" size="small" />空值转 null</span>
        <NRadioGroup v-model:value="outputMode" size="small">
          <NRadioButton value="json">JSON 数组</NRadioButton>
          <NRadioButton value="array">数组的数组</NRadioButton>
          <NRadioButton value="sql">SQL INSERT</NRadioButton>
        </NRadioGroup>
        <template v-if="outputMode === 'sql'">
          <NSelect v-model:value="dialect" class="w-36" size="small" :options="DIALECTS" />
          <NInput v-model:value="table" class="w-40" size="small" placeholder="表名" />
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="multiRow" size="small" />多行批量</span>
        </template>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="manualMode" type="warning" :bordered="false">输入超过 1MB，已关闭自动转换，请手动点击「转换」。</NAlert>
      <NAlert v-if="parsed" type="info" :bordered="false">
        {{ parsed.rows.length }} 行 × {{ parsed.headers.length }} 列，跳过 {{ parsed.skippedBlankLines }} 个空行
      </NAlert>
      <NAlert v-for="warning in parsed?.warnings.slice(0, 10) ?? []" :key="warning.line" type="warning" :bordered="false">
        {{ warning.message }}
      </NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">表格文本</div>
        <div ref="editorEl" class="flex-1 min-h-0 overflow-hidden"></div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">{{ outputLabel }}</span>
          <NButton size="tiny" @click="copyOutput">复制</NButton>
        </div>
        <pre class="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono leading-relaxed">{{ output }}</pre>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 类型检查与构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，产出 `dist/assets/TabularConvert-*.js`。

- [ ] **Step 3: 提交**

```bash
git add src/views/tools/TabularConvert/TabularConvert.vue
git commit -m "feat(tabular-convert): 新增 Excel/CSV 转 JSON 与 SQL 视图"
```

---

### Task 10: 全量回归与验收

**Files:** 无新增（只跑验证；若发现回归，修正对应任务的文件后重跑）

- [ ] **Step 1: 前端全量测试与构建**

Run: `npm test`
Expected: 既有用例 + 批次 A 新增的 4 组用例全部 PASS。

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，`dist/assets/` 下能看到 `Regex-*.js`、`MockData-*.js`、`ColorConverter-*.js`、`TabularConvert-*.js`。

- [ ] **Step 2: Rust 回归（批次 A 不涉及 Rust 改动，仅确认未破）**

Run: `cargo clippy --all-targets -- -D warnings`（工作目录 `src-tauri`）
Expected: 无 warning。

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部通过。注意：`test_http` 组用例会在沙箱内因禁止绑定本地回环端口而失败，属环境限制；需在沙箱外重跑 `cargo test --manifest-path Cargo.toml --test test_http` 确认 6 个用例全绿。

- [ ] **Step 3: 依赖与约束核对**

Run: `git diff HEAD~N --stat -- src-tauri/ package.json`（N = 本批次任务数）
Expected: 无输出（两个路径都不应出现在改动里）。

Run: `git diff HEAD~N --stat -- src/types/tool.ts`
Expected: 只有新增行（3 条注册项），无既有条目改动。

- [ ] **Step 4: 人工验收清单（dev 服务）**

启动 `npm run dev`（默认 1420），逐项确认：

1. 侧边栏四个工具都打开真实实现，不再出现占位页。
2. `regex`：输入 `\d+` 高亮全部数字；贴一个非法正则（如 `([a-z`）就地报错不白屏；点「手机号」规则一键载入并命中样例；替换框输入 `[$&]` 后预览正确。
3. `color-converter`：输入 `#FF0000` 三栏同步；拖动 Alpha 后 HEX 出现 alpha 通道；点最近使用色能回填。
4. `mock-data`：生成 5 条 UUID v4；切雪花 ID 生成后能看到互不相同的十进制串；Mock 数据里身份证 18 位且校验位自洽（可用 `regex` 工具交叉验证）。
5. `tabular-convert`：粘贴一段 Excel 复制的 TSV（含中文、数字、`true`），JSON 输出正确；切 SQL + MySQL，标识符为反引号、字符串单引号双写；把某列改成 19 位数字，输出保持带引号的字符串。
6. 四个工具关闭 Tab 再打开，输入与视图选项均还原；`mock-data` 重开后结果区为空（符合设计）。

- [ ] **Step 5: 确认提交历史与工作区状态**

Run: `git log --oneline -12`
Expected: 看到本计划各任务的提交记录。

Run: `git status --short`
Expected: 无未提交改动。

- [ ] **Step 6: 向用户汇报**

汇报内容：四个工具的实现范围、跑过的验证命令与结果、零新增依赖的证据、以及「本批次不改 Rust 与数据库 schema」的确认。

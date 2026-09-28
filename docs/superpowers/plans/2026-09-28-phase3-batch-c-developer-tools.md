# 第三阶段批次 C 实施计划：Markdown 预览与图片 / Base64 / SVG

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付第三阶段批次 C 的两个工具——`markdown`（GFM 实时预览 + 双向同步滚动 + 导出）与 `image-base64`（图片 ↔ Base64/DataURL、剪贴板粘图、等比缩放重编码、SVG 压缩、另存到本地）。

**Architecture:** Markdown 侧用 `marked` 解析、`DOMPurify` 消毒、`highlight.js` 高亮代码块，预览走 `sandbox="allow-same-origin"`（不给 `allow-scripts`）的 `srcdoc` iframe，滚动同步按比例双向驱动。图片侧的 Base64/DataURL 解析、SVG 压缩、缩放尺寸计算都是纯函数；真正的文件落地由新增的 Rust 命令 `save_binary_file`（`std::fs` + 已有 `base64` crate，零新增 crate）完成。

**Tech Stack:** Vue 3 (`<script setup lang="ts">`) + Naive UI + Tailwind + CodeMirror 6 + Vitest + `marked` / `dompurify` / `highlight.js` / `@codemirror/lang-markdown`；Rust 侧复用 `base64` 与 `std::fs`。

**Spec:** `docs/superpowers/specs/2026-09-28-phase3-batch-c-design.md`

## Global Constraints

- 新增 npm 依赖**仅限 4 个**：`marked`、`dompurify`、`highlight.js`、`@codemirror/lang-markdown`（`highlight.js` 已作为 `naive-ui` 的传递依赖存在于 lockfile，本批次提升为直接依赖）。
- `src-tauri/` 只允许三处改动：新增 `commands/file.rs`、`commands/mod.rs` 加一行 `pub mod file;`、`lib.rs` 的 `generate_handler!` 加一行注册。**不得新增 Rust crate**。
- 预览 iframe 必须 `sandbox="allow-same-origin"` 且**不带 `allow-scripts`**；预览内容只经 `srcdoc` 注入，禁止 `v-html`。
- 组件 Props 契约固定：`defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()`。
- 快照：回填 `props.initialSnapshot?.x ?? <默认值>`；落库 `tabStore.updateTabSnapshot(props.tabId, {...})`；文本输入 250ms 防抖；只持久化输入与视图选项。
- 派生结果（渲染后的 HTML、图片 DataURL、压缩产物）不入快照；重开由 `onMounted` 用回填输入重算。
- 错误处理：非法输入用 `NAlert` 就地提示并保留上一次有效结果；空输入只显示空态。
- 依赖 DOM 的函数（`sanitizeHtml` / `highlightCode` / `resizeImage`）不做 node 环境单测，改由 Task 6 的浏览器验收覆盖；纯函数必须有单测。
- 每个任务结束都要 `npm test` 与 `npm run build` 通过，并单独提交一次 git。

---

### Task 1: 依赖安装、工具注册、共享工具与 Rust 保存命令

**Files:**
- Modify: `package.json` / `package-lock.json`（4 个依赖）
- Modify: `src/types/tool.ts`（新增 2 条注册项）
- Modify: `src/App.vue`（2 个 `defineAsyncComponent` + 2 个分支）
- Create: `src/utils/base64.ts`（字节 ↔ Base64，两个工具共用）
- Create: `src/utils/fileSave.ts`（封装 `save_binary_file` 调用）
- Create: `src-tauri/src/commands/file.rs`
- Modify: `src-tauri/src/commands/mod.rs`（加 `pub mod file;`）
- Modify: `src-tauri/src/lib.rs`（`generate_handler!` 注册）
- Create: `src/views/tools/Markdown/Markdown.vue`（占位）
- Create: `src/views/tools/ImageBase64/ImageBase64.vue`（占位）

**Interfaces:**
- Produces: 侧边栏 `markdown` 与 `image-base64` 能解析到真实组件（先占位，Task 3 / 6 替换）。

- [ ] **Step 1: 安装依赖**

Run: `npm install marked dompurify highlight.js @codemirror/lang-markdown`
Expected: 4 个包写入 `package.json` 的 `dependencies`，lockfile 更新（`highlight.js` 已在 lockfile 中，不会重新下载）。

- [ ] **Step 2: 探测 marked 的渲染 API 形态**

Run:
```bash
node --input-type=module -e "import { marked } from 'marked'; console.log(marked.parse('# hi').trim()); console.log(JSON.stringify(marked.parse('|a|b|\n|-|-|\n|1|2|').trim().slice(0, 40)))"
```
Expected: 输出 `<h1>hi</h1>` 与一段 `<table>` 开头的 HTML（确认 GFM 表格默认开启）。若 `marked` 的导出名或默认 GFM 行为与预期不符，以本步骤实测结果为准调整 Task 2 的 import。

- [ ] **Step 3: 在 `src/types/tool.ts` 的 `TOOLS` 数组末尾新增两条**

```ts
  {
    id: 'markdown',
    name: 'Markdown / HTML 预览',
    description: 'GFM 实时渲染、双向同步滚动、代码块高亮与 HTML 导出',
    category: 'format',
    icon: 'FileText',
    keywords: ['markdown', 'md', 'gfm', 'preview', 'html', 'render']
  },
  {
    id: 'image-base64',
    name: '图片与 Base64 / SVG',
    description: '图片 ↔ Base64/DataURL、剪贴板粘图、等比缩放重编码与 SVG 压缩',
    category: 'dev',
    icon: 'Image',
    keywords: ['image', 'base64', 'dataurl', 'svg', 'png', 'jpeg', 'compress']
  }
```

- [ ] **Step 4: 在 `src/App.vue` 的异步组件声明区追加（放在 `WebsocketTool` 之后）**

```ts
const MarkdownTool = defineAsyncComponent(() => import('@/views/tools/Markdown/Markdown.vue'))
const ImageBase64Tool = defineAsyncComponent(() => import('@/views/tools/ImageBase64/ImageBase64.vue'))
```

- [ ] **Step 5: 在 `resolveBaseComponent` 内、`return ToolPlaceholder` 之前追加分支**

```ts
  if (toolId === 'markdown') {
    return MarkdownTool
  }
  if (toolId === 'image-base64' || toolId === 'image_base64') {
    return ImageBase64Tool
  }
```

- [ ] **Step 6: 创建两个占位组件**

`src/views/tools/Markdown/Markdown.vue` 与 `src/views/tools/ImageBase64/ImageBase64.vue`，内容均为：

```vue
<script setup lang="ts">
defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()
</script>

<template>
  <div class="h-full flex items-center justify-center text-xs text-slate-400">待实现</div>
</template>
```

- [ ] **Step 7: 新增共享 base64 / fileSave 工具**

创建 `src/utils/base64.ts`：

```ts
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}
```

创建 `src/utils/fileSave.ts`：

```ts
import { saveBase64File } from '@/utils/fileSave'
import { bytesToBase64 } from './base64'

export function saveBase64File(path: string, base64: string): Promise<number> {
  return invoke<number>('save_binary_file', { path, base64 })
}

export function saveTextFile(path: string, text: string): Promise<number> {
  return saveBase64File(path, bytesToBase64(new TextEncoder().encode(text)))
}
```

- [ ] **Step 8: 实现并注册 Rust 保存命令**

创建 `src-tauri/src/commands/file.rs`：

```rust
use base64::Engine;

/// 把 base64 内容写到指定路径，返回写入字节数。
/// 目标目录不存在时自动创建；路径由用户输入，属「另存为」语义。
#[tauri::command]
pub fn save_binary_file(path: String, base64: String) -> Result<u64, String> {
    let trimmed = base64.trim();
    if trimmed.is_empty() {
        return Err("内容为空".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(trimmed)
        .map_err(|err| format!("Base64 解码失败：{err}"))?;

    let target = std::path::PathBuf::from(path.trim());
    if target.as_os_str().is_empty() {
        return Err("路径为空".into());
    }
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|err| format!("创建目录失败：{err}"))?;
        }
    }
    std::fs::write(&target, &bytes).map_err(|err| format!("写入失败：{err}"))?;
    Ok(bytes.len() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_decoded_bytes_and_creates_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/out.bin");
        let written = save_binary_file(path.to_string_lossy().into_owned(), "AQID".into()).unwrap();
        assert_eq!(written, 3);
        assert_eq!(std::fs::read(&path).unwrap(), vec![1, 2, 3]);
    }

    #[test]
    fn rejects_invalid_input() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bad.bin");
        assert!(save_binary_file(path.to_string_lossy().into_owned(), "!!!".into()).is_err());
        assert!(save_binary_file(path.to_string_lossy().into_owned(), "   ".into()).is_err());
        assert!(save_binary_file("   ".into(), "AQID".into()).is_err());
    }
}
```

在 `src-tauri/src/commands/mod.rs` 末尾加一行：

```rust
pub mod file;
```

在 `src-tauri/src/lib.rs` 的 `invoke_handler` 列表里、`commands::cron::predict_cron_runs,` 之后加一行：

```rust
            commands::file::save_binary_file,
```

- [ ] **Step 9: 跑 Rust 单测与 clippy**

Run: `cargo test --manifest-path src-tauri/Cargo.toml commands::file 2>&1 | tail -12`
Expected: `writes_decoded_bytes_and_creates_dirs` 与 `rejects_invalid_input` 两个用例 PASS。

Run: `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings 2>&1 | tail -5`
Expected: 无 warning。

- [ ] **Step 10: 验证构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，构建通过（占位 chunk 可能被合并，Task 3 / 6 后出现真实产物）。

- [ ] **Step 11: 提交**

```bash
git add package.json package-lock.json src/types/tool.ts src/App.vue src/utils/base64.ts src/utils/fileSave.ts src-tauri/src/commands/file.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src/views/tools/Markdown/Markdown.vue src/views/tools/ImageBase64/ImageBase64.vue
git commit -m "feat(phase3-c): 安装依赖、注册两个工具并新增 Rust 保存命令"
```

---

### Task 2: Markdown 纯函数（渲染 / srcdoc / 滚动比例）

**Files:**
- Create: `src/views/tools/Markdown/utils/renderMarkdown.ts`
- Create: `src/views/tools/Markdown/utils/preview.ts`
- Create: `src/views/tools/Markdown/utils/scrollSync.ts`
- Test: `src/views/tools/Markdown/__tests__/renderMarkdown.spec.ts`
- Test: `src/views/tools/Markdown/__tests__/scrollSync.spec.ts`

**Interfaces:**
- Produces:
  - `markdownToHtml(markdown: string): { html: string; error?: string }`（纯 marked，无 DOM）
  - `buildSrcdoc(bodyHtml: string, isDark: boolean): string`（纯字符串拼接）
  - `sanitizeHtml(html: string): string`（在 `utils/preview.ts`，依赖 DOMPurify 与 DOM）
  - `highlightCode(html: string): string`（在 `utils/preview.ts`，依赖 highlight.js 与 DOM）

> **为什么拆成两个文件**：`dompurify` 与 `highlight.js` 都需要 DOM。把它们放进 `renderMarkdown.ts` 会让「纯函数单测」在 node 环境下 import 到 DOM 依赖；拆开后 `renderMarkdown.ts` 只依赖 `marked`（node 下可用），单测能稳定跑，而依赖 DOM 的部分由 Task 6 的浏览器验收覆盖。
  - `scrollRatio(el: { scrollTop: number; scrollHeight: number; clientHeight: number }): number`
  - `targetScrollTop(el: { scrollHeight: number; clientHeight: number }, ratio: number): number`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/Markdown/__tests__/renderMarkdown.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { buildSrcdoc, markdownToHtml } from '../utils/renderMarkdown'

describe('markdownToHtml', () => {
  it('渲染 GFM 表格', () => {
    const { html } = markdownToHtml('| a | b |\n| - | - |\n| 1 | 2 |')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>a</th>')
    expect(html).toContain('<td>2</td>')
  })

  it('渲染任务列表与删除线', () => {
    const { html } = markdownToHtml('- [x] done\n- [ ] todo\n\n~~gone~~')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('<del>gone</del>')
  })

  it('代码块带上 language- 类名供高亮识别', () => {
    const { html } = markdownToHtml('```js\nconst a = 1\n```')
    expect(html).toContain('<pre>')
    expect(html).toContain('language-js')
  })

  it('空输入返回空字符串且不报错', () => {
    expect(markdownToHtml('')).toEqual({ html: '' })
  })
})

describe('buildSrcdoc', () => {
  it('包含 doctype、样式与正文', () => {
    const doc = buildSrcdoc('<p>hi</p>', false)
    expect(doc).toContain('<!doctype html>')
    expect(doc).toContain('<style>')
    expect(doc).toContain('<p>hi</p>')
    expect(doc).toContain('color-scheme: light')
  })

  it('深色模式切换 color-scheme', () => {
    expect(buildSrcdoc('<p>x</p>', true)).toContain('color-scheme: dark')
  })
})
```

创建 `src/views/tools/Markdown/__tests__/scrollSync.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { scrollRatio, targetScrollTop } from '../utils/scrollSync'

describe('scrollSync', () => {
  it('scrollRatio 在顶部为 0、底部为 1', () => {
    expect(scrollRatio({ scrollTop: 0, scrollHeight: 1000, clientHeight: 200 })).toBe(0)
    expect(scrollRatio({ scrollTop: 800, scrollHeight: 1000, clientHeight: 200 })).toBe(1)
  })

  it('scrollRatio 在中间为 0.5，且内容不足时返回 0', () => {
    expect(scrollRatio({ scrollTop: 400, scrollHeight: 1000, clientHeight: 200 })).toBe(0.5)
    expect(scrollRatio({ scrollTop: 10, scrollHeight: 100, clientHeight: 200 })).toBe(0)
  })

  it('scrollRatio 对越界值做钳制', () => {
    expect(scrollRatio({ scrollTop: -50, scrollHeight: 1000, clientHeight: 200 })).toBe(0)
    expect(scrollRatio({ scrollTop: 9999, scrollHeight: 1000, clientHeight: 200 })).toBe(1)
  })

  it('targetScrollTop 按比例换算并钳制', () => {
    expect(targetScrollTop({ scrollHeight: 1000, clientHeight: 200 }, 0.5)).toBe(400)
    expect(targetScrollTop({ scrollHeight: 1000, clientHeight: 200 }, 2)).toBe(800)
    expect(targetScrollTop({ scrollHeight: 100, clientHeight: 200 }, 0.5)).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/Markdown`
Expected: FAIL，报无法解析 `../utils/renderMarkdown` 等模块。

- [ ] **Step 3: 实现两个 utils 模块**

创建 `src/views/tools/Markdown/utils/renderMarkdown.ts`（**纯函数，只依赖 `marked`**，node 单测可直接 import）：

```ts
import { marked } from 'marked'

export function markdownToHtml(markdownText: string): { html: string; error?: string } {
  if (!markdownText.trim()) return { html: '' }
  try {
    return { html: marked.parse(markdownText, { gfm: true, breaks: false }) as string }
  } catch (err) {
    return { html: '', error: err instanceof Error ? err.message : 'Markdown 渲染失败' }
  }
}

export function buildSrcdoc(bodyHtml: string, isDark: boolean): string {
  const scheme = isDark ? 'dark' : 'light'
  const bg = isDark ? '#0f172a' : '#ffffff'
  const fg = isDark ? '#e2e8f0' : '#1e293b'
  const border = isDark ? '#1e293b' : '#e2e8f0'
  const codeBg = isDark ? '#090d16' : '#f8fafc'
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
:root { color-scheme: ${scheme}; }
body { margin: 0; padding: 16px; background: ${bg}; color: ${fg};
  font: 14px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; }
h1, h2, h3, h4 { line-height: 1.3; margin: 1.2em 0 0.6em; }
p, ul, ol, blockquote { margin: 0.6em 0; }
table { border-collapse: collapse; margin: 0.8em 0; }
th, td { border: 1px solid ${border}; padding: 4px 8px; }
blockquote { border-left: 3px solid ${border}; padding-left: 12px; color: #64748b; }
code { background: ${codeBg}; padding: 1px 4px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { background: ${codeBg}; padding: 12px; border-radius: 6px; overflow: auto; }
pre code { background: none; padding: 0; }
img { max-width: 100%; }
a { color: #6366f1; }
</style></head><body>${bodyHtml}</body></html>`
}
```

创建 `src/views/tools/Markdown/utils/preview.ts`（**依赖 DOM**，仅由视图与浏览器验收覆盖）：

```ts
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import yaml from 'highlight.js/lib/languages/yaml'

// 只注册常用语言，避免把整包（1MB+）打进产物
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('go', go)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('yaml', yaml)

const ALLOWED_TAGS = [
  'a', 'p', 'br', 'hr', 'em', 'strong', 'del', 'code', 'pre', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'input', 'span',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'
]

const ALLOWED_ATTR = ['href', 'title', 'alt', 'src', 'class', 'type', 'checked', 'disabled', 'start', 'colspan', 'rowspan', 'rel']

// 依赖 DOM：由 Task 6 的浏览器验收覆盖
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'style']
  })
}

// 依赖 DOM：给 <pre><code class="language-xx"> 加高亮类名
export function highlightCode(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('pre code').forEach(block => {
    const className = block.getAttribute('class') ?? ''
    const match = /language-([\w-]+)/.exec(className)
    const language = match?.[1]
    if (language && hljs.getLanguage(language)) {
      block.innerHTML = hljs.highlight(block.textContent ?? '', { language }).value
      block.classList.add('hljs')
    }
  })
  return doc.body.innerHTML
}

```

创建 `src/views/tools/Markdown/utils/scrollSync.ts`：

```ts
interface ScrollMetrics {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function scrollRatio(el: ScrollMetrics): number {
  const max = el.scrollHeight - el.clientHeight
  if (max <= 0) return 0
  return clamp01(el.scrollTop / max)
}

export function targetScrollTop(el: { scrollHeight: number; clientHeight: number }, ratio: number): number {
  const max = el.scrollHeight - el.clientHeight
  if (max <= 0) return 0
  return clamp01(ratio) * max
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/Markdown`
Expected: PASS（两个文件全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/Markdown/utils src/views/tools/Markdown/__tests__
git commit -m "feat(markdown): 新增 Markdown 渲染/沙箱文档/滚动同步纯函数及单测"
```

---

### Task 3: Markdown 视图

**Files:**
- Modify: `src/views/tools/Markdown/Markdown.vue`（替换占位实现）

**Interfaces:**
- Consumes: Task 2 的 `markdownToHtml` / `sanitizeHtml` / `highlightCode` / `buildSrcdoc` / `scrollRatio` / `targetScrollTop`
- Produces: 视图，快照字段 `{ markdown, syncScroll }`

- [ ] **Step 1: 写视图实现**

替换 `src/views/tools/Markdown/Markdown.vue` 全文为：

```vue
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NSwitch, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { Compartment, EditorState } from '@codemirror/state'
import { markdown as markdownLanguage } from '@codemirror/lang-markdown'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { saveTextFile } from '@/utils/fileSave'
import { buildSrcdoc, markdownToHtml } from './utils/renderMarkdown'
import { highlightCode, sanitizeHtml } from './utils/preview'
import { scrollRatio, targetScrollTop } from './utils/scrollSync'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

const SAMPLE = [
  '# DevUtils Markdown 预览',
  '',
  '支持 **GFM**：表格、任务列表、删除线、自动链接。',
  '',
  '| 能力 | 状态 |',
  '| --- | --- |',
  '| 表格 | ✅ |',
  '| 任务列表 | ✅ |',
  '',
  '- [x] 双向同步滚动',
  '- [ ] 导出 PDF',
  '',
  '```js',
  'const sum = (a, b) => a + b',
  '```'
].join('\n')

const markdown = ref<string>(props.initialSnapshot?.markdown ?? SAMPLE)
const syncScroll = ref<boolean>(props.initialSnapshot?.syncScroll ?? true)
const exportPath = ref<string>(props.initialSnapshot?.exportPath ?? '~/Downloads/devutils-preview.html')
const errorMessage = ref<string>('')
const previewHtml = ref<string>('')
const sanitizedFlag = ref<boolean>(false)
const editorEl = ref<HTMLDivElement | null>(null)
const iframeEl = ref<HTMLIFrameElement | null>(null)
let editorView: EditorView | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let renderTimer: ReturnType<typeof setTimeout> | null = null
let syncing = false

const themeCompartment = new Compartment()

const srcdoc = computed(() => buildSrcdoc(previewHtml.value, themeStore.isDark))

function getMarkdown(): string {
  return editorView ? editorView.state.doc.toString() : markdown.value
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, { markdown: getMarkdown(), syncScroll: syncScroll.value, exportPath: exportPath.value })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function render() {
  const { html, error } = markdownToHtml(getMarkdown())
  if (error) {
    errorMessage.value = error
    return
  }
  errorMessage.value = ''
  const clean = sanitizeHtml(html)
  sanitizedFlag.value = clean !== html
  previewHtml.value = highlightCode(clean)
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = setTimeout(render, 250)
}

function handleDocChange() {
  markdown.value = getMarkdown()
  scheduleSnapshot()
  scheduleRender()
}

function copyText(text: string, label: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success(label)
}

async function exportHtml() {
  const doc = buildSrcdoc(previewHtml.value, themeStore.isDark)
  const path = exportPath.value.trim()
  if (!path) {
    message.warning('请先填写导出路径')
    return
  }
  try {
    const bytes = await saveTextFile(path, doc)
    message.success(`已导出 ${bytes} 字节到 ${path}`)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}

// --- 双向同步滚动 ---
function syncToIframe() {
  if (!syncScroll.value || syncing || !editorView || !iframeEl.value) return
  const doc = iframeEl.value.contentDocument
  if (!doc) return
  const scroller = editorView.scrollDOM
  const ratio = scrollRatio({ scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight })
  syncing = true
  doc.documentElement.scrollTop = targetScrollTop(
    { scrollHeight: doc.documentElement.scrollHeight, clientHeight: doc.documentElement.clientHeight },
    ratio
  )
  requestAnimationFrame(() => {
    syncing = false
  })
}

function attachPreviewScroll() {
  const doc = iframeEl.value?.contentDocument
  if (!doc) return
  doc.addEventListener('scroll', () => {
    if (!syncScroll.value || syncing || !editorView) return
    const root = doc.documentElement
    const ratio = scrollRatio({ scrollTop: root.scrollTop, scrollHeight: root.scrollHeight, clientHeight: root.clientHeight })
    syncing = true
    editorView.scrollDOM.scrollTop = targetScrollTop(
      { scrollHeight: editorView.scrollDOM.scrollHeight, clientHeight: editorView.scrollDOM.clientHeight },
      ratio
    )
    requestAnimationFrame(() => {
      syncing = false
    })
  })
}

function getEditorTheme(isDark: boolean) {
  return EditorView.theme(
    {
      '&': { height: '100%', fontSize: '13px', backgroundColor: isDark ? '#090d16' : '#ffffff', color: isDark ? '#e2e8f0' : '#1e293b' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', lineHeight: '1.7' },
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
        doc: markdown.value,
        extensions: [
          basicSetup,
          markdownLanguage(),
          themeCompartment.of(getEditorTheme(themeStore.isDark)),
          EditorView.updateListener.of(update => {
            if (update.docChanged) handleDocChange()
          })
        ]
      }),
      parent: editorEl.value
    })
    editorView.scrollDOM.addEventListener('scroll', syncToIframe)
  }
  render()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  if (renderTimer) clearTimeout(renderTimer)
  saveSnapshot()
  editorView?.scrollDOM.removeEventListener('scroll', syncToIframe)
  editorView?.destroy()
  editorView = null
})

watch(syncScroll, saveSnapshot)
watch(exportPath, scheduleSnapshot)
watch(
  () => themeStore.isDark,
  dark => {
    if (editorView) editorView.dispatch({ effects: themeCompartment.reconfigure(getEditorTheme(dark)) })
  }
)
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">Markdown / HTML 预览</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">GFM 实时渲染、双向同步滚动、代码块高亮与 HTML 导出</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="syncScroll" size="small" />同步滚动</span>
        <NButton size="small" @click="copyText(getMarkdown(), '已复制 Markdown')">复制 Markdown</NButton>
        <NButton size="small" @click="copyText(srcdoc, '已复制 HTML')">复制 HTML</NButton>
        <NButton size="small" type="primary" @click="exportHtml">导出 .html</NButton>
        <NInput v-model:value="exportPath" size="small" class="w-56" placeholder="~/Downloads/devutils-preview.html" />
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">Markdown</div>
        <div ref="editorEl" class="flex-1 min-h-0 overflow-hidden"></div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">预览（沙箱 iframe）</span>
          <span class="text-[11px] text-slate-400">{{ markdown.length }} 字符<span v-if="sanitizedFlag"> · 已消毒</span></span>
        </div>
        <iframe
          ref="iframeEl"
          class="flex-1 min-h-0 w-full border-none bg-white"
          sandbox="allow-same-origin"
          :srcdoc="srcdoc"
          @load="attachPreviewScroll"
        ></iframe>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 类型检查与构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，产出 `dist/assets/Markdown-*.js`。

- [ ] **Step 3: 提交**

```bash
git add src/views/tools/Markdown/Markdown.vue
git commit -m "feat(markdown): 新增 Markdown 预览视图（沙箱 iframe + 同步滚动 + 导出）"
```

---

### Task 4: 图片侧纯函数（DataURL / SVG 压缩 / 缩放尺寸）

**Files:**
- Create: `src/views/tools/ImageBase64/utils/dataUrl.ts`
- Create: `src/views/tools/ImageBase64/utils/svgMinify.ts`
- Create: `src/views/tools/ImageBase64/utils/imageResize.ts`
- Test: `src/views/tools/ImageBase64/__tests__/dataUrl.spec.ts`
- Test: `src/views/tools/ImageBase64/__tests__/svgMinify.spec.ts`
- Test: `src/views/tools/ImageBase64/__tests__/imageResize.spec.ts`

**Interfaces:**
- Produces:
  - `parseDataUrl(input: string): { mime?: string; base64: string; error?: string }`
  - `toDataUrl(mime: string, base64: string): string`
  - `base64ToBytes(base64: string): Uint8Array`、`bytesToBase64(bytes: Uint8Array): string`
  - `minifySvg(svg: string): string`
  - `targetSize(width: number, height: number, scale: number): { width: number; height: number }`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/ImageBase64/__tests__/dataUrl.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, parseDataUrl, toDataUrl } from '../utils/dataUrl'

describe('dataUrl', () => {
  it('解析标准 DataURL', () => {
    const result = parseDataUrl('data:image/png;base64,AQID')
    expect(result.error).toBeUndefined()
    expect(result.mime).toBe('image/png')
    expect(result.base64).toBe('AQID')
  })

  it('接受无前缀的纯 Base64 与 URL-safe 变体', () => {
    expect(parseDataUrl('AQID').base64).toBe('AQID')
    expect(parseDataUrl('_-A=').base64).toBe('+/A=')
  })

  it('非法字符与空串返回 error', () => {
    expect(parseDataUrl('').error).toBeTruthy()
    expect(parseDataUrl('!!!').error).toBeTruthy()
    expect(parseDataUrl('data:image/png;base64,').error).toBeTruthy()
  })

  it('toDataUrl 拼装前缀', () => {
    expect(toDataUrl('image/jpeg', 'AQID')).toBe('data:image/jpeg;base64,AQID')
  })

  it('字节与 Base64 往返一致（含边界字节）', () => {
    const bytes = new Uint8Array([0, 255, 1, 254, 128])
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual([0, 255, 1, 254, 128])
  })
})
```

创建 `src/views/tools/ImageBase64/__tests__/svgMinify.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { minifySvg } from '../utils/svgMinify'

describe('minifySvg', () => {
  it('去掉 XML 声明与注释', () => {
    const input = '<?xml version="1.0"?>\n<!-- 注释 -->\n<svg><rect/></svg>'
    const output = minifySvg(input)
    expect(output).not.toContain('<?xml')
    expect(output).not.toContain('注释')
    expect(output).toContain('<svg>')
  })

  it('保留 <!--! 显式保留注释', () => {
    expect(minifySvg('<svg><!--! keep --></svg>')).toContain('<!--! keep -->')
  })

  it('折叠标签之间的空白', () => {
    expect(minifySvg('<svg>\n  <rect />\n  <circle />\n</svg>')).toBe('<svg><rect /><circle /></svg>')
  })

  it('不改动 text / tspan / style 内部内容', () => {
    const input = '<svg><text>  a   b  </text><style>.a { fill: red }</style></svg>'
    expect(minifySvg(input)).toBe(input)
  })

  it('折叠属性之间的多余空白', () => {
    expect(minifySvg('<svg   width="10"    height="10" />')).toBe('<svg width="10" height="10" />')
  })

  it('空输入返回空串', () => {
    expect(minifySvg('')).toBe('')
  })
})
```

创建 `src/views/tools/ImageBase64/__tests__/imageResize.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { targetSize } from '../utils/imageResize'

describe('targetSize', () => {
  it('按比例等比缩放并取整', () => {
    expect(targetSize(1000, 500, 0.5)).toEqual({ width: 500, height: 250 })
    expect(targetSize(101, 51, 0.5)).toEqual({ width: 51, height: 26 })
  })

  it('scale 为 1 时不变', () => {
    expect(targetSize(800, 600, 1)).toEqual({ width: 800, height: 600 })
  })

  it('极端长宽比不会产生 0', () => {
    expect(targetSize(10000, 3, 0.01)).toEqual({ width: 100, height: 1 })
  })

  it('非法输入被规整', () => {
    expect(targetSize(0, 0, 0.5)).toEqual({ width: 1, height: 1 })
    expect(targetSize(100, 100, 2)).toEqual({ width: 200, height: 200 })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/ImageBase64`
Expected: FAIL，报无法解析 `../utils/dataUrl` 等模块。

- [ ] **Step 3: 实现三个 utils 模块**

创建 `src/views/tools/ImageBase64/utils/dataUrl.ts`：

```ts
import { base64ToBytes, bytesToBase64 } from '@/utils/base64'

export { base64ToBytes, bytesToBase64 }

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/

export function toDataUrl(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`
}

export function parseDataUrl(input: string): { mime?: string; base64: string; error?: string } {
  const text = input.trim()
  if (!text) return { base64: '', error: '请输入 DataURL 或 Base64' }
  let mime: string | undefined
  let payload = text
  if (text.startsWith('data:')) {
    const comma = text.indexOf(',')
    if (comma < 0) return { base64: '', error: 'DataURL 缺少逗号分隔符' }
    const meta = text.slice(5, comma)
    if (!meta.includes('base64')) return { base64: '', error: '仅支持 base64 编码的 DataURL' }
    mime = meta.split(';')[0] || undefined
    payload = text.slice(comma + 1)
  }
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  if (!payload || !BASE64_RE.test(padded)) return { base64: '', error: 'Base64 内容非法' }
  try {
    base64ToBytes(padded)
  } catch {
    return { base64: '', error: 'Base64 解码失败' }
  }
  return { mime, base64: padded }
}
```

创建 `src/views/tools/ImageBase64/utils/svgMinify.ts`：

```ts
const PRESERVE_CONTENT_TAGS = ['text', 'tspan', 'style', 'pre', 'title', 'desc']

// 保守压缩：只做「去声明 / 去注释 / 折叠结构空白」，不改语义
export function minifySvg(svg: string): string {
  if (!svg.trim()) return ''
  const preserved: string[] = []
  let working = svg.replace(/<\?xml[\s\S]*?\?>/g, '')
  working = working.replace(/<!--(?!\!)[\s\S]*?-->/g, '')
  for (const tag of PRESERVE_CONTENT_TAGS) {
    const re = new RegExp(`(<${tag}\\b[^>]*>)([\\s\\S]*?)(</${tag}>)`, 'gi')
    working = working.replace(re, (_match, open: string, content: string, close: string) => {
      const token = `@@PRESERVE_${preserved.length}@@`
      preserved.push(`${open}${content}${close}`)
      return token
    })
  }
  working = working
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\/>/g, ' />')
    .trim()
  return working.replace(/@@PRESERVE_(\d+)@@/g, (_match, index: string) => preserved[Number(index)] ?? '')
}
```

创建 `src/views/tools/ImageBase64/utils/imageResize.ts`：

```ts
export function targetSize(width: number, height: number, scale: number): { width: number; height: number } {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1
  return {
    width: Math.max(1, Math.round(safeWidth * safeScale)),
    height: Math.max(1, Math.round(safeHeight * safeScale))
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/ImageBase64`
Expected: PASS（三个文件全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/ImageBase64/utils src/views/tools/ImageBase64/__tests__
git commit -m "feat(image-base64): 新增 DataURL/SVG 压缩/缩放尺寸纯函数及单测"
```

---

### Task 5: 图片与 Base64 视图

**Files:**
- Modify: `src/views/tools/ImageBase64/ImageBase64.vue`（替换占位实现）

**Interfaces:**
- Consumes: Task 4 的 `parseDataUrl` / `toDataUrl` / `base64ToBytes` / `bytesToBase64` / `minifySvg` / `targetSize`；Task 1 的 `saveBase64File`
- Produces: 视图，快照字段 `{ mode, base64Input, svgInput, scale, quality, savePath }`

- [ ] **Step 1: 写视图实现**

替换 `src/views/tools/ImageBase64/ImageBase64.vue` 全文为：

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NInputNumber, NRadioButton, NRadioGroup, NSlider, useMessage } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { useTabStore } from '@/stores/tabStore'
import { base64ToBytes, bytesToBase64, parseDataUrl, toDataUrl } from './utils/dataUrl'
import { targetSize } from './utils/imageResize'
import { minifySvg } from './utils/svgMinify'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

type Mode = 'toBase64' | 'toImage' | 'svg'

const mode = ref<Mode>(props.initialSnapshot?.mode ?? 'toBase64')
const base64Input = ref<string>(props.initialSnapshot?.base64Input ?? '')
const svgInput = ref<string>(props.initialSnapshot?.svgInput ?? '')
const scale = ref<number>(props.initialSnapshot?.scale ?? 100)
const quality = ref<number>(props.initialSnapshot?.quality ?? 0.8)
const savePath = ref<string>(props.initialSnapshot?.savePath ?? '')
const errorMessage = ref<string>('')
const dataUrl = ref<string>('')
const rawBase64 = ref<string>('')
const sourceBytes = ref<number>(0)
const outputBytes = ref<number>(0)
const compressedUrl = ref<string>('')
const svgOutput = ref<string>('')
const imageEl = ref<HTMLImageElement | null>(null)
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const previewSrc = computed(() => dataUrl.value || compressedUrl.value)
const mime = computed(() => parseDataUrl(dataUrl.value).mime ?? 'image/png')

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    mode: mode.value,
    base64Input: base64Input.value,
    svgInput: svgInput.value,
    scale: scale.value,
    quality: quality.value,
    savePath: savePath.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function applyDataUrl(next: string, bytes: number) {
  dataUrl.value = next
  const parsed = parseDataUrl(next)
  rawBase64.value = parsed.base64
  sourceBytes.value = bytes
  errorMessage.value = parsed.error ?? ''
  compressedUrl.value = ''
}

function readFile(file: File) {
  const reader = new FileReader()
  reader.onload = () => applyDataUrl(String(reader.result), file.size)
  reader.onerror = () => {
    errorMessage.value = '读取文件失败'
  }
  reader.readAsDataURL(file)
}

function onPaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        event.preventDefault()
        readFile(file)
        return
      }
    }
  }
}

function onPickFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) readFile(file)
  target.value = ''
}

function decodeBase64Input() {
  const parsed = parseDataUrl(base64Input.value)
  if (parsed.error) {
    errorMessage.value = parsed.error
    return
  }
  errorMessage.value = ''
  dataUrl.value = parsed.mime ? toDataUrl(parsed.mime, parsed.base64) : toDataUrl('image/png', parsed.base64)
  rawBase64.value = parsed.base64
  sourceBytes.value = base64ToBytes(parsed.base64).length
  compressedUrl.value = ''
}

async function compress() {
  if (!previewSrc.value || !imageEl.value) {
    errorMessage.value = '请先载入图片'
    return
  }
  const image = imageEl.value
  const { width, height } = targetSize(image.naturalWidth, image.naturalHeight, scale.value / 100)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    errorMessage.value = '当前环境不支持 Canvas'
    return
  }
  ctx.drawImage(image, 0, 0, width, height)
  const type = mime.value === 'image/jpeg' || mime.value === 'image/webp' ? mime.value : 'image/png'
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality.value))
  if (!blob) {
    errorMessage.value = '压缩失败'
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    compressedUrl.value = String(reader.result)
    outputBytes.value = blob.size
  }
  reader.readAsDataURL(blob)
}

function runSvgMinify() {
  svgOutput.value = minifySvg(svgInput.value)
  sourceBytes.value = new TextEncoder().encode(svgInput.value).length
  outputBytes.value = new TextEncoder().encode(svgOutput.value).length
}

async function saveToFile() {
  const payload = mode.value === 'svg' ? svgOutput.value : rawBase64.value
  if (!payload) {
    errorMessage.value = '没有可保存的内容'
    return
  }
  const path = savePath.value.trim()
  if (!path) {
    errorMessage.value = '请填写保存路径'
    return
  }
  try {
    const bytes =
      mode.value === 'svg'
        ? await saveBase64File(path, bytesToBase64(new TextEncoder().encode(svgOutput.value)))
        : await saveBase64File(path, rawBase64.value)
    errorMessage.value = ''
    message.success(`已保存 ${bytes} 字节到 ${path}`)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}

function copyText(text: string, label: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success(label)
}

watch([mode, base64Input, svgInput, scale, quality, savePath], scheduleSnapshot)

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 shrink-0 space-y-2">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-sm font-bold tracking-tight">图片与 Base64 / SVG</h1>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">粘贴剪贴板图片或选择文件，转换、缩放重编码、SVG 压缩与另存</p>
        </div>
        <NRadioGroup v-model:value="mode" size="small">
          <NRadioButton value="toBase64">图片 → Base64</NRadioButton>
          <NRadioButton value="toImage">Base64 → 图片</NRadioButton>
          <NRadioButton value="svg">SVG 压缩</NRadioButton>
        </NRadioGroup>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-500 dark:text-slate-400 shrink-0">保存路径</span>
        <NInput v-model:value="savePath" size="small" class="flex-1" placeholder="~/Downloads/devutils-image.png" />
        <NButton size="small" type="primary" @click="saveToFile">保存到文件</NButton>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 gap-3">
        <template v-if="mode === 'toBase64'">
          <div
            class="flex-1 min-h-0 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-2 text-xs text-slate-500"
            tabindex="0"
            @paste="onPaste"
          >
            <span>点这里后按 Ctrl/Cmd+V 粘贴剪贴板图片</span>
            <label class="text-indigo-600 dark:text-indigo-400 cursor-pointer">
              <input type="file" accept="image/*" class="hidden" @change="onPickFile" />
              或选择本地图片…
            </label>
          </div>
        </template>

        <template v-else-if="mode === 'toImage'">
          <div class="flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
            <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span class="text-xs font-medium">Base64 / DataURL</span>
              <NButton size="tiny" @click="decodeBase64Input">解码</NButton>
            </div>
            <textarea v-model="base64Input" class="flex-1 min-h-0 w-full resize-none bg-transparent p-3 text-xs font-mono outline-none" placeholder="data:image/png;base64,..."></textarea>
          </div>
        </template>

        <template v-else>
          <div class="flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
            <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span class="text-xs font-medium">SVG 源码</span>
              <NButton size="tiny" @click="runSvgMinify">压缩</NButton>
            </div>
            <textarea v-model="svgInput" class="flex-1 min-h-0 w-full resize-none bg-transparent p-3 text-xs font-mono outline-none" placeholder="<svg>…</svg>"></textarea>
          </div>
        </template>

        <div class="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shrink-0 space-y-2">
          <div class="flex items-center gap-3 text-xs">
            <span class="shrink-0">缩放 {{ scale }}%</span>
            <NSlider v-model:value="scale" :min="10" :max="100" class="flex-1" />
            <span class="shrink-0">质量 {{ quality.toFixed(2) }}</span>
            <NInputNumber v-model:value="quality" size="tiny" class="w-20" :min="0.1" :max="1" :step="0.05" />
            <NButton size="tiny" @click="compress">压缩</NButton>
          </div>
          <div class="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>原始 {{ sourceBytes }} B</span>
            <span v-if="outputBytes">→ 输出 {{ outputBytes }} B</span>
          </div>
        </div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">预览与输出</span>
          <div class="flex items-center gap-2">
            <NButton v-if="mode === 'toBase64' && dataUrl" size="tiny" @click="copyText(dataUrl, '已复制 DataURL')">复制 DataURL</NButton>
            <NButton v-if="mode === 'toBase64' && rawBase64" size="tiny" @click="copyText(rawBase64, '已复制 Base64')">复制 Base64</NButton>
            <NButton v-if="mode === 'svg' && svgOutput" size="tiny" @click="copyText(svgOutput, '已复制压缩结果')">复制 SVG</NButton>
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-3 space-y-3">
          <img v-if="previewSrc" ref="imageEl" :src="previewSrc" class="max-w-full max-h-72 object-contain mx-auto" alt="preview" />
          <p v-else class="text-xs text-slate-400">暂无图片</p>
          <pre v-if="mode === 'toBase64' && rawBase64" class="text-[11px] font-mono break-all whitespace-pre-wrap max-h-40 overflow-auto">{{ rawBase64 }}</pre>
          <pre v-if="mode === 'svg' && svgOutput" class="text-[11px] font-mono break-all whitespace-pre-wrap max-h-60 overflow-auto">{{ svgOutput }}</pre>
        </div>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 类型检查与构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，产出 `dist/assets/ImageBase64-*.js`。

- [ ] **Step 3: 提交**

```bash
git add src/views/tools/ImageBase64/ImageBase64.vue
git commit -m "feat(image-base64): 新增图片与 Base64/SVG 视图"
```

---

### Task 6: 全量回归与验收

**Files:** 无新增（只跑验证；若发现回归，修正对应任务的文件后重跑）

- [ ] **Step 1: 前端全量测试与构建**

Run: `npm test`
Expected: 既有用例 + 批次 C 新增的 5 组用例全部 PASS。

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，`dist/assets/` 下能看到 `Markdown-*.js` 与 `ImageBase64-*.js`。

- [ ] **Step 2: Rust 回归**

Run: `cargo clippy --all-targets -- -D warnings`（工作目录 `src-tauri`）
Expected: 无 warning。

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部通过（含 Task 1 新增的 2 个 `commands::file` 用例）；`test_http` 需在沙箱外重跑确认 6 个用例全绿。

- [ ] **Step 3: 约束核对**

Run: `git diff --stat <批次起始提交>..HEAD -- package.json`
Expected: 只有 4 个依赖新增。

Run: `git diff <批次起始提交>..HEAD -- src-tauri/`
Expected: 只有 `commands/file.rs`（新增）、`commands/mod.rs`（一行）、`lib.rs`（一行）。

- [ ] **Step 4: 浏览器验收（本地静态服务 + 无头 Chrome + 真实 CSP）**

复用批次 B 的验收套路：用 `npm run build` 的产物 + 带真实 CSP 头的静态服务 + 无头浏览器驱动。必须断言：

1. Markdown 工具打开后预览 iframe 内渲染出 `<table>` 与 `<h1>`（GFM 生效）。
2. 代码块高亮生效：iframe 内 `pre code` 含 `hljs` 类名。
3. **安全**：把 `<script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">` 粘进编辑器后，iframe 内 `document.scripts.length === 0`，且父窗口 `window.__pwned` 仍为 `undefined`。
4. 同步滚动：把编辑器滚到底部，iframe 的 `documentElement.scrollTop` 大于 0（比例联动生效）。
5. 图片工具：把一段 1×1 PNG 的 DataURL 贴进「Base64 → 图片」，预览 `img` 的 `naturalWidth === 1`。
6. SVG 压缩：贴一段带注释与换行的 SVG，点压缩后输出不含注释且长度变小。
7. 关闭 Tab 再打开，Markdown 文本与视图选项还原。

- [ ] **Step 5: 保存命令的真机验证**

Run: 起 Tauri 应用（`npm run tauri dev`），在图片工具里把保存路径填成 `/tmp/devutils-save-test.png`，点「保存到文件」，然后：

Run: `ls -l /tmp/devutils-save-test.png && file /tmp/devutils-save-test.png`
Expected: 文件存在、大小与预览的字节数一致、`file` 识别为 PNG image data。

- [ ] **Step 6: 确认提交历史与工作区状态**

Run: `git log --oneline -10`
Expected: 看到本计划各任务的提交记录。

Run: `git status --short`
Expected: 无未提交改动。

- [ ] **Step 7: 向用户汇报**

汇报内容：两个工具的实现范围、4 个新增依赖与理由、Rust 零新增 crate 的证据、沙箱与消毒的实测结论（含 `document.scripts.length === 0` 的断言结果）、以及保存命令的真机落盘证据。

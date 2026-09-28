# 第三阶段批次 C 设计规范：Markdown 预览与图片 / Base64 / SVG

**文档版本**：v1.0
**更新日期**：2026-09-28
**适用范围**：DevUtils 第三阶段（P1 实用工具扩展）之批次 C
**分支**：`master`
**前置文档**：`docs/superpowers/specs/2026-09-22-developer-toolbox-design.md`（总设计 §4.2 渲染沙箱、§5.2 `p3_4`/`p3_5`）、`docs/superpowers/specs/2026-09-28-phase3-batch-b-design.md`（批次 B，工程约定与 CSP 结论）

---

## 1. 背景与批次拆分

| 批次 | 内容 | 依赖特征 |
| --- | --- | --- |
| A（已完成） | `regex`、`mock-data`、`color-converter`、`tabular-convert` | 零新增依赖 |
| B（已完成） | `jwt`、`websocket` | 零新增 npm 依赖；仅改 CSP 一行 |
| **C（本文档）** | `markdown`（Markdown / HTML 预览）、`image-base64`（图片与 Base64 / SVG） | **引入 4 个 npm 依赖** + **新增 1 个 Rust 命令** |
| D | X.509 证书解析、二维码生成与解码 | 需成熟第三方库 |

两个工具**尚未注册**，本批次需在 `src/types/tool.ts` 新增两条（`markdown`、`image-base64`）。

**本批次是本项目第一次真正引入第三方 npm 依赖**。此前三条「尽量零依赖」的路都走通了（RS256 纯 JS、CSV 状态机、SQL 压缩器），但 Markdown 解析属于「自己写一定更差」的领域：CommonMark + GFM 的边界情况极多，手写解析器是明确的反模式。因此本批次主张引库，并给出**最小集合**：

| 依赖 | 用途 | 为什么必须有 | 体积/风险 |
| --- | --- | --- | --- |
| `marked` | Markdown → HTML（GFM 表格、任务列表、删除线、自动链接） | 手写解析器不可接受 | 纯 ESM、无 eval、无原生模块 |
| `dompurify` | 对 marked 产物做 HTML 消毒 | 纵深防御：预览内容来自用户粘贴的不可信 Markdown | 纯 JS、无 eval |
| `highlight.js` | 预览里代码块的高亮 | 总设计要求「语法高亮」 | **已在 lockfile 里**（`naive-ui` 的传递依赖 11.12.0），本批次只是把它提升为直接依赖，不引入新下载 |
| `@codemirror/lang-markdown` | 编辑器里的 Markdown 语法高亮 | 与既有 CodeMirror 栈一致（`JsonSuite` 已用 `@codemirror/lang-json`） | 小、同族包 |

**Rust 侧零新增 crate**：图片/HTML 落地保存用 `std::fs` + 已有的 `base64` crate（`commands/http.rs` 已在用 `base64::Engine`），新增一个 `commands/file.rs` 命令即可。

**本批次不做的事（明确排除）**：

- 不做 Markdown 导出 PDF、不做数学公式（KaTeX）与 Mermaid 图表。
- 不做原生文件选择器（`tauri-plugin-dialog`）：保存路径由用户输入/粘贴，默认值给到 `~/Downloads/`。原生选择器作为后续增强项记录在 §6。
- 不做图片的 EXIF 保留与格式互转全家桶：只做 PNG/JPEG/WebP 的 canvas 重编码 + 等比缩放。
- 不做 SVG 的语义级优化（如路径合并、属性重写）：只做保守的「去注释 / 折叠空白 / 去 XML 声明」压缩。

---

## 2. 通用工程约定

沿用批次 A / B 的契约，逐条一致：

- 目录：`src/views/tools/<ToolName>/<ToolName>.vue` + `utils/*.ts` + `__tests__/*.spec.ts`；视图只做状态绑定。
- Props：`defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()`。
- 快照：`props.initialSnapshot?.x ?? <默认值>` 回填；`tabStore.updateTabSnapshot(props.tabId, {...})` 落库；文本输入 250ms 防抖；只持久化输入与视图选项。
- 派生结果（渲染后的 HTML、图片 Base64、压缩产物）**不入快照**；重开由 `onMounted` 用回填输入重算。
- 错误处理：非法输入用 `NAlert` 就地提示并保留上一次有效结果；空输入只显示空态。
- 每个任务结束都要 `npm test` 与 `npm run build` 通过，并单独提交一次 git。

### 2.1 渲染沙箱（安全关键）

总设计 §4.2 要求「Markdown HTML 预览运行在 `<iframe sandbox="allow-same-origin" srcdoc="...">` 隔离沙箱中，禁用 `allow-scripts`」。本批次严格遵守，并说明与既有 Postman 预览的差异：

- Postman 的 `HtmlPreviewIframe.vue` 用的是 **`sandbox=""`**（最严，连 same-origin 都不给）——它不需要与 iframe 交互，够用且更好。
- Markdown 预览需要**双向同步滚动**，父页面必须能读写 `iframe.contentDocument.documentElement.scrollTop`，所以必须给 `allow-same-origin`。**仍然不给 `allow-scripts`**：没有脚本执行权，注入的 HTML 就无法调用 Tauri IPC、也无法读取父页面数据。
- 除此之外再做一层 `DOMPurify` 消毒（纵深防御）：即使将来 iframe 属性被改错，消毒也能兜住。
- 预览内容一律通过 `srcdoc` 注入，不使用 `v-html`，也不把用户内容拼进父页面 DOM。

---

## 3. `markdown`：Markdown / HTML 预览

### 3.1 目标

左侧写 Markdown（GFM），右侧实时渲染预览；两侧滚动位置双向同步；可复制 HTML、导出 `.html` 文件。

### 3.2 布局与交互

- 顶部：标题 + 「同步滚动」开关 + 「复制 HTML」+「导出 .html」+「复制 Markdown」+ 手动「渲染」按钮（仅在手动模式显示）。
- 左栏：CodeMirror 编辑器（`@codemirror/lang-markdown`，主题跟随 `themeStore.isDark`）。
- 右栏：预览 iframe（`sandbox="allow-same-origin"`、`srcdoc`）。
- 底部状态条：Markdown 字数 / 渲染耗时 / 是否触发消毒。

### 3.3 渲染管线（定稿）

1. `marked.parse(markdown, { gfm: true, breaks: false })` → HTML 字符串。
2. `DOMPurify.sanitize(html, { ... })` 消毒：
   - 允许 GFM 需要的标签（`table`/`thead`/`tbody`/`tr`/`th`/`td`/`del`/`input[type=checkbox]` 等）与 `class`（highlight.js 的高亮类名要靠它）。
   - **禁止** `script`、`style`、`iframe`、`object`、`embed`、`form` 与所有 `on*` 事件属性；`a` 标签强制加 `rel="noopener noreferrer"` 并保留 `target` 由 CSS 决定（默认不开新窗口）。
3. 用 `marked-highlight` 风格的自定义 renderer 把代码块交给 `highlight.js`：**只注册常用语言**（js/ts/json/html/css/bash/sql/python/go/rust/java/yaml/markdown），避免整包 1MB+。
4. 拼装 `srcdoc`：注入一段固定的基础样式（字体、表格边框、代码块底色，深浅色各一套），样式以 `<style>` 内联在 `srcdoc` 里——因为 iframe 是 `allow-same-origin` 但不执行脚本，外部样式表加载会被 CSP 的 `default-src 'self'` 允许，但内联样式更稳且与主题联动更简单。
5. 渲染失败（marked 抛错）时保留上一次成功结果并就地提示。

### 3.4 双向同步滚动（定稿）

- 方向 A（编辑器 → 预览）：CodeMirror 的 `scrollDOM` 滚动时，按 `scrollTop / (scrollHeight - clientHeight)` 比例设置 `iframe.contentDocument.documentElement.scrollTop`。
- 方向 B（预览 → 编辑器）：iframe 的 `contentDocument` 上挂 `scroll` 监听，按同样比例反向设置。
- **防抖与回环保护**：每次同步写入前设 `syncing = true`，写入后 `requestAnimationFrame` 清除；收到滚动事件时若 `syncing` 为真则忽略，避免两边互相抖动。
- 关闭「同步滚动」开关后双向都停止。
- iframe `load` 事件后才挂监听；`srcdoc` 更新会重建文档，需在每次 load 后重新挂。

### 3.5 文件与接口

```
src/views/tools/Markdown/
  Markdown.vue
  utils/renderMarkdown.ts   # renderMarkdown / buildSrcdoc
  utils/scrollSync.ts       # scrollRatio / applyRatio
  __tests__/renderMarkdown.spec.ts
  __tests__/scrollSync.spec.ts
```

```ts
renderMarkdown(markdown: string): { html: string; sanitized: boolean; error?: string }
buildSrcdoc(bodyHtml: string, isDark: boolean): string
scrollRatio(el: { scrollTop: number; scrollHeight: number; clientHeight: number }): number
applyRatio(el: { scrollTop: number; scrollHeight: number; clientHeight: number }, ratio: number): void
```

### 3.6 快照字段

```ts
{ markdown: string; syncScroll: boolean }
```

### 3.7 测试要点

- `renderMarkdown`：GFM 表格 / 任务列表 / 删除线 / 自动链接各一条精确断言。
- 安全：`<script>alert(1)</script>`、`<img src=x onerror=alert(1)>`、`<a href="javascript:alert(1)">` 三种输入必须被消掉（断言输出里不含 `script`、`onerror`、`javascript:`）。
- 代码块：` ```js ` 渲染出带 `hljs` 类名的 `<code>`。
- `buildSrcdoc`：包含 `<!doctype html>`、深浅色样式二选一、body 内容原样嵌入。
- `scrollSync`：`scrollRatio` 在 0 / 中间 / 底部三点的取值；`applyRatio` 写入正确的 `scrollTop`。

---

## 4. `image-base64`：图片与 Base64 / SVG

### 4.1 目标

图片与 Base64 / DataURL 互转、剪贴板粘图、图片等比缩放重编码、SVG 压缩，以及把结果保存到本地文件。

### 4.2 布局与交互

- 顶部：模式切换（图片 → Base64 / Base64 → 图片 / SVG 压缩）+ 保存路径输入（默认 `~/Downloads/devutils-<时间戳>.<ext>`）+「保存到文件」按钮。
- 图片 → Base64：粘贴区（支持 Ctrl/Cmd+V 粘贴剪贴板图片、也支持 `<input type="file">`）+ 预览 + 输出格式（DataURL / 纯 Base64）+ 复制按钮 + 字节数展示。
- Base64 → 图片：文本域输入（接受带或不带 `data:image/...;base64,` 前缀）+ 预览 + 保存。
- 图片压缩：缩放比例（10%–100%）+ JPEG 质量（0.1–1.0，仅 JPEG/WebP 显示）+ 「压缩」按钮 + 前后字节数对比。
- SVG 压缩：输入框 + 「压缩」按钮 + 压缩前后字节数 + 复制。

### 4.3 数据模型（定稿）

- **DataURL 解析**：`parseDataUrl(input)` → `{ mime, base64, bytes }`；不带前缀的纯 Base64 按「无 mime」处理，预览时按 PNG 兜底。
- **Base64 校验**：只接受 `A-Za-z0-9+/=` 与 URL-safe 变体（`-_`），并做长度与 `atob` 双重校验，非法直接报错。
- **剪贴板粘图**：监听 `paste` 事件，从 `clipboardData.items` 里找 `type.startsWith('image/')` 的项 → `getAsFile()` → `FileReader.readAsDataURL`。
- **图片压缩**：`createImageBitmap(blob)` → `OffscreenCanvas`（不可用时回退 `<canvas>`）→ `ctx.drawImage` 缩放 → `canvas.convertToBlob({ type, quality })` → 转回 DataURL；输出格式默认保持原格式（PNG 无质量参数）。
- **SVG 压缩**：自写保守压缩器（`utils/svgMinify.ts`）：
  - 去掉 XML 声明（`<?xml ... ?>`）与注释（`<!-- ... -->`，但**保留** `<!--! ... -->` 这种显式保留注释）；
  - 折叠标签之间的空白与换行；保留 `<text>` / `<tspan>` / `<style>` / `<pre>` 内部内容原样（避免改坏可见文本）；
  - 折叠属性之间的多余空白；
  - 不做任何语义重写（不删属性、不合并路径）。

### 4.4 保存到本地（新增 Rust 命令）

- 新文件 `src-tauri/src/commands/file.rs`：

  ```rust
  #[tauri::command]
  pub fn save_binary_file(path: String, base64: String) -> Result<u64, String>
  ```

  - 用 `base64::engine::general_purpose::STANDARD.decode` 解码（与 `commands/http.rs` 同一套 API）；
  - 目标目录不存在时 `std::fs::create_dir_all`；
  - 写入成功返回字节数；失败返回错误字符串（前端用 `NAlert` 展示）。
  - **零新增 crate**：`base64` 与 `std::fs` 都已在用。
- 在 `src-tauri/src/lib.rs` 的 `generate_handler!` 里注册该命令，并在 `commands/mod.rs` 加 `pub mod file;`。
- 前端调用：`invoke('save_binary_file', { path, base64 })`。
- 安全说明：命令按用户输入的路径写文件，这是「另存为」类功能的固有语义；不做路径白名单（用户本机自用工具），但错误信息要如实回显。

### 4.5 文件与接口

```
src/views/tools/ImageBase64/
  ImageBase64.vue
  utils/dataUrl.ts      # parseDataUrl / toDataUrl / base64ToBytes / bytesToBase64
  utils/imageResize.ts  # resizeImage(blob, scale, mime, quality) -> Promise<Blob>
  utils/svgMinify.ts    # minifySvg(svg: string): string
  __tests__/dataUrl.spec.ts
  __tests__/svgMinify.spec.ts
  __tests__/imageResize.spec.ts（只测纯函数部分：目标尺寸计算）
```

```ts
parseDataUrl(input: string): { mime?: string; base64: string; error?: string }
toDataUrl(mime: string, base64: string): string
base64ToBytes(base64: string): Uint8Array
bytesToBase64(bytes: Uint8Array): string
targetSize(width: number, height: number, scale: number): { width: number; height: number }
minifySvg(svg: string): string
```

### 4.6 快照字段

```ts
{ mode: 'toBase64' | 'toImage' | 'svg'; dataUrl: string; base64Input: string; svgInput: string; scale: number; quality: number; savePath: string }
```

（不持久化大体积的图片 Base64 结果：粘贴产生的 DataURL 只放在内存里，切走即丢；用户要留存就点保存。）

### 4.7 测试要点

- `parseDataUrl`：标准 DataURL、无前缀纯 Base64、URL-safe 变体、非法字符、空串。
- `toDataUrl` / `base64ToBytes` / `bytesToBase64` 往返一致（含 `0x00`/`0xFF` 边界字节）。
- `targetSize`：等比缩放取整、最小 1px、scale=1 不变、极端长宽比不产生 0。
- `minifySvg`：去 XML 声明、去注释、折叠空白；`<!--! -->` 保留；`<text>  a  b </text>` 内部空白不变；属性间多余空白折叠。
- 保存命令不做前端单测（依赖 Tauri IPC），由 Task 7 的真机验收覆盖。

---

## 5. 交付顺序与验收标准

**建议顺序**：`markdown`（utils → 视图）→ `image-base64`（utils → 视图）→ Rust 保存命令 → 全量回归与验收。

**验收清单**：

1. 侧边栏点击 `markdown` 与 `image-base64` 打开真实实现。
2. Markdown：粘贴 GFM 文档，表格/任务列表/删除线/代码块高亮正确；开关同步滚动后两侧滚动联动且不抖动；含 `<script>` 与 `onerror` 的输入被消毒，预览里看不到任何脚本执行痕迹（控制台无告警、iframe 内 `document.scripts.length === 0`）。
3. 图片：粘贴剪贴板图片得到 DataURL 预览；把该 DataURL 贴回「Base64 → 图片」能还原同一张图；SVG 压缩后字节数下降且渲染不变。
4. 保存：输入 `~/Downloads/devutils-test.png` 点保存，文件真实落盘且能打开（验收时用 `ls -l` 与文件头校验）。
5. 两个工具的输入与视图选项在关闭 Tab / LRU 卸载 / 重启后重开能够还原；渲染结果与图片数据不落库。
6. `npm test`、`npm run build` 全绿；`cargo clippy --all-targets -- -D warnings` 与 `cargo test --manifest-path src-tauri/Cargo.toml` 通过。
7. 依赖与改动范围：`package.json` 只新增 §1 表里的 4 个依赖；`src-tauri/` 只新增 `commands/file.rs` + `commands/mod.rs` 一行 + `lib.rs` 注册一行。

---

## 6. 后续批次衔接

- **批次 D**：X.509 证书解析（可用 Rust `x509-parser` 或前端 `@peculiar/x509`）、二维码生成与解码（`qrcode` + `jsqr`）。选型在批次 D 的设计阶段单独给出。
- **原生文件选择器**：若用户希望「另存为」弹出系统对话框，需要引入 `tauri-plugin-dialog`（+ 能力声明）。本批次先用路径输入，把这个增强项留给后续。
- **打包与公证交付**：仍属发布工程，单独排期。

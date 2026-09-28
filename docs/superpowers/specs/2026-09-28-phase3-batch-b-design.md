# 第三阶段批次 B 设计规范：JWT 解析与 WebSocket 调试

**文档版本**：v1.0
**更新日期**：2026-09-28
**适用范围**：DevUtils 第三阶段（P1 实用工具扩展）之批次 B
**分支**：`master`
**前置文档**：`docs/superpowers/specs/2026-09-22-developer-toolbox-design.md`（总设计）、`docs/superpowers/specs/2026-09-28-phase3-batch-a-design.md`（批次 A，工程约定来源）

---

## 1. 背景与批次拆分

| 批次 | 内容 | 依赖特征 |
| --- | --- | --- |
| A（已完成） | `regex`、`mock-data`、`color-converter`、`tabular-convert` | 零新增依赖，纯前端 |
| **B（本文档）** | `jwt`、`websocket` | 零新增 npm 依赖；**唯一非前端改动是 CSP** |
| C | Markdown / HTML 预览、图片与 Base64 / SVG | 需解析与消毒库、原生文件能力 |
| D | X.509 证书解析、二维码生成与解码 | 需成熟第三方库 |

两个工具在 `src/types/tool.ts` 中**已注册**（`jwt`、`websocket`，`category` 分别为 `crypto` / `network`），当前落到 `ToolPlaceholder`，本批次替换为真实实现，**不改 `src/types/tool.ts`**。

**本批次唯一的非前端改动**：`src-tauri/tauri.conf.json` 的 CSP 增加 `connect-src 'self' ws: wss:`（见 §4.3）。除此之外 `src-tauri/` 零改动、数据库 schema 零改动。

**本批次不做的事（明确排除）**：

- 不做 PEM / SPKI / PKCS#1 公钥解析（RS256 只接受 JWK 或 JWKS）。
- 不做 RS384 / RS512 / ES256 / ES384 / EdDSA 验签。
- 不做私钥签名：篡改重签只对 HS256 生效（RS256 无私钥无法重签）。
- 不做 WebSocket 自定义请求头与代理：webview 原生 `WebSocket` API 不支持自定义头，若后续需要再评估 Rust `tokio-tungstenite` 方案。
- 不做 WebSocket 控制帧 Ping/Pong：浏览器 API 不暴露控制帧（见 §4.4）。
- 不做二进制帧的构造发送（收到二进制帧按 base64 只读展示并标注）。

---

## 2. 通用工程约定

沿用批次 A 的契约，逐条一致：

- 目录：`src/views/tools/<ToolName>/<ToolName>.vue` + `utils/*.ts` + `__tests__/*.spec.ts`；视图只做状态绑定，算法全在 `utils`。
- Props：`defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()`。
- 快照：`props.initialSnapshot?.x ?? <默认值>` 回填；`tabStore.updateTabSnapshot(props.tabId, {...})` 落库；文本输入 250ms 防抖；只持久化输入与视图选项。
- 派生结果（解码结果、验签结论、日志流）**不入快照**，重开由 `onMounted` 用回填输入重算。
- 错误处理：非法输入用 `NAlert` 就地提示并保留上一次有效结果；空输入只显示空态。
- 高亮渲染禁止 `v-html`，一律用分段数组 + `v-for`。
- 每个任务结束都要 `npm test` 与 `npm run build` 通过，并单独提交一次 git。

### 2.1 复用点

| 能力 | 复用来源 |
| --- | --- |
| HMAC-SHA256 | `@noble/hashes` 的 `hmac.js` + `sha2.js`（v2 导出路径带 `.js`，批次 C 已引入该依赖） |
| SHA-256 摘要 | 同上 `sha2.js` 的 `sha256` |
| base64url 编解码 | 自行实现（`atob`/`btoa` + `-`/`_` 替换与 padding 补全），不引库 |
| 编辑器 / 主题跟随 | CodeMirror 6 + `Compartment`，沿用 `SqlFormatter.vue` / `Regex.vue` 写法 |
| UI 组件 | Naive UI + Tailwind，沿用既有风格 |

---

## 3. `jwt`：JWT 解析与调试

### 3.1 目标

粘贴 JWT，三段式色彩高亮解析 Header / Payload，展示 Claims 可读时间与过期倒计时；支持 HS256 验签与「改 Payload 后重新签名」；支持 RS256 验签（公钥用 JWK/JWKS）。

### 3.2 布局与交互

- 顶部：Token 输入（CodeMirror 纯文本，单行也可多行粘贴）+「解析」按钮（手动模式显示）+ 清空。
- 输入护栏：Token 超过 256KB 时关闭自动解析，只保留「解析」按钮（与批次 A 的正则口径一致）。
- 左栏：三段式高亮预览（Header 段 / Payload 段 / Signature 段各自配色，分段渲染）。
- 中栏：Header 与 Payload 的 JSON 美化展示（只读）。
- 右栏：Claims 表（`exp` / `iat` / `nbf` 显示 ISO 时间 + 相对时间，每秒刷新倒计时）+ 验签面板。
- 验签面板：
  - 算法下拉：`HS256` / `RS256`（按 token 头部 `alg` 自动选中，可手动改）。
  - HS256：Secret 输入 + 「Secret 是 base64」开关 + 验签按钮 + 结果徽章。
  - RS256：公钥 JSON 输入（JWK 或 JWKS；JWKS 时按 token 头部 `kid` 匹配，匹配不到则用第一条）+ 验签按钮 + 结果徽章。
  - 篡改重签（仅 HS256）：Payload 可编辑，点「重新签名」生成新 token 并展示。

### 3.3 解码模型（定稿）

- 分段：token 必须恰好 3 段（`.` 分隔），否则返回 `error: 'JWT 必须由 3 段组成'`。
- base64url 解码：`-`→`+`、`_`→`/`、按 4 的倍数补 `=`，再 `atob`；解码失败返回 `error`。
- JSON 解析：Header 与 Payload 各自 `JSON.parse`；失败返回带段名的 `error`（如 `Payload 不是合法 JSON`）。
- 签名输入：`signingInput = ${rawHeader}.${rawPayload}`（**原始 base64url 文本**，不是解码后的 JSON）。
- 解析成功时同时返回 `rawHeader` / `rawPayload` / `rawSignature` 三段原文，供高亮渲染与验签复用。

### 3.4 验签模型（定稿）

- **HS256**：`expected = base64url(hmac(sha256, keyBytes, signingInput))`，与 token 的签名段做**逐字节常量时间比较**（长度不等直接 false）。`keyBytes` 默认按 UTF-8 编码，开启 base64 开关时先 `atob`。
- **RS256（纯 JS 实现，零依赖）**：
  1. 从 JWK 取 `n`、`e`（base64url 解码为 BigInt）。
  2. `s = bytesToBigInt(signature)`；若 `s >= n` 直接判无效。
  3. `m = s^e mod n`（BigInt 快速幂），按模长左补零到 `signature.length` 字节。
  4. 校验 PKCS#1 v1.5 结构：`0x00 0x01` + 至少 8 个 `0xFF` + `0x00` + DigestInfo(SHA-256) 前缀 `30 31 30 0d 06 09 60 86 48 01 65 03 04 02 01 05 00 04 20` + 32 字节摘要，且长度与 `m` 完全吻合。
  5. 摘要用 `sha256(signingInput)` 计算。
  - 这是**公钥验签**，不涉及任何秘密，允许非恒定时间实现。
- **为什么不用 `crypto.subtle`**：生产构建下页面源是 `tauri://localhost`（已核实 `useHttpsScheme` 只影响 Windows / Android，macOS / Linux 仍是自定义协议），自定义协议不保证是 secure context，`crypto.subtle` 在这些平台可能为 `undefined`；dev 模式走 `http://localhost:1420` 反而是 secure context，**会导致 dev 能跑、打包后失效**。纯 JS 路径跨平台确定，因此本批次统一走纯 JS。
- 验签结论三态：`valid` / `invalid` / `unavailable`（缺 secret 或公钥时显示「未提供密钥」而不是「验签失败」）。
  - 实现分层：`verifyHs256` / `verifyRs256` 只返回布尔（或 `error`），三态判定由视图负责——secret / 公钥输入为空时直接显示「未提供密钥」，不调用 util。
- 篡改重签：改 Payload → 重新 base64url 编码 → 用 HS256 重新签名；`alg` 不是 HS256 时该按钮禁用并提示。

### 3.5 文件与接口

```
src/views/tools/Jwt/
  Jwt.vue
  utils/jwtDecode.ts     # base64UrlToBytes / bytesToBase64Url / decodeJwt
  utils/jwtVerify.ts     # verifyHs256 / verifyRs256 / hmacSign
  utils/claims.ts        # describeClaims
  __tests__/jwtDecode.spec.ts
  __tests__/jwtVerify.spec.ts
  __tests__/claims.spec.ts
```

```ts
interface DecodedJwt {
  header: Record<string, any>
  payload: Record<string, any>
  rawHeader: string
  rawPayload: string
  rawSignature: string
  signingInput: string
}
decodeJwt(token: string): { value?: DecodedJwt; error?: string }
verifyHs256(signingInput: string, signature: string, secret: string, secretIsBase64: boolean): boolean
hmacSign(signingInput: string, secret: string, secretIsBase64: boolean): string
verifyRs256(signingInput: string, signature: string, publicKeyJson: string, kid?: string): { valid: boolean; error?: string }
describeClaims(payload: Record<string, any>, now: number): { key: string; value: string; iso?: string; relative?: string }[]
```

### 3.6 快照字段

```ts
{ token: string; secret: string; secretIsBase64: boolean; publicKeyJson: string; editedPayload: string }
```

### 3.7 测试要点

- 解码：正常三段 token 的 header/payload 字段正确；两段 / 四段 / 非 base64 / 非 JSON 各自返回预期 `error`。
- base64url：含 `-` `_` 的段往返一致；缺 padding 的段能正确解码。
- HS256：用固定 secret 与固定 token 断言 `verifyHs256 === true`；改 1 个字符后为 `false`；`hmacSign` 输出与 token 签名段一致（往返）。
- RS256：单测内置一对固定 RSA JWK 与用其签出的固定 token（实现阶段用 `node:crypto` 生成一次后写死），断言 `valid === true`；篡改 payload 后 `valid === false`；`n` 为非法 base64url 时返回 `error`。
- Claims：`exp` 已过期 / 未过期 / 缺失三种情况的中文相对时间与 ISO 输出。

---

## 4. `websocket`：WebSocket 调试

### 4.1 目标

连接 WS/WSS 端点，收发文本消息，流式日志与关键字检索，心跳保活与断线自动重连，消息模板快捷发送。

### 4.2 布局与交互

- 顶部：URL 输入 + 子协议输入（逗号分隔）+「连接」/「断开」按钮 + 状态徽章（idle / connecting / open / closing / closed）+ 自动重连开关 + 心跳开关与间隔。
- 顶部第二行：心跳载荷输入（默认 `{"type":"ping"}`）与「清空日志」按钮。
- 左栏：消息编辑器（CodeMirror 纯文本）+「发送」按钮 + 模板列表（新增 / 编辑 / 删除 / 一键填入并发送）。
- 右栏：流式日志（时间 / 方向 / 类型 / 大小 / 载荷）+ 关键字检索框 + 方向过滤（全部 / 仅收 / 仅发 / 仅系统）。
- URL 非法（`new WebSocket` 抛 `SyntaxError`）时用 `NAlert` 提示并不进入 connecting 状态。

### 4.3 连接与 CSP

- 用 **webview 原生 `WebSocket` API**（`new WebSocket(url, protocols)`），零新增依赖。
- **必须改 CSP**：当前 `src-tauri/tauri.conf.json` 的 `csp` 是 `default-src 'self'; img-src 'self' asset: data:; style-src 'self' 'unsafe-inline'; script-src 'self'`，没有 `connect-src`，会回落到 `default-src 'self'`，**WebSocket 连接会被直接拦掉**。改为：

  ```
  default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' asset: data:; style-src 'self' 'unsafe-inline'; script-src 'self'
  ```

- 风险说明（写进代码注释）：放开 `connect-src` 后，若将来出现被注入的脚本，理论上可经 WebSocket 外发数据。当前 `script-src 'self'` 已阻断内联与远程脚本，应用自身脚本是唯一来源，风险可接受；这是「零新增依赖 + 复用原生能力」的代价，已在 spec 中显式记录。
- 混合内容风险：页面源是 `tauri://localhost`，`ws://`（非 TLS）是否被混合内容策略拦截需在实现阶段用本地 echo 服务实测；若被拦，界面提示改用 `wss://`，并把结论写回 spec。

### 4.4 连接生命周期（定稿）

- 状态机：`idle → connecting → open → closing → closed`，界面用状态徽章显示，并记录每次状态迁移到日志（`system` 方向）。
- 手动断开：用户点「断开」后不再自动重连。
- 自动重连：仅在「开启自动重连」且非手动断开时生效；退避策略为 `min(1000 * 2^attempt, 30000)` 毫秒，`attempt` 在连接成功后归零。
- **心跳**：浏览器 `WebSocket` API **不能发送控制帧 Ping**，所以心跳实现为「按固定间隔发送用户自定义的文本心跳载荷」（默认 `{"type":"ping"}`），并记录发送时间；界面明确标注这是应用层心跳，不是协议层 Ping。
- 连接错误与关闭码：`onerror` / `onclose(code, reason, wasClean)` 全部落日志。

### 4.5 日志模型（定稿）

```ts
interface WsLogEntry {
  id: number
  direction: 'in' | 'out' | 'system'
  kind: 'text' | 'binary'
  payload: string      // 文本帧原文；二进制帧为 base64；system 为描述
  size: number         // 字节数（按 UTF-8 计）
  timestamp: number
}
```

- 上限：内存中最多保留 **2000 条**，超出丢弃最旧的（`appendLog` 纯函数负责裁剪）。
- 检索：关键字过滤（大小写不敏感）与方向过滤（全部 / 仅收 / 仅发 / 仅系统）。
- 二进制帧：只读展示为 base64 并标注 `[binary]`，本批次不构造发送。
- 日志不落快照（流式数据，重开即清空）。

### 4.6 消息模板

- 模板结构：`{ id, name, payload }`，支持新增 / 编辑 / 删除 / 一键发送。
- 存储：**存快照**（`templates` 字段）。
  - 与总设计的偏离说明：总设计写的是「统一复用 `app_favorites` 表」，但当前代码里**收藏功能整体还没接 SQLite**——`toolStore` 的收藏存在 `localStorage`，`app_favorites` / `app_recents` 两张表在前端完全没被使用。为一个工具单独用裸 SQL 写 `app_favorites` 会制造「只有 WebSocket 模板进库」的不一致。因此本批次把模板放进快照（同样能跨重启保留），待收藏功能整体接入 SQLite 时再统一迁移。

### 4.7 文件与接口

```
src/views/tools/Websocket/
  Websocket.vue
  utils/wsLog.ts         # createLogEntry / appendLog / filterLog / formatBytes
  utils/reconnect.ts     # nextReconnectDelay(attempt) / shouldReconnect(state)
  utils/templates.ts     # addTemplate / updateTemplate / removeTemplate
  __tests__/wsLog.spec.ts
  __tests__/reconnect.spec.ts
  __tests__/templates.spec.ts
```

```ts
appendLog(entries: WsLogEntry[], entry: WsLogEntry, limit?: number): WsLogEntry[]
filterLog(entries: WsLogEntry[], options: { keyword: string; direction: 'all' | 'in' | 'out' | 'system' }): WsLogEntry[]
nextReconnectDelay(attempt: number): number   // min(1000 * 2^attempt, 30000)
addTemplate(list: WsTemplate[], template: WsTemplate): WsTemplate[]
updateTemplate(list: WsTemplate[], id: string, patch: Partial<WsTemplate>): WsTemplate[]
removeTemplate(list: WsTemplate[], id: string): WsTemplate[]
```

### 4.8 快照字段

```ts
{ url: string; protocols: string; templates: WsTemplate[]; heartbeatEnabled: boolean; heartbeatIntervalMs: number; heartbeatPayload: string; autoReconnect: boolean; keyword: string; direction: string }
```

### 4.9 测试要点

- `appendLog`：超过上限时丢弃最旧条目且长度恒为上限；顺序保持追加顺序。
- `filterLog`：关键字大小写不敏感命中；方向过滤各分支；空关键字返回全部。
- `nextReconnectDelay`：`0→1000`、`1→2000`、`2→4000`、`5→30000`（封顶）、`10→30000`。
- `templates`：新增 / 更新 / 删除的不可变性（原数组不被修改）与未知 id 的空操作。
- 连接逻辑本身不做单测（依赖真实网络），由批次 B 实施计划的真机验收步骤覆盖。

---

## 5. 交付顺序与验收标准

**建议顺序**：`jwt`（utils → 视图）→ `websocket`（CSP → utils → 视图）→ 全量回归与验收。

**验收清单**：

1. 侧边栏点击 `jwt` 与 `websocket` 打开真实实现，不再出现 `ToolPlaceholder`。
2. JWT：三段式高亮正确；`exp` 倒计时每秒刷新；HS256 用正确 secret 验签通过、错 secret 不通过；RS256 用固定 JWK 验签通过、篡改后不通过；HS256 改 Payload 后重签得到可被自身验签通过的新 token。
3. WebSocket：能连上本地 echo 服务并收发文本消息；日志实时追加且可关键字检索；断开后按退避重连；心跳按间隔发送并落日志；收到的二进制帧按 base64 只读展示。
4. 两个工具的输入与视图选项在关闭 Tab / LRU 卸载 / 重启后重开能够还原；日志与验签结论等派生结果不落库。
5. 非法输入全部走界面提示，无控制台未捕获异常、无白屏。
6. `npm test`、`npm run build` 全绿；`cargo clippy --all-targets -- -D warnings` 与 `cargo test --manifest-path src-tauri/Cargo.toml` 保持通过（本批次不改 Rust 代码，只改 `tauri.conf.json` 的 CSP）。
7. 未新增 npm 依赖：`package.json` 无变动；`src/types/tool.ts` 无变动；`src-tauri/` 的改动**仅限** `tauri.conf.json` 的 `csp` 一行。

---

## 6. 后续批次衔接

- **批次 C**：Markdown 预览需「解析库 + 消毒库」；图片与 Base64 需落地保存能力，且当前 CSP 未放行 `blob:`，导出方案要在设计阶段先定。
- **批次 D**：X.509 证书解析、二维码生成与解码。
- 新增依赖策略（能用成熟库就用 vs 尽量零依赖）仍待用户确认；本批次通过纯 JS 实现 RS256 与原生 WebSocket，把该决策推迟到了批次 C。

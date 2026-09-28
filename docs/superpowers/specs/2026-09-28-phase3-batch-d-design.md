# 第三阶段批次 D 设计规范：X.509 证书解析与二维码生成 / 解码

**文档版本**：v1.0
**更新日期**：2026-09-28
**适用范围**：DevUtils 第三阶段（P1 实用工具扩展）之批次 D
**分支**：`master`
**前置文档**：`docs/superpowers/specs/2026-09-22-developer-toolbox-design.md`（总设计 §3 `p3_8`、§5.2）、`docs/superpowers/specs/2026-09-28-phase3-batch-c-design.md`（批次 C，工程约定与依赖选型结论）

---

## 1. 背景与批次拆分

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| A | `regex`、`mock-data`、`color-converter`、`tabular-convert` | 已完成 |
| B | `jwt`、`websocket` | 已完成 |
| C | `markdown`、`image-base64` | 已完成 |
| **D（本文档）** | `x509`（X.509 证书解析）、`qrcode`（二维码生成与解码） | 本批次 |

总设计 §3 甘特图 `p3_8` 的「X.509 证书 / QR / 拾色器 / 打包公证交付」中，拾色器已在批次 A 交付，本批次补齐 X.509 与 QR。**打包与公证属发布工程，仍单独排期**（批次 C 设计规范 §6 已明确）。

两个工具**尚未注册**，本批次需在 `src/types/tool.ts` 新增两条（`x509`、`qrcode`）。

### 1.1 选型证据（已联网核实）

| 候选 | 版本 | 结论 |
| --- | --- | --- |
| `x509-parser`（Rust crate） | 0.18.1 | **采用**。`default = []`，不启用 `verify` / `verify-aws` 就不会拉入 `ring` / `aws-lc-rs`；纯 Rust，无 C 依赖，满足「零新增 C 依赖」 |
| `qrcode`（npm） | 1.5.4 | **采用**（生成）。`browser` 字段把 `./lib/index.js` 映射为 `./lib/browser.js` 且 `fs: false`，Vite 只会打进浏览器实现；`pngjs` / `yargs` 仅 Node 入口使用，不会进包 |
| `jsqr`（npm） | 1.4.0 | **采用**（解码）。零依赖纯 JS，无原生模块、无 `eval` |
| `@types/qrcode`（npm） | 1.5.6 | **采用**（devDependency）。`qrcode` 自身不带 TypeScript 声明，`vue-tsc` 需要它才能过类型检查 |
| `@peculiar/x509`（npm） | 2.1.0 | **不采用**，理由见 §3.2 |

### 1.2 本批次不做的事（明确排除）

- 证书链校验、CRL / OCSP 查询、证书签发与自签生成、PKCS#12 / JKS 容器解析。
- 证书签名的密码学验签（`x509-parser` 的 `verify` 特性需要 `ring`，本批次不引入）。
- 二维码 logo 叠加、圆点 / 渐变等美化、批量生成与批量解码。
- 二维码解码前的图像增强（模糊、倾斜、破损图片的预处理）。

---

## 2. 通用工程约定

沿用批次 A / B / C 的契约，逐条一致：

- 目录：`src/views/tools/<ToolName>/<ToolName>.vue` + `utils/*.ts` + `__tests__/*.spec.ts`；视图只做状态绑定。
- Props：`defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()`。
- 快照：`props.initialSnapshot?.x ?? <默认值>` 回填；`tabStore.updateTabSnapshot(props.tabId, {...})` 落库；文本输入 250ms 防抖；**只持久化输入与视图选项**。
- 派生结果（解析出来的证书字段、二维码图片、解码文本）**不入快照**；重开由 `onMounted` 用回填输入重算。
- 错误处理：非法输入用 `NAlert` 就地提示并保留上一次有效结果；空输入只显示空态，不抛未捕获异常。
- 每个任务结束都要 `npm test` 与 `npm run build` 通过，并单独提交一次 git；Rust 改动额外跑 `cargo clippy --all-targets -- -D warnings` 与 `cargo test --manifest-path src-tauri/Cargo.toml`。

---

## 3. `x509`：X.509 证书解析

### 3.1 目标

粘贴 PEM / DER(hex) / Base64 三种形态的证书，解析出主体、签发者、有效期、公钥、扩展与指纹，分组可读展示，并可一键复制指纹与规范化 PEM。

### 3.2 为什么解析放在 Rust 侧（定稿）

- **生产环境不可依赖 WebCrypto**：批次 B 已核实，生产构建的页面源是 `tauri://localhost` 自定义协议，不保证是 secure context，`crypto.subtle` 可能为 `undefined`；而 dev 模式走 `http://localhost:1420` 反而是 secure context，会造成「dev 能跑、打包后失效」的隐性故障。`@peculiar/x509` 的部分能力依赖 WebCrypto，风险不可接受。
- **手写 ASN.1 DER 解析是明确的反模式**：标签、长度编码、BIT STRING 补齐、时间两种编码（UTCTime / GeneralizedTime）等边界情况极多。
- **复用既有依赖，零新增 crate 冲突**：`base64`（解码）、`hex`（指纹与序列号）、`sha-1` + `sha2`（指纹）、`chrono`（有效期格式化）都已在 `src-tauri/Cargo.toml` 里。
- **纯计算、一次 IPC**：解析是同步确定性计算，不需要异步与状态管理。

### 3.3 输入识别（定稿）

按顺序探测，命中即用：

1. 含 `-----BEGIN CERTIFICATE-----` → 抽取 PEM body（去掉全部空白）后按标准 Base64 解码。
2. 去掉空白与 `:` 后全部是十六进制字符、长度为偶数且 ≥ 64 → 按 hex 解码。
3. 否则按标准 Base64 解码；失败再试 URL-Safe Base64（`-`/`_` 换 `+`/`/` 并补齐 `=`）。
4. 全部失败 → `Err("无法识别的证书格式：请粘贴 PEM、DER(hex) 或 Base64")`。
5. DER 解出后解析失败 → `Err("DER 解析失败：<x509-parser 错误>")`。

### 3.4 输出契约（Rust → 前端，camelCase）

```ts
interface NameFields {
  commonName?: string
  organization: string[]
  organizationalUnit: string[]
  country: string[]
  state: string[]
  locality: string[]
  email: string[]
  raw: string              // RFC4514 风格完整 DN，用于展示与主体/签发者比较
}

interface CertificateInfo {
  subject: NameFields
  issuer: NameFields
  serialHex: string        // 大写，无分隔
  version: string          // "v1" | "v2" | "v3"
  notBefore: string        // RFC3339 UTC
  notAfter: string         // RFC3339 UTC
  daysRemaining: number    // 负数表示已过期
  isExpired: boolean
  signatureAlgorithm: string      // OID 字符串
  publicKeyAlgorithm: string      // OID 字符串
  publicKeyBits: number | null
  subjectAltNames: string[]       // 前缀化：DNS: / IP: / email: / URI:
  keyUsage: string[]
  extendedKeyUsage: string[]
  isCa: boolean
  pathLenConstraint: number | null
  selfSigned: boolean             // 主体 DN 与签发者 DN 相同（不做密码学验签）
  fingerprints: { sha1: string; sha256: string }   // 大写，冒号分隔
  derHex: string
  pem: string
}
```

命令签名：

```rust
#[tauri::command]
pub fn parse_certificate(input: String) -> Result<CertificateInfo, String>
```

字段来源对照表（实现时按此落地）：

| 输出字段 | 来源 |
| --- | --- |
| `subject` / `issuer` | `cert.subject()` / `cert.issuer()`；`iter_common_name()` / `iter_organization()` / `iter_organizational_unit()` / `iter_country()` / `iter_state_or_province()` / `iter_locality()` / `iter_email()`；`as_raw()` 用于主体与签发者的相等判断 |
| `serialHex` | `cert.raw_serial()` 原始字节 → `hex` 大写编码（**不用** `cert.serial` 的 `BigUint`，避免高位 0 被吞掉，展示更贴近 OpenSSL） |
| `version` | `cert.version()` → `X509Version::V1 / V2 / V3` |
| `notBefore` / `notAfter` | `cert.validity().not_before.to_datetime()` / `not_after` → unix 秒 → `chrono` 格式化为 RFC3339 |
| `daysRemaining` / `isExpired` | `chrono::Utc::now()` 与 `notAfter` 的秒差（向下取整到天） |
| `signatureAlgorithm` | `cert.signature_algorithm.algorithm.to_id_string()` |
| `publicKeyAlgorithm` / `publicKeyBits` | `cert.public_key().algorithm.algorithm.to_id_string()` 与 `cert.public_key().parsed()` 的密钥长度 |
| `subjectAltNames` | `cert.subject_alternative_name()`，按类型加前缀 |
| `keyUsage` / `extendedKeyUsage` | `cert.key_usage()` / `cert.extended_key_usage()` 的 flag 名 |
| `isCa` / `pathLenConstraint` | `cert.basic_constraints()` |
| `fingerprints` | 对原始 DER 做 SHA-1 / SHA-256 → 大写 hex → 每两字符插冒号 |
| `derHex` / `pem` | 原始 DER；PEM 由 DER 重新 Base64 编码并 64 列折行（`x509-parser` 的 `pem` 模块只做解析，不做编码） |

### 3.5 布局与交互

- 顶部：标题 +「解析」+「清空」+「复制 PEM」+「复制 SHA-256」。
- 左栏：证书输入 textarea（等宽字体，可粘贴 PEM / hex / Base64）+「填入示例证书」按钮（示例证书内联在代码里）。
- 右栏：结果分组展示
  1. **概要**：Subject CN、Issuer CN、有效期（带状态徽标：`有效` / `30 天内到期` / `已过期`）、序列号、版本。
  2. **主体 / 签发者**：DN 明细表（CN / O / OU / C / ST / L / email）。
  3. **公钥与签名**：公钥算法、位数、签名算法（经 `oidLabel` 映射为可读名）。
  4. **扩展**：SAN 列表、Key Usage、Extended Key Usage、Basic Constraints（CA / pathLen）。
  5. **指纹**：SHA-1 与 SHA-256，等宽字体 + 一键复制。
- 未解析时右栏显示空态；错误用 `NAlert` 就地提示。

### 3.6 文件与接口

```
src-tauri/src/commands/x509.rs     # parse_certificate + #[cfg(test)] 单测
src/views/tools/X509/
  X509.vue
  utils/certView.ts                # 展示层纯函数
  __tests__/certView.spec.ts
```

```ts
expiryLevel(daysRemaining: number): 'ok' | 'soon' | 'expired'  // soon = 0 <= days <= 30
formatFingerprint(hex: string): string                         // 'aabbcc' → 'AA:BB:CC'
formatPublicKey(algorithm: string, bits: number | null): string
oidLabel(oid: string): string                                  // 命中映射表返回可读名，否则原样回落 OID
```

`oidLabel` 映射表（最小集合）：

| OID | 名称 |
| --- | --- |
| `1.2.840.113549.1.1.1` | RSA |
| `1.2.840.113549.1.1.5` | SHA1withRSA |
| `1.2.840.113549.1.1.11` | SHA256withRSA |
| `1.2.840.113549.1.1.12` | SHA384withRSA |
| `1.2.840.113549.1.1.13` | SHA512withRSA |
| `1.2.840.10045.2.1` | EC |
| `1.2.840.10045.4.3.2` | ECDSA-with-SHA256 |
| `1.3.101.112` | Ed25519 |

### 3.7 快照字段

```ts
{ input: string }
```

证书是公开信息，可以持久化；解析结果不落库，重开时由 `onMounted` 重新解析。

### 3.8 测试要点

Rust（`commands/x509.rs` 的 `#[cfg(test)]`，复用已内联的自签证书常量）：

- PEM 解析成功：断言 Subject CN、Issuer CN、`is_ca()` 结果、`selfSigned == true`、SHA-256 指纹长度为 64 个 hex 字符。
- 同一张证书的 DER hex 与 Base64 输入得到与 PEM **完全一致**的 `CertificateInfo`（结构体派生 `PartialEq`，直接整体比较）。
- 空输入、乱码输入、PEM 头尾正确但 body 损坏三种情况都返回 `Err`。
- 指纹与系统 `openssl x509 -fingerprint -sha256` 的结果一致（实现时用固定证书校验一次，作为测试常量固化）。

前端（`certView.spec.ts`）：

- `expiryLevel(-1) === 'expired'`、`expiryLevel(0) === 'soon'`、`expiryLevel(30) === 'soon'`、`expiryLevel(31) === 'ok'`。
- `formatFingerprint('aabbcc') === 'AA:BB:CC'`；空串返回空串。
- `formatPublicKey('1.2.840.113549.1.1.1', 2048)` 含 `RSA` 与 `2048`；`bits` 为 `null` 时不出现 `null` 字样。
- `oidLabel` 命中已知 OID 与未知 OID 原样回落。

---

## 4. `qrcode`：二维码生成与解码

### 4.1 目标

生成：文本 / URL → 二维码，可调纠错等级、尺寸、边距与前景背景色，支持导出 PNG 与复制 DataURL。
解码：粘贴剪贴板图片 / 拖拽 / 选择文件 → 解出文本。

### 4.2 选型决策（定稿）

**前端纯 JS（`qrcode` + `jsqr`）**：

- 生成与解码都是纯计算，输入来自剪贴板或本地文件，放前端零 IPC 往返。
- CSP 已放行 `img-src 'self' asset: data:`（批次 C 结论），canvas 与 DataURL 预览都不需要新增 CSP。
- 导出 PNG 复用批次 C 已有的 `save_binary_file` 命令，**Rust 侧零改动**。
- 两个库都是纯 JS、无原生模块、无 `eval`，与批次 C 的依赖策略一致。

对比方案（Rust 侧 `qrcode` + `rqrr` + `image`）：跨端结果一致，但要新增 3 个 crate（其中 `image` 体积大、编解码矩阵广），且「粘贴剪贴板图片」仍需先把图片交给前端或做额外 IPC，收益不足以抵消成本。

### 4.3 布局与交互

- 顶部：标题 + 模式切换 `NRadioGroup`：`生成` / `解码`。
- **生成模式**
  - 左栏：内容 textarea + 参数区（纠错等级 L/M/Q/H 分段按钮、尺寸 `NInputNumber` 128–1024、边距 `NInputNumber` 0–8、前景 / 背景 `NColorPicker`）+「生成」按钮。
  - 右栏：canvas 预览（白底、按容器等比显示）+「复制 DataURL」+ 保存路径输入 +「导出 PNG」。
- **解码模式**
  - 左栏：拖拽 / 粘贴区（`tabindex="0"` + `@paste` + `@drop`）+ 文件选择 + 原图预览。
  - 右栏：解码结果（等宽 `pre`，可换行）+「复制文本」+ 识别信息（二维码版本、文本字节数）+ 失败提示。

### 4.4 生成参数与校验（定稿）

```ts
interface QrOptions {
  ecc: 'L' | 'M' | 'Q' | 'H'   // 默认 'M'
  size: number                  // 默认 256，范围 128–1024，取整
  margin: number                // 默认 2，范围 0–8，取整
  fg: string                    // 默认 '#000000'
  bg: string                    // 默认 '#FFFFFF'
}
```

- `size` / `margin` 越界时钳制到边界；非有限值回落默认值。
- 颜色统一归一化为 `#RRGGBB` 大写；非法颜色回落默认值。
- `contrastRatio(fg, bg) < 3` 时给黄色提示「前景与背景对比度过低，扫码可能失败」，但**不阻止生成**。
- 内容为空时不生成，右栏保持空态。
- 生成抛错（内容超出该纠错等级容量）时保留上一次有效二维码并就地提示。

### 4.5 解码流程（定稿）

1. 图片来源：剪贴板 `paste`（`clipboardData.items` 中 `type.startsWith('image/')`）、拖拽 `drop`、`<input type="file" accept="image/*">`。
2. `createImageBitmap(file)` → 画到离屏 `canvas` → `getImageData(0, 0, w, h)`。
3. **尺寸保护**：任一边超过 4096 时先等比缩到 4096，避免 `getImageData` 内存峰值。
4. `jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })`。
5. 命中：展示 `data`（文本）、`version`（二维码版本）与文本字节数。
6. 未命中：`NAlert` 提示「未识别到二维码，试试更清晰或更大的图片」。
7. 解码结果与图片**不落库**。

### 4.6 导出

- `canvas.toBlob('image/png')` → `FileReader.readAsDataURL` → 去掉 `data:*;base64,` 前缀 → `saveBase64File(path, base64)`（批次 C 已有）。
- 默认路径 `~/Downloads/devutils-qrcode.png`。
- 成功 / 失败用 `message` 与 `NAlert` 反馈，与 `image-base64` 保持一致。

### 4.7 文件与接口

```
src/views/tools/Qrcode/
  Qrcode.vue
  utils/qrOptions.ts      # normalizeQrOptions / contrastRatio
  utils/decodeQr.ts       # decodeQr 包装 jsQR
  __tests__/qrOptions.spec.ts
  __tests__/decodeQr.spec.ts
  __tests__/fixtures/qrMatrix.ts
```

```ts
normalizeQrOptions(partial: Partial<QrOptions>): QrOptions
contrastRatio(fg: string, bg: string): number   // WCAG 相对亮度比，范围 1–21
decodeQr(image: { data: Uint8ClampedArray; width: number; height: number }):
  { text: string; version: number; bytes: number } | null
```

### 4.8 快照字段

```ts
{
  mode: 'generate' | 'decode'
  text: string
  ecc: 'L' | 'M' | 'Q' | 'H'
  size: number
  margin: number
  fg: string
  bg: string
  savePath: string
}
```

### 4.9 测试要点

- `normalizeQrOptions`：`size` 越界钳制（64 → 128、4096 → 1024）、`margin` 越界钳制、非法颜色回落、`ecc` 非法值回落 `'M'`。
- `contrastRatio('#000000', '#FFFFFF')` 约等于 21（±0.1）；`contrastRatio('#FFFFFF', '#FFFFFF') === 1`。
- `decodeQr` 往返：`__tests__/fixtures/qrMatrix.ts` 内联一份版本 1 二维码的模块矩阵（21×21 的 `0`/`1` 字符串数组，内容为固定短文本 `DEVUTILS-1`，纠错等级 M），测试把它按 8 倍缩放 + 4 模块静默区展开成 `Uint8ClampedArray` 像素缓冲，断言 `decodeQr` 解出的 `text` 等于 `DEVUTILS-1`、`version === 1`。
- `decodeQr` 负例：全白像素缓冲返回 `null`。

> 该 fixture 用一次性脚本（`qrcode` 的 `create()`）生成后固化为常量，测试本身不依赖 `qrcode`，保证解码器测试是真正的独立往返验证。

---

## 5. 依赖清单与改动范围

| 类型 | 名称 | 版本 | 用途 |
| --- | --- | --- | --- |
| Rust | `x509-parser` | `0.18` | 证书解析（保持 `default-features`，不启用 `verify`） |
| npm | `qrcode` | `^1.5.4` | 二维码生成 |
| npm | `jsqr` | `^1.4.0` | 二维码解码 |
| npm (dev) | `@types/qrcode` | `^1.5.6` | `qrcode` 的类型声明 |

改动范围（验收时用 `git diff --stat <批次起点>..HEAD` 核对）：

- `src-tauri/Cargo.toml`：+1 行依赖。
- `src-tauri/src/commands/x509.rs`：新增；`commands/mod.rs`：+1 行；`lib.rs`：+1 行注册命令。
- `package.json`：+2 依赖。
- `package.json`：+2 运行依赖（`qrcode`、`jsqr`）+ 1 devDependency（`@types/qrcode`）。
- `src/types/tool.ts`：+2 条工具（`x509` 归 `crypto`、`qrcode` 归 `dev`）。
- `src/App.vue`：+2 个 `defineAsyncComponent` 与 `resolveBaseComponent` 分支。
- 新增 `src/views/tools/X509/**`、`src/views/tools/Qrcode/**`。

---

## 6. 交付顺序与验收标准

任务拆分（5 个任务，TDD 逐任务提交）：

1. **Task 1**：安装依赖、注册两个工具、新增 `commands/x509.rs`（命令 + Rust 单测）。
2. **Task 2**：`x509` 视图 + `certView` 纯函数与单测。
3. **Task 3**：`qrcode` 纯函数（`qrOptions` / `decodeQr` / fixture）与单测。
4. **Task 4**：`qrcode` 视图（生成 / 解码 / 导出）。
5. **Task 5**：全量回归与验收。

**验收清单**：

1. 侧边栏点击 `x509` 与 `qrcode` 打开真实实现。
2. `x509`：同一张证书的 PEM / DER(hex) / Base64 三种输入解析结果一致；过期证书显示「已过期」徽标；乱码输入只提示错误、不白屏。
3. `qrcode` 生成：内容 `https://example.com`、纠错 H、尺寸 512 生成的二维码，能被本工具的「解码」模式解回原文（自证闭环）。
4. `qrcode` 解码：粘贴剪贴板里的二维码图片能解出文本；非二维码图片给出失败提示。
5. 导出：生成的二维码保存到 `~/Downloads/devutils-qrcode.png`，`file` 识别为 PNG，且能被解码模式解回同一文本。
6. 两个工具的输入与视图选项在关闭 Tab / LRU 卸载 / 重启后重开能还原；解析结果与图片不落库。
7. `npm test`、`npm run build`、`cargo clippy --all-targets -- -D warnings`、`cargo test --manifest-path src-tauri/Cargo.toml` 全绿。
8. 依赖与改动范围符合 §5。

---

## 7. 后续批次衔接

- **原生文件选择器**：引入 `tauri-plugin-dialog` 让「另存为」弹出系统对话框，替换当前「手填路径」的交互。
- **HTML → Markdown 反向转换**：总设计 §5.2 写的是「Markdown / HTML 互转」，当前只交付了 Markdown → HTML 的预览与导出。
- **打包与公证交付**：macOS 签名 / 公证、Windows 安装包与自动更新，属发布工程，单独排期。
- **证书链校验 / CRL / OCSP**：本批次明确排除，若后续需要，评估 `x509-parser` 的 `verify` 特性（会引入 `ring`）或独立验证模块。

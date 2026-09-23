# 第二阶段批次 C 设计规范：SSH 公钥指纹与 SQL 格式化

**文档版本**：v1.0
**更新日期**：2026-09-23
**适用范围**：DevUtils 第二阶段（P0 开发者高频工具）之批次 C
**分支**：`master`
**前置文档**：`docs/superpowers/specs/2026-09-22-developer-toolbox-design.md`（总设计）、`docs/superpowers/specs/2026-09-23-phase2-batch-a-design.md`、`docs/superpowers/specs/2026-09-23-phase2-batch-b-design.md`

---

## 1. 背景与批次拆分

第二阶段共 7 项工具，按「新增依赖」维度拆成三批。批次 A、B 已合并进 `master`；批次 C 收尾剩下两项：

| 批次 | 内容 | 依赖特征 |
| --- | --- | --- |
| A（已交付） | `json-to-types`、`url-parser`、`radix-case`、`chmod-calc`、`password-ssh`（密码生成） | 零新增依赖 |
| B（已交付） | `yaml-prop-json`、`yaml-validator`、`toml-validator` | `yaml` + `smol-toml` |
| **C（本文档）** | `password-ssh` 的 SSH Key 页签（公钥指纹解析）、`sql-formatter` | `sql-formatter` + `@noble/hashes` |

**落点**：

- `password-ssh` 工具里已有「密码生成 / SSH Key」两个页签，批次 A 交付了密码生成，SSH Key 页签当时留了占位文案。本批次把该页签替换为真实实现，**不新增工具入口**。
- `sql-formatter` 工具 id 已在 `src/types/tool.ts` 注册（分类 `format`），当前落到 `ToolPlaceholder`；本批次新建视图替换占位。

**批次 C 不做的事（明确排除）**：

- 不解析私钥（PEM / OpenSSH 私钥），不做签名验签。
- 不把 SSH 指纹拆成独立工具（页签结构批次 A 已定）。
- 不改动 Rust 端；`src-tauri/` 下任何文件均不改。
- 不改 `src/types/tool.ts`（`sql-formatter` 的既有定义文案无需调整）。
- 不做 SQL 语法校验/语义分析（只做格式化与压缩，非法 SQL 由库报错透出）。

---

## 2. 通用工程约定

### 2.1 目录与组件契约

沿用批次 A/B 的结构：

```
src/views/tools/<ToolName>/
  <ToolName>.vue           # 视图层：仅做状态绑定与渲染
  utils/*.ts               # 纯函数：全部可单测的业务逻辑
  __tests__/*.spec.ts      # Vitest 单测
```

- 组件 Props 契约与前面批次一致：
  ```ts
  defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()
  ```
- 业务逻辑一律放 `utils/`，视图内不写算法。
- 图标沿用侧栏现有的单字符徽章写法（`icon` 字段仅为元数据）。

### 2.2 注册方式

- `src/App.vue` 新增 `sql-formatter` 的异步组件声明与 `resolveBaseComponent` 分支，同时兼容 `sql-formatter` / `sql_formatter`。
- `password-ssh` 的注册与 `PasswordSsh.vue` 的入口不动，只替换页签内容。

### 2.3 快照持久化契约

- 回填：`props.initialSnapshot?.x ?? <默认值>`。
- 落库：`tabStore.updateTabSnapshot(props.tabId, {...})`，文本输入 250ms 防抖。
- 只持久化「输入内容 + 视图选项」，不持久化派生结果与错误信息。
- 存储位置不变：SQLite `tool_state_snapshots.snapshot_data_json`。

### 2.4 新增依赖

| 依赖 | 用途 | 约束 |
| --- | --- | --- |
| `sql-formatter` | SQL 多方言格式化 | 纯 JS，无原生模块 |
| `@noble/hashes` | 同步 SHA-256 与 MD5（SSH 指纹） | 纯 JS，无原生模块、无 postinstall 脚本 |

- 选择 `@noble/hashes` 而非浏览器内置 `crypto.subtle` + Rust IPC 的原因：`crypto.subtle.digest` 是异步的、且不提供 MD5；走 Rust IPC 会让「解析一个公钥」这种纯计算被迫异步并与后端耦合。用同步库后，解析与指纹全部是同步纯函数，单测不需要 mock 异步。
- 除这两个库外不新增任何依赖；实现时锁定实际解析到的稳定版本。
- MD5 仅用于**展示**兼容旧平台（`ssh-keygen -E md5`）的指纹，不用于任何安全判断。

### 2.5 错误处理与边界基线

- 非法输入不抛异常到 UI：统一用 `NAlert` 就地提示。
- 上一次有效结果保留：出错时输出区保持上一次成功的结果。
- 空输入：显示空态占位，不报错。
- 输入规模护栏：文本输入超过 1MB 时关闭自动派生，改为手动点击按钮。
- 所有解析/格式化调用包在 `try/catch` 内，库抛出的错误统一转换为 `{ message, line?, column? }` 后交给视图层渲染。
- 不新增 Worker、不引入 WebAssembly，全部在主线程同步计算。

### 2.6 测试口径

- 每个工具至少一个 `utils` 单测文件，覆盖正常路径、边界、错误分支。
- **SSH 指纹的断言基准是 OpenSSH 本身**：用固定公钥样本，把 `ssh-keygen -lf`（默认 SHA256）与 `ssh-keygen -lf -E md5` 的输出写死进单测。这样断言的是「与 OpenSSH 一致」，而不是「与我们自己的实现自洽」。
- 每完成一个工具：`npm test` 与 `npm run build` 必须通过。

### 2.7 复用点

| 能力 | 复用来源 |
| --- | --- |
| 代码编辑器 | `codemirror`（批次 A/B 的初始化写法） |
| 快捷键 / 平台文案 | `src/utils/platform.ts` |
| UI 组件与主题 | Naive UI（`NAlert`/`NButton`/`NInput`/`NRadioGroup`/`NRadioButton`/`NSelect`/`NTag`/`useMessage`）+ Tailwind |
| 快照 | `tabStore.updateTabSnapshot` |

---

## 3. `password-ssh` 的 SSH Key 页签：公钥解析与指纹

### 3.1 目标

粘贴一个或多个 OpenSSH 公钥，解析出密钥类型、位数/曲线与 SHA256、MD5 指纹，便于与 `ssh-keygen`、云厂商控制台或代码托管平台展示的指纹核对。

### 3.2 输入与逐行解析

- 输入为多行文本（CodeMirror，带行号），每行一个公钥，兼容 `authorized_keys` 形态。
- 忽略空行与以 `#` 开头的注释行。
- 单行结构：`[options] <keytype> <base64 blob> [comment]`。
  - `options` 前缀（如 `command="…"`、`no-port-forwarding`、`from="…"`）允许存在，解析时跳过；「整行复制」保留原始整行。
  - `<base64 blob>` 是 SSH wire format 的密钥材料；`comment` 为可选尾部注释。
- **类型与参数从 blob 解析**（长度前缀字符串序列），不靠字符串猜测：

| 密钥类型 | 解析出的信息 |
| --- | --- |
| `ssh-rsa` | RSA 位数 = 模数 `n` 去掉前导零字节后的字节数 × 8 |
| `ssh-ed25519` | 显示为 `ED25519`，不显示位数（与 `ssh-keygen` 一致） |
| `ecdsa-sha2-nistp256` / `nistp384` / `nistp521` | 曲线名 + 对应位数 |
| `sk-ssh-ed25519@openssh.com` | `ED25519-SK`（FIDO 硬件密钥） |
| `sk-ecdsa-sha2-nistp256@openssh.com` | `ECDSA-SK`（FIDO 硬件密钥） |
| 其它 | 该行报「不支持的密钥类型 X」 |

### 3.3 指纹

对 blob 的**原始字节**计算，格式与 `ssh-keygen -l` 一致：

- `SHA256:` + base64(SHA-256(blob))，**去掉 `=` 填充**。
- `MD5:` + 16 组小写十六进制、以 `:` 分隔。

### 3.4 逐行隔离错误

- 某行非法只标记该行，其余行照常解析并渲染。
- 非法行在提示区汇总为「第 N 行：原因」，同时在结果列表中把该行标红。
- 不做整体失败，不清空其它行的结果。

### 3.5 输出

- 每个密钥一项，含：密钥类型、位数/曲线、SHA256 指纹、MD5 指纹、注释，以及「复制指纹」与「复制整行」两个按钮。
- 空输入显示空态。

### 3.6 文件与接口

- `src/views/tools/PasswordSsh/utils/sshKey.ts`
  - `interface ParsedPublicKey { line: number; type: string; bits?: number; curve?: string; comment: string; rawLine: string; sha256: string; md5: string }`
  - `interface SshParseIssue { line: number; message: string }`
  - `interface SshParseResult { keys: ParsedPublicKey[]; issues: SshParseIssue[] }`
  - `parsePublicKeys(text: string): SshParseResult`
  - `fingerprintSha256(blob: Uint8Array): string`
  - `fingerprintMd5(blob: Uint8Array): string`

  - 说明：`type` 保存 blob 里的原始类型串（如 `ssh-ed25519`、`sk-ecdsa-sha2-nistp256@openssh.com`）；视图层负责把它渲染成友好标签（`ED25519` / `ED25519-SK` / `ECDSA-SK` 等），展示优先级为 `curve` → `bits` → 仅标签。

### 3.7 快照字段

```ts
{ sshInput: string }
```

（与同工具内密码生成部分的快照字段并列，互不影响。）

### 3.8 测试要点

- 四类样本各一条：RSA、ECDSA、ED25519、SK。
- 指纹与 `ssh-keygen` 输出逐字符一致（SHA256 与 MD5 各一条断言）。
- RSA 位数按实际模数计算（用 2048/4096 样本各验证一次）。
- `options` 前缀行能被正确解析且 `rawLine` 保留原样。
- `#` 注释行与空行被忽略。
- 混合输入（合法 + 非法）时，合法行照常输出、非法行只报自己的行号。
- 空输入返回空结果且不报错。

---

## 4. `sql-formatter`：SQL 格式化与压缩

### 4.1 目标

多方言 SQL 美化与单行压缩，附带关键字大小写控制。

### 4.2 布局与交互

- 顶部：方言下拉（标准 SQL / MySQL / PostgreSQL / SQLite / SQL Server / Oracle）、关键字大小写（大写 / 小写 / 保持原样）、模式切换（格式化 / 压缩）。
- 左侧：SQL 输入（CodeMirror）。
- 右侧：只读输出 + 复制按钮。
- 250ms 防抖自动派生；输入超过 1MB 时关闭自动派生，改为手动点击按钮。
- 出错时 `NAlert` 显示原因并保留上一次有效输出；空输入显示空态。

### 4.3 格式化规则

- 交给 `sql-formatter`，参数 `{ language, keywordCase, tabWidth: 2 }`。
- 方言映射：标准 SQL → `sql`、MySQL → `mysql`、PostgreSQL → `postgresql`、SQLite → `sqlite`、SQL Server → `transactsql`、Oracle → `plsql`。
- 关键字大小写映射到库的 `keywordCase`（`upper` / `lower` / `preserve`）。
- 库抛错时把错误信息原样透出（不吞异常、不改写文案）。

### 4.4 压缩规则（自写状态机）

`sqlMinify(text)` 从左到右扫描，规则：

- **原样保留**字符串字面量与引用标识符：`'…'`、`"…"`、`` `…` ``，以及 PostgreSQL 的 `$$…$$` 与 `$tag$…$tag$` 美元引用（内部空白与注释字符一律不动）。
- **剥离注释**：`-- …` 行注释与 `/* … */` 块注释。
  - `--` 必须**后接空白或行尾**才算注释（MySQL 规则），避免把 `a--b` 这类表达式误伤。
- **`/*! … */` 原样保留**：那是 MySQL 的可执行版本注释，剥掉会改变语义。
- 其余位置的连续空白折叠为单个空格，结果首尾 trim。

### 4.5 文件与接口

- `src/views/tools/SqlFormatter/utils/sqlFormat.ts`
  - `type SqlDialect = 'sql' | 'mysql' | 'postgresql' | 'sqlite' | 'transactsql' | 'plsql'`
  - `type KeywordCase = 'upper' | 'lower' | 'preserve'`
  - `formatSql(text: string, dialect: SqlDialect, keywordCase: KeywordCase): { output: string; error?: string }`
- `src/views/tools/SqlFormatter/utils/sqlMinify.ts`
  - `minifySql(text: string): string`

### 4.6 快照字段

```ts
{ input: string, dialect: SqlDialect, keywordCase: KeywordCase, mode: 'format' | 'minify' }
```

### 4.7 测试要点

- 六种方言各一条样本，断言输出与库的预期一致。
- 关键字大写 / 小写 / 保持三档各一条断言。
- 非法 SQL 返回 `error` 且不产出内容。
- 压缩器专测四类易误伤场景：`'-- 不是注释'`（字符串内）、`a--b`（无空白的双减号）、`$$ … -- … $$`（美元引用内）、`/*!40000 … */`（版本注释必须保留）。
- 压缩器正例：`-- 真注释` 与 `/* 块注释 */` 被剥离；多行 SQL 压成单行且空白折叠正确。
- 空输入返回空结果且不报错。

---

## 5. 交付顺序与验收标准

**建议顺序**：先 SSH 页签（`utils/sshKey.ts` → 视图页签），再 `sql-formatter`（`utils/sqlMinify.ts` → `utils/sqlFormat.ts` → 视图）。

每个工具的循环：先写 `utils` 单测（TDD）→ 实现 `utils` → 视图绑定 → `npm test` / `npm run build`。

**验收清单**：

1. `password-ssh` 的 SSH Key 页签是真实实现，不再显示占位文案；`sql-formatter` 不再是 `ToolPlaceholder` 占位页。
2. SSH 指纹与 `ssh-keygen -lf`（SHA256）及 `ssh-keygen -lf -E md5` 的输出逐字符一致。
3. 混合输入下，非法行只报自己的行号，合法行结果不受影响。
4. SQL 压缩器不破坏字符串字面量、美元引用与 `/*! */` 版本注释。
5. 两个工具的输入与视图选项在关闭 Tab 或触发 LRU 卸载后重开能够还原。
6. `npm test`、`npm run build` 全绿；`cargo clippy --all-targets -- -D warnings` 与 `cargo test --manifest-path src-tauri/Cargo.toml` 保持通过（批次 C 不涉及 Rust 改动）。
7. 新增依赖仅 `sql-formatter` 与 `@noble/hashes` 两个；`src-tauri/` 与 `src/types/tool.ts` 零改动。

---

## 6. 后续衔接

- 第二阶段（P0 开发者高频工具）在本批次后全部交付完毕。
- 第三期（P1）工具（WebSocket 调试、JWT 解析、图片与 Base64、Markdown 预览等）各自走完整的「设计 → 计划 → 实现」循环。
- **Excel / CSV 文本转 JSON 与多方言 SQL（总设计 `p3_3`）已明确归入第三期**：本批次不做，`src/types/tool.ts` 也无需为它新增注册项。
- 本批次引入的 `@noble/hashes` 可在第三期需要哈希/摘要的能力中复用。

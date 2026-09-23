# 第二阶段批次 B 设计规范：YAML / Properties / TOML 工具集

**文档版本**：v1.0
**更新日期**：2026-09-23
**适用范围**：DevUtils 第二阶段（P0 开发者高频工具）之批次 B
**分支**：`feat/phase1-mvp`
**前置文档**：`docs/superpowers/specs/2026-09-22-developer-toolbox-design.md`（总设计）、`docs/superpowers/specs/2026-09-23-phase2-batch-a-design.md`（批次 A 设计规范）、`docs/superpowers/plans/2026-09-23-phase2-batch-a-developer-tools.md`（批次 A 实施计划）

---

## 1. 背景与批次拆分

第二阶段共 7 项工具，按「新增依赖」维度拆成三批。批次 A 已交付 5 个零依赖工具；批次 B 负责需要 YAML / TOML 解析能力的两项：

| 批次 | 内容 | 依赖特征 |
| --- | --- | --- |
| A（已交付） | `json-to-types`、`url-parser`、`radix-case`、`chmod-calc`、`password-ssh`（密码生成） | 零新增依赖，纯前端计算 |
| **B（本文档）** | `yaml-prop-json`（三向互转）、`yaml-validator`、`toml-validator` | 需 YAML / TOML 解析库 |
| C | SSH Key 指纹解析、`sql-formatter` | 需成熟第三方库 |

**批次 B 不做的事（明确排除）**：

- 不做 SSH Key 指纹解析与 SQL 格式化（归批次 C）。
- 不做 YAML / TOML 与 JSON 的互转（本文档只做「校验 + 格式化」，互转仅在 YAML ↔ Properties ↔ JSON 三向里做）。
- 不做 YAML 多文档编辑与合并（只解析首文档）。
- 不改动 Rust 端；`src-tauri/` 下任何文件均不改。
- 除新增两个校验器注册项外，不动 `src/types/tool.ts` 既有工具定义。

---

## 2. 通用工程约定

### 2.1 目录与组件契约

沿用批次 A 的结构，不引入新范式：

```
src/views/tools/<ToolName>/
  <ToolName>.vue           # 视图层：仅做状态绑定与渲染
  utils/*.ts               # 纯函数：全部可单测的业务逻辑
  __tests__/*.spec.ts      # Vitest 单测
```

- 组件 Props 契约与批次 A 完全一致：
  ```ts
  defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()
  ```
- 业务逻辑一律放 `utils/`，视图内不写算法，保证单测不依赖 DOM。
- 图标沿用侧栏现有的单字符徽章写法（`src/types/tool.ts` 的 `icon` 字段当前未被视图消费，仅作为元数据填写）。

### 2.2 注册方式

`src/App.vue`：

- 新增 2 个 `defineAsyncComponent(() => import('@/views/tools/<ToolName>/<ToolName>.vue'))`，保持代码分割。
- `resolveBaseComponent` 增加分支，同时兼容连字符与下划线两种 id：
  - `yaml-prop-json` / `yaml_prop_json`（本批次开始实现，注册项批次 A 已存在）
  - `yaml-validator` / `yaml_validator`
  - `toml-validator` / `toml_validator`

`src/types/tool.ts`：新增 `yaml-validator` 与 `toml-validator` 两个工具定义（`category: 'format'`，`keywords` 覆盖中英文检索词）。`yaml-prop-json` 的定义已存在，不改动。

### 2.3 快照持久化契约

- 回填：所有状态初值统一走 `props.initialSnapshot?.x ?? <默认值>`。
- 落库：状态变更时调用 `tabStore.updateTabSnapshot(props.tabId, {...})`，文本类输入做 250ms 防抖。
- 只持久化「输入内容 + 视图选项」，不持久化纯派生的结果与错误信息。
- 存储位置不变：SQLite `tool_state_snapshots.snapshot_data_json`。

### 2.4 新增依赖

| 依赖 | 用途 | 约束 |
| --- | --- | --- |
| `yaml` | YAML 解析 / 序列化 / 错误行列定位 | 纯 JS，无原生模块、无 postinstall 脚本 |
| `smol-toml` | TOML 解析 / 序列化 / 错误行列定位 | 同上 |

- 两个库都只在浏览器端使用，不进入 Rust 侧。
- 实现时锁定实际解析到的稳定版本并写入 `package.json` 与 lock 文件；安装属实现阶段的一次性联网动作。
- 除这两个库外不新增任何依赖。Properties 解析**不引库**（见 3.3，点分键与数组语法是本工具的业务逻辑，手写解析器约 100 行且完全可单测）。

### 2.5 错误处理与边界基线（3 个工具共同遵守）

- 非法输入不抛异常到 UI：统一用 `NAlert`（`type="error"` / `"warning"`）在输入区下方就地提示。
- 上一次有效结果保留：输入非法时输出区保持上一次成功的结果，不闪空、不白屏。
- 空输入：输出区显示空态占位，不报错。
- 输入规模护栏：`yaml-prop-json` 的实时派生在输入超过 1MB 时关闭，改为手动点击按钮；两个校验器本就是手动触发，不受此限制。
- 不新增 Worker、不引入 WebAssembly，全部在主线程同步计算。
- 所有解析调用包在 `try/catch` 内，库抛出的错误统一转换为 `{ message, line?, column? }` 结构后再交给视图层渲染。

### 2.6 测试口径

- 每个工具至少一个 `utils` 单测文件，覆盖：正常路径、边界（空值 / 深层嵌套 / 超长 / 特殊字符）、错误分支（非法语法 / 键冲突 / 非常规 tag）。
- 互转工具采用「固定输入 → 精确输出比对」；校验器断言「错误类型 + 行列号」。
- 每完成一个工具：`npm test` 与 `npm run build` 必须通过。

### 2.7 复用点

| 能力 | 复用来源 |
| --- | --- |
| 大整数无损 JSON 解析 | `src/views/tools/JsonSuite/utils/losslessJson.ts` 的 `LosslessJSON`（`useNativeBigInt: true`） |
| 代码编辑器 | `codemirror` + `@codemirror/lang-json`（批次 A `JsonToTypes.vue` 的初始化写法） |
| 快捷键 / 平台文案 | `src/utils/platform.ts` |
| UI 组件与主题 | Naive UI（`NAlert`/`NButton`/`NInput`/`NRadioGroup`/`NRadioButton`/`NSwitch`/`NTag`/`useMessage`）+ Tailwind |
| 快照 | `tabStore.updateTabSnapshot` |

---

## 3. `yaml-prop-json`：YAML / Properties / JSON 三向互转

### 3.1 目标

三栏实时联动，任意一栏编辑后其余两栏自动派生，覆盖 JSON ↔ YAML ↔ Properties 三条转换路径。

### 3.2 布局与交互

- 顶部：格式说明与「重置」按钮。
- 主体：三栏并排（JSON / YAML / Properties），每栏独立 CodeMirror 输入区 + 复制按钮。
- 每栏顶部标注格式名；错误与警告统一显示在顶部提示区。
- 输入超过 1MB 时关闭自动派生，改为手动点击「转换」按钮触发（沿用批次 A `json-to-types` 的手动模式）。

**编辑真源规则（避免三向循环）**：

- 用户在哪一栏输入，哪一栏即成为当前真源，其余两栏在 250ms 防抖后派生重写。
- 派生重写不触发新的编辑事件（用标志位抑制），保证不会出现 A 改写 B、B 又改写 A 的回环。
- 切换真源时先做全量重算，再进入防抖派生。

### 3.3 Properties 解析与生成（手写，不引库）

**解析（文本 → 对象）**：

- 行分隔：`\r?\n`；忽略空行。
- 注释：以 `#` 或 `!` 开头的行整行忽略（转换时丢弃，并在提示区说明丢弃了几行注释）。
- 键值分隔：第一个未被转义的 `=` 或 `:`；两者都不存在时按「无值」处理（值取空字符串）。
- 键转义：`\.` 表示字面点号，`\\` 表示字面反斜杠。
- 点分键展开：`a.b.c=v` → `{ a: { b: { c: 'v' } } }`。
- 数组段：`servers[0].url=v` 与 `servers.0.url=v` 两种写法都识别为数组元素；`[n]` 与纯数字段等价。
- 键冲突（同一路径既出现标量又出现子键，如 `a=1` 与 `a.b=2`）→ 报错并保留上一次有效结果。
- 值一律按字符串处理，**不做类型推断**（`true` / `123` 仍是字符串）。这是刻意的设计决策：Properties 本身无类型，推断会破坏「无损双向转换」的承诺。

**生成（对象 → 文本）**：

- 嵌套对象压平为点分键；数组统一输出中括号风格 `servers[0].url=v`。
- 输出顺序与对象键顺序一致，数组按索引升序。
- 值中的特殊字符按 Java Properties 约定转义（`\n`、`\t`、`\r`、`=`、`:`、`#`、`!`）。

### 3.4 YAML ↔ JSON 转换

- 解析使用 `yaml` 库，开启 `intAsBigInt: true` 保证大整数无损。
- JSON 侧复用 `LosslessJSON`，超安全整数以 `bigint` 形式流转，绝不经过 `Number`。

**宽松模式规则（用户已确认采用宽松取向）**：

| 输入内容 | 处理方式 |
| --- | --- |
| 日期 / 时间戳（库解析为 `Date`） | 转 ISO 8601 字符串，并在提示区给出 warning |
| 锚点与引用（`&a` / `*a`） | 就地展开为独立副本，不保留引用关系 |
| 多文档（含 `---`） | 只取第一个文档，并给出 warning |
| `!!binary` 等非常规 tag | 报错并保留上一次有效结果 |
| 未知自定义 tag | 报错并给出行列定位 |

- YAML 侧解析出的超出 JS 安全整数范围的整数：在 JSON 输出中以**字符串**呈现，并在提示区标注被转换的键路径（JSON 无法承载注释，故用界面提示代替注释）。

### 3.5 文件与接口

- `utils/properties.ts`
  - `parseProperties(text: string): { value: unknown; error?: string; warnings: string[] }`
  - `stringifyProperties(value: unknown): string`
- `utils/yamlConvert.ts`
  - `parseYaml(text: string): { value: unknown; error?: string; line?: number; column?: number; warnings: string[] }`
  - `stringifyYaml(value: unknown): string`
- `utils/jsonConvert.ts`
  - `parseJson(text: string): { value: unknown; error?: string; warnings: string[] }`
  - `stringifyJson(value: unknown): string`
- `utils/convert.ts`
  - `type SourceFormat = 'json' | 'yaml' | 'properties'`
  - `convertFrom(source: SourceFormat, text: string): { json: string; yaml: string; properties: string; error?: string; warnings: string[] }`

### 3.6 快照字段

```ts
{
  source: 'json' | 'yaml' | 'properties',   // 当前真源，默认 'json'
  json: string,
  yaml: string,
  properties: string
}
```

### 3.7 测试要点

- Properties：点分键展开、两种数组写法、`\.` 转义、无等号键、注释丢弃计数、键冲突报错、往返无损。
- YAML：日期转 ISO + warning、锚点展开、多文档取首个 + warning、`!!binary` 报错、超限整数转字符串 + 提示、非法语法行列定位。
- JSON：非法语法报错、大整数无损往返。
- 三向：固定输入下三条路径的精确输出比对；空输入返回空态。

---

## 4. `yaml-validator`：YAML 语法校验器

### 4.1 目标

粘贴 YAML，校验语法并给出精确的行列错误定位；通过时输出格式化或压缩后的 YAML。

### 4.2 布局与交互

- 顶部：标题 + 输出模式切换（格式化 / 压缩）+ 「校验」按钮 + 复制按钮。
- 左侧：YAML 输入（CodeMirror，带行号）。
- 右侧：输出区（只读）+ 校验结果。
- 触发方式：显式「校验」按钮（校验器不做实时推导，避免大文本抖动；因此无需 1MB 自动降级逻辑）。
- 校验通过：显示规范化输出；校验失败：`NAlert` 显示「第 N 行第 M 列：错误原因」，并保留上一次有效输出。

### 4.3 校验与格式化规则

- 解析用 `yaml` 库；错误对象的行列信息从库提供的 `linePos` 读取（实现时以库实际字段为准，若缺失则回退解析错误消息）。
- 格式化：统一 2 空格缩进、移除多余空行与行尾空白。
- 压缩：使用 flow 风格序列化输出单行文本（实现时以库的 flow / collectionStyle 选项为准）。
- 多文档输入：与 `yaml-prop-json` 保持一致，只取首文档并给出 warning。
- 不做语义校验（不校验业务字段、不校验 JSON Schema）。

### 4.4 文件与接口

- `utils/yamlValidator.ts`
  - `validateYaml(text: string): { valid: boolean; error?: string; line?: number; column?: number; warnings: string[] }`
  - `formatYaml(text: string, mode: 'pretty' | 'compact'): { output: string; error?: string; line?: number; column?: number }`

### 4.5 快照字段

```ts
{ input: string, mode: 'pretty' | 'compact' }
```

### 4.6 测试要点

- 合法 YAML：通过校验并输出稳定格式化结果。
- 非法 YAML：断言错误类型与行列号（如缩进错误、重复键、非法 tag）。
- 空输入：空态、不报错。
- 压缩模式：flow 风格单行输出。
- 多文档：取首个 + warning。

---

## 5. `toml-validator`：TOML 语法校验器

### 5.1 目标

粘贴 TOML，校验语法并给出精确的行列错误定位；通过时输出规范化 TOML。

### 5.2 布局与交互

与 `yaml-validator` 对齐：顶部「校验」按钮 + 复制按钮；左侧输入（CodeMirror，带行号）；右侧只读输出。TOML 只有一种规范化输出风格，因此不提供模式切换。校验失败时 `NAlert` 显示「第 N 行第 M 列：错误原因」并保留上次有效输出。

### 5.3 校验与格式化规则

- 解析用 `smol-toml` 的 `parse`，序列化用 `stringify`。
- 错误行列信息从库抛出的错误对象读取（实现时以库实际字段为准）。
- 格式化：`stringify(parse(text))` 输出规范化 TOML。
- 不做语义校验。

### 5.4 文件与接口

- `utils/tomlValidator.ts`
  - `validateToml(text: string): { valid: boolean; error?: string; line?: number; column?: number }`
  - `formatToml(text: string): { output: string; error?: string; line?: number; column?: number }`

### 5.5 快照字段

```ts
{ input: string }
```

### 5.6 测试要点

- 合法 TOML：通过校验并输出稳定格式化结果。
- 非法 TOML：断言错误类型与行列号（重复键、未闭合字符串、非法表头）。
- 空输入：空态、不报错。
- 边界：内联表、数组表 `[[x]]`、日期时间字面量。

---

## 6. 交付顺序与验收标准

**建议顺序**：`yaml-prop-json`（先 `utils/properties.ts`，再 `utils/yamlConvert.ts` / `jsonConvert.ts` / `convert.ts`，最后视图）→ `yaml-validator` → `toml-validator`。

每个工具的循环：先写 `utils` 单测（TDD）→ 实现 `utils` → 视图绑定 → `npm test` / `npm run build`。

**验收清单**：

1. 侧栏点击 3 个工具均打开真实实现，`yaml-prop-json` 不再是 `ToolPlaceholder` 占位页。
2. `yaml-prop-json`：任意一栏编辑后其余两栏正确派生，无循环改写；Properties 点分键与两种数组写法均正确往返。
3. `yaml-validator` / `toml-validator`：非法输入给出准确行列定位；合法输入输出稳定格式化结果。
4. 每个工具的输入与视图选项在关闭 Tab 或触发 LRU 卸载后重开能够还原。
5. 非法输入全部走界面提示，无控制台未捕获异常，无白屏。
6. `npm test`、`npm run build` 全绿；`cargo clippy --all-targets -- -D warnings` 与 `cargo test --manifest-path src-tauri/Cargo.toml` 保持通过（批次 B 不涉及 Rust 改动）。
7. 新增依赖仅 `yaml` 与 `smol-toml` 两个，`package.json` 与 lock 文件的其余部分无变动。

---

## 7. 后续批次衔接

- 批次 C 补齐 `password-ssh` 的 SSH Key 指纹页签与 `sql-formatter`，引入相应成熟库，单独走完整「设计 → 计划 → 实现」循环。
- 本批次新增的 `yaml` 依赖可在批次 C 及第三期（如 YAML 与 JSON 互转扩展）中复用，届时无需再评估。

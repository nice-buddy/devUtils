# 第二阶段批次 A 设计规范：零依赖纯前端工具集

**文档版本**：v1.0  
**更新日期**：2026-09-23  
**适用范围**：DevUtils 第二阶段（P0 开发者高频工具）之批次 A  
**分支**：`feat/phase1-mvp`  
**前置文档**：`docs/superpowers/specs/2026-09-22-developer-toolbox-design.md`（总设计）、`docs/superpowers/plans/2026-09-22-phase1-mvp-developer-toolbox.md`（第一期实施计划）

---

## 1. 背景与批次拆分

第二阶段共 7 项工具，按「新增依赖」维度拆成三批，每批独立走「设计 → 计划 → 实现」循环：

| 批次 | 内容 | 依赖特征 |
| --- | --- | --- |
| **A（本文档）** | `json-to-types`、`url-parser`、`radix-case`、`chmod-calc`、`password-ssh`（仅密码生成） | 零新增依赖，纯前端计算 |
| B | `yaml-prop-json`、YAML / TOML 校验器 | 需 YAML / TOML 解析库 |
| C | SSH Key 指纹解析、`sql-formatter` | 需成熟第三方库 |

批次 A 的 5 个工具在 `src/types/tool.ts` 中**已完成注册**，当前均落到 `ToolPlaceholder` 占位页；本批次负责用真实实现替换占位。

**批次 A 不做的事（明确排除）**：

- 不做 YAML / Properties / TOML / SQL 相关能力（归批次 B、C）。
- 不做 SSH Key 指纹解析（归批次 C，本批次仅保留页签占位）。
- 不做 JSON 多份样本合并 UI（仅单文档 + 数组全量元素合并）。
- 不新增任何 npm 依赖、不改动 Rust 端、不动 `src/types/tool.ts` 的工具文案与分类。

---

## 2. 通用工程约定

### 2.1 目录与组件契约

```
src/views/tools/<ToolName>/
  <ToolName>.vue           # 视图层：仅做状态绑定与渲染
  utils/*.ts               # 纯函数：全部可单测的业务逻辑
  __tests__/*.spec.ts      # Vitest 单测
```

- 组件 Props 契约与第一期完全一致：
  ```ts
  defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()
  ```
- 业务逻辑一律放 `utils/`，视图内不写算法，保证单测不依赖 DOM。
- 图标沿用现有视图的内联 SVG 写法，不引入图标库。

### 2.2 注册方式

`src/App.vue`：

- 新增 5 个 `defineAsyncComponent(() => import('@/views/tools/<ToolName>/<ToolName>.vue'))`，保持代码分割，不影响冷启动指标。
- `resolveBaseComponent` 增加分支，并同时兼容连字符与下划线两种 id 写法（沿用 `json-suite` / `json_suite` 的既有约定）：
  - `json-to-types` / `json_to_types`
  - `url-parser` / `url_parser`
  - `radix-case` / `radix_case`
  - `chmod-calc` / `chmod_calc`
  - `password-ssh` / `password_ssh`

### 2.3 快照持久化契约

- 回填：所有状态初值统一走 `props.initialSnapshot?.x ?? <默认值>`。
- 落库：状态变更时调用 `tabStore.updateTabSnapshot(props.tabId, {...})`，即第一期 `JsonSuite.vue` / `DiffViewer.vue` 的 `saveSnapshot()` 模式；文本类输入做防抖（250ms 量级）。
- 存储位置不变：SQLite `tool_state_snapshots.snapshot_data_json`，随 Tab 关闭 / LRU 卸载 / 应用退出自动持久化，重开 Tab 时回填。
- 敏感开关不走防抖：普通文本输入走防抖，但关闭「持久化生成结果」这类敏感开关时必须绕过防抖立即写库，否则用户在防抖窗口内切走 Tab 或退出应用会留下冗余明文。
- 只持久化「输入内容 + 视图选项」，不持久化纯派生的计算结果与错误信息。

### 2.4 复用点

| 能力 | 复用来源 |
| --- | --- |
| 大整数无损 JSON 解析 | `src/views/tools/JsonSuite/utils/losslessJson.ts` 的 `LosslessJSON`（`json-bigint` + `useNativeBigInt`） |
| 快捷键 / 平台文案 | `src/utils/platform.ts`（`shortcutLabel` / `altShortcutLabel`） |
| UI 组件与主题 | Naive UI（`NRadioGroup`/`NRadioButton`/`NInput`/`NSwitch`/`NButton`/`NAlert`/`NTable`/`NSelect`/`NSlider`/`NTag`/`useMessage`）+ Tailwind 原子类 |
| 平台判定 | 沿用 `src/utils/platform.ts` 的 `isMacOS` |

### 2.5 错误处理与边界基线（5 个工具共同遵守）

- 非法输入不抛异常到 UI：统一用 `NAlert`（`type="error"` / `"warning"`）在输入区下方就地提示。
- 上一次有效结果保留：输入非法时输出区保持上一次成功的结果，不闪空、不白屏。
- 空输入：输出区显示空态占位，不报错。
- 输入规模护栏：文本输入超过 1MB 时关闭实时推导，改为手动触发（按钮），避免主线程卡顿。
- 不新增 Worker、不引入 WebAssembly，全部在主线程同步计算。

### 2.6 测试口径

- 每个工具至少一个 `utils` 单测文件，覆盖：正常路径、边界（空值 / 极端长度 / 特殊字符）、错误分支（非法输入必须给出预期错误）。
- 生成器类工具（`json-to-types`）采用「固定输入 → 精确字符串比对」的快照式断言。
- 不追求覆盖率数字，目标是错误分支与边界分支均有断言，沿用第一期 `__tests__` 风格。
- 每完成一个工具：`npm test` 与 `npm run build` 必须通过。

---

## 3. `json-to-types`：JSON 转强类型结构体

### 3.1 目标

输入一段 JSON，推导数据结构并生成 TypeScript / Go / Java / Rust 四种语言的强类型声明。

### 3.2 布局与交互

- 顶部：语言单选（`NRadioGroup` + `NRadioButton`，TS / Go / Java / Rust，默认 TS）、根类型名输入（默认 `RootObject`）。
- 左侧：JSON 输入（CodeMirror，复用 `@codemirror/lang-json` 与第一期编辑器初始化写法）。
- 右侧：只读代码输出区 + 复制按钮（复制成功走 `useMessage()` 提示）。
- 300ms 防抖实时推导；输入超过 1MB 时显示提示并改为手动点击「生成」。

### 3.3 类型推导模型（定稿）

- 单文档输入；根节点为对象或数组。
- 数组**全量**扫描所有元素并合并类型，只看首元素是明确禁止的行为。
- 对象合并：所有出现过的 key 取并集；某个对象元素缺该 key → 该字段标记为**可选**。
- 类型冲突 → 联合类型；其中 `integer ∪ number` 收敛为 `number`（避免产出 `int64 | float64` 这种无意义联合）。
- `null` 不单独成类型：字段值出现过 `null` 时按「可为空」处理（可选 + 注释）。
- 大整数判定：第一期 `LosslessJSON` 配置为 `useNativeBigInt: true`，超出 `Number.MAX_SAFE_INTEGER` 的整数字面量解析后是原生 `bigint`。推导引擎必须以 `typeof value === 'bigint'` 识别，禁止写成 `typeof value === 'number' && value > Number.MAX_SAFE_INTEGER`（那条分支在本配置下永远命中不了，会静默漏掉全部雪花 ID）。
- 大整数映射按目标语言分流（生成代码必须能被真实反序列化）：
  - TypeScript：推导为 `string`（TS 没有 64 位整型），附注释「原值超出 JS 安全整数范围，已按字符串处理」。
  - Go / Rust / Java：值落在 `int64` 范围（-2^63 ~ 2^63-1）时分别推导为 `int64` / `i64` / `Long`，超出该范围时回退为 `string` / `String` 并附同样的注释。把 19 位雪花 ID 一律硬写成字符串，会让这三个语言的结构体在反序列化原始数值 JSON 时直接报类型不匹配。
  - 该分流只影响**生成代码的类型标注**，不影响工具内部「不经过 Number、全程无损」的总原则。
- 空数组 / 空对象 → `any` / `interface{}` / `Object` / `Value`，并给出提示。
- 根为标量或标量数组：TS / Go / Rust 输出类型别名；Java 不支持类型别名，输出包装类并在注释中说明。

各语言映射表：

| IR | TypeScript | Go | Java | Rust |
| --- | --- | --- | --- | --- |
| string | `string` | `string` | `String` | `String` |
| 整数（≤ 安全整数） | `number` | `int64` | `Long` | `i64` |
| 小数 / 非整数 | `number` | `float64` | `Double` | `f64` |
| 超大整数（超安全整数但在 int64 内） | `string` | `int64` | `Long` | `i64` |
| 超大整数（超出 int64 范围） | `string` | `string` | `String` | `String` |
| boolean | `boolean` | `bool` | `Boolean` | `bool` |
| null | 可选 + 注释 | 指针 + `omitempty` | `@Nullable` | `Option<T>` |
| 缺 key | `key?:` | `*T` + `json:"key,omitempty"` | `@Nullable` | `Option<T>` |
| 联合 | `A \| B` | `interface{}` | `Object` | `serde_json::Value` |
| 空数组/对象 | `any` | `interface{}` | `Object` | `serde_json::Value` |
| 嵌套对象 | 独立 `interface` | 独立 `struct` | `static class` | 独立 `struct` |

命名规则：

- TypeScript：`export interface <RootName>`，非法标识符的 key 用引号包裹。
- Go：字段名首字母大写，并用 `json:"<原 key>"` 保留原始 key；输出 `type <RootName> struct`。
- Java：`public class <RootName>`，字段私有 + `@Nullable` 标注，嵌套对象生成为 `public static class`。
- Rust：字段名转 `snake_case`，用 `#[serde(rename = "<原 key>")]` 保留原始 key；结构体加 `#[derive(Serialize, Deserialize)]`。
- 嵌套类型命名：`<父类型名><字段名 Pascal>`，输出顺序为被引用类型在前、父类型在后。
- 根为对象数组（`[{...}, {...}]`）：元素结构体固定命名为 `<RootName>Item`，根类型按语言关联：TS `export type <RootName> = <RootName>Item[]`、Go `type <RootName> []<RootName>Item`、Rust `pub type <RootName> = Vec<<RootName>Item>;`；Java 无类型别名，输出包装类 `public class <RootName> { public List<<RootName>Item> items; }` 并在注释里说明。
- 名称唯一化：生成器维护类型名注册表，同名时（如 `root.a.b` 与 `root.ab` 归一后撞名）追加数字后缀直到唯一，保证不会输出重复类型声明而编译失败。不做结构等价去重：不同路径下形状相同的对象各自生成独立类型，避免隐性共享带来的歧义。
- 保留字转义：字段名命中目标语言保留字时加下划线后缀，并用注解保留原始 key：
  - Rust：`type_` + `#[serde(rename = "type")]`（不用 `r#` 前缀，因为 `self` / `crate` 这类关键字无法靠前缀转义）。
  - Java：`class_` + `@JsonProperty("class")`。
  - Go：字段名首字母大写本身就避开了全部 Go 关键字（Go 关键字全为小写），用 `json` tag 保留原名即可。
  - TypeScript：属性名加引号包裹即可，无需额外转义。
- 缩进：TS / Java / Rust 用 2 空格，Go 用 tab。
- Java 输出完整性：头部带上 `import java.util.List;` 与 `import com.fasterxml.jackson.annotation.JsonProperty;`，`@Nullable` 采用 `org.jetbrains.annotations.Nullable` 并在文件头注释里说明可替换为其它注解，保证生成的代码拿过去能编译。

### 3.4 文件与接口

- `utils/typeInfer.ts`
  - `inferType(value: unknown): TypeNode`（基于 `LosslessJSON.parse` 的结果）
  - `TypeNode`：`{ kind: 'primitive' | 'array' | 'object' | 'union'; ... }`，`object` 节点持有 `fields: { key, type, optional, note? }[]`；`primitive.name` 取 `string | integer | number | boolean`，`integer` 额外带 `big?: boolean` 标记（区分安全整数与超大整数，供各语言在生成阶段分流）
- `utils/generators/typescript.ts` / `go.ts` / `java.ts` / `rust.ts`：`generate(root: TypeNode, rootName: string): string`
- `utils/generators/index.ts`：`generators: Record<Language, (root, rootName) => string>`
- `utils/generators/naming.ts`：各语言保留字表、`escapeIdentifier(lang, key)`、`uniqueTypeName(registry, name)`

### 3.5 快照字段

```ts
{ raw: string, language: 'ts' | 'go' | 'java' | 'rust', rootName: string }
```

### 3.6 测试要点

字段全量合并、缺 key → 可选、类型冲突 → 联合、`null` 混入、空数组、空对象、嵌套对象命名、非法 JSON 报错，以及四种语言的精确输出比对。

大整数专项：`typeof value === 'bigint'` 的识别（雪花 ID 不允许落到 `number` 分支）、int64 边界值（`9223372036854775807` 与 `9223372036854775808`）在 Go / Rust / Java 的输出分流、超出 int64 范围回退字符串、TS 恒为字符串。

命名专项：根为对象数组时的 `Item` 命名、同名类型追加后缀、Rust `type_` 与 Java `class_` 保留字转义。

---

## 4. `url-parser`：URL 解析与构造器

### 4.1 目标

把复杂 URL 拆解成可校验、可编辑的结构，并支持从结构化字段反向拼装 URL。

### 4.2 布局与交互

- 顶部：URL 输入框（单行，实时解析，250ms 防抖）。
- 左侧：结构字段（协议 / 用户名 / 密码 / 主机 / 端口 / 路径 / 锚点），逐字段可编辑。
- 右侧：Query 参数表格，支持增行、删行、单行启用/停用、重复 key 多行共存。
- 底部：拼装结果（只读）+ 复制按钮。

**单一数据源**：URL 文本是唯一真源。字段与参数表格的编辑直接写回 URL 文本，避免双向同步打架。

### 4.3 编码与解析规则

- 解析语义对齐 `URLSearchParams`：`+` 解码为空格，`%xx` 解码为字符。
- **不做「正则跳过 `%xx`」这类启发式处理**：值里本来就含 `%20` / `%25` 字面量时会被误判成已编码序列，是典型的编解码反模式。编解码完全由 `autoDecode` 确定。
- `autoDecode = true`（默认）：模型内保存**完全解码后的纯字符串**，拼装时对 query key/value 统一调 `encodeURIComponent`（空格输出 `%20`）、对 path 按段编码，保证 `parse → build → parse` 幂等。
- `autoDecode = false`：模型保存用户粘贴的原始文本，拼装时原样回填，全程不做任何编解码。
- 无值参数 `?flag`（无 `=`）与 `?flag=` 区分保留：参数模型为 `{ key, value, enabled, hasEquals }`。
- 缺协议时按 `https://` 试解析，并在界面上标注「已按 https 解析」。
- 非法 URL：报错并保留上一次有效解析结果。

### 4.4 文件与接口

- `utils/urlParser.ts`
  - `parseUrl(input: string): ParsedUrl`，`ParsedUrl` 含 `protocol / username / password / host / port / path / hash / entries / valid / error? / schemeInserted`
  - `buildUrl(parts: ParsedUrl): string`
  - 主机构造使用 `URL` + `URLSearchParams` 标准 API，不手写正则解析。

### 4.5 快照字段

```ts
{ rawUrl: string, autoDecode: boolean }  // autoDecode 默认 true
```

`autoDecode=false` 时表格展示原始编码文本并原样回写，便于用户保留自己贴入的编码形态。

### 4.6 测试要点

带端口 / 带 userinfo / IPv6 主机 / 多值重复 key / 无值参数 / 空 query / 缺协议补全 / 非法 URL。

幂等与字面量专项：`parse → build → parse` 两次结果一致；值字面量为 `foo%20bar` 时 `autoDecode=true` 下必须编码成 `foo%2520bar`（而不是被当已编码序列放行）；`autoDecode=false` 下必须原样输出。

---

## 5. `radix-case`：进制转换与命名风格

### 5.1 布局与交互

顶部三面板切换（`NRadioGroup` + `NRadioButton`）：进制转换 / 命名风格 / 文本行处理。

### 5.2 进制转换

- 输入值 + 源进制选择（2 / 8 / 10 / 16）。
- 同时输出 2 / 8 / 10 / 16 四种进制结果，均带复制按钮。
- 选项：是否输出 `0x` / `0b` / `0o` 前缀、十六进制大小写。
- 允许输入 `0x` / `0b` / `0o` 前缀与 `_` 分隔符；支持负数。
- 全程 `BigInt` 计算，支持任意长度整数与 64 位以上数值，绝不经过 `Number`。
- 负数与进制表示：四种进制输出一律用**数学符号表示法**（`-255` / `-0xFF` / `-0b11111111`），不做定宽补码换算（`BigInt` 是任意精度、无硬件位宽，补码语义必须额外指定字长，超出本工具范围）。
- 非法字符报错，并指出非法字符在输入中的位置。

### 5.3 命名风格

- 输入一段文本，输出 7 种风格：`camelCase`、`PascalCase`、`snake_case`、`SCREAMING_SNAKE_CASE`、`kebab-case`、`dot.case`、`Title Case`，逐条复制。
- 分词规则（依次执行，最后过滤空 token）：
  1. 按非字母数字字符切分（`_`、`-`、`.`、空格等）。
  2. 小写 / 数字 → 大写 的边界：`getHTTPResponse` → `get` + `HTTPResponse`。
  3. 连续大写后接小写时，最后一个大写归入下一段：`HTTPServer` → `HTTP` + `Server`。
  4. 数字 → 大写 的边界：`XML2JSON` → `XML2` + `JSON`、`user2Id` → `user2` + `Id`。
  5. 数字不单独成 token，始终并入前一个 token：`IPv4Address` → `IP` + `v4` + `Address`。
- 分词结果锚定用例（单测直接断言这些）：`HTTPServer` → `http_server`；`getHTTPResponse` → `get_http_response`；`XML2JSON` → `xml2_json`；`IPv4Address` → `ip_v4_address`；`user2Id` → `user2_id`。

### 5.4 文本行处理

- 多行输入 + 选项：去空行、去首尾空白、去重、排序（不变 / 升序 / 降序 / 忽略大小写）。
- 每行前缀 / 后缀拼接。
- 输出区附「原始行数 → 结果行数」统计与复制按钮。

### 5.5 文件与接口

- `utils/radix.ts`：`parseInRadix(input, radix)`、`convertAll(input, radix, opts)`
- `utils/caseConvert.ts`：`tokenize(text)`、`toCase(text, style)`、`convertAllCases(text)`
- `utils/textLines.ts`：`processLines(input, options)`，`options = { dropBlank, trimEdge, dedupe, sort: 'none' | 'asc' | 'desc', ignoreCase, prefix, suffix }`（`ignoreCase` 同时作用于去重与排序比较）

### 5.6 快照字段

```ts
{
  panel: 'radix' | 'case' | 'lines',
  radix: { input: string, from: 2 | 8 | 10 | 16, prefix: boolean, upper: boolean },
  caseInput: string,
  lines: { input: string, options: {...} }   // options 结构同 5.5
}
```

### 5.7 测试要点

大数（超过 64 位）双向转换、负数输出格式（`-255` / `-0xFF` / `-0b11111111`）、非法字符定位、缩写分词锚定用例（`HTTPServer` / `getHTTPResponse` / `XML2JSON` / `IPv4Address` / `user2Id`）、排序与去重组合、前缀后缀、空输入。

---

## 6. `chmod-calc`：Linux 权限计算器

### 6.1 布局与交互

- 权限矩阵为唯一数据源：三行（owner / group / other）× 三列（read / write / execute），外加 setuid / setgid / sticky 三个特殊位开关。
- 输出三份结果：八进制（常规 3 位；含特殊位时显示 4 位）、符号位（`-rwxr-xr-x`）、命令（`chmod [-R] 755 <path>`，带文件名输入与 `-R` 开关）。
- 反向输入：数字框（`755` / `4755`）与符号框（`rwxr-xr-x`）是**写入口**，矩阵仍然只是唯一状态源。

**单向事件流（避开双向 watch 抖动）**：只有输入长度落在合法范围（八进制 3 ~ 4 位 / 符号位 9 ~ 10 位）且校验通过，或者失焦 / 回车时，才派发更新矩阵的动作；用户打到一半的中间态（例如刚敲了 `7`）只就地标红提示，绝不回填、绝不碰矩阵状态，避免输入框被重置与监听回环。

### 6.2 边界

- 八进制只接受 3 ~ 4 位、每位数 0~7，出现 8/9 或长度错误 → 报错。
- 符号位接受 9 位（`rwxr-xr-x`）或 10 位（含首位类型字符），支持 `s` / `S` / `t` / `T` 特殊位表示。
- 非法输入保留上一次有效状态。
- 命令中的路径输入做最小处理：空值时不拼接路径，含空格时按 shell 规范加引号。

### 6.3 文件与接口

- `utils/chmod.ts`：`octalToBits(octal)`、`bitsToOctal(bits)`、`bitsToSymbolic(bits)`、`symbolicToBits(symbolic)`、`toCommand(bits, { path, recursive })`
- `bits = { owner: number, group: number, other: number, setuid: boolean, setgid: boolean, sticky: boolean }`

### 6.4 快照字段

```ts
{ bits: {...}, filePath: string, recursive: boolean }
```

### 6.5 测试要点

`755` / `644` / `4755` / `1777` 的双向转换、`s`/`S`/`t` 符号解析、非法八进制、9 位与 10 位符号位、命令拼装（含 `-R` 与含空格路径）。

中间态专项：`octalToBits('7')` / `symbolicToBits('rwx')` 只返回错误、不产生合法 bits，供视图层「不合法就不回填」的约定使用。

---

## 7. `password-ssh`：强密码生成（批次 A 仅此一半）

### 7.1 布局与交互

- 顶部两个页签：密码生成 / SSH Key。
- SSH Key 页签在批次 A 只渲染占位说明（「SSH Key 指纹解析将在批次 C 交付」），不注册任何逻辑。
- 密码生成面板：
  - 长度：滑块 + 数字输入（4 ~ 128，默认 16）。
  - 字符集开关：大写 / 小写 / 数字 / 符号，默认全开。
  - 排除易混淆字符（`0 O 1 l I |`），默认开启。
  - 生成数量（1 ~ 20，默认 1）。
  - 生成按钮 → 结果列表（等宽显示、逐条复制、一键重新生成）。
  - 强度读数：熵值（bits）与分级（< 60 弱 / 60 ~ 90 中 / > 90 强），熵值必须按**排除易混淆字符后的实际有效字符集**计算，不能拿全量字符集大小估算。

### 7.2 生成规则

- 随机源使用 `crypto.getRandomValues`，禁止 `Math.random`。
- 每一个已启用的字符类别至少落一个字符（当长度 ≥ 类别数时），随后 Fisher–Yates 洗牌打散位置。
- 长度小于启用类别数 → 报错提示；排除易混淆后若某个已启用类别的候选字符被清空，则该类别不可用并给出提示。
- `generatePasswords` 支持注入 RNG，便于单测确定化。

### 7.3 持久化开关

- 开关「持久化生成结果」**默认关闭**。
- 生成参数（长度 / 字符集 / 排除选项 / 数量）**始终**持久化。
- 开关打开时生成结果一并写入快照。
- 关闭开关的瞬间**绕过防抖立即写库**清空 `results`（普通文本输入走 250ms 防抖，这个开关不走），否则用户在防抖窗口内切走 Tab 或退出应用会把明文密码留在 SQLite 里。
- 关闭状态下的保存函数一律不携带 `results` 字段，避免后续任意一次普通保存把旧结果写回去。

### 7.4 文件与接口

- `utils/password.ts`
  - `buildCharset(options)`：返回字符集字符串与错误信息
  - `generatePasswords(options, rng?)`：返回 `{ passwords, error? }`
  - `estimateEntropy(options)`：返回 `length * log2(实际有效字符集大小)` 与分级（实际有效字符集 = 已启用类别去除易混淆字符后的并集）

### 7.5 快照字段

```ts
{
  panel: 'password' | 'ssh',
  length: number,
  charsets: { upper: boolean, lower: boolean, digits: boolean, symbols: boolean },
  excludeAmbiguous: boolean,
  count: number,
  persistResults: boolean,
  results: string[]   // 仅 persistResults 为 true 时写入
}
```

### 7.6 测试要点

各字符集开关组合、排除易混淆后不出现禁用字符、每类别至少一个字符、长度不足报错、数量与不重复性、熵值分级边界、注入 RNG 的确定性输出。

熵值专项：同一 `length` 下开启与关闭「排除易混淆字符」的熵值必须不同，且前者较小（验证确实用了实际有效字符集）。

---

## 8. 交付顺序与验收标准

**建议顺序**：`json-to-types` → `url-parser` → `radix-case` → `chmod-calc` → `password-ssh`。

每个工具的循环：先写 `utils` 单测（TDD）→ 实现 `utils` → 视图绑定 → `npm test` / `npm run build`。

**验收清单**：

1. 侧边栏点击 5 个工具均打开真实实现，不再出现 `ToolPlaceholder` 占位页。
2. 每个工具的输入内容与视图选项在关闭 Tab 或触发 LRU 卸载后重开能够还原（密码结果仅在开关开启时还原）。
3. 非法输入全部走界面提示，无控制台未捕获异常，无白屏。
4. `npm test`、`npm run build` 全绿；`cargo clippy --all-targets -- -D warnings` 与 `cargo test --manifest-path src-tauri/Cargo.toml` 作为回归保持通过（批次 A 不涉及 Rust 改动）。
5. 未新增 npm 依赖，`package.json` 无变动。

---

## 9. 后续批次衔接

- 批次 B 在 `yaml-prop-json` 与 YAML / TOML 校验器落地时，需要引入 YAML / TOML 解析依赖，届时单独走一次设计 → 计划 → 实现循环。
- 批次 C 补齐 `password-ssh` 的 SSH Key 指纹页签与 `sql-formatter`，引入相应成熟库，同样单独走完整循环。

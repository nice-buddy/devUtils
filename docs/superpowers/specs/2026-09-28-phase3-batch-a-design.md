# 第三阶段批次 A 设计规范：零依赖纯前端工具集

**文档版本**：v1.0
**更新日期**：2026-09-28
**适用范围**：DevUtils 第三阶段（P1 实用工具扩展）之批次 A
**分支**：`master`
**前置文档**：`docs/superpowers/specs/2026-09-22-developer-toolbox-design.md`（总设计）、`docs/superpowers/specs/2026-09-23-phase2-batch-c-design.md`（休眠快照机制来源）

---

## 1. 背景与批次拆分

第三阶段（P1）在总设计 §5.2 共列 8 个模块。按「新增依赖 / 原生能力」维度拆批，每批独立走「设计 → 计划 → 实现」循环：

| 批次 | 内容 | 依赖特征 |
| --- | --- | --- |
| **A（本文档）** | `regex`、`mock-data`、`color-converter`、`tabular-convert` | 零新增依赖，纯前端计算 |
| B | `jwt`、`websocket` | 复用已有 `@noble/hashes` 与 WebCrypto；WebSocket 用 webview 原生实现 |
| C | Markdown / HTML 预览、图片与 Base64 / SVG | 需 Markdown 解析 + 消毒库；图片落地需原生能力 |
| D | X.509 证书解析、二维码生成与解码 | 需成熟第三方库 |

> 总设计 §5.2 的 `p3_8` 里「打包与公证交付」属发布工程，不随工具批次走，单独排期。

**注册状态（权威来源：`src/types/tool.ts` 当前内容）**：

- `regex` 已注册（`name: '正则表达式测试'`、`category: 'dev'`），当前落到 `ToolPlaceholder` 占位页，本批次用真实实现替换。
- `mock-data`、`color-converter`、`tabular-convert` **尚未注册**，本批次需新增注册项。这是与前两批次的重要差异：**本批次会修改 `src/types/tool.ts`**（仅新增条目，不改动既有条目文案与分类）。

**本批次不做的事（明确排除）**：

- 不做 JWT、WebSocket、Markdown、图片 / Base64、X.509、二维码（归后续批次）。
- 不新增任何 npm 依赖、不改动 Rust 端（`src-tauri/`）、不改动数据库 schema。
- 不做拖放导入（Tauri `dragDropEnabled` 默认为 `true`，官方说明「Windows 上必须关掉它才能用 HTML5 拖放」，跨平台行为不一致，收益低、代价高，见 §6.2）。
- 不做「颜色对比度 / 无障碍检查」等总设计未要求的扩展能力。

---

## 2. 通用工程约定

### 2.1 目录与组件契约

```
src/views/tools/<ToolName>/
  <ToolName>.vue           # 视图层：仅做状态绑定与渲染
  utils/*.ts               # 纯函数：全部可单测的业务逻辑
  __tests__/*.spec.ts      # Vitest 单测
```

- 组件 Props 契约与既有工具完全一致：
  ```ts
  defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()
  ```
- 业务逻辑一律放 `utils/`，视图内不写算法，保证单测不依赖 DOM。
- 图标沿用现有视图的内联 SVG 写法，不引入图标库；`src/types/tool.ts` 的 `icon` 字段是元数据，仅按既有风格填字符串。

### 2.2 注册方式

`src/types/tool.ts` 的 `TOOLS` 数组新增三条（位置紧邻现有 `regex` 条目）：

| id | name | description | category | keywords |
| --- | --- | --- | --- | --- |
| `mock-data` | `UUID / 雪花 ID / Mock 数据` | `UUID v1/v4/v7、NanoID、雪花 ID 与中文测试 Mock 数据批量生成` | `dev` | `uuid`, `snowflake`, `nanoid`, `mock`, `faker`, `random` |
| `color-converter` | `颜色转换与拾取` | `HEX / RGB / HSL 互转与取色器` | `dev` | `color`, `hex`, `rgb`, `hsl`, `picker`, `eyedropper` |
| `tabular-convert` | `Excel / CSV 转 JSON 与 SQL` | `粘贴或导入 TSV/CSV，推导类型并生成 JSON 数组或多方言批量 INSERT` | `format` | `excel`, `csv`, `tsv`, `json`, `sql`, `insert`, `table` |

`src/App.vue`：

- 新增 4 个 `defineAsyncComponent(() => import('@/views/tools/<ToolName>/<ToolName>.vue'))`，保持代码分割。
- `resolveBaseComponent` 增加分支，同时兼容连字符与下划线两种 id 写法（沿用既有约定）：
  - `regex`
  - `mock-data` / `mock_data`
  - `color-converter` / `color_converter`
  - `tabular-convert` / `tabular_convert`

### 2.3 快照持久化契约

- 回填：所有状态初值统一走 `props.initialSnapshot?.x ?? <默认值>`。
- 落库：状态变更调用 `tabStore.updateTabSnapshot(props.tabId, {...})`；文本类输入做 250ms 防抖。
- 派生结果（匹配结果、生成结果、转换输出、错误信息）**一律不入快照**，重开时由 `onMounted` 用回填的输入重算一次（与批次 C 的 `PasswordSsh` / `SqlFormatter` 修复后行为一致）。
- 关闭 Tab / LRU 卸载 / 应用退出后重开均能还原，机制沿用批次 C 交付的「休眠快照 + `sys_settings.open_tab_ids`」，本批次不改动该机制。

### 2.4 复用点

| 能力 | 复用来源 |
| --- | --- |
| 随机源 | `crypto.getRandomValues`（与 `PasswordSsh/utils/password.ts` 一致；**禁止 `Math.random`**） |
| 可测随机注入 | 生成函数接受 `rng: (bytes: Uint8Array) => void` 形参，沿用 `password.ts` 的 `zeroRng` 单测模式 |
| 哈希 / HMAC | 本批次不需要；`@noble/hashes` 留给批次 B 的 JWT |
| 快捷键 / 平台文案 | `src/utils/platform.ts` |
| UI 组件与主题 | Naive UI（`NInput`/`NButton`/`NSelect`/`NRadioGroup`/`NRadioButton`/`NSwitch`/`NInputNumber`/`NSlider`/`NTag`/`NAlert`/`NCheckbox`/`useMessage`）+ Tailwind 原子类 |
| 编辑器 | CodeMirror 6（`codemirror` 的 `basicSetup` + `@codemirror/state`），主题 `Compartment` 跟随 `themeStore.isDark`，沿用 `SqlFormatter.vue` 写法 |

**关于 SQL 方言表**：`tabular-convert` 需要 6 种方言的标识符引用与布尔字面量规则，与批次 C `SqlFormatter` 的 `DIALECTS`（`sql` / `mysql` / `postgresql` / `sqlite` / `transactsql` / `plsql`）**id 保持一致**，但**不抽公共模块**——两者用途不同（格式化 vs DML 生成），抽公共层会为一个标签表引入跨工具耦合。防漂移手段是本节钉死 id 列表 + 单测覆盖全部 6 种方言。

### 2.5 错误处理与边界基线（4 个工具共同遵守）

- 非法输入不抛异常到 UI：统一用 `NAlert`（`type="error"` / `"warning"`）就地提示。
- 上一次有效结果保留：输入非法时输出区保持上一次成功的结果，不闪空、不白屏。
- 空输入：输出区显示空态占位，不报错。
- 输入规模护栏：文本输入超过 1MB 时关闭实时派生，改为手动点击按钮触发。
- 不新增 Worker、不引入 WebAssembly，全部在主线程同步计算。

### 2.6 测试口径

- 每个工具至少一个 `utils` 单测文件，覆盖正常路径、边界（空值 / 极端长度 / 特殊字符）与错误分支。
- 生成器与代码生成类（`mock-data`、`tabular-convert`）采用「固定输入 + 注入 rng → 精确字符串比对」的断言方式。
- 每完成一个工具：`npm test` 与 `npm run build` 必须通过。

---

## 3. `regex`：正则表达式测试

### 3.1 目标

输入正则与测试文本，实时高亮全部匹配、列出捕获组明细、预览替换结果，并内置中文开发者高频规则库一键载入。

### 3.2 布局与交互

- 顶部：正则输入框（单行，`/` 与 `/` 视觉包裹）、flags 复选框（`g` `i` `m` `s` `u` `y`）、「运行」按钮（仅在手动模式显示）。
- 中部左：测试文本（CodeMirror，纯文本）。
- 中部右：高亮预览（只读，按匹配切段渲染）+ 匹配列表（序号、`index`、`[0]` 全文、命名/编号捕获组明细）。
- 底部：替换模板输入框 + 替换结果预览 + 复制按钮。
- 侧栏：内置规则库（点击载入正则 + flags + 示例文本）。

**高亮渲染不得使用 `v-html`**：由 `utils` 产出 `{ text, matchIndex }[]` 分段数组，模板用 `v-for` + `<span>` 渲染，杜绝把用户输入当 HTML 注入。

### 3.3 匹配与替换模型（定稿）

- 编译：`compileRegex(pattern, flags)` → `{ regex?: RegExp; error?: string }`；`new RegExp` 抛错时把 `error.message` 原样返回（不加工、不吞掉）。
- **全局迭代**：高亮与匹配列表内部一律补 `g`（`new RegExp(source, flags.includes('g') ? flags : flags + 'g')`），保证「列出全部匹配」符合直觉。
- **粘性 `y`**：用户勾选 `y` 时内部**不补 `g`**，从 `lastIndex = 0` 起连续匹配，遇到第一个不连续匹配即停止（保持 `y` 的语义，而不是静默降级）。
- **零长度匹配防护**：`match[0] === ''` 时必须手动把 `lastIndex += 1`，否则死循环；该分支必须有单测。
- 上限：单次运行最多收集 5000 条匹配；命中上限时停止迭代并在结果区标注「已截断」。
- 替换：`applyReplace(text, regex, replacement)` 使用补 `g` 后的正则调用 `String.prototype.replace`，模板语义沿用原生（`$1`、`$&`、`$$`、`$<name>`）；不做自定义模板方言。
- 运行护栏：测试文本超过 256KB 或手动模式开启时不做自动运行，只显示「运行」按钮；正则引擎本身不可中断，这是本工具能给出的最强护栏，界面上要明确提示。
  （256KB 比 §2.5 的 1MB 基线更严：正则是 CPU 敏感路径，病态回溯会让主线程长时间无响应。）

### 3.4 内置规则库（定稿 4 条）

| 名称 | 正则 | flags | 说明 |
| --- | --- | --- | --- |
| 手机号（中国大陆） | `^1[3-9]\d{9}$` | `g` | 11 位，1 开头，第二位 3-9 |
| 身份证号（18 位） | `^\d{17}[\dXx]$` | `g` | 仅格式校验，不做校验位计算 |
| 统一社会信用代码 | `^[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}$` | `g` | 排除 I、O、S、V、Z |
| 银行卡号 | `^\d{16,19}$` | `g` | 仅长度与数字校验，不做 Luhn |

规则库为静态常量表（`utils/regexPresets.ts`），每条含 `name`、`pattern`、`flags`、`sample`、`description`。

### 3.5 文件与接口

```
src/views/tools/Regex/
  Regex.vue
  utils/regexTester.ts     # compileRegex / runMatches / applyReplace / buildSegments
  utils/regexPresets.ts    # 内置规则库常量
  __tests__/regexTester.spec.ts
```

```ts
interface RegexMatch {
  index: number
  value: string
  groups: { name?: string; index: number; value: string | undefined }[]
}
interface RegexRunResult {
  matches: RegexMatch[]
  truncated: boolean
  error?: string
}
compileRegex(pattern: string, flags: string): { regex?: RegExp; error?: string }
runMatches(text: string, regex: RegExp, limit?: number): RegexRunResult
applyReplace(text: string, regex: RegExp, replacement: string): string
buildSegments(text: string, matches: RegexMatch[]): { text: string; matchIndex: number }[]
```

### 3.6 快照字段

```ts
{ pattern: string; flags: string; testText: string; replacement: string }
```

### 3.7 测试要点

- 全局匹配、命名捕获组、`y` 粘性语义、零长度匹配不死循环（各一条断言）。
- 非法正则返回 `error` 而不是抛异常；空 pattern / 空文本返回空结果。
- 匹配数超过 5000 时 `truncated === true`。
- `buildSegments` 分段结果拼回原文必须与输入完全一致（往返断言）。
- 替换：`$1` / `$&` / `$$` 各一条；无匹配时原样返回。

---

## 4. `mock-data`：UUID / 雪花 ID / Mock 数据生成

### 4.1 目标

批量生成 UUID（v1 / v4 / v7）、NanoID、雪花 ID，以及中文场景的测试 Mock 数据，全部标注为测试数据、不得用于生产。

### 4.2 布局与交互

- 顶部：类型选择（UUID v4 / UUID v7 / UUID v1 / NanoID / 雪花 ID / Mock 数据）+ 数量输入（1–1000）+「生成」按钮 +「复制全部」。
- 类型参数区随选择切换：
  - UUID：无参数（大写 / 带连字符开关）。
  - NanoID：长度（默认 21）、自定义字母表（默认 `A-Za-z0-9_-`）。
  - 雪花 ID：纪元（默认 `1288834974657`，Twitter 纪元）、机器号（0–1023）、可选「机器号按 5 位数据中心 + 5 位机器拆分」开关。
  - Mock 数据：字段多选（姓名 / 手机号 / 身份证 / 邮箱 / 地址 / 公司名 / 银行卡号）+ 输出格式（列表 / JSON 数组）。
- 结果区：等宽列表 + 逐条复制 + 全量复制。

### 4.3 生成模型（定稿）

- **随机源**：一律 `crypto.getRandomValues`；所有生成函数签名带 `rng: (bytes: Uint8Array) => void`，默认实现为 `crypto.getRandomValues`，单测注入确定性 rng。
- **UUID v4**（RFC 9562 §5.4）：16 随机字节，`byte[6] = (byte[6] & 0x0f) | 0x40`，`byte[8] = (byte[8] & 0x3f) | 0x80`，小写十六进制 8-4-4-4-12。
- **UUID v7**（§5.7）：前 48 位为毫秒时间戳（大端），`byte[6] = (byte[6] & 0x0f) | 0x70`，`byte[8]` 置变体位 `10xxxxxx`，其余 74 位随机。**不承诺同毫秒内单调递增**（RFC 的可选单调计数器不在本批次范围内），单测只断言跨毫秒的时间前缀有序。
- **UUID v1**（§5.1）：60 位时间戳（自 1582-10-15 的 100ns 计数）+ 14 位 clock sequence（随机）+ 48 位 node（随机生成，并把多播位 `byte[10] |= 0x01` 置位，避免伪装成真实 MAC）。
- **NanoID**：复用已有 `nanoid` 依赖的 `customAlphabet`，不使用 `Math.random` 版本。
- **雪花 ID**：41 位毫秒 + 10 位机器号 + 12 位序列，全程 `BigInt`，输出十进制字符串。同毫秒内序列自增；序列用满 4096 时等待下一毫秒（生成数量上限 1000，不会长时间阻塞）。同时提供 `decodeSnowflake(id, epoch)` 反解出时间戳 / 机器号 / 序列，用于自检展示。
- **Mock 数据**：
  - 中文姓名：姓氏表 ≥ 60 条常见姓（每条 1 个汉字）+ 名字用字表 ≥ 80 条（每条 1 个汉字），随机组合；不引 faker。
  - 手机号：`1[3-9]` + **9 位**随机数字（共 11 位），输出时在界面标注「测试号段，请勿用于真实短信验证」。
  - 身份证（18 位）：固定区划码表 + 合法出生日期 + 3 位顺序码 + 校验位，三段全部钉死：
    - 区划码表：**31 条**（大陆 31 个省级行政区各取 1 个真实 6 位区划码），每条为 6 位数字且前两位落在省级代码集合 `11-15 / 21-23 / 31-37 / 41-46 / 50-54 / 61-65` 内。
    - 出生日期：1940-01-01 ~ 2006-12-31（保证成年），按真实日历校验闰年与月天数。
    - 校验位：权重 `[7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2]` 加权求和 mod 11，查表 `10X98765432`（已用 `11010519491231002X`、`440524188001010014` 两个已知样本验证过）。
  - 银行卡号：16–19 位，生成时用 **Luhn 校验** 反推末位，保证自洽。
  - 邮箱 / 地址 / 公司名：模板 + 词表组合（地址 = 省 + 市 + 区 + 街道 + 门牌号；公司名 = 地区 + 词 + 行业后缀）。

### 4.4 文件与接口

```
src/views/tools/MockData/
  MockData.vue
  utils/uuid.ts          # uuidV1 / uuidV4 / uuidV7
  utils/snowflake.ts     # nextSnowflake / decodeSnowflake
  utils/mockData.ts      # randomName / randomPhone / randomIdCard / randomBankCard / randomEmail / randomAddress / randomCompany
  utils/random.ts        # 默认 rng、随机整数、从数组取元素
  __tests__/uuid.spec.ts
  __tests__/snowflake.spec.ts
  __tests__/mockData.spec.ts
```

### 4.5 快照字段

```ts
{ type: 'uuid-v4' | 'uuid-v7' | 'uuid-v1' | 'nanoid' | 'snowflake' | 'mock'; count: number; nanoidLength: number; nanoidAlphabet: string; epoch: string; machineId: number; splitMachineId: boolean; fields: string[]; outputFormat: 'list' | 'json'; uppercase: boolean }
```

**生成结果不持久化**：UUID / 雪花 ID / Mock 数据都是派生结果，重开 Tab 后结果区为空，需重新点「生成」。本工具不引入「持久化生成结果」开关——那是第二阶段为敏感密码场景专门加的。

（`epoch` 用字符串存，避免超过 `Number.MAX_SAFE_INTEGER` 时被截断。）

### 4.6 测试要点

- UUID v4：版本位 = 4、变体位 = 10、格式正则、同 rng 下输出确定。
- UUID v7：版本位 = 7、变体位 = 10；注入两个相差 1ms 的时间源时，前 12 位十六进制字典序递增。
- UUID v1：版本位 = 1、node 多播位置位。
- 雪花 ID：同一毫秒内序列递增且互不相同；`decodeSnowflake` 往返得到输入的时间戳 / 机器号 / 序列；`epoch` 为字符串时按 BigInt 解析。
- 身份证：生成的号码通过 `GB 11643-1999` 校验位重算；出生日期落在允许区间。
- 区划码表：恰好 31 条、每条 6 位数字、前两位在允许的省级代码集合内；姓名词表非空且每条为单个汉字。
- 银行卡：生成的号码通过 Luhn 校验。
- 数量上限：请求 1000 条时全部互不相同（雪花与 UUID 各一条断言）。

---

## 5. `color-converter`：颜色转换与拾取

### 5.1 目标

HEX / RGB / HSL 三者双向联动，并提供取色能力与最近使用色。

### 5.2 布局与交互

- 顶部：主输入框（接受任意支持的颜色写法）+ 原生 `<input type="color">` 色块 + 「吸管」按钮（`window.EyeDropper` 存在时显示，不存在时隐藏，不做降级提示）。
- 三组数值区：HEX（文本）、RGB（三个 0–255 数字输入 + Alpha 0–100 滑块）、HSL（H 0–360、S/L 0–100、Alpha）。
- 预览区：大色块（含 Alpha 棋盘底）+ 各格式字符串 + 逐条复制。
- 底部：最近使用色（最多 12 个，点击回填）。

### 5.3 解析与格式化规则（定稿）

- **支持输入**：
  - `#RGB`、`#RGBA`、`#RRGGBB`、`#RRGGBBAA`（大小写不敏感）。
  - `rgb()` / `rgba()`（数值或百分比）。
  - `hsl()` / `hsla()`（H 带或不带 `deg`）。
  - 16 个基础 CSS 命名色（`black` `silver` `gray` `white` `maroon` `red` `purple` `fuchsia` `green` `lime` `olive` `yellow` `navy` `blue` `teal` `aqua`）；不做全量 148 色表。
- **输出**：
  - HEX：`#RRGGBB`；Alpha < 1 时输出 `#RRGGBBAA`。
  - RGB：`rgb(r, g, b)`；Alpha < 1 时 `rgba(r, g, b, a)`，`a` 保留 2 位小数（去尾零）。
  - HSL：`hsl(h, s%, l%)`；H 四舍五入到整数，S/L 四舍五入到整数百分比。
- **取整规则**：RGB 分量四舍五入到 0–255 整数；HSL 由 RGB 计算时 H 归一化到 `[0, 360)`，S/L 为百分比并四舍五入。
- **H 范围**：输入侧 H 的合法区间为 `[0, 360]`（`360` 与 `0` 等价），超出即非法（比 CSS 的取模语义更严，避免「输错却被静默修正」）；输出侧 H 始终归一化到 `[0, 360)`。
- 解析失败：`parseColor` 返回 `{ error }`，视图就地提示并保留上一次有效结果。

### 5.4 文件与接口

```
src/views/tools/ColorConverter/
  ColorConverter.vue
  utils/colorConvert.ts   # parseColor / toHex / toRgbString / toHslString / rgbToHsl / hslToRgb
  __tests__/colorConvert.spec.ts
```

```ts
interface Rgba { r: number; g: number; b: number; a: number }
parseColor(input: string): { value?: Rgba; error?: string }
toHex(c: Rgba): string
toRgbString(c: Rgba): string
toHslString(c: Rgba): string
```

### 5.5 快照字段

```ts
{ input: string; recent: string[] }
```

（`recent` 只存最近 12 个 `#RRGGBBAA` 字符串，纯输入性质，不存派生结果。）

### 5.6 测试要点

- 往返：锚定色（`#000000` / `#FFFFFF` / `#FF0000` / `#00FF00` / `#0000FF`）走 RGB → 整数化 HSL → RGB 后与原始值完全一致；非锚定色（如 `#123456`）因 H/S/L 取整会有每通道 ≤3 的偏移，这是取整规则的预期后果，单测按 ±3 容差断言（不是缺陷）。
- 缩写形式 `#RGB` / `#RGBA` 展开正确；`rgb(100%, 0%, 0%)` 百分比解析正确。
- Alpha 保留与省略规则（`a === 1` 不输出 alpha 通道）。
- 非法输入（`#12345`、`rgb(300,0,0)`、`hsl(400, 50%, 50%)`、空串）全部返回 `error`。
- HSL 边界：H=360 与 H=0 输出一致。

---

## 6. `tabular-convert`：Excel / CSV 文本转 JSON 与 SQL

### 6.1 目标

把从 Excel 复制的制表符文本或 CSV 文本（也支持选择本地文件）解析成结构化行，推导字段类型，输出 JSON 数组或多方言批量 INSERT 语句。

### 6.2 布局与交互

- 顶部：分隔符选择（自动 / 制表符 / 逗号 / 分号 / 竖线）、「首行为表头」开关、空值处理（`null` / 空字符串）、输出模式（JSON 数组 / JSON 数组的数组 / SQL INSERT）、SQL 方言选择（仅 SQL 模式显示）、表名输入（默认 `my_table`）、「选择文件…」按钮 + 手动「转换」按钮（仅手动模式显示）。
- 左：输入文本（CodeMirror 纯文本，支持粘贴 TSV/CSV）。
- 右：输出预览（只读 `<pre>` + 复制按钮，沿用 `SqlFormatter.vue` 的样式）。
- 状态条：解析出的行列数、跳过的空行数、告警（列数不一致的行号）。

**文件导入只用隐藏 `<input type="file" accept=".csv,.tsv,.txt">` + 按钮，不做拖放**：`src-tauri/tauri.conf.json` 未设置 `dragDropEnabled`，而 `tauri-utils` 的默认值是 `true`（源码注释：`Disabling it is required to use HTML5 drag and drop on the frontend on Windows`）——即 Windows 上原生 HTML5 拖放直接被拦，macOS/Linux 行为又不一致；要跨平台支持拖放得改 Tauri 配置再自己接原生事件拿路径，收益与成本不成比例。`<input type="file">` 在三个平台的 webview 里都能拿到 `File` 对象（`File.text()` 可直接读文本），且不需要改 Tauri 配置。

### 6.3 解析规则（定稿）

- **分隔符探测**：候选 `\t` / `,` / `;` / `|`，取「首 20 个非空行里字段数中位数最大」的候选；全都不足 2 列时按单列处理。手动指定时不做探测。
- **RFC 4180 兼容**：双引号包裹字段、`""` 表示字段内单个 `"`、字段内允许换行与分隔符；`\r\n` / `\r` / `\n` 统一按换行处理（复用批次 A 的换行口径）。
- **表头与列数**：默认首行为表头，空表头单元格回退为 `colN`（N 从 1 开始）；重复表头追加 `_2`、`_3`；关闭开关时列名统一为 `col1..colN`。**列数以表头宽度为准**（有表头时，超出列数的数据列被截断并计入告警；关闭表头开关时取最宽行作为列数）。
- **行处理**：完全空行跳过并计数；字段数少于列数的行按空值补齐；多于列数的行计入告警并在结果区列出前 10 条行号。
- **类型推导**（对每个单元格独立推导）：
  - 空字符串 → 按「空值处理」选项得到 `null` 或 `''`。
  - `true` / `false`（大小写不敏感）→ 布尔。
  - 十进制数字：整数字面量或小数字面量（允许前导 `+` / `-`）→ 数值。
  - **大整数保护**：有效数字超过 15 位、或带前导零（如 `00123`）、或超过 `Number.MAX_SAFE_INTEGER` 的整数 → **一律按字符串输出**（与项目「大整数无损」口径一致），并在输出中保留原始字面量。
  - 其余 → 字符串（原样，不 trim 内部空格；仅去掉包裹用的引号）。
- **规模护栏**：输入超过 1MB 时关闭自动转换，只保留「转换」按钮。

### 6.4 输出模型（定稿）

- **JSON 数组**：`[ { "col1": value, ... } ]`，缩进 2 空格（与项目其他工具一致）。
- **JSON 数组的数组**：`[ [value, ...] ]`，第一行可选输出表头数组。
- **SQL INSERT**：
  - 语句形态：`INSERT INTO <table> (<col1>, <col2>) VALUES (<v1>, <v2>);`，可选「多行批量」（每 100 行一条语句）。
  - 标识符引用按方言：`mysql` → 反引号；`transactsql` → `[方括号]`；`sql` / `postgresql` / `sqlite` / `plsql` → 双引号。标识符内的引用符按方言双写转义。
  - 字符串转义：单引号一律双写；`mysql` 额外把反斜杠转义为 `\\`（MySQL 默认把 `\` 当转义符）。
  - 布尔字面量：`mysql` / `postgresql` / `sqlite` → `TRUE` / `FALSE`；`sql` / `transactsql` / `plsql` → `1` / `0`。
  - `null` → `NULL`；数值 → 原样字面量；字符串 → 单引号包裹。
  - 表名与列名默认做标识符引用；「表名」输入为空时回退 `my_table`。

### 6.5 文件与接口

```
src/views/tools/TabularConvert/
  TabularConvert.vue
  utils/delimiter.ts      # detectDelimiter
  utils/parseTable.ts     # parseDelimitedText → { headers, rows, warnings }
  utils/inferType.ts      # inferCell / inferColumn
  utils/toJson.ts         # rowsToJsonArray / rowsToArrayOfArrays
  utils/toSql.ts          # rowsToInsertSql(dialect, table, headers, rows, options)
  __tests__/parseTable.spec.ts
  __tests__/inferType.spec.ts
  __tests__/toJson.spec.ts
  __tests__/toSql.spec.ts
```

```ts
interface ParsedTable {
  headers: string[]
  rows: string[][]
  skippedBlankLines: number
  warnings: { line: number; message: string }[]
}
parseDelimitedText(text: string, options: { delimiter?: string; hasHeader: boolean }): ParsedTable
inferCell(raw: string, options: { emptyAsNull: boolean }): string | number | boolean | null
rowsToInsertSql(dialect: SqlInsertDialect, table: string, headers: string[], rows: CellValue[][], options: { multiRow: boolean }): string
```

### 6.6 快照字段

```ts
{ input: string; delimiter: string; hasHeader: boolean; emptyAsNull: boolean; outputMode: 'json' | 'array' | 'sql'; dialect: string; table: string; multiRow: boolean }
```

### 6.7 测试要点

- 解析：带引号字段、`""` 转义、字段内换行、CRLF/CR/LF、行尾多余分隔符、完全空行跳过（各一条）。
- 分隔符探测：TSV / CSV / 分号 / 竖线各一条；单列文本不误判。
- 表头：空表头回退 `colN`、重复表头追加 `_2`、关闭表头开关后为 `col1..colN`。
- 类型推导：`true/false`、整数、小数、`00123` 保持字符串、19 位雪花 ID 保持字符串、超 `MAX_SAFE_INTEGER` 保持字符串、空值两种模式。
- JSON：对象数组与数组的数组各一条精确字符串断言。
- SQL：**注入防护用例**——值里含 `'` 与 `\` 时输出正确转义；标识符含 `"` / `` ` `` 时按方言双写；6 种方言各一条精确字符串断言；布尔与 `null` 字面量按方言输出。

---

## 7. 交付顺序与验收标准

**建议顺序**：`color-converter`（最小） → `regex` → `mock-data` → `tabular-convert`（最大）。

每个工具的循环：先写 `utils` 单测（TDD）→ 实现 `utils` → 视图绑定 → `npm test` / `npm run build`。

**验收清单**：

1. 侧边栏点击 `regex`、`mock-data`、`color-converter`、`tabular-convert` 均打开真实实现，不再出现 `ToolPlaceholder` 占位页。
2. 四个工具的输入与视图选项在关闭 Tab / LRU 卸载 / 重启后重开能够还原；派生结果重算，不落库。
3. 非法输入全部走界面提示，无控制台未捕获异常、无白屏。
4. `regex` 在超长文本与零长度匹配模式下不冻结、不死循环；命中上限时明确标注已截断。
5. `tabular-convert` 生成的 SQL 对所有值做转义、标识符按方言引用，注入用例通过。
6. `npm test`、`npm run build` 全绿；`cargo clippy --all-targets -- -D warnings` 与 `cargo test --manifest-path src-tauri/Cargo.toml` 作为回归保持通过（批次 A 不涉及 Rust 改动）。
7. 未新增 npm 依赖：`package.json` 的 `dependencies` / `devDependencies` 无变动；本批次对 `src/types/tool.ts` 的改动仅为新增三条工具注册项。

---

## 8. 后续批次衔接

- **批次 B**：`jwt` 用 `@noble/hashes` 做 HS256 校验、用 WebCrypto `crypto.subtle` 做 RS256 校验（零新增依赖，但需先验证 Tauri webview 的 `crypto.subtle` 可用性）；`websocket` 走 webview 原生 `WebSocket`，**注意当前 CSP 为 `default-src 'self'`，没有 `connect-src`，需要在设计时确认是否放开 `connect-src` 或改走 Rust 端**。
- **批次 C**：Markdown 预览需「解析库 + 消毒库」；图片与 Base64 需落地保存能力（Rust 命令或 fs 插件），且当前 CSP 未放行 `blob:`，导出方案要在设计阶段定。
- **批次 D**：X.509 证书解析、二维码生成与解码。
- 「打包与公证交付」不随工具批次走，单独排期。

export type ToolCategory =
  | 'format'   // 代码与格式化
  | 'diff'     // 文本与对比
  | 'network'  // 网络与接口
  | 'crypto'   // 编码与加解密
  | 'time'     // 时间与 Cron
  | 'dev'      // 开发与辅助

export interface ToolCategoryMeta {
  id: ToolCategory
  name: string
  icon: string
}

export interface ToolDefinition {
  id: string
  name: string
  description: string
  category: ToolCategory
  icon?: string
  keywords?: string[]
  isMvp?: boolean
}

export const TOOL_CATEGORIES: ToolCategoryMeta[] = [
  { id: 'format', name: '代码与格式化', icon: 'Code' },
  { id: 'diff', name: '文本与比对', icon: 'GitCompare' },
  { id: 'network', name: '网络与接口', icon: 'Send' },
  { id: 'crypto', name: '编码与安全', icon: 'Lock' },
  { id: 'time', name: '时间与调度', icon: 'Clock' },
  { id: 'dev', name: '开发与辅助', icon: 'Terminal' }
]

export const TOOLS: ToolDefinition[] = [
  // MVP 核心工具
  {
    id: 'json-suite',
    name: 'JSON 深度套件',
    description: '大整数 AST 无损保护、格式化排版、单引号/尾随逗号容错修复与 JSONPath 过滤',
    category: 'format',
    icon: 'Json',
    keywords: ['json', 'format', 'repair', 'jsonpath', 'bigint', 'lossless', 'beautify', 'minify'],
    isMvp: true
  },
  {
    id: 'diff-viewer',
    name: '文本与 JSON 对比',
    description: '纯文本与 JSON 语义行级/字符级差异比对，双栏/单栏切换，Alt+↑/↓ 差异导航',
    category: 'diff',
    icon: 'Diff',
    keywords: ['diff', 'compare', 'text', 'json', 'similar', 'inline', 'split'],
    isMvp: true
  },
  {
    id: 'postman',
    name: 'Postman Lite',
    description: '无 CORS 限制的原生 HTTP 请求调试器，支持 cURL 双向导入导出与沙箱预览',
    category: 'network',
    icon: 'Send',
    keywords: ['http', 'api', 'curl', 'rest', 'request', 'postman', 'headers', 'params'],
    isMvp: true
  },
  {
    id: 'encoding-hash',
    name: '编码转换与流式哈希',
    description: 'Base64/URL/Hex 互转，MD5/SHA 摘要计算与超大文件 2MB 分块流式哈希',
    category: 'crypto',
    icon: 'Hash',
    keywords: ['base64', 'hex', 'md5', 'sha', 'hash', 'url', 'unicode', 'stream'],
    isMvp: true
  },
  {
    id: 'timestamp-cron',
    name: '时间戳与 Cron 中心',
    description: '纳秒级时间戳互转、多时区对照矩阵、Unix date 命令生成与 Cron 未来触发推演',
    category: 'time',
    icon: 'Clock',
    keywords: ['timestamp', 'cron', 'timezone', 'unix', 'date', 'utc', 'nano'],
    isMvp: true
  },

  // 扩展规划工具 (Phase 2 & 3)
  {
    id: 'yaml-prop-json',
    name: 'YAML / Properties / JSON 互转',
    description: '三栏实时联动双向互转与点分扁平化属性键转换',
    category: 'format',
    icon: 'Transform',
    keywords: ['yaml', 'properties', 'json', 'convert']
  },
  {
    id: 'yaml-validator',
    name: 'YAML 语法校验器',
    description: 'YAML 语法校验、行列错误定位与格式化 / 压缩输出',
    category: 'format',
    icon: 'CheckCircle',
    keywords: ['yaml', 'yml', 'validate', 'lint', '校验']
  },
  {
    id: 'toml-validator',
    name: 'TOML 语法校验器',
    description: 'TOML 语法校验、行列错误定位与格式化输出',
    category: 'format',
    icon: 'CheckCircle',
    keywords: ['toml', 'validate', 'lint', '校验']
  },
  {
    id: 'json-to-types',
    name: 'JSON 转强类型结构体',
    description: '输入 JSON 自动推导生成 TypeScript、Go、Java POJO/Record、Rust Struct',
    category: 'format',
    icon: 'Code',
    keywords: ['typescript', 'go', 'java', 'rust', 'struct', 'interface']
  },
  {
    id: 'url-parser',
    name: 'URL 解析与构造器',
    description: '复杂 URL 结构拆解与 Query 参数双向表格化编辑',
    category: 'network',
    icon: 'Link',
    keywords: ['url', 'query', 'params', 'decode', 'encode']
  },
  {
    id: 'radix-case',
    name: '进制与命名风格转换',
    description: '2/8/10/16 进制双向换算与 camelCase/snake_case/kebab-case 命名切换',
    category: 'dev',
    icon: 'Case',
    keywords: ['radix', 'binary', 'hex', 'camelcase', 'snakecase', 'naming']
  },
  {
    id: 'password-ssh',
    name: '强密码生成与 SSH Key 解析',
    description: '排除混淆字符的密码生成与本地公钥指纹提取解析',
    category: 'crypto',
    icon: 'Key',
    keywords: ['password', 'ssh', 'key', 'fingerprint', 'security']
  },
  {
    id: 'sql-formatter',
    name: 'SQL 格式化与压缩',
    description: '多方言 SQL 语法美化、大小写对齐与单行压缩',
    category: 'format',
    icon: 'Database',
    keywords: ['sql', 'format', 'minify', 'query']
  },
  {
    id: 'chmod-calc',
    name: 'Linux chmod 权限计算器',
    description: '数字权限（如 755）与符号权限（rwxr-xr-x）双向转换',
    category: 'dev',
    icon: 'Terminal',
    keywords: ['chmod', 'linux', 'permission', 'octal']
  },
  {
    id: 'websocket',
    name: 'WebSocket 实时测试',
    description: 'WS/WSS 长连接保活心跳、快捷消息模板与实时收发日志',
    category: 'network',
    icon: 'Plug',
    keywords: ['websocket', 'ws', 'wss', 'socket', 'stream']
  },
  {
    id: 'jwt',
    name: 'JWT 解析与调试',
    description: '三段式色彩高亮解析、Claims 过期时间倒计时与签名重签',
    category: 'crypto',
    icon: 'Shield',
    keywords: ['jwt', 'token', 'auth', 'claim', 'signature']
  },
  {
    id: 'regex',
    name: '正则表达式测试',
    description: '实时匹配变色高亮、捕获组明细与内置常见规则库',
    category: 'dev',
    icon: 'Search',
    keywords: ['regex', 'regexp', 'pattern', 'test', 'replace']
  },
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
]

export function getToolById(id: string): ToolDefinition | undefined {
  return TOOLS.find(t => t.id === id)
}

export function getCategoryMeta(category: ToolCategory): ToolCategoryMeta | undefined {
  return TOOL_CATEGORIES.find(c => c.id === category)
}

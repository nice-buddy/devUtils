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

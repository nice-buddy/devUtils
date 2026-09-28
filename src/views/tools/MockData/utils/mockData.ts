import { defaultRng, pick, randomInt, type Rng } from './random'

// 大陆 31 个省级行政区各取 1 个真实 6 位区划码
export const AREA_CODES: string[] = [
  '110101', '120101', '130102', '140105', '150102', '210102', '220102', '230102',
  '310101', '320102', '330102', '340102', '350102', '360102', '370102', '410102',
  '420102', '430102', '440103', '450102', '460105', '500101', '510104', '520102',
  '530102', '540102', '610102', '620102', '630102', '640104', '650102'
]

export const SURNAMES: string[] = [
  '赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈', '褚', '卫', '蒋', '沈', '韩', '杨',
  '朱', '秦', '尤', '许', '何', '吕', '施', '张', '孔', '曹', '严', '华', '金', '魏', '陶', '姜',
  '戚', '谢', '邹', '喻', '柏', '水', '窦', '章', '云', '苏', '潘', '葛', '奚', '范', '彭', '郎',
  '鲁', '韦', '昌', '马', '苗', '凤', '花', '方', '俞', '任', '袁', '柳', '唐', '罗', '薛', '伍'
]

export const GIVEN_CHARS: string[] = [
  '伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明',
  '超', '秀', '霞', '平', '刚', '桂', '英', '华', '建', '文', '斌', '辉', '鹏', '飞', '宇', '浩',
  '然', '睿', '泽', '轩', '晨', '阳', '琳', '雪', '悦', '欣', '怡', '婷', '佳', '嘉', '琪', '瑶',
  '子', '一', '小', '大', '天', '安', '宁', '康', '乐', '思', '语', '心', '若', '书', '博', '远',
  '志', '海', '江', '山', '云', '风', '雨', '雪', '松', '竹', '梅', '兰', '春', '秋', '冬', '夏'
]

export const CITY_PREFIXES: string[] = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '西安', '南京', '苏州']
export const STREETS: string[] = ['中山路', '人民路', '建设路', '解放路', '文化路', '长江路', '科技路', '花园街', '和平街', '望江路']
export const COMPANY_WORDS: string[] = ['云图', '恒信', '星辰', '同创', '天工', '远景', '嘉合', '智联', '长风', '沃德']
export const COMPANY_SUFFIXES: string[] = ['科技有限公司', '网络技术有限公司', '信息技术有限公司', '数据服务有限公司']
export const EMAIL_WORDS: string[] = ['user', 'test', 'dev', 'admin', 'demo', 'qa', 'ops', 'hello', 'team', 'mail']

const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const ID_CHECK_MAP = '10X98765432'

export function idCardCheckDigit(first17: string): string {
  let sum = 0
  for (let i = 0; i < 17; i += 1) sum += Number(first17[i]) * ID_WEIGHTS[i]
  return ID_CHECK_MAP[sum % 11]
}

export function luhnCheckDigit(digits: string): string {
  let sum = 0
  let double = true
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = Number(digits[i])
    if (double) {
      value *= 2
      if (value > 9) value -= 9
    }
    sum += value
    double = !double
  }
  return String((10 - (sum % 10)) % 10)
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

export function randomName(rng: Rng = defaultRng): string {
  const surname = pick(rng, SURNAMES)
  const length = randomInt(rng, 2) + 1
  let given = ''
  for (let i = 0; i < length; i += 1) given += pick(rng, GIVEN_CHARS)
  return surname + given
}

export function randomPhone(rng: Rng = defaultRng): string {
  const second = 3 + randomInt(rng, 7)
  let tail = ''
  for (let i = 0; i < 9; i += 1) tail += randomInt(rng, 10)
  return `1${second}${tail}`
}

export function randomIdCard(rng: Rng = defaultRng): string {
  const area = pick(rng, AREA_CODES)
  const year = 1940 + randomInt(rng, 67)
  const month = 1 + randomInt(rng, 12)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = 1 + randomInt(rng, daysInMonth)
  const seq = pad(randomInt(rng, 1000), 3)
  const first17 = `${area}${year}${pad(month, 2)}${pad(day, 2)}${seq}`
  return first17 + idCardCheckDigit(first17)
}

export function randomBankCard(rng: Rng = defaultRng): string {
  const length = 16 + randomInt(rng, 4)
  let prefix = ''
  for (let i = 0; i < length - 1; i += 1) prefix += randomInt(rng, 10)
  return prefix + luhnCheckDigit(prefix)
}

export function randomEmail(rng: Rng = defaultRng): string {
  const domains = ['example.com', 'test.com', 'example.org']
  const user = `${pick(rng, EMAIL_WORDS)}${randomInt(rng, 1000)}`
  return `${user}@${pick(rng, domains)}`
}

export function randomAddress(rng: Rng = defaultRng): string {
  return `${pick(rng, CITY_PREFIXES)}市${pick(rng, STREETS)}${randomInt(rng, 200) + 1}号`
}

export function randomCompany(rng: Rng = defaultRng): string {
  return `${pick(rng, CITY_PREFIXES)}${pick(rng, COMPANY_WORDS)}${pick(rng, COMPANY_SUFFIXES)}`
}

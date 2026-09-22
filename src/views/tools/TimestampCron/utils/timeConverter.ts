export type TimeUnit = 's' | 'ms' | 'us' | 'ns'

const FACTORS: Record<TimeUnit, bigint> = {
  s: 1_000_000_000n,
  ms: 1_000_000n,
  us: 1_000n,
  ns: 1n
}

/**
 * 转换时间戳精度（全程使用 BigInt 纯整数运算，严禁浮点截断）
 */
export function convertTimestamp(input: string, fromUnit: TimeUnit, toUnit: TimeUnit): string {
  const trimmed = input.trim()
  if (!trimmed || !/^-?\d+$/.test(trimmed)) {
    throw new Error(`无效的时间戳格式: "${input}"`)
  }

  const value = BigInt(trimmed)
  const ns = value * FACTORS[fromUnit]
  const target = ns / FACTORS[toUnit]
  return target.toString()
}

/**
 * 将时间戳拆解为标准 Date 对象和多余的亚毫秒纳秒数（extraNs 6位补齐）
 */
export function timestampToDate(ts: string, unit: TimeUnit): { date: Date; extraNs: string } {
  const trimmed = ts.trim()
  if (!trimmed || !/^-?\d+$/.test(trimmed)) {
    throw new Error(`无效的时间戳格式: "${ts}"`)
  }

  const value = BigInt(trimmed)
  const ns = value * FACTORS[unit]
  const ms = ns / 1_000_000n
  const remNs = ns % 1_000_000n
  const absRem = remNs < 0n ? -remNs : remNs

  const extraNs = absRem.toString().padStart(6, '0')
  const date = new Date(Number(ms))
  if (isNaN(date.getTime())) {
    throw new Error(`时间戳超出有效日期范围: "${ts}"`)
  }

  return { date, extraNs }
}

/**
 * 将 Date 转换为指定单位的时间戳字符串
 */
export function dateToTimestamp(date: Date, toUnit: TimeUnit): string {
  if (isNaN(date.getTime())) {
    return '0'
  }
  const ms = BigInt(date.getTime())
  const ns = ms * 1_000_000n
  const target = ns / FACTORS[toUnit]
  return target.toString()
}

export interface DateFormats {
  iso: string
  rfc2822: string
  utc: string
  local: string
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

/**
 * 格式化多重标准日期格式矩阵
 */
export function formatDateMatrix(date: Date): DateFormats {
  if (isNaN(date.getTime())) {
    return { iso: '', rfc2822: '', utc: '', local: '' }
  }
  const iso = date.toISOString()
  const rfc2822 = date.toUTCString()
  const utc = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`
  const local = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

  return { iso, rfc2822, utc, local }
}

export interface UnixDateCommands {
  macos: string
  macosFormatted: string
  linux: string
  linuxFormatted: string
}

/**
 * 生成 macOS 和 Linux 终端环境下的 Unix date 还原命令行
 */
export function generateUnixDateCommands(epochSeconds: string | number): UnixDateCommands {
  const sec = String(epochSeconds).trim()
  return {
    macos: `date -r ${sec}`,
    macosFormatted: `date -r ${sec} "+%Y-%m-%d %H:%M:%S"`,
    linux: `date -d @${sec}`,
    linuxFormatted: `date -d @${sec} "+%Y-%m-%d %H:%M:%S"`
  }
}

/**
 * 将 Cron 表达式逆向解析为易读的中文自然语言说明
 */
export function explainCronChinese(pattern: string): string {
  const trimmed = pattern.trim()
  if (!trimmed) return '无效的 Cron 表达式'

  const parts = trimmed.split(/\s+/)
  if (parts.length < 5 || parts.length > 7) {
    return '无效的 Cron 表达式'
  }

  // 快捷匹配常见模式
  if (trimmed === '* * * * *') return '每分钟执行一次'
  if (trimmed === '0 * * * *') return '每小时整点执行一次'
  if (trimmed === '0 0 * * *') return '每天午夜 00:00 执行一次'
  if (trimmed === '0 2 * * *') return '每天凌晨 02:00 执行一次'
  if (trimmed === '30 9 * * 1-5') return '每个工作日(周一至周五) 09:30 执行一次'
  if (trimmed === '0 30 9 * * 1-5') return '每个工作日(周一至周五) 09:30:00 执行一次'
  if (trimmed === '0 8 * * 1') return '每周一 08:00 执行一次'

  let secPart = ''
  let minPart = ''
  let hourPart = ''
  let domPart = ''
  let monthPart = ''
  let dowPart = ''

  if (parts.length === 5) {
    ;[minPart, hourPart, domPart, monthPart, dowPart] = parts
  } else {
    ;[secPart, minPart, hourPart, domPart, monthPart, dowPart] = parts
  }

  const weekDayMap: Record<string, string> = {
    '0': '周日',
    '1': '周一',
    '2': '周二',
    '3': '周三',
    '4': '周四',
    '5': '周五',
    '6': '周六',
    '7': '周日',
    '1-5': '周一至周五(工作日)',
    '6,0': '周末',
    '6,7': '周末'
  }

  const descSegments: string[] = []

  // 月份
  if (monthPart !== '*') {
    descSegments.push(`每年 ${monthPart} 月`)
  }

  // 星期 / 日期
  if (dowPart !== '*' && dowPart !== '?') {
    const dowText = weekDayMap[dowPart] || `星期 ${dowPart}`
    descSegments.push(`每逢 ${dowText}`)
  } else if (domPart !== '*' && domPart !== '?') {
    if (domPart.startsWith('*/')) {
      descSegments.push(`每隔 ${domPart.slice(2)} 天`)
    } else {
      descSegments.push(`每月 ${domPart} 日`)
    }
  } else {
    if (hourPart !== '*' && !hourPart.startsWith('*/')) {
      descSegments.push('每天')
    }
  }

  // 小时 / 分钟 / 秒
  if (hourPart === '*' && minPart.startsWith('*/')) {
    const step = minPart.slice(2)
    descSegments.push(`每隔 ${step} 分钟`)
  } else if (secPart && secPart.startsWith('*/') && minPart === '*' && hourPart === '*') {
    const step = secPart.slice(2)
    descSegments.push(`每隔 ${step} 秒`)
  } else if (hourPart === '*' && minPart === '*') {
    descSegments.push('每分钟')
  } else {
    const formatPart = (p: string, unit: string) => {
      if (p === '*') return `每${unit}`
      if (p.includes(',')) {
        return p
          .split(',')
          .map(sub => {
            const num = parseInt(sub.trim(), 10)
            return isNaN(num) ? sub : pad(num)
          })
          .join(',')
      }
      const num = parseInt(p, 10)
      return isNaN(num) ? p : pad(num)
    }
    const h = formatPart(hourPart, '小时')
    const m = formatPart(minPart, '分钟')
    if (secPart) {
      const s = formatPart(secPart, '秒')
      descSegments.push(`${h}:${m}:${s}`)
    } else {
      descSegments.push(`${h}:${m}`)
    }
  }

  return descSegments.join(' ') + ' 执行一次'
}

export interface TimezoneItem {
  id: string
  city: string
  timezone: string
  timeStr: string
  offsetStr: string
  isDst: boolean
}

const TARGET_TIMEZONES = [
  { id: 'local', city: '本地时间 (Local)', timezone: 'Local' },
  { id: 'beijing', city: '北京时间 (Asia/Shanghai)', timezone: 'Asia/Shanghai' },
  { id: 'utc', city: '世界协调时间 (UTC)', timezone: 'UTC' },
  { id: 'london', city: '伦敦时间 (Europe/London)', timezone: 'Europe/London' },
  { id: 'newyork', city: '纽约时间 (America/New_York)', timezone: 'America/New_York' },
  { id: 'tokyo', city: '东京时间 (Asia/Tokyo)', timezone: 'Asia/Tokyo' },
  { id: 'sf', city: '旧金山/洛杉矶 (America/Los_Angeles)', timezone: 'America/Los_Angeles' }
]

function formatTimeInZone(date: Date, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }
  if (timeZone && timeZone !== 'Local') {
    options.timeZone = timeZone
  }

  const formatter = new Intl.DateTimeFormat('en-CA', options)
  const parts = formatter.formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

function getZoneOffsetStr(date: Date, timeZone?: string): string {
  if (timeZone === 'UTC') return 'UTC'
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZoneName: 'longOffset'
    }
    if (timeZone && timeZone !== 'Local') {
      options.timeZone = timeZone
    }
    const formatter = new Intl.DateTimeFormat('en-US', options)
    const parts = formatter.formatToParts(date)
    const tzPart = parts.find(p => p.type === 'timeZoneName')
    if (tzPart?.value) {
      const match = tzPart.value.match(/GMT([+-]\d{2}:\d{2})/)
      if (match) {
        return `UTC${match[1]}`
      }
      return tzPart.value.replace('GMT', 'UTC')
    }
  } catch {
    // fallback
  }
  return 'UTC'
}

function parseOffsetMinutes(offStr: string): number {
  const match = offStr.match(/([+-])(\d{2}):(\d{2})/)
  if (!match) return 0
  const sign = match[1] === '-' ? -1 : 1
  return sign * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10))
}

function isDaylightSaving(date: Date, timeZone?: string): boolean {
  if (!timeZone || timeZone === 'UTC' || timeZone === 'Asia/Shanghai' || timeZone === 'Asia/Tokyo') {
    return false
  }
  try {
    const jan = new Date(date.getFullYear(), 0, 1)
    const jul = new Date(date.getFullYear(), 6, 1)
    const getOffset = (d: Date) => {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone === 'Local' ? undefined : timeZone,
        timeZoneName: 'longOffset'
      })
      return formatter.formatToParts(d).find(p => p.type === 'timeZoneName')?.value ?? ''
    }
    const curOffset = getOffset(date)
    const janOffset = getOffset(jan)
    const julOffset = getOffset(jul)

    if (janOffset !== julOffset) {
      const curMin = parseOffsetMinutes(curOffset)
      const janMin = parseOffsetMinutes(janOffset)
      const julMin = parseOffsetMinutes(julOffset)
      const standardMin = Math.min(janMin, julMin)
      return curMin > standardMin
    }
  } catch {
    // fallback
  }
  return false
}

/**
 * 获取世界主要时区对照矩阵数据
 */
export function getTimezoneMatrix(date: Date): TimezoneItem[] {
  return TARGET_TIMEZONES.map(item => {
    const timeStr = formatTimeInZone(date, item.timezone)
    const offsetStr = getZoneOffsetStr(date, item.timezone)
    const isDst = isDaylightSaving(date, item.timezone)

    return {
      id: item.id,
      city: item.city,
      timezone: item.timezone,
      timeStr,
      offsetStr,
      isDst
    }
  })
}

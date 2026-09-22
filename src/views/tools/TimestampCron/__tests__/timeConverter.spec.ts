import { describe, it, expect } from 'vitest'
import {
  convertTimestamp,
  timestampToDate,
  dateToTimestamp,
  formatDateMatrix,
  generateUnixDateCommands,
  explainCronChinese,
  getTimezoneMatrix
} from '../utils/timeConverter'

describe('Timestamp Converter (BigInt Lossless)', () => {
  const nano19 = '1727000000123456789'

  it('preserves 19-digit nanoseconds without float rounding loss', () => {
    // Standard JS Number would round 1727000000123456789 to 1727000000123456800
    const convertedNs = convertTimestamp(nano19, 'ns', 'ns')
    expect(convertedNs).toBe('1727000000123456789')

    const convertedUs = convertTimestamp(nano19, 'ns', 'us')
    expect(convertedUs).toBe('1727000000123456')

    const convertedMs = convertTimestamp(nano19, 'ns', 'ms')
    expect(convertedMs).toBe('1727000000123')

    const convertedS = convertTimestamp(nano19, 'ns', 's')
    expect(convertedS).toBe('1727000000')
  })

  it('converts smaller units up to nanoseconds', () => {
    expect(convertTimestamp('1727000000', 's', 'ns')).toBe('1727000000000000000')
    expect(convertTimestamp('1727000000123', 'ms', 'ns')).toBe('1727000000123000000')
    expect(convertTimestamp('1727000000123456', 'us', 'ns')).toBe('1727000000123456000')
    expect(convertTimestamp('1727000000', 's', 'ms')).toBe('1727000000000')
  })

  it('throws on invalid timestamp strings', () => {
    expect(() => convertTimestamp('invalid-number', 's', 'ms')).toThrow()
    expect(() => convertTimestamp('', 's', 'ms')).toThrow()
  })

  it('splits nanosecond timestamp to Date and sub-millisecond extraNs', () => {
    const { date, extraNs } = timestampToDate(nano19, 'ns')
    expect(date.getTime()).toBe(1727000000123)
    expect(extraNs).toBe('456789')
  })

  it('handles s, ms, us in timestampToDate', () => {
    const sResult = timestampToDate('1727000000', 's')
    expect(sResult.date.getTime()).toBe(1727000000000)
    expect(sResult.extraNs).toBe('000000')

    const msResult = timestampToDate('1727000000123', 'ms')
    expect(msResult.date.getTime()).toBe(1727000000123)
    expect(msResult.extraNs).toBe('000000')

    const usResult = timestampToDate('1727000000123456', 'us')
    expect(usResult.date.getTime()).toBe(1727000000123)
    expect(usResult.extraNs).toBe('456000')
  })

  it('converts Date to timestamp strings for all units', () => {
    const testDate = new Date(1727000000123)
    expect(dateToTimestamp(testDate, 's')).toBe('1727000000')
    expect(dateToTimestamp(testDate, 'ms')).toBe('1727000000123')
    expect(dateToTimestamp(testDate, 'us')).toBe('1727000000123000')
    expect(dateToTimestamp(testDate, 'ns')).toBe('1727000000123000000')
  })
})

describe('Format Date Matrix & Unix Commands', () => {
  it('formats dates in ISO, RFC2822, UTC and local format', () => {
    const d = new Date('2024-09-22T10:30:00.000Z')
    const matrix = formatDateMatrix(d)

    expect(matrix.iso).toBe('2024-09-22T10:30:00.000Z')
    expect(matrix.rfc2822).toContain('2024')
    expect(matrix.utc).toBe('2024-09-22 10:30:00 UTC')
    expect(matrix.local).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('generates macOS and Linux Unix date commands', () => {
    const cmds = generateUnixDateCommands('1727000000')

    expect(cmds.macos).toBe('date -r 1727000000')
    expect(cmds.macosFormatted).toBe('date -r 1727000000 "+%Y-%m-%d %H:%M:%S"')
    expect(cmds.linux).toBe('date -d @1727000000')
    expect(cmds.linuxFormatted).toBe('date -d @1727000000 "+%Y-%m-%d %H:%M:%S"')
  })

  it('handles number type in generateUnixDateCommands', () => {
    const cmds = generateUnixDateCommands(1727000000)
    expect(cmds.macos).toBe('date -r 1727000000')
    expect(cmds.linux).toBe('date -d @1727000000')
  })
})

describe('Chinese Cron Explanation', () => {
  it('explains standard 5-part cron patterns', () => {
    expect(explainCronChinese('* * * * *')).toContain('每分钟')
    expect(explainCronChinese('0 * * * *')).toContain('每小时')
    expect(explainCronChinese('0 2 * * *')).toContain('02:00')
    expect(explainCronChinese('30 9 * * 1-5')).toContain('09:30')
    expect(explainCronChinese('0 8 * * 1')).toContain('08:00')
    expect(explainCronChinese('*/5 * * * *')).toContain('5')
  })

  it('explains 6-part cron patterns with seconds', () => {
    const explanation = explainCronChinese('0 30 9 * * 1-5')
    expect(explanation).toContain('09:30:00')
    expect(explanation).toContain('周一至周五')
  })

  it('returns a fallback message for invalid cron', () => {
    expect(explainCronChinese('invalid cron')).toBe('无效的 Cron 表达式')
  })
})

describe('Timezone Matrix', () => {
  it('generates multi-timezone comparison matrix with key global regions', () => {
    const d = new Date('2024-09-22T10:30:00.000Z')
    const matrix = getTimezoneMatrix(d)

    expect(matrix.length).toBeGreaterThanOrEqual(6)

    const ids = matrix.map(m => m.timezone)
    expect(ids).toContain('Local')
    expect(ids).toContain('Asia/Shanghai')
    expect(ids).toContain('UTC')
    expect(ids).toContain('America/New_York')
    expect(ids).toContain('Europe/London')
    expect(ids).toContain('Asia/Tokyo')

    for (const item of matrix) {
      expect(item.city).toBeTruthy()
      expect(item.timeStr).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
      expect(item.offsetStr).toMatch(/^(UTC|GMT)[+-]\d{2}:\d{2}$|^UTC$/)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { AREA_CODES, GIVEN_CHARS, SURNAMES, idCardCheckDigit, luhnCheckDigit, randomBankCard, randomIdCard, randomName, randomPhone } from '../utils/mockData'

const seqRng = (start = 0) => {
  let counter = start
  return (bytes: Uint8Array) => {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (counter + i * 7) & 0xff
    counter = (counter + 13) & 0xff
  }
}

describe('mock-data Mock 数据', () => {
  it('词表规模与内容符合规范', () => {
    expect(AREA_CODES).toHaveLength(31)
    for (const code of AREA_CODES) {
      expect(code).toMatch(/^\d{6}$/)
      expect(['11', '12', '13', '14', '15', '21', '22', '23', '31', '32', '33', '34', '35', '36', '37', '41', '42', '43', '44', '45', '46', '50', '51', '52', '53', '54', '61', '62', '63', '64', '65']).toContain(code.slice(0, 2))
    }
    expect(SURNAMES.length).toBeGreaterThanOrEqual(60)
    expect(GIVEN_CHARS.length).toBeGreaterThanOrEqual(80)
    for (const char of [...SURNAMES, ...GIVEN_CHARS]) expect(char).toMatch(/^[\u4e00-\u9fa5]$/)
  })

  it('身份证校验位可自洽重算，出生日期在允许区间', () => {
    for (let i = 0; i < 20; i += 1) {
      const id = randomIdCard(seqRng(i))
      expect(id).toMatch(/^\d{17}[\dX]$/)
      expect(idCardCheckDigit(id.slice(0, 17))).toBe(id[17])
      const year = Number(id.slice(6, 10))
      expect(year).toBeGreaterThanOrEqual(1940)
      expect(year).toBeLessThanOrEqual(2006)
      expect(AREA_CODES).toContain(id.slice(0, 6))
    }
  })

  it('银行卡号通过 Luhn 校验', () => {
    for (let i = 0; i < 20; i += 1) {
      const card = randomBankCard(seqRng(i))
      expect(card).toMatch(/^\d{16,19}$/)
      expect(luhnCheckDigit(card.slice(0, -1))).toBe(card[card.length - 1])
    }
  })

  it('姓名与手机号格式正确', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(randomName(seqRng(i))).toMatch(/^[\u4e00-\u9fa5]{2,4}$/)
      expect(randomPhone(seqRng(i))).toMatch(/^1[3-9]\d{9}$/)
    }
  })

  it('已知样本的校验位算法正确', () => {
    expect(idCardCheckDigit('11010519491231002')).toBe('X')
    expect(idCardCheckDigit('44052418800101001')).toBe('4')
    expect(luhnCheckDigit('7992739871')).toBe('3')
  })
})

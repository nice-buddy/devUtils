import { describe, expect, it } from 'vitest'
import {
  AMBIGUOUS_CHARS,
  buildCharset,
  estimateEntropy,
  generatePasswords,
  type PasswordOptions
} from '../utils/password'

// 确定性 RNG：始终返回 0，用于断言长度、字符集与每类至少一个字符。
const zeroRng = (bytes: Uint8Array) => bytes.fill(0)

const base: PasswordOptions = {
  length: 16,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false,
  count: 1
}

describe('password-ssh 密码生成', () => {
  it('排除易混淆字符后字符集不再包含这些字符', () => {
    const { charset } = buildCharset({ ...base, excludeAmbiguous: true })
    for (const char of AMBIGUOUS_CHARS) expect(charset).not.toContain(char)
  })

  it('生成长度正确且每类至少一个字符', () => {
    const { passwords, error } = generatePasswords({ ...base, count: 3 }, zeroRng)
    expect(error).toBeUndefined()
    expect(passwords).toHaveLength(3)
    for (const password of passwords) {
      expect(password).toHaveLength(16)
      expect(/[A-Z]/.test(password)).toBe(true)
      expect(/[a-z]/.test(password)).toBe(true)
      expect(/[0-9]/.test(password)).toBe(true)
    }
  })

  it('关闭的字符类别不会出现在结果里', () => {
    const { passwords } = generatePasswords({ ...base, upper: false, symbols: false }, zeroRng)
    expect(passwords[0]).toMatch(/^[a-z0-9]+$/)
  })

  it('长度与数量越界、未启用任何字符集都返回错误', () => {
    expect(generatePasswords({ ...base, length: 3 }, zeroRng).error).toBeTruthy()
    expect(generatePasswords({ ...base, count: 0 }, zeroRng).error).toBeTruthy()
    expect(
      generatePasswords({ ...base, upper: false, lower: false, digits: false, symbols: false }, zeroRng).error
    ).toBeTruthy()
  })

  it('熵值按排除易混淆后的实际字符集计算', () => {
    const withAmbiguous = estimateEntropy({ ...base, excludeAmbiguous: false })
    const withoutAmbiguous = estimateEntropy({ ...base, excludeAmbiguous: true })
    expect(withoutAmbiguous.bits).toBeLessThan(withAmbiguous.bits)
    expect(withAmbiguous.level).toBe('strong')
  })
})

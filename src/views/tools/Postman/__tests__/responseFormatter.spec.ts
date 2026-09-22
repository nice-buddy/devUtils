import { describe, it, expect } from 'vitest'
import { formatResponseBody, LARGE_RESPONSE_THRESHOLD_BYTES } from '../utils/responseFormatter'

describe('Postman 响应体无损格式化器 (LosslessJSON & 大文本保护)', () => {
  it('100% 精确保留 19 位雪花数值字面量与纳秒时间戳，无数值截断', () => {
    const raw = '{"order_id":1892837482910293847,"user_id":9223372036854775807,"nano":1690000000123456789}'
    const formatted = formatResponseBody(raw)

    expect(formatted).toContain('1892837482910293847')
    expect(formatted).toContain('9223372036854775807')
    expect(formatted).toContain('1690000000123456789')
    expect(formatted).not.toContain('1892837482910293800')
  })

  it('超过 1MB 阈值的大体积响应跳过繁重格式化以保护界面流畅度', () => {
    // 构造一个超过 1MB 的超大 JSON 字符串
    const padding = 'x'.repeat(LARGE_RESPONSE_THRESHOLD_BYTES + 10)
    const largeJson = `{"data":"${padding}"}`

    // isLarge 为 true 时直接返回原文本
    const resultWithFlag = formatResponseBody(largeJson, true)
    expect(resultWithFlag).toBe(largeJson)

    // 文本本身超 1MB 时自动跳过格式化
    const resultAuto = formatResponseBody(largeJson, false)
    expect(resultAuto).toBe(largeJson)
  })

  it('普通非 JSON 纯文本原样返回', () => {
    const text = 'Hello world! Plain text response.'
    expect(formatResponseBody(text)).toBe(text)
  })

  it('容错处理：非法 JSON 字符串平稳降级，不抛出异常并返回原文本', () => {
    const malformed = '{"unclosed": "brace"'
    expect(() => formatResponseBody(malformed)).not.toThrow()
    expect(formatResponseBody(malformed)).toBe(malformed)
  })

  it('空字符串或空响应体安全处理', () => {
    expect(formatResponseBody('')).toBe('')
  })
})

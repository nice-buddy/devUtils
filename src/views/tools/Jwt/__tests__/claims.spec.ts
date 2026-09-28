import { describe, expect, it } from 'vitest'
import { describeClaims } from '../utils/claims'

const NOW = 1_700_000_000_000

describe('describeClaims', () => {
  it('exp 未过期时给出「还剩」相对时间与 ISO', () => {
    const rows = describeClaims({ exp: 1_700_000_090 }, NOW)
    const exp = rows.find(r => r.key === 'exp')
    expect(exp?.relative).toBe('还剩 1 分 30 秒')
    expect(exp?.iso).toBe(new Date(1_700_000_090_000).toISOString())
  })

  it('exp 已过期时给出「已过去」相对时间', () => {
    const rows = describeClaims({ exp: 1_699_999_400 }, NOW)
    expect(rows.find(r => r.key === 'exp')?.relative).toBe('已过去 10 分 0 秒')
  })

  it('超过一天时按天小时展示', () => {
    const rows = describeClaims({ exp: 1_700_000_000 + 90000 }, NOW)
    expect(rows.find(r => r.key === 'exp')?.relative).toBe('还剩 1 天 1 小时')
  })

  it('缺失的时间类 Claim 不输出相对时间，非时间 Claim 原样展示', () => {
    const rows = describeClaims({ sub: 'abc', iat: 1_700_000_000 }, NOW)
    expect(rows.find(r => r.key === 'sub')).toEqual({ key: 'sub', value: '"abc"' })
    expect(rows.find(r => r.key === 'iat')?.relative).toBe('就是现在')
  })
})

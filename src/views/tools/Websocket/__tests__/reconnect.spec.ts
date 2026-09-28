import { describe, expect, it } from 'vitest'
import { nextReconnectDelay, shouldReconnect } from '../utils/reconnect'

describe('reconnect', () => {
  it('退避按 2 的幂增长并封顶 30s', () => {
    expect(nextReconnectDelay(0)).toBe(1000)
    expect(nextReconnectDelay(1)).toBe(2000)
    expect(nextReconnectDelay(2)).toBe(4000)
    expect(nextReconnectDelay(5)).toBe(30000)
    expect(nextReconnectDelay(10)).toBe(30000)
  })

  it('负数或小数尝试次数被规整', () => {
    expect(nextReconnectDelay(-3)).toBe(1000)
    expect(nextReconnectDelay(1.7)).toBe(2000)
  })

  it('手动断开后不再重连', () => {
    expect(shouldReconnect({ manualClose: true, autoReconnect: true })).toBe(false)
    expect(shouldReconnect({ manualClose: false, autoReconnect: false })).toBe(false)
    expect(shouldReconnect({ manualClose: false, autoReconnect: true })).toBe(true)
  })
})

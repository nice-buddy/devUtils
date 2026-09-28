import { describe, expect, it } from 'vitest'
import { decodeSnowflake, nextSnowflake, type SnowflakeState } from '../utils/snowflake'

const EPOCH = 1288834974657n

describe('mock-data 雪花 ID', () => {
  it('同一毫秒内序列自增且 ID 互不相同', () => {
    const state: SnowflakeState = { lastTimestamp: 0, sequence: 0 }
    const ids = [0, 1, 2].map(() => nextSnowflake(state, 7, EPOCH, 1_700_000_000_000))
    expect(new Set(ids.map(String)).size).toBe(3)
    expect(ids[1] - ids[0]).toBe(1n)
  })

  it('序列用满 4096 后推进到下一毫秒', () => {
    const state: SnowflakeState = { lastTimestamp: 1_700_000_000_000, sequence: 4095 }
    nextSnowflake(state, 7, EPOCH, 1_700_000_000_000)
    expect(state.lastTimestamp).toBe(1_700_000_000_001)
    expect(state.sequence).toBe(0)
  })

  it('decode 往返得到时间戳 / 机器号 / 序列', () => {
    const state: SnowflakeState = { lastTimestamp: 0, sequence: 0 }
    const now = 1_700_000_000_000
    const id = nextSnowflake(state, 123, EPOCH, now)
    expect(decodeSnowflake(id, EPOCH)).toEqual({ timestamp: now, machineId: 123, sequence: 0 })
  })

  it('批量 1000 条互不相同', () => {
    const state: SnowflakeState = { lastTimestamp: 0, sequence: 0 }
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i += 1) ids.add(String(nextSnowflake(state, 1, EPOCH, 1_700_000_000_000)))
    expect(ids.size).toBe(1000)
  })
})

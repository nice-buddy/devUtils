import { describe, expect, it } from 'vitest'
import { appendLog, byteSize, filterLog, formatBytes, type WsLogEntry } from '../utils/wsLog'

const entry = (id: number, direction: WsLogEntry['direction'], payload: string): WsLogEntry => ({
  id,
  direction,
  kind: 'text',
  payload,
  size: byteSize(payload),
  timestamp: 1_700_000_000_000 + id
})

describe('wsLog', () => {
  it('appendLog 超过上限时丢弃最旧条目', () => {
    let log: WsLogEntry[] = []
    for (let i = 0; i < 5; i += 1) log = appendLog(log, entry(i, 'in', `m${i}`), 3)
    expect(log.map(e => e.id)).toEqual([2, 3, 4])
  })

  it('appendLog 不修改原数组', () => {
    const original: WsLogEntry[] = []
    appendLog(original, entry(1, 'in', 'x'), 10)
    expect(original).toHaveLength(0)
  })

  it('filterLog 关键字大小写不敏感且支持方向过滤', () => {
    const log = [entry(1, 'in', 'Hello'), entry(2, 'out', 'hello'), entry(3, 'system', '已连接')]
    expect(filterLog(log, { keyword: 'HELLO', direction: 'all' }).map(e => e.id)).toEqual([1, 2])
    expect(filterLog(log, { keyword: '', direction: 'system' }).map(e => e.id)).toEqual([3])
    expect(filterLog(log, { keyword: '', direction: 'all' })).toHaveLength(3)
  })

  it('byteSize 与 formatBytes', () => {
    expect(byteSize('abc')).toBe(3)
    expect(byteSize('中文')).toBe(6)
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB')
  })
})

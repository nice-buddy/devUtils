import { describe, expect, it } from 'vitest'
import { uuidV1, uuidV4, uuidV7 } from '../utils/uuid'

const seqRng = (start = 0) => {
  let counter = start
  return (bytes: Uint8Array) => {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (counter + i) & 0xff
    counter = (counter + bytes.length) & 0xff
  }
}

const version = (id: string) => id[14]
const variant = (id: string) => id[19]

describe('mock-data UUID', () => {
  it('v4 版本位与变体位正确，且同 rng 下输出确定', () => {
    const a = uuidV4(seqRng(0))
    const b = uuidV4(seqRng(0))
    expect(a).toBe(b)
    expect(version(a)).toBe('4')
    expect(['8', '9', 'a', 'b']).toContain(variant(a))
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('v7 版本位正确，时间前缀随毫秒递增', () => {
    const early = uuidV7(1_700_000_000_000, seqRng(0))
    const later = uuidV7(1_700_000_001_000, seqRng(0))
    expect(version(early)).toBe('7')
    expect(['8', '9', 'a', 'b']).toContain(variant(early))
    expect(early.slice(0, 12) < later.slice(0, 12)).toBe(true)
  })

  it('v1 版本位正确且 node 多播位置位', () => {
    const id = uuidV1(1_700_000_000_000, seqRng(0))
    expect(version(id)).toBe('1')
    expect(['8', '9', 'a', 'b']).toContain(variant(id))
    const nodeFirstByte = parseInt(id.replace(/-/g, '').slice(20, 22), 16)
    expect(nodeFirstByte & 0x01).toBe(1)
  })
})

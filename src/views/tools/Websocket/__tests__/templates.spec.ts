import { describe, expect, it } from 'vitest'
import { addTemplate, removeTemplate, updateTemplate, type WsTemplate } from '../utils/templates'

const base: WsTemplate[] = [{ id: 'a', name: 'ping', payload: '{"type":"ping"}' }]

describe('templates', () => {
  it('新增返回新数组且不改原数组', () => {
    const next = addTemplate(base, { id: 'b', name: 'sub', payload: '{}' })
    expect(next).toHaveLength(2)
    expect(base).toHaveLength(1)
  })

  it('更新命中 id 且不允许改 id', () => {
    const next = updateTemplate(base, 'a', { name: 'ping2', id: 'hacked' })
    expect(next[0].name).toBe('ping2')
    expect(next[0].id).toBe('a')
    expect(base[0].name).toBe('ping')
  })

  it('未知 id 的更新与删除是空操作', () => {
    expect(updateTemplate(base, 'zzz', { name: 'x' })).toEqual(base)
    expect(removeTemplate(base, 'zzz')).toEqual(base)
    expect(removeTemplate(base, 'a')).toHaveLength(0)
  })
})

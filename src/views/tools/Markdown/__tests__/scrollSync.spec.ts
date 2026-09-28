import { describe, expect, it } from 'vitest'
import { scrollRatio, targetScrollTop } from '../utils/scrollSync'

describe('scrollSync', () => {
  it('scrollRatio 在顶部为 0、底部为 1', () => {
    expect(scrollRatio({ scrollTop: 0, scrollHeight: 1000, clientHeight: 200 })).toBe(0)
    expect(scrollRatio({ scrollTop: 800, scrollHeight: 1000, clientHeight: 200 })).toBe(1)
  })

  it('scrollRatio 在中间为 0.5，且内容不足时返回 0', () => {
    expect(scrollRatio({ scrollTop: 400, scrollHeight: 1000, clientHeight: 200 })).toBe(0.5)
    expect(scrollRatio({ scrollTop: 10, scrollHeight: 100, clientHeight: 200 })).toBe(0)
  })

  it('scrollRatio 对越界值做钳制', () => {
    expect(scrollRatio({ scrollTop: -50, scrollHeight: 1000, clientHeight: 200 })).toBe(0)
    expect(scrollRatio({ scrollTop: 9999, scrollHeight: 1000, clientHeight: 200 })).toBe(1)
  })

  it('targetScrollTop 按比例换算并钳制', () => {
    expect(targetScrollTop({ scrollHeight: 1000, clientHeight: 200 }, 0.5)).toBe(400)
    expect(targetScrollTop({ scrollHeight: 1000, clientHeight: 200 }, 2)).toBe(800)
    expect(targetScrollTop({ scrollHeight: 100, clientHeight: 200 }, 0.5)).toBe(0)
  })
})

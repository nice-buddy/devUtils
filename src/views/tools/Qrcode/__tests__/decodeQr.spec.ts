import { describe, expect, it } from 'vitest'
import { decodeQr } from '../utils/decodeQr'
import { QR_FIXTURE_TEXT, qrFixturePixels } from './fixtures/qrMatrix'

describe('decodeQr', () => {
  it('能从像素缓冲里解出二维码文本', () => {
    const result = decodeQr(qrFixturePixels())
    expect(result).not.toBeNull()
    expect(result?.text).toBe(QR_FIXTURE_TEXT)
    expect(result?.version).toBe(1)
    expect(result?.bytes).toBe(QR_FIXTURE_TEXT.length)
  })

  it('纯白图片返回 null', () => {
    const width = 64
    const height = 64
    const data = new Uint8ClampedArray(width * height * 4)
    data.fill(255)
    expect(decodeQr({ data, width, height })).toBeNull()
  })
})

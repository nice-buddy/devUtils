import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, parseDataUrl, toDataUrl } from '../utils/dataUrl'

const PNG_PREFIX = 'data:' + 'image/png' + ';base64,'
const JPEG_PREFIX = 'data:' + 'image/jpeg' + ';base64,'

describe('dataUrl', () => {
  it('解析标准 DataURL', () => {
    const result = parseDataUrl(PNG_PREFIX + 'AQID')
    expect(result.error).toBeUndefined()
    expect(result.mime).toBe('image/png')
    expect(result.base64).toBe('AQID')
  })

  it('接受无前缀的纯 Base64 与 URL-safe 变体', () => {
    expect(parseDataUrl('AQID').base64).toBe('AQID')
    expect(parseDataUrl('_-A=').base64).toBe('/+A=')
  })

  it('非法字符与空串返回 error', () => {
    expect(parseDataUrl('').error).toBeTruthy()
    expect(parseDataUrl('!!!').error).toBeTruthy()
    expect(parseDataUrl('data:text/plain,hello').error).toBeTruthy()
  })

  it('toDataUrl 拼装前缀', () => {
    expect(toDataUrl('image/jpeg', 'AQID')).toBe(JPEG_PREFIX + 'AQID')
  })

  it('字节与 Base64 往返一致（含边界字节）', () => {
    const bytes = new Uint8Array([0, 255, 1, 254, 128])
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual([0, 255, 1, 254, 128])
  })
})

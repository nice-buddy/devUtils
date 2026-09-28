import { describe, expect, it } from 'vitest'
import { expiryLevel, formatFingerprint, formatPublicKey, oidLabel } from '../utils/certView'

describe('certView', () => {
  it('按剩余天数划分有效期状态', () => {
    expect(expiryLevel(-1)).toBe('expired')
    expect(expiryLevel(0)).toBe('soon')
    expect(expiryLevel(30)).toBe('soon')
    expect(expiryLevel(31)).toBe('ok')
  })

  it('指纹按大写冒号分隔展示', () => {
    expect(formatFingerprint('aabbcc')).toBe('AA:BB:CC')
    expect(formatFingerprint('')).toBe('')
  })

  it('公钥展示包含算法名与位数', () => {
    expect(formatPublicKey('1.2.840.113549.1.1.1', 2048)).toBe('RSA · 2048 bit')
    expect(formatPublicKey('1.2.840.10045.2.1', null)).toBe('EC')
  })

  it('OID 命中映射表时返回可读名，否则原样回落', () => {
    expect(oidLabel('1.2.840.113549.1.1.11')).toBe('SHA256withRSA')
    expect(oidLabel('1.3.101.112')).toBe('Ed25519')
    expect(oidLabel('9.9.9.9')).toBe('9.9.9.9')
  })
})

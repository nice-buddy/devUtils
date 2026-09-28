import { describe, expect, it } from 'vitest'
import { compareVersions, isNewerVersion, parseVersion } from '../version'

describe('parseVersion', () => {
  it('解析三段版本号并去掉 v 前缀', () => {
    expect(parseVersion('v1.2.3').numbers).toEqual([1, 2, 3])
    expect(parseVersion('1.2.3').prerelease).toBe('')
  })

  it('不足三段的版本号补齐为 0', () => {
    expect(parseVersion('1.2').numbers).toEqual([1, 2, 0])
    expect(parseVersion('2').numbers).toEqual([2, 0, 0])
  })

  it('保留预发布后缀', () => {
    expect(parseVersion('v0.1.0-mvp').prerelease).toBe('mvp')
    expect(parseVersion('v0.1.0-mvp').numbers).toEqual([0, 1, 0])
  })

  it('非法片段按 0 处理', () => {
    expect(parseVersion('x.y.z').numbers).toEqual([0, 0, 0])
    expect(parseVersion('').numbers).toEqual([0, 0, 0])
  })
})

describe('compareVersions', () => {
  it('相等版本返回 0', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0)
    expect(compareVersions('v1.0', '1.0.0')).toBe(0)
  })

  it('按主次修订依次比较', () => {
    expect(compareVersions('0.1.0', '0.2.0')).toBeLessThan(0)
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
  })

  it('预发布版本低于同号正式版', () => {
    expect(compareVersions('0.1.0-mvp', '0.1.0')).toBeLessThan(0)
    expect(compareVersions('0.1.0', '0.1.0-mvp')).toBeGreaterThan(0)
  })
})

describe('isNewerVersion', () => {
  it('仅在远端更高时返回 true', () => {
    expect(isNewerVersion('0.1.0', 'v0.2.0')).toBe(true)
    expect(isNewerVersion('0.1.0', 'v0.1.0')).toBe(false)
    expect(isNewerVersion('0.2.0', 'v0.1.9')).toBe(false)
  })
})

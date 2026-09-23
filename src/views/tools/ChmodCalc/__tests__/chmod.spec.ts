import { describe, expect, it } from 'vitest'
import {
  bitsToOctal,
  bitsToSymbolic,
  octalToBits,
  symbolicToBits,
  toCommand,
  type PermBits
} from '../utils/chmod'

function bits(raw: string): PermBits {
  const result = octalToBits(raw)
  if ('error' in result) throw new Error(result.error)
  return result.bits
}

describe('chmod-calc 权限换算', () => {
  it('数字权限与符号位双向转换', () => {
    expect(bitsToOctal(bits('755'))).toBe('755')
    expect(bitsToSymbolic(bits('755'))).toBe('-rwxr-xr-x')
    expect(bitsToSymbolic(bits('644'))).toBe('-rw-r--r--')
    const parsed = symbolicToBits('rwxr-xr-x')
    expect('bits' in parsed && bitsToOctal(parsed.bits)).toBe('755')
    const withType = symbolicToBits('-rw-r--r--')
    expect('bits' in withType && bitsToOctal(withType.bits)).toBe('644')
  })

  it('处理 setuid / setgid / sticky 四位权限', () => {
    expect(bitsToOctal(bits('4755'))).toBe('4755')
    expect(bitsToSymbolic(bits('4755'))).toBe('-rwsr-xr-x')
    expect(bitsToSymbolic(bits('1777'))).toBe('-rwxrwxrwt')
    expect(bitsToSymbolic(bits('4644'))).toBe('-rwSr--r--')
    const parsed = symbolicToBits('rwsr-xr-x')
    expect('bits' in parsed && parsed.bits.setuid).toBe(true)
  })

  it('非法输入只返回错误，不产生 bits（供视图不回填）', () => {
    expect('error' in octalToBits('789')).toBe(true)
    expect('error' in octalToBits('7')).toBe(true)
    expect('error' in symbolicToBits('rwx')).toBe(true)
    expect('error' in symbolicToBits('rwxrwxrwz')).toBe(true)
  })

  it('命令拼装包含 -R 与路径引用', () => {
    expect(toCommand(bits('755'), {})).toBe('chmod 755')
    expect(toCommand(bits('755'), { path: '/var/www', recursive: true })).toBe('chmod -R 755 /var/www')
    expect(toCommand(bits('600'), { path: '/tmp/my file' })).toBe("chmod 600 '/tmp/my file'")
  })
})

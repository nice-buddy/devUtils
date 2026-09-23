import { describe, expect, it } from 'vitest'
import { parsePublicKeys } from '../utils/sshKey'

const ED = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIE1B4BQ1QoTKWos5YBZPzGzdDgiFpyhHdz+5f/8rPwBe devutils@example.com'
const RSA = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCrXcWZLVm3nHGSu+oJ6/WLZ4L1n55viuEWkquWWFcn9+V+fm94Jv70W7XyFqJ5FYFZPI7pcl7BZujjepcnnLmjRPUvRgEmp5DeRcZoBhkRKj0m4YiEE5tlTOoZrYFQtuNuCZx7tpgoNw38AliJ5cJSIitMHkR8TMfPaQi9gyq6hVC7QPjxpzUyty8XDdORVs4pmywIUzMupqi44WpNAVAqwAOWUzZVQeS4lG13PbdYe8hQHjX8Szzx23wHUh4qxd/QR1J216gmtDua0bQryK6ImecF/pkFNEWAvRYzS3SVBeLlNgFn5n7W1X7LZKv+m23z9C3fhSpUmIDN5H7DQQJl rsa@example.com'
const EC = 'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBDOenPkDK+Xt/EBrJIeomE4wtiPjFbIdq6IKRXVRFo3ZjCHKsshYCwI758lA2Fyq5nPtiv7SL8lBpXOec+sVCEI= ecdsa@example.com'

describe('sshKey 公钥解析与指纹', () => {
  it('解析 ED25519 公钥并给出与 ssh-keygen 一致的指纹', () => {
    const { keys, issues } = parsePublicKeys(ED)
    expect(issues).toEqual([])
    expect(keys).toHaveLength(1)
    expect(keys[0].type).toBe('ssh-ed25519')
    expect(keys[0].bits).toBeUndefined()
    expect(keys[0].comment).toBe('devutils@example.com')
    expect(keys[0].sha256).toBe('SHA256:m7uTNIRAdw3CZKV1WqO3C0DFdwaHTjrPybpsYW5nPJk')
    expect(keys[0].md5).toBe('MD5:4e:d4:08:6c:4b:af:ac:ce:cd:30:5f:78:f3:05:c9:d4')
  })

  it('解析 RSA 公钥并按实际模数给出位数', () => {
    const { keys } = parsePublicKeys(RSA)
    expect(keys[0].type).toBe('ssh-rsa')
    expect(keys[0].bits).toBe(2048)
    expect(keys[0].sha256).toBe('SHA256:gvOvmtn00H/gSoxnGnyuCJdHveLT+jOm5armrAbGylA')
    expect(keys[0].md5).toBe('MD5:81:54:c4:6d:b9:72:2e:9f:e0:3f:93:01:6a:ed:89:d2')
  })

  it('解析 ECDSA 公钥并给出曲线与位数', () => {
    const { keys } = parsePublicKeys(EC)
    expect(keys[0].type).toBe('ecdsa-sha2-nistp256')
    expect(keys[0].curve).toBe('nistp256')
    expect(keys[0].bits).toBe(256)
    expect(keys[0].sha256).toBe('SHA256:tffopSqPv6px6dmK6/7E0cDfE7eSD4XTq+XPThE4MRs')
    expect(keys[0].md5).toBe('MD5:2b:86:15:2c:80:7a:65:52:26:f2:26:21:aa:64:c3:79')
  })

  it('解析 FIDO/SK 公钥（sk-ssh-ed25519）', () => {
    // 构造一个合法的 sk-ssh-ed25519@openssh.com blob：type + 32 字节公钥 + application
    const type = 'sk-ssh-ed25519@openssh.com'
    const parts: number[] = []
    const pushField = (bytes: number[]) => {
      parts.push((bytes.length >>> 24) & 0xff, (bytes.length >>> 16) & 0xff, (bytes.length >>> 8) & 0xff, bytes.length & 0xff, ...bytes)
    }
    pushField([...new TextEncoder().encode(type)])
    pushField(Array.from({ length: 32 }, (_, i) => i + 1))
    pushField([...new TextEncoder().encode('ssh:')])
    const blob = Buffer.from(parts)
    const line = `${type} ${blob.toString('base64')} sk@example.com`

    const { keys, issues } = parsePublicKeys(line)
    expect(issues).toEqual([])
    expect(keys[0].type).toBe(type)
    expect(keys[0].comment).toBe('sk@example.com')
    expect(keys[0].sha256.startsWith('SHA256:')).toBe(true)
    expect(keys[0].md5.startsWith('MD5:')).toBe(true)
  })

  it('带 options 前缀的行能正确解析且保留整行', () => {
    const line = `command="/usr/bin/foo --bar",no-port-forwarding ${ED}`
    const { keys, issues } = parsePublicKeys(line)
    expect(issues).toEqual([])
    expect(keys[0].type).toBe('ssh-ed25519')
    expect(keys[0].rawLine).toBe(line)
    expect(keys[0].sha256).toBe('SHA256:m7uTNIRAdw3CZKV1WqO3C0DFdwaHTjrPybpsYW5nPJk')
  })

  it('忽略空行与 # 注释行', () => {
    const { keys, issues } = parsePublicKeys(`# 这是注释\n\n${ED}\n`)
    expect(issues).toEqual([])
    expect(keys).toHaveLength(1)
    expect(keys[0].line).toBe(3)
  })

  it('混合输入时非法行只报自己的行号，合法行不受影响', () => {
    const { keys, issues } = parsePublicKeys(`${ED}\nssh-rsa not-base64!!! bad@example.com\n${RSA}`)
    expect(keys).toHaveLength(2)
    expect(keys.map(k => k.line)).toEqual([1, 3])
    expect(issues).toHaveLength(1)
    expect(issues[0].line).toBe(2)
  })

  it('声明的类型与密钥数据不一致时报错', () => {
    const { keys, issues } = parsePublicKeys(`ssh-rsa ${ED.split(' ')[1]} x@example.com`)
    expect(keys).toHaveLength(0)
    expect(issues[0].message).toContain('不一致')
  })

  it('空输入返回空结果且不报错', () => {
    expect(parsePublicKeys('   \n\n')).toEqual({ keys: [], issues: [] })
  })
})

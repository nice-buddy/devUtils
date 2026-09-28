import { describe, expect, it } from 'vitest'
import { hmacSign, verifyHs256, verifyRs256 } from '../utils/jwtVerify'

const SIGNING_INPUT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0'
// 固定 HS256 已知答案（node:crypto 用 secret="secret" 算出，header+payload = SIGNING_INPUT）
const HS256_SIGNATURE = '8qZF8vbN3UpcanXFc-mPXJkOPN01-bRch8XX3rToP1U'

const RS256_SIGNING_INPUT = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJycyJ9'
// 固定 RS256 样本：以下 JWK 与签名由 node:crypto 生成（2048 位 RSA / RSA-SHA256）
const RS256_JWK = '{"kty":"RSA","n":"ufpvQWI5B_WjFwsPdL8f0i8SCjrsPFegs5ldFPCIhTdfqrQbcw3blT8sW2srYDPVAk357brFlRk4VHOHN1x-ENgMB8t3-h1Q0uigxml4S66hNd5jRAWTbN8raOwIEgbzKoUKKI3r_d6IOA0soL1ClDRAyK2UEai4s4fco0fGsM3Jv-udsI2lpF6sCy5dvOrM3B3w1elWIVGfVAGw2B7oP7OrwAketjmy4y7PC0tYbk_H5kFmEKmcbUx8xYf55u3TENyHpW5SEy4KM60IhugtIasNWqWWoLJaaFHZE1WcRUP53H5HCP2zlBjmP4stkwpbDx-fb5UfAV7Ugq9raPRgDQ","e":"AQAB"}'
const RS256_SIGNATURE = 'fcPMm9AYn9kas7EauUEHYv_pVBDWmdmXLpSiCKB9PCwoiqesMqYqJsNnVO3EtsO-85TFzvbiS2uSl1cx3SY8Z9AUwrYbyySKWvGdiE9P8mYjIiIRZfwxplue4__4Oibb4LOLMvEovoBXgq2ERJZpjqHzd5SZXrypytYoS0bB56kvhQAkM_kAscysmnw67D2j2VvgUY-EYin_Z4OHjg-2dS-wbPlMzh_dJsKEEaVsaxjw7eLtvprFtAhfVauE7EdPBv7cFiaqZaytue0aotG5SNahguOmnnRcwKuHgNbVYxBABwAK1xIMFzqZxwpBJ8Ctnd4fnm27DTW_g84bFqasRA'

describe('jwtVerify', () => {
  it('hmacSign 输出 base64url 且与 verifyHs256 自洽', () => {
    const signature = hmacSign(SIGNING_INPUT, 'secret', false)
    expect(signature).not.toContain('=')
    expect(signature).toBe(HS256_SIGNATURE)
    expect(verifyHs256(SIGNING_INPUT, signature, 'secret', false)).toBe(true)
  })

  it('用已知答案验签通过', () => {
    expect(verifyHs256(SIGNING_INPUT, HS256_SIGNATURE, 'secret', false)).toBe(true)
  })

  it('错误 secret 验签失败，长度不同也不抛异常', () => {
    const signature = hmacSign(SIGNING_INPUT, 'secret', false)
    expect(verifyHs256(SIGNING_INPUT, signature, 'other', false)).toBe(false)
    expect(verifyHs256(SIGNING_INPUT, 'short', 'secret', false)).toBe(false)
  })

  it('RS256 用固定 JWK 验签通过', () => {
    const result = verifyRs256(RS256_SIGNING_INPUT, RS256_SIGNATURE, RS256_JWK)
    expect(result.error).toBeUndefined()
    expect(result.valid).toBe(true)
  })

  it('RS256 篡改签名后验签失败', () => {
    const tampered = RS256_SIGNATURE.slice(0, -2) + (RS256_SIGNATURE.endsWith('AA') ? 'BB' : 'AA')
    expect(verifyRs256(RS256_SIGNING_INPUT, tampered, RS256_JWK).valid).toBe(false)
  })

  it('RS256 公钥非法时返回 error 而不是抛异常', () => {
    expect(verifyRs256(RS256_SIGNING_INPUT, RS256_SIGNATURE, 'not-json').error).toBeTruthy()
    expect(verifyRs256(RS256_SIGNING_INPUT, RS256_SIGNATURE, '{"kty":"EC"}').error).toBeTruthy()
  })

  it('JWKS 按 kid 匹配，匹配不到时退回第一条', () => {
    const jwks = JSON.stringify({ keys: [JSON.parse(RS256_JWK)] })
    expect(verifyRs256(RS256_SIGNING_INPUT, RS256_SIGNATURE, jwks).valid).toBe(true)
    expect(verifyRs256(RS256_SIGNING_INPUT, RS256_SIGNATURE, jwks, 'unknown-kid').valid).toBe(true)
  })
})

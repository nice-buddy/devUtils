# 第三阶段批次 B 实施计划：JWT 解析与 WebSocket 调试

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付第三阶段批次 B 的两个工具——`jwt`（三段式解析、Claims 倒计时、HS256/RS256 验签、HS256 篡改重签）与 `websocket`（长连接、流式日志检索、心跳、退避重连、消息模板），零新增 npm 依赖。

**Architecture:** JWT 的解码/验签全部做成 `utils` 纯函数：HS256 用已有的 `@noble/hashes`，RS256 用 BigInt 模幂 + PKCS#1 v1.5 校验（不依赖 `crypto.subtle`，因为生产环境的 `tauri://localhost` 不保证是 secure context）。WebSocket 用 webview 原生 `WebSocket` API，日志/退避/模板做成纯函数；唯一非前端改动是 `tauri.conf.json` 的 CSP 增加 `connect-src 'self' ws: wss:`。

**Tech Stack:** Vue 3 (`<script setup lang="ts">`) + Naive UI + Tailwind + CodeMirror 6 + Vitest；`@noble/hashes`（已有依赖）。

**Spec:** `docs/superpowers/specs/2026-09-28-phase3-batch-b-design.md`

## Global Constraints

- 新增依赖为零：`package.json` 的 `dependencies` 与 `devDependencies` 均不得改动。
- `src/types/tool.ts` 不得改动（`jwt` / `websocket` 已注册）。
- `src-tauri/` 的改动**仅限** `tauri.conf.json` 的 `csp` 一行（Task 5）。
- 组件 Props 契约固定：`defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()`。
- 快照：回填 `props.initialSnapshot?.x ?? <默认值>`；落库 `tabStore.updateTabSnapshot(props.tabId, {...})`；文本输入 250ms 防抖；只持久化输入与视图选项。
- 派生结果（解码结果、验签结论、WebSocket 日志）不入快照；重开由 `onMounted` 用回填输入重算。
- 错误处理：非法输入用 `NAlert` 就地提示并保留上一次有效结果；空输入只显示空态不报错。
- 高亮渲染禁止 `v-html`，一律用分段数组 + `v-for`。
- JWT 输入超过 256KB 时关闭自动解析，改为手动按钮。
- 每个任务结束都要 `npm test` 与 `npm run build` 通过，并单独提交一次 git。

---

### Task 1: App.vue 接入与占位视图

**Files:**
- Modify: `src/App.vue`（2 个 `defineAsyncComponent` + 2 个 `resolveBaseComponent` 分支）
- Create: `src/views/tools/Jwt/Jwt.vue`（占位）
- Create: `src/views/tools/Websocket/Websocket.vue`（占位）

**Interfaces:**
- Produces: 侧边栏 `jwt` 与 `websocket` 能解析到真实组件（本任务先落占位，Task 3 / 6 替换）。

- [ ] **Step 1: 在 `src/App.vue` 的异步组件声明区追加（放在 `TabularConvert` 声明之后）**

```ts
const JwtTool = defineAsyncComponent(() => import('@/views/tools/Jwt/Jwt.vue'))
const WebsocketTool = defineAsyncComponent(() => import('@/views/tools/Websocket/Websocket.vue'))
```

- [ ] **Step 2: 在 `resolveBaseComponent` 内、`return ToolPlaceholder` 之前追加分支**

```ts
  if (toolId === 'jwt') {
    return JwtTool
  }
  if (toolId === 'websocket') {
    return WebsocketTool
  }
```

- [ ] **Step 3: 创建两个占位组件**

`src/views/tools/Jwt/Jwt.vue` 与 `src/views/tools/Websocket/Websocket.vue`，内容均为：

```vue
<script setup lang="ts">
defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()
</script>

<template>
  <div class="h-full flex items-center justify-center text-xs text-slate-400">待实现</div>
</template>
```

- [ ] **Step 4: 验证构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，构建通过。

> 说明：占位组件体积极小，Rollup 会把异步 chunk 合并进主 chunk，本步骤看不到 `Jwt-*.js` / `Websocket-*.js`，Task 3 / 6 替换实现后才会出现。

- [ ] **Step 5: 提交**

```bash
git add src/App.vue src/views/tools/Jwt/Jwt.vue src/views/tools/Websocket/Websocket.vue
git commit -m "feat(phase3-b): 接入 jwt/websocket 两个工具入口"
```

---

### Task 2: JWT 纯函数（decode / claims / verify）

**Files:**
- Create: `src/views/tools/Jwt/utils/jwtDecode.ts`
- Create: `src/views/tools/Jwt/utils/claims.ts`
- Create: `src/views/tools/Jwt/utils/jwtVerify.ts`
- Test: `src/views/tools/Jwt/__tests__/jwtDecode.spec.ts`
- Test: `src/views/tools/Jwt/__tests__/claims.spec.ts`
- Test: `src/views/tools/Jwt/__tests__/jwtVerify.spec.ts`

**Interfaces:**
- Produces:
  - `interface DecodedJwt { header: Record<string, any>; payload: Record<string, any>; rawHeader: string; rawPayload: string; rawSignature: string; signingInput: string }`
  - `base64UrlToBytes(input: string): Uint8Array`、`bytesToBase64Url(bytes: Uint8Array): string`
  - `decodeJwt(token: string): { value?: DecodedJwt; error?: string }`
  - `describeClaims(payload: Record<string, any>, now: number): { key: string; value: string; iso?: string; relative?: string }[]`
  - `verifyHs256(signingInput: string, signature: string, secret: string, secretIsBase64: boolean): boolean`
  - `hmacSign(signingInput: string, secret: string, secretIsBase64: boolean): string`
  - `verifyRs256(signingInput: string, signature: string, publicKeyJson: string, kid?: string): { valid: boolean; error?: string }`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/Jwt/__tests__/jwtDecode.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { base64UrlToBytes, bytesToBase64Url, decodeJwt } from '../utils/jwtDecode'

// header {"alg":"HS256","typ":"JWT"} / payload {"sub":"1","exp":1700000000}
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjoxNzAwMDAwMDAwfQ.abc-_123'

describe('jwtDecode', () => {
  it('解析三段式 token', () => {
    const { value, error } = decodeJwt(TOKEN)
    expect(error).toBeUndefined()
    expect(value?.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(value?.payload).toEqual({ sub: '1', exp: 1700000000 })
    expect(value?.signingInput).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjoxNzAwMDAwMDAwfQ')
    expect(value?.rawSignature).toBe('abc-_123')
  })

  it('段数不是 3 时报错', () => {
    expect(decodeJwt('a.b').error).toContain('3 段')
    expect(decodeJwt('a.b.c.d').error).toContain('3 段')
  })

  it('非法 base64url 或非 JSON 时给出带段名的错误', () => {
    expect(decodeJwt('!!!.eyJzdWIiOiIxIn0.sig').error).toContain('Header')
    expect(decodeJwt('eyJhbGciOiJIUzI1NiJ9.bm90LWpzb24.sig').error).toContain('Payload')
  })

  it('base64url 往返一致，含 - 与 _', () => {
    const bytes = new Uint8Array([251, 255, 190, 0, 1])
    const encoded = bytesToBase64Url(bytes)
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(Array.from(base64UrlToBytes(encoded))).toEqual([251, 255, 190, 0, 1])
  })

  it('缺 padding 的段也能解码', () => {
    expect(new TextDecoder().decode(base64UrlToBytes('eyJzdWIiOiIxIn0'))).toBe('{"sub":"1"}')
  })
})
```

创建 `src/views/tools/Jwt/__tests__/claims.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { describeClaims } from '../utils/claims'

const NOW = 1_700_000_000_000

describe('describeClaims', () => {
  it('exp 未过期时给出「还剩」相对时间与 ISO', () => {
    const rows = describeClaims({ exp: 1_700_000_090 }, NOW)
    const exp = rows.find(r => r.key === 'exp')
    expect(exp?.relative).toBe('还剩 1 分 30 秒')
    expect(exp?.iso).toBe(new Date(1_700_000_090_000).toISOString())
  })

  it('exp 已过期时给出「已过去」相对时间', () => {
    const rows = describeClaims({ exp: 1_699_999_400 }, NOW)
    expect(rows.find(r => r.key === 'exp')?.relative).toBe('已过去 10 分 0 秒')
  })

  it('超过一天时按天小时展示', () => {
    const rows = describeClaims({ exp: 1_700_000_000 + 90000 }, NOW)
    expect(rows.find(r => r.key === 'exp')?.relative).toBe('还剩 1 天 1 小时')
  })

  it('缺失的时间类 Claim 不输出相对时间，非时间 Claim 原样展示', () => {
    const rows = describeClaims({ sub: 'abc', iat: 1_700_000_000 }, NOW)
    expect(rows.find(r => r.key === 'sub')).toEqual({ key: 'sub', value: '"abc"' })
    expect(rows.find(r => r.key === 'iat')?.relative).toBe('就是现在')
  })
})
```

创建 `src/views/tools/Jwt/__tests__/jwtVerify.spec.ts`：

```ts
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
```

> 上面两个 RS256 常量与 HS256 的 `HS256_SIGNATURE` 都是用 `node:crypto` 一次性生成后写死的**已知答案**，实施时直接照抄，不要改。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/Jwt`
Expected: FAIL，报无法解析 `../utils/jwtDecode` 等模块。

- [ ] **Step 3: 实现三个 utils 模块**

创建 `src/views/tools/Jwt/utils/jwtDecode.ts`：

```ts
export interface DecodedJwt {
  header: Record<string, any>
  payload: Record<string, any>
  rawHeader: string
  rawPayload: string
  rawSignature: string
  signingInput: string
}

const decoder = new TextDecoder()

export function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeJwt(token: string): { value?: DecodedJwt; error?: string } {
  const parts = token.trim().split('.')
  if (parts.length !== 3) return { error: 'JWT 必须由 3 段组成（header.payload.signature）' }
  const [rawHeader, rawPayload, rawSignature] = parts
  let header: Record<string, any>
  let payload: Record<string, any>
  try {
    header = JSON.parse(decoder.decode(base64UrlToBytes(rawHeader)))
  } catch {
    return { error: 'Header 不是合法的 base64url JSON' }
  }
  try {
    payload = JSON.parse(decoder.decode(base64UrlToBytes(rawPayload)))
  } catch {
    return { error: 'Payload 不是合法的 base64url JSON' }
  }
  return {
    value: {
      header,
      payload,
      rawHeader,
      rawPayload,
      rawSignature,
      signingInput: `${rawHeader}.${rawPayload}`
    }
  }
}
```

创建 `src/views/tools/Jwt/utils/claims.ts`：

```ts
const TIME_CLAIMS = ['exp', 'iat', 'nbf']

function humanize(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分 ${secs} 秒`
  return `${secs} 秒`
}

export function describeClaims(
  payload: Record<string, any>,
  now: number
): { key: string; value: string; iso?: string; relative?: string }[] {
  return Object.entries(payload).map(([key, raw]) => {
    const row: { key: string; value: string; iso?: string; relative?: string } = {
      key,
      value: JSON.stringify(raw)
    }
    if (TIME_CLAIMS.includes(key) && typeof raw === 'number' && Number.isFinite(raw)) {
      row.iso = new Date(raw * 1000).toISOString()
      const diff = Math.round(raw - now / 1000)
      row.relative = diff === 0 ? '就是现在' : diff > 0 ? `还剩 ${humanize(diff)}` : `已过去 ${humanize(-diff)}`
    }
    return row
  })
}
```

创建 `src/views/tools/Jwt/utils/jwtVerify.ts`：

```ts
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { base64UrlToBytes, bytesToBase64Url } from './jwtDecode'

const encoder = new TextEncoder()

// PKCS#1 v1.5 里 SHA-256 的 DigestInfo 前缀
const SHA256_DIGEST_INFO_PREFIX = new Uint8Array([
  0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20
])

function secretBytes(secret: string, isBase64: boolean): Uint8Array {
  if (!isBase64) return encoder.encode(secret)
  const binary = atob(secret.trim())
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function hmacSign(signingInput: string, secret: string, secretIsBase64: boolean): string {
  const mac = hmac(sha256, secretBytes(secret, secretIsBase64), encoder.encode(signingInput))
  return bytesToBase64Url(mac)
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

export function verifyHs256(signingInput: string, signature: string, secret: string, secretIsBase64: boolean): boolean {
  try {
    const expected = hmac(sha256, secretBytes(secret, secretIsBase64), encoder.encode(signingInput))
    return timingSafeEqual(expected, base64UrlToBytes(signature))
  } catch {
    return false
  }
}

interface RsaJwk {
  kty?: string
  n: string
  e: string
  kid?: string
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)
  return value
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length)
  let rest = value
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = Number(rest & 0xffn)
    rest >>= 8n
  }
  return out
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n
  let b = base % modulus
  let e = exponent
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus
    b = (b * b) % modulus
    e >>= 1n
  }
  return result
}

function pickJwk(publicKeyJson: string, kid?: string): { jwk?: RsaJwk; error?: string } {
  let parsed: any
  try {
    parsed = JSON.parse(publicKeyJson)
  } catch {
    return { error: '公钥不是合法 JSON' }
  }
  const candidates: RsaJwk[] = Array.isArray(parsed?.keys) ? parsed.keys : [parsed]
  const rsa = candidates.filter(k => k && typeof k.n === 'string' && typeof k.e === 'string')
  if (!rsa.length) return { error: '公钥里没有 RSA JWK（需要 n 与 e）' }
  if (kid) {
    const matched = rsa.find(k => k.kid === kid)
    if (matched) return { jwk: matched }
  }
  return { jwk: rsa[0] }
}

export function verifyRs256(
  signingInput: string,
  signature: string,
  publicKeyJson: string,
  kid?: string
): { valid: boolean; error?: string } {
  const { jwk, error } = pickJwk(publicKeyJson, kid)
  if (!jwk) return { valid: false, error }
  try {
    const n = bytesToBigInt(base64UrlToBytes(jwk.n))
    const e = bytesToBigInt(base64UrlToBytes(jwk.e))
    const sig = base64UrlToBytes(signature)
    const s = bytesToBigInt(sig)
    if (s >= n) return { valid: false }
    const m = bigIntToBytes(modPow(s, e, n), sig.length)
    const digest = sha256(encoder.encode(signingInput))
    const minLength = 2 + 8 + 1 + SHA256_DIGEST_INFO_PREFIX.length + digest.length
    if (m.length < minLength) return { valid: false }
    if (m[0] !== 0x00 || m[1] !== 0x01) return { valid: false }
    const separator = m.length - 1 - digest.length - SHA256_DIGEST_INFO_PREFIX.length
    if (separator - 2 < 8) return { valid: false }
    for (let i = 2; i < separator; i += 1) {
      if (m[i] !== 0xff) return { valid: false }
    }
    if (m[separator] !== 0x00) return { valid: false }
    for (let i = 0; i < SHA256_DIGEST_INFO_PREFIX.length; i += 1) {
      if (m[separator + 1 + i] !== SHA256_DIGEST_INFO_PREFIX[i]) return { valid: false }
    }
    for (let i = 0; i < digest.length; i += 1) {
      if (m[separator + 1 + SHA256_DIGEST_INFO_PREFIX.length + i] !== digest[i]) return { valid: false }
    }
    return { valid: true }
  } catch {
    return { valid: false, error: '公钥解析失败' }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/Jwt`
Expected: PASS（三个文件全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/Jwt/utils src/views/tools/Jwt/__tests__
git commit -m "feat(jwt): 新增 JWT 解码/Claims/HS256与RS256 验签纯函数及单测"
```

---

### Task 3: JWT 视图

**Files:**
- Modify: `src/views/tools/Jwt/Jwt.vue`（替换占位实现）

**Interfaces:**
- Consumes: Task 2 的 `decodeJwt` / `describeClaims` / `verifyHs256` / `verifyRs256` / `hmacSign` / `bytesToBase64Url`
- Produces: 视图，快照字段 `{ token, secret, secretIsBase64, publicKeyJson, editedPayload }`

- [ ] **Step 1: 写视图实现**

替换 `src/views/tools/Jwt/Jwt.vue` 全文为：

```vue
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NRadioButton, NRadioGroup, NSwitch, NTag, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { Compartment, EditorState } from '@codemirror/state'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { bytesToBase64Url, decodeJwt, type DecodedJwt } from './utils/jwtDecode'
import { describeClaims } from './utils/claims'
import { hmacSign, verifyHs256, verifyRs256 } from './utils/jwtVerify'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

const AUTO_PARSE_MAX_BYTES = 256 * 1024

const token = ref<string>(props.initialSnapshot?.token ?? '')
const secret = ref<string>(props.initialSnapshot?.secret ?? '')
const secretIsBase64 = ref<boolean>(props.initialSnapshot?.secretIsBase64 ?? false)
const publicKeyJson = ref<string>(props.initialSnapshot?.publicKeyJson ?? '')
const editedPayload = ref<string>(props.initialSnapshot?.editedPayload ?? '')
const errorMessage = ref<string>('')
const decoded = ref<DecodedJwt | null>(null)
const verifyState = ref<'none' | 'valid' | 'invalid' | 'unavailable'>('none')
const verifyMessage = ref<string>('')
const now = ref<number>(Date.now())
const manualMode = ref<boolean>(false)
const editorEl = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let parseTimer: ReturnType<typeof setTimeout> | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null

const themeCompartment = new Compartment()

const algorithm = computed(() => String(decoded.value?.header?.alg ?? ''))
const segments = computed(() => {
  if (!decoded.value) return []
  return [
    { label: 'header', text: decoded.value.rawHeader, cls: 'text-rose-500 dark:text-rose-400' },
    { label: '.', text: '.', cls: 'text-slate-400' },
    { label: 'payload', text: decoded.value.rawPayload, cls: 'text-violet-500 dark:text-violet-400' },
    { label: '.', text: '.', cls: 'text-slate-400' },
    { label: 'signature', text: decoded.value.rawSignature, cls: 'text-cyan-600 dark:text-cyan-400' }
  ]
})
const claimRows = computed(() => (decoded.value ? describeClaims(decoded.value.payload, now.value) : []))

function getToken(): string {
  return editorView ? editorView.state.doc.toString() : token.value
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    token: getToken(),
    secret: secret.value,
    secretIsBase64: secretIsBase64.value,
    publicKeyJson: publicKeyJson.value,
    editedPayload: editedPayload.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function runDecode() {
  const text = getToken().trim()
  if (!text) {
    decoded.value = null
    errorMessage.value = ''
    verifyState.value = 'none'
    return
  }
  const result = decodeJwt(text)
  if (result.error || !result.value) {
    errorMessage.value = result.error ?? '解析失败'
    decoded.value = null
    return
  }
  errorMessage.value = ''
  decoded.value = result.value
  editedPayload.value = JSON.stringify(result.value.payload, null, 2)
  verifyState.value = 'none'
  verifyMessage.value = ''
}

function scheduleParse() {
  manualMode.value = getToken().length > AUTO_PARSE_MAX_BYTES
  if (manualMode.value) return
  if (parseTimer) clearTimeout(parseTimer)
  parseTimer = setTimeout(runDecode, 250)
}

function handleDocChange() {
  token.value = getToken()
  scheduleSnapshot()
  scheduleParse()
}

function runVerify() {
  if (!decoded.value) return
  if (algorithm.value === 'HS256') {
    if (!secret.value) {
      verifyState.value = 'unavailable'
      verifyMessage.value = '未提供密钥'
      return
    }
    const ok = verifyHs256(decoded.value.signingInput, decoded.value.rawSignature, secret.value, secretIsBase64.value)
    verifyState.value = ok ? 'valid' : 'invalid'
    verifyMessage.value = ok ? 'HS256 验签通过' : 'HS256 验签不通过'
    return
  }
  if (algorithm.value === 'RS256') {
    if (!publicKeyJson.value.trim()) {
      verifyState.value = 'unavailable'
      verifyMessage.value = '未提供公钥'
      return
    }
    const result = verifyRs256(decoded.value.signingInput, decoded.value.rawSignature, publicKeyJson.value, decoded.value.header?.kid)
    if (result.error) {
      verifyState.value = 'invalid'
      verifyMessage.value = result.error
      return
    }
    verifyState.value = result.valid ? 'valid' : 'invalid'
    verifyMessage.value = result.valid ? 'RS256 验签通过' : 'RS256 验签不通过'
    return
  }
  verifyState.value = 'unavailable'
  verifyMessage.value = `暂不支持 ${algorithm.value || '未知'} 算法`
}

function resign() {
  if (!decoded.value) return
  if (algorithm.value !== 'HS256') {
    message.warning('只有 HS256 才能用 secret 重新签名')
    return
  }
  if (!secret.value) {
    message.warning('请先填写 secret')
    return
  }
  let payload: Record<string, any>
  try {
    payload = JSON.parse(editedPayload.value)
  } catch {
    message.error('编辑后的 Payload 不是合法 JSON')
    return
  }
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(decoded.value.header)))
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = hmacSign(`${header}.${body}`, secret.value, secretIsBase64.value)
  const next = `${header}.${body}.${signature}`
  if (editorView) {
    editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: next } })
  }
  token.value = next
  runDecode()
  saveSnapshot()
  message.success('已重新签名')
}

function copyText(text: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success('已复制')
}

function getEditorTheme(isDark: boolean) {
  return EditorView.theme(
    {
      '&': { height: '100%', fontSize: '13px', backgroundColor: isDark ? '#090d16' : '#ffffff', color: isDark ? '#e2e8f0' : '#1e293b' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', lineHeight: '1.6' },
      '.cm-gutters': { backgroundColor: isDark ? '#070a10' : '#f8fafc', color: isDark ? '#475569' : '#94a3b8', borderRight: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0' }
    },
    { dark: isDark }
  )
}

onMounted(async () => {
  await nextTick()
  if (editorEl.value) {
    editorView = new EditorView({
      state: EditorState.create({
        doc: token.value,
        extensions: [
          basicSetup,
          themeCompartment.of(getEditorTheme(themeStore.isDark)),
          EditorView.updateListener.of(update => {
            if (update.docChanged) handleDocChange()
          })
        ]
      }),
      parent: editorEl.value
    })
  }
  runDecode()
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  if (parseTimer) clearTimeout(parseTimer)
  if (clockTimer) clearInterval(clockTimer)
  saveSnapshot()
  editorView?.destroy()
  editorView = null
})

watch([secret, secretIsBase64, publicKeyJson], scheduleSnapshot)
watch(editedPayload, scheduleSnapshot)
watch(
  () => themeStore.isDark,
  dark => {
    if (editorView) editorView.dispatch({ effects: themeCompartment.reconfigure(getEditorTheme(dark)) })
  }
)
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">JWT 解析与调试</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">三段式高亮、Claims 倒计时、HS256/RS256 验签与 HS256 重签</p>
      </div>
      <div class="flex items-center gap-2">
        <NTag v-if="algorithm" size="small">{{ algorithm }}</NTag>
        <NButton v-if="manualMode" size="small" type="primary" @click="runDecode">解析</NButton>
        <NButton size="small" @click="copyText(getToken())">复制 Token</NButton>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
      <NAlert v-if="manualMode" type="warning" :bordered="false">Token 超过 256KB，已关闭自动解析，请手动点击「解析」。</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 gap-3">
        <div class="flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 flex flex-col">
          <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">Token</div>
          <div ref="editorEl" class="flex-1 min-h-0 overflow-hidden"></div>
        </div>

        <div class="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shrink-0">
          <div class="text-xs font-medium mb-1">三段式</div>
          <div class="text-xs font-mono break-all">
            <span v-for="(segment, index) in segments" :key="index" :class="segment.cls">{{ segment.text }}</span>
            <span v-if="!segments.length" class="text-slate-400">粘贴 Token 后自动解析</span>
          </div>
        </div>

        <div class="h-2/5 min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
          <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">Header / Payload</div>
          <div class="flex-1 min-h-0 overflow-auto p-2 grid grid-cols-2 gap-2">
            <pre class="text-[11px] font-mono whitespace-pre-wrap">{{ decoded ? JSON.stringify(decoded.header, null, 2) : '' }}</pre>
            <pre class="text-[11px] font-mono whitespace-pre-wrap">{{ decoded ? JSON.stringify(decoded.payload, null, 2) : '' }}</pre>
          </div>
        </div>
      </section>

      <section class="flex flex-col min-h-0 gap-3">
        <div class="flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
          <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">Claims</div>
          <div class="flex-1 min-h-0 overflow-auto p-2 space-y-1">
            <div v-for="row in claimRows" :key="row.key" class="text-xs flex items-start gap-2">
              <code class="font-mono text-slate-500 dark:text-slate-400 w-20 shrink-0">{{ row.key }}</code>
              <code class="font-mono break-all flex-1">{{ row.value }}</code>
              <span v-if="row.relative" class="text-[11px] text-indigo-600 dark:text-indigo-400 shrink-0">{{ row.relative }}</span>
            </div>
            <p v-if="!claimRows.length" class="text-xs text-slate-400">暂无 Claims</p>
          </div>
        </div>

        <div class="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shrink-0 space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium">验签</span>
            <NRadioGroup :value="algorithm || 'HS256'" size="small" disabled>
              <NRadioButton value="HS256">HS256</NRadioButton>
              <NRadioButton value="RS256">RS256</NRadioButton>
            </NRadioGroup>
            <NButton size="tiny" type="primary" @click="runVerify">验签</NButton>
            <NTag
              v-if="verifyState !== 'none'"
              size="small"
              :type="verifyState === 'valid' ? 'success' : verifyState === 'invalid' ? 'error' : 'warning'"
            >
              {{ verifyMessage }}
            </NTag>
          </div>

          <div v-if="algorithm === 'HS256'" class="flex items-center gap-2">
            <span class="w-16 text-xs text-slate-500 dark:text-slate-400 shrink-0">Secret</span>
            <NInput v-model:value="secret" size="small" type="password" show-password-on="click" placeholder="HS256 secret" />
            <span class="flex items-center gap-1 text-xs shrink-0">
              <NSwitch v-model:value="secretIsBase64" size="small" />base64
            </span>
          </div>

          <div v-if="algorithm === 'RS256'" class="space-y-1">
            <span class="text-xs text-slate-500 dark:text-slate-400">公钥（JWK 或 JWKS）</span>
            <NInput v-model:value="publicKeyJson" type="textarea" :autosize="{ minRows: 3, maxRows: 6 }" placeholder='{"kty":"RSA","n":"...","e":"AQAB"}' />
          </div>

          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-500 dark:text-slate-400">Payload（可编辑后重签）</span>
              <NButton size="tiny" :disabled="algorithm !== 'HS256'" @click="resign">重新签名</NButton>
            </div>
            <NInput v-model:value="editedPayload" type="textarea" :autosize="{ minRows: 4, maxRows: 10 }" />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 类型检查与构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，产出 `dist/assets/Jwt-*.js`。

- [ ] **Step 3: 提交**

```bash
git add src/views/tools/Jwt/Jwt.vue
git commit -m "feat(jwt): 新增 JWT 解析与调试视图"
```

---

### Task 4: WebSocket 纯函数（日志 / 重连 / 模板）

**Files:**
- Create: `src/views/tools/Websocket/utils/wsLog.ts`
- Create: `src/views/tools/Websocket/utils/reconnect.ts`
- Create: `src/views/tools/Websocket/utils/templates.ts`
- Test: `src/views/tools/Websocket/__tests__/wsLog.spec.ts`
- Test: `src/views/tools/Websocket/__tests__/reconnect.spec.ts`
- Test: `src/views/tools/Websocket/__tests__/templates.spec.ts`

**Interfaces:**
- Produces:
  - `interface WsLogEntry { id: number; direction: 'in' | 'out' | 'system'; kind: 'text' | 'binary'; payload: string; size: number; timestamp: number }`
  - `LOG_LIMIT = 2000`、`byteSize(text: string): number`、`formatBytes(size: number): string`
  - `appendLog(entries: WsLogEntry[], entry: WsLogEntry, limit?: number): WsLogEntry[]`
  - `filterLog(entries: WsLogEntry[], options: { keyword: string; direction: 'all' | 'in' | 'out' | 'system' }): WsLogEntry[]`
  - `nextReconnectDelay(attempt: number): number`、`shouldReconnect(state: { manualClose: boolean; autoReconnect: boolean }): boolean`
  - `interface WsTemplate { id: string; name: string; payload: string }`、`addTemplate` / `updateTemplate` / `removeTemplate`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/Websocket/__tests__/wsLog.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { appendLog, byteSize, filterLog, formatBytes, type WsLogEntry } from '../utils/wsLog'

const entry = (id: number, direction: WsLogEntry['direction'], payload: string): WsLogEntry => ({
  id,
  direction,
  kind: 'text',
  payload,
  size: byteSize(payload),
  timestamp: 1_700_000_000_000 + id
})

describe('wsLog', () => {
  it('appendLog 超过上限时丢弃最旧条目', () => {
    let log: WsLogEntry[] = []
    for (let i = 0; i < 5; i += 1) log = appendLog(log, entry(i, 'in', `m${i}`), 3)
    expect(log.map(e => e.id)).toEqual([2, 3, 4])
  })

  it('appendLog 不修改原数组', () => {
    const original: WsLogEntry[] = []
    appendLog(original, entry(1, 'in', 'x'), 10)
    expect(original).toHaveLength(0)
  })

  it('filterLog 关键字大小写不敏感且支持方向过滤', () => {
    const log = [entry(1, 'in', 'Hello'), entry(2, 'out', 'hello'), entry(3, 'system', '已连接')]
    expect(filterLog(log, { keyword: 'HELLO', direction: 'all' }).map(e => e.id)).toEqual([1, 2])
    expect(filterLog(log, { keyword: '', direction: 'system' }).map(e => e.id)).toEqual([3])
    expect(filterLog(log, { keyword: '', direction: 'all' })).toHaveLength(3)
  })

  it('byteSize 与 formatBytes', () => {
    expect(byteSize('abc')).toBe(3)
    expect(byteSize('中文')).toBe(6)
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB')
  })
})
```

创建 `src/views/tools/Websocket/__tests__/reconnect.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { nextReconnectDelay, shouldReconnect } from '../utils/reconnect'

describe('reconnect', () => {
  it('退避按 2 的幂增长并封顶 30s', () => {
    expect(nextReconnectDelay(0)).toBe(1000)
    expect(nextReconnectDelay(1)).toBe(2000)
    expect(nextReconnectDelay(2)).toBe(4000)
    expect(nextReconnectDelay(5)).toBe(30000)
    expect(nextReconnectDelay(10)).toBe(30000)
  })

  it('负数或小数尝试次数被规整', () => {
    expect(nextReconnectDelay(-3)).toBe(1000)
    expect(nextReconnectDelay(1.7)).toBe(2000)
  })

  it('手动断开后不再重连', () => {
    expect(shouldReconnect({ manualClose: true, autoReconnect: true })).toBe(false)
    expect(shouldReconnect({ manualClose: false, autoReconnect: false })).toBe(false)
    expect(shouldReconnect({ manualClose: false, autoReconnect: true })).toBe(true)
  })
})
```

创建 `src/views/tools/Websocket/__tests__/templates.spec.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/Websocket`
Expected: FAIL，报无法解析 `../utils/wsLog` 等模块。

- [ ] **Step 3: 实现三个 utils 模块**

创建 `src/views/tools/Websocket/utils/wsLog.ts`：

```ts
export interface WsLogEntry {
  id: number
  direction: 'in' | 'out' | 'system'
  kind: 'text' | 'binary'
  payload: string
  size: number
  timestamp: number
}

export const LOG_LIMIT = 2000

const encoder = new TextEncoder()

export function byteSize(text: string): number {
  return encoder.encode(text).length
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function appendLog(entries: WsLogEntry[], entry: WsLogEntry, limit = LOG_LIMIT): WsLogEntry[] {
  const next = [...entries, entry]
  return next.length > limit ? next.slice(next.length - limit) : next
}

export function filterLog(
  entries: WsLogEntry[],
  options: { keyword: string; direction: 'all' | 'in' | 'out' | 'system' }
): WsLogEntry[] {
  const keyword = options.keyword.trim().toLowerCase()
  return entries.filter(entry => {
    if (options.direction !== 'all' && entry.direction !== options.direction) return false
    if (!keyword) return true
    return entry.payload.toLowerCase().includes(keyword)
  })
}
```

创建 `src/views/tools/Websocket/utils/reconnect.ts`：

```ts
export const MAX_RECONNECT_DELAY = 30000

export function nextReconnectDelay(attempt: number): number {
  const safe = Math.max(0, Math.floor(attempt))
  return Math.min(1000 * 2 ** safe, MAX_RECONNECT_DELAY)
}

export function shouldReconnect(state: { manualClose: boolean; autoReconnect: boolean }): boolean {
  return state.autoReconnect && !state.manualClose
}
```

创建 `src/views/tools/Websocket/utils/templates.ts`：

```ts
export interface WsTemplate {
  id: string
  name: string
  payload: string
}

export function addTemplate(list: WsTemplate[], template: WsTemplate): WsTemplate[] {
  return [...list, template]
}

export function updateTemplate(list: WsTemplate[], id: string, patch: Partial<WsTemplate>): WsTemplate[] {
  return list.map(item => (item.id === id ? { ...item, ...patch, id: item.id } : item))
}

export function removeTemplate(list: WsTemplate[], id: string): WsTemplate[] {
  return list.filter(item => item.id !== id)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/Websocket`
Expected: PASS（三个文件全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/Websocket/utils src/views/tools/Websocket/__tests__
git commit -m "feat(websocket): 新增日志/退避重连/模板纯函数及单测"
```

---

### Task 5: CSP 放行与测试夹具

**Files:**
- Modify: `src-tauri/tauri.conf.json`（`app.security.csp` 增加 `connect-src`）

**Interfaces:**
- Produces: webview 允许 `ws:` / `wss:` 连接；`ws://` 是否被混合内容策略拦截的结论。

- [ ] **Step 1: 修改 CSP**

把 `src-tauri/tauri.conf.json` 的 `app.security.csp` 从：

```json
"csp": "default-src 'self'; img-src 'self' asset: data:; style-src 'self' 'unsafe-inline'; script-src 'self'"
```

改为：

```json
"csp": "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' asset: data:; style-src 'self' 'unsafe-inline'; script-src 'self'"
```

- [ ] **Step 2: 起一个本地 WebSocket echo 服务（临时脚本，验证后删除）**

创建 `/tmp/ws-echo.mjs`：

```js
import { createServer } from 'node:net'
import { createHash } from 'node:crypto'

const PORT = 8799
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

createServer(socket => {
  socket.once('data', buffer => {
    const key = /Sec-WebSocket-Key: (.+)/i.exec(buffer.toString())?.[1]?.trim()
    if (!key) return socket.destroy()
    const accept = createHash('sha1').update(key + GUID).digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    )
    socket.on('data', frame => {
      // 只处理未掩码/掩码的单帧文本回显：解析 opcode 与长度，回写同样载荷
      const opcode = frame[0] & 0x0f
      if (opcode === 0x8) return socket.end()
      let length = frame[1] & 0x7f
      let offset = 2
      if (length === 126) { length = frame.readUInt16BE(2); offset = 4 }
      const masked = (frame[1] & 0x80) !== 0
      const mask = masked ? frame.subarray(offset, offset + 4) : null
      if (masked) offset += 4
      const payload = Buffer.from(frame.subarray(offset, offset + length))
      if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4]
      const header = payload.length < 126 ? Buffer.from([0x81, payload.length]) : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff])
      socket.write(Buffer.concat([header, payload]))
    })
  })
}).listen(PORT, '127.0.0.1', () => console.log('ws echo on ' + PORT))
```

Run: `node /tmp/ws-echo.mjs`（后台运行）

- [ ] **Step 3: 校验改动范围**

Run: `git diff src-tauri/tauri.conf.json`
Expected: 只有 `csp` 一行变化，其余字段不动。

> 本任务**不做**连通性实测：那时 WebSocket 视图（Task 6）还没实现，没有可操作的界面。真实连通性验证放在 Task 7 的验收步骤里（用 Task 6 的视图 + 本任务的 echo 服务）。

- [ ] **Step 4: 清理临时脚本并提交**

```bash
rm /tmp/ws-echo.mjs
git add src-tauri/tauri.conf.json
git commit -m "feat(websocket): CSP 放行 connect-src ws/wss 以支持原生 WebSocket"
```

---

### Task 6: WebSocket 视图

**Files:**
- Modify: `src/views/tools/Websocket/Websocket.vue`（替换占位实现）

**Interfaces:**
- Consumes: Task 4 的 `appendLog` / `filterLog` / `formatBytes` / `byteSize` / `nextReconnectDelay` / `shouldReconnect` / 模板函数
- Produces: 视图，快照字段 `{ url, protocols, templates, heartbeatEnabled, heartbeatIntervalMs, heartbeatPayload, autoReconnect, keyword, direction }`

- [ ] **Step 1: 写视图实现**

替换 `src/views/tools/Websocket/Websocket.vue` 全文为：

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NInputNumber, NSelect, NSwitch, NTag, useMessage } from 'naive-ui'
import { useTabStore } from '@/stores/tabStore'
import { appendLog, byteSize, filterLog, formatBytes, type WsLogEntry } from './utils/wsLog'
import { nextReconnectDelay, shouldReconnect } from './utils/reconnect'
import { addTemplate, removeTemplate, updateTemplate, type WsTemplate } from './utils/templates'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

const DIRECTIONS = [
  { label: '全部', value: 'all' },
  { label: '仅收', value: 'in' },
  { label: '仅发', value: 'out' },
  { label: '仅系统', value: 'system' }
]

const url = ref<string>(props.initialSnapshot?.url ?? 'ws://127.0.0.1:8799')
const protocols = ref<string>(props.initialSnapshot?.protocols ?? '')
const templates = ref<WsTemplate[]>(props.initialSnapshot?.templates ?? [])
const heartbeatEnabled = ref<boolean>(props.initialSnapshot?.heartbeatEnabled ?? false)
const heartbeatIntervalMs = ref<number>(props.initialSnapshot?.heartbeatIntervalMs ?? 15000)
const heartbeatPayload = ref<string>(props.initialSnapshot?.heartbeatPayload ?? '{"type":"ping"}')
const autoReconnect = ref<boolean>(props.initialSnapshot?.autoReconnect ?? true)
const keyword = ref<string>(props.initialSnapshot?.keyword ?? '')
const direction = ref<'all' | 'in' | 'out' | 'system'>(props.initialSnapshot?.direction ?? 'all')
const outbound = ref<string>('')
const newTemplateName = ref<string>('')
const status = ref<'idle' | 'connecting' | 'open' | 'closing' | 'closed'>('idle')
const errorMessage = ref<string>('')
const log = ref<WsLogEntry[]>([])
let socket: WebSocket | null = null
let manualClose = false
let reconnectAttempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let logId = 0

const visibleLog = computed(() => filterLog(log.value, { keyword: keyword.value, direction: direction.value }))

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    url: url.value,
    protocols: protocols.value,
    templates: [...templates.value],
    heartbeatEnabled: heartbeatEnabled.value,
    heartbeatIntervalMs: heartbeatIntervalMs.value,
    heartbeatPayload: heartbeatPayload.value,
    autoReconnect: autoReconnect.value,
    keyword: keyword.value,
    direction: direction.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function pushLog(directionValue: WsLogEntry['direction'], kind: WsLogEntry['kind'], payload: string) {
  logId += 1
  log.value = appendLog(log.value, {
    id: logId,
    direction: directionValue,
    kind,
    payload,
    size: byteSize(payload),
    timestamp: Date.now()
  })
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

function startHeartbeat() {
  stopHeartbeat()
  if (!heartbeatEnabled.value) return
  heartbeatTimer = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(heartbeatPayload.value)
      pushLog('out', 'text', `[heartbeat] ${heartbeatPayload.value}`)
    }
  }, Math.max(1000, heartbeatIntervalMs.value))
}

function clearReconnectTimer() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
}

function connect() {
  clearReconnectTimer()
  errorMessage.value = ''
  manualClose = false
  if (socket) {
    socket.close()
    socket = null
  }
  const target = url.value.trim()
  if (!target) {
    errorMessage.value = '请输入 WebSocket 地址'
    return
  }
  status.value = 'connecting'
  try {
    socket = protocols.value.trim()
      ? new WebSocket(target, protocols.value.split(',').map(item => item.trim()).filter(Boolean))
      : new WebSocket(target)
  } catch (err) {
    status.value = 'idle'
    errorMessage.value = err instanceof Error ? err.message : 'WebSocket 地址非法'
    return
  }
  pushLog('system', 'text', `正在连接 ${target}`)

  socket.onopen = () => {
    status.value = 'open'
    reconnectAttempt = 0
    pushLog('system', 'text', '已连接')
    startHeartbeat()
  }
  socket.onmessage = event => {
    if (typeof event.data === 'string') {
      pushLog('in', 'text', event.data)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1] ?? ''
      pushLog('in', 'binary', `[binary] ${base64}`)
    }
    reader.readAsDataURL(event.data as Blob)
  }
  socket.onerror = () => {
    pushLog('system', 'text', '连接出错')
  }
  socket.onclose = event => {
    status.value = 'closed'
    stopHeartbeat()
    pushLog('system', 'text', `连接关闭 code=${event.code} reason=${event.reason || '-'} clean=${event.wasClean}`)
    if (shouldReconnect({ manualClose, autoReconnect: autoReconnect.value })) {
      const delay = nextReconnectDelay(reconnectAttempt)
      reconnectAttempt += 1
      pushLog('system', 'text', `${delay}ms 后重连（第 ${reconnectAttempt} 次）`)
      reconnectTimer = setTimeout(connect, delay)
    }
  }
}

function disconnect() {
  manualClose = true
  clearReconnectTimer()
  stopHeartbeat()
  if (socket) {
    status.value = 'closing'
    socket.close()
  }
}

function send() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    message.warning('连接未就绪')
    return
  }
  if (!outbound.value) return
  socket.send(outbound.value)
  pushLog('out', 'text', outbound.value)
}

function applyTemplate(template: WsTemplate) {
  outbound.value = template.payload
}

function createTemplate() {
  const name = newTemplateName.value.trim() || `模板 ${templates.value.length + 1}`
  templates.value = addTemplate(templates.value, { id: `tpl_${Date.now()}`, name, payload: outbound.value })
  newTemplateName.value = ''
  saveSnapshot()
}

function renameTemplate(template: WsTemplate, name: string) {
  templates.value = updateTemplate(templates.value, template.id, { name })
  scheduleSnapshot()
}

function dropTemplate(template: WsTemplate) {
  templates.value = removeTemplate(templates.value, template.id)
  saveSnapshot()
}

function clearLog() {
  log.value = []
}

watch([url, protocols, heartbeatEnabled, heartbeatIntervalMs, heartbeatPayload, autoReconnect, keyword, direction], scheduleSnapshot)

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  clearReconnectTimer()
  stopHeartbeat()
  manualClose = true
  saveSnapshot()
  socket?.close()
  socket = null
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 shrink-0 space-y-2">
      <div class="flex items-center gap-2">
        <NInput v-model:value="url" size="small" class="flex-1" placeholder="ws://127.0.0.1:8799" />
        <NInput v-model:value="protocols" size="small" class="w-40" placeholder="子协议（逗号分隔）" />
        <NButton size="small" type="primary" :disabled="status === 'open' || status === 'connecting'" @click="connect">连接</NButton>
        <NButton size="small" :disabled="status !== 'open'" @click="disconnect">断开</NButton>
        <NTag size="small" :type="status === 'open' ? 'success' : status === 'connecting' ? 'warning' : 'default'">{{ status }}</NTag>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="autoReconnect" size="small" />自动重连</span>
        <span class="flex items-center gap-2 text-xs">
          <NSwitch v-model:value="heartbeatEnabled" size="small" />心跳
          <NInputNumber v-model:value="heartbeatIntervalMs" class="w-28" size="small" :min="1000" :step="1000" />ms
        </span>
        <NInput v-model:value="heartbeatPayload" size="small" class="max-w-xs" placeholder="心跳载荷" />
        <span class="text-[11px] text-slate-400">浏览器 API 不能发控制帧 Ping，这里是应用层心跳</span>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 gap-3">
        <div class="flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
          <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span class="text-xs font-medium">发送</span>
            <NButton size="tiny" type="primary" @click="send">发送</NButton>
          </div>
          <textarea
            v-model="outbound"
            class="flex-1 min-h-0 w-full resize-none bg-transparent p-3 text-xs font-mono outline-none"
            placeholder='{"type":"subscribe"}'
          ></textarea>
        </div>

        <div class="h-1/3 min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
          <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
            <span class="text-xs font-medium">消息模板</span>
            <NInput v-model:value="newTemplateName" size="tiny" class="w-32" placeholder="模板名" />
            <NButton size="tiny" @click="createTemplate">存为模板</NButton>
          </div>
          <div class="flex-1 min-h-0 overflow-auto p-2 space-y-1">
            <div v-for="template in templates" :key="template.id" class="flex items-center gap-2">
              <NInput :value="template.name" size="tiny" class="w-28" @update:value="renameTemplate(template, $event)" />
              <code class="flex-1 text-[11px] font-mono truncate">{{ template.payload }}</code>
              <NButton size="tiny" @click="applyTemplate(template)">填入</NButton>
              <NButton size="tiny" @click="dropTemplate(template)">删除</NButton>
            </div>
            <p v-if="!templates.length" class="text-xs text-slate-400">暂无模板</p>
          </div>
        </div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <span class="text-xs font-medium">日志（{{ visibleLog.length }} / {{ log.length }}）</span>
          <NInput v-model:value="keyword" size="tiny" class="w-40" placeholder="关键字检索" />
          <NSelect v-model:value="direction" size="tiny" class="w-24" :options="DIRECTIONS" />
          <NButton size="tiny" @click="clearLog">清空</NButton>
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-2 space-y-1 font-mono text-[11px]">
          <div v-for="entry in visibleLog" :key="entry.id" class="flex items-start gap-2">
            <span class="text-slate-400 shrink-0">{{ new Date(entry.timestamp).toLocaleTimeString() }}</span>
            <span
              class="shrink-0"
              :class="entry.direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : entry.direction === 'out' ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'"
            >{{ entry.direction }}</span>
            <span class="text-slate-400 shrink-0">{{ formatBytes(entry.size) }}</span>
            <span class="break-all">{{ entry.payload }}</span>
          </div>
          <p v-if="!visibleLog.length" class="text-xs text-slate-400">暂无日志</p>
        </div>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 类型检查与构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，产出 `dist/assets/Websocket-*.js`。

- [ ] **Step 3: 提交**

```bash
git add src/views/tools/Websocket/Websocket.vue
git commit -m "feat(websocket): 新增 WebSocket 调试视图（收发/日志检索/心跳/重连/模板）"
```

---

### Task 7: 全量回归与验收

**Files:** 无新增（只跑验证；若发现回归，修正对应任务的文件后重跑）

- [ ] **Step 1: 前端全量测试与构建**

Run: `npm test`
Expected: 既有用例 + 批次 B 新增的 6 组用例全部 PASS。

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，`dist/assets/` 下能看到 `Jwt-*.js` 与 `Websocket-*.js`。

- [ ] **Step 2: Rust 回归**

Run: `cargo clippy --all-targets -- -D warnings`（工作目录 `src-tauri`）
Expected: 无 warning。

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部通过；`test_http` 需在沙箱外重跑确认 6 个用例全绿。

- [ ] **Step 3: 约束核对**

Run: `git diff --stat <批次起始提交>..HEAD -- package.json src/types/tool.ts`
Expected: 无输出。

Run: `git diff <批次起始提交>..HEAD -- src-tauri/`
Expected: 只有 `tauri.conf.json` 的 `csp` 一行变化。

- [ ] **Step 4: 真机验收清单（Tauri 应用 + 本地 echo 服务）**

先起测试夹具：重新创建 Task 5 Step 2 的 `/tmp/ws-echo.mjs` 并后台运行（`node /tmp/ws-echo.mjs`），再启动应用（`npm run tauri dev`）。

1. `jwt`：粘贴 Task 2 里的固定 HS256 token，三段高亮正确、`exp` 倒计时每秒刷新；填正确 secret 验签通过、错 secret 不通过；改 Payload 后点「重新签名」，新 token 能被同一 secret 验签通过。
2. `jwt`：粘贴固定 RS256 token 与 JWK，验签通过；改一个字符后不通过。
3. `websocket`：连上本地 echo 服务，发一条文本收到回显，日志两个方向都有记录；关键字检索能过滤；断开后按退避自动重连；开启心跳后按间隔发送并落日志。
4. 两个工具关闭 Tab 再打开，输入与视图选项还原；日志与验签结论不还原（符合设计）。
5. 控制台无未捕获异常。

验收结论处理：
- `ws://` 能连上 → 在 spec §4.3 把「需在实现阶段用本地 echo 服务实测」改成「已实测 `ws://` 在 `tauri://localhost` 下可用」。
- `ws://` 被混合内容拦截 → 在 spec §4.3 记录结论，并在 `Websocket.vue` 里对 `ws://` 输入加黄色提示「建议改用 wss://」，然后重跑 `npm test` 与 `npm run build` 并追加一次提交。

- [ ] **Step 5: 确认提交历史与工作区状态**

Run: `git log --oneline -10`
Expected: 看到本计划各任务的提交记录。

Run: `git status --short`
Expected: 无未提交改动。

- [ ] **Step 6: 向用户汇报**

汇报内容：两个工具的实现范围、零新增依赖的证据、CSP 改动的唯一性与实测结论、跑过的验证命令与结果、以及 RS256 为什么不用 `crypto.subtle`。

# 第二阶段批次 C 实施计划：SSH 公钥指纹与 SQL 格式化

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付批次 C 的两个能力——`password-ssh` 工具里的 SSH Key 页签（OpenSSH 公钥解析 + SHA256/MD5 指纹）与 `sql-formatter` 工具（6 方言格式化 + 关键字大小写 + 自写单行压缩），业务逻辑全部下沉到可单测的 `utils`。

**Architecture:** SSH 侧在既有 `PasswordSsh` 目录下新增 `utils/sshKey.ts`，把「按 SSH wire format 解出类型/位数/曲线 + 算指纹」做成同步纯函数；SQL 侧新建 `SqlFormatter` 目录，`utils/sqlFormat.ts` 包装 `sql-formatter`，`utils/sqlMinify.ts` 是自写的引号/注释感知状态机。`src/App.vue` 用 `defineAsyncComponent` 注册 `sql-formatter` 并兼容连字符/下划线 id。

**Tech Stack:** Vue 3 (`<script setup lang="ts">`) + Naive UI + Tailwind + CodeMirror 6 + Vitest；`sql-formatter`（格式化）、`@noble/hashes`（同步 SHA-256 / MD5）。

**Spec:** `docs/superpowers/specs/2026-09-23-phase2-batch-c-design.md`

## Global Constraints

- 新增依赖仅 `sql-formatter` 与 `@noble/hashes` 两个；除此之外 `package.json` 与 lock 文件不得改动。
- 不改 `src-tauri/` 下任何文件；不改 `src/types/tool.ts`（`sql-formatter` 定义已存在，`password-ssh` 页签结构已存在）。
- 组件 Props 契约固定：`defineProps<{ tabId: string; initialSnapshot?: Record<string, any> }>()`。
- 快照：回填 `props.initialSnapshot?.x ?? <默认值>`；落库 `tabStore.updateTabSnapshot(props.tabId, {...})`；文本输入 250ms 防抖；只持久化输入与视图选项。
- 错误处理：非法输入用 `NAlert` 就地提示并保留上一次有效结果；空输入只显示空态不报错。
- 输入规模护栏：`sql-formatter` 的自动派生在输入超过 1MB 时关闭，改为手动点击按钮。
- SSH 指纹格式必须与 `ssh-keygen` 一致：`SHA256:` + base64（去掉 `=` 填充）、`MD5:` + 小写十六进制冒号分隔。
- SSH 解析逐行隔离错误：某行非法只标记该行，其余行照常输出。
- SQL 压缩器必须保护字符串字面量、`$$`/`$tag$` 美元引用与 `` ` `` 引用标识符；保留 MySQL 的 `/*! … */` 版本注释；`--` 只在后接空白或行尾时才算注释。
- 每个任务结束都要 `npm test` 与 `npm run build` 通过，并单独提交一次 git。

---

### Task 1: 依赖安装与 SSH 公钥解析纯函数

**Files:**
- Modify: `package.json`（新增 `dependencies`）
- Create: `src/views/tools/PasswordSsh/utils/sshKey.ts`
- Test: `src/views/tools/PasswordSsh/__tests__/sshKey.spec.ts`

**Interfaces:**
- Produces:
  - `interface ParsedPublicKey { line: number; type: string; bits?: number; curve?: string; comment: string; rawLine: string; sha256: string; md5: string }`
  - `interface SshParseIssue { line: number; message: string }`
  - `interface SshParseResult { keys: ParsedPublicKey[]; issues: SshParseIssue[] }`
  - `parsePublicKeys(text: string): SshParseResult`
  - `fingerprintSha256(blob: Uint8Array): string`
  - `fingerprintMd5(blob: Uint8Array): string`

- [ ] **Step 1: 安装依赖**

Run: `npm install sql-formatter @noble/hashes`
Expected: 两个包写入 `package.json` 的 `dependencies` 与 lock 文件。（该命令需要联网；若沙箱拒绝网络，请申请联网权限后重跑。）

- [ ] **Step 2: 探测 @noble/hashes 的实际导出路径**

Run:
```bash
node --input-type=module -e "import { sha256 } from '@noble/hashes/sha2'; import { md5 } from '@noble/hashes/legacy'; console.log(sha256(new Uint8Array([1,2,3])).length, md5(new Uint8Array([1,2,3])).length)"
```
Expected: 输出 `32 16`。若任一导入失败（不同大版本导出路径不同），读 `node_modules/@noble/hashes/package.json` 的 `exports` 字段确认实际子路径（可能是 `@noble/hashes/sha256`），并在 Step 4 中改用确认后的路径。

- [ ] **Step 3: 写失败测试**

创建 `src/views/tools/PasswordSsh/__tests__/sshKey.spec.ts`。三个真实样本与指纹取自本机 `ssh-keygen -lf`（SHA256）与 `ssh-keygen -l -E md5`（MD5），已用 `openssl dgst` 交叉验证：

```ts
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
```

- [ ] **Step 4: 运行测试确认失败**

Run: `npx vitest run src/views/tools/PasswordSsh/__tests__/sshKey.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../utils/sshKey"`。

- [ ] **Step 5: 实现 sshKey.ts**

创建 `src/views/tools/PasswordSsh/utils/sshKey.ts`：

```ts
import { sha256 } from '@noble/hashes/sha2'
import { md5 } from '@noble/hashes/legacy'

export interface ParsedPublicKey {
  line: number
  type: string
  bits?: number
  curve?: string
  comment: string
  rawLine: string
  sha256: string
  md5: string
}

export interface SshParseIssue {
  line: number
  message: string
}

export interface SshParseResult {
  keys: ParsedPublicKey[]
  issues: SshParseIssue[]
}

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/

const CURVE_BITS: Record<string, number> = {
  nistp256: 256,
  nistp384: 384,
  nistp521: 521
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

// 读取 SSH wire format 的长度前缀字符串
function readField(bytes: Uint8Array, offset: number): { value: Uint8Array; next: number } {
  if (offset + 4 > bytes.length) throw new Error('密钥数据在读取长度时截断')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = view.getUint32(offset)
  const start = offset + 4
  const end = start + length
  if (end > bytes.length) throw new Error('密钥数据在读取字段时截断')
  return { value: bytes.subarray(start, end), next: end }
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function describeKey(blob: Uint8Array): { type: string; bits?: number; curve?: string } {
  const typeField = readField(blob, 0)
  const type = decodeText(typeField.value)
  let offset = typeField.next

  if (type === 'ssh-rsa') {
    const exponent = readField(blob, offset)
    const modulus = readField(blob, exponent.next)
    let value = modulus.value
    while (value.length > 1 && value[0] === 0) value = value.subarray(1)
    return { type, bits: value.length * 8 }
  }

  if (type === 'ssh-ed25519') {
    const key = readField(blob, offset)
    if (key.value.length !== 32) throw new Error('ED25519 公钥长度异常')
    return { type }
  }

  if (type.startsWith('ecdsa-sha2-')) {
    const curveField = readField(blob, offset)
    const point = readField(blob, curveField.next)
    const curve = decodeText(curveField.value)
    if (point.value.length === 0) throw new Error('ECDSA 公钥点为空')
    return { type, curve, bits: CURVE_BITS[curve] }
  }

  if (type === 'sk-ssh-ed25519@openssh.com') {
    const key = readField(blob, offset)
    if (key.value.length !== 32) throw new Error('SK ED25519 公钥长度异常')
    return { type }
  }

  if (type === 'sk-ecdsa-sha2-nistp256@openssh.com') {
    const curveField = readField(blob, offset)
    const curve = decodeText(curveField.value)
    return { type, curve, bits: CURVE_BITS[curve] }
  }

  throw new Error(`不支持的密钥类型 ${type}`)
}

export function fingerprintSha256(blob: Uint8Array): string {
  return `SHA256:${bytesToBase64(sha256(blob)).replace(/=+$/, '')}`
}

export function fingerprintMd5(blob: Uint8Array): string {
  const digest = md5(blob)
  const hex = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join(':')
  return `MD5:${hex}`
}

export function parsePublicKeys(text: string): SshParseResult {
  const keys: ParsedPublicKey[] = []
  const issues: SshParseIssue[] = []

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#')) return

    const tokens = trimmed.split(/\s+/)
    // 用「像 base64 的 token」定位 blob，这样带空格的 options 前缀（如 command="..."）也不会错位
    const blobIndex = tokens.findIndex(token => token.length > 16 && BASE64_RE.test(token))
    if (blobIndex <= 0) {
      issues.push({ line, message: '无法识别的公钥行：缺少 base64 密钥数据' })
      return
    }

    const declaredType = tokens[blobIndex - 1]
    try {
      const blob = base64ToBytes(tokens[blobIndex])
      const described = describeKey(blob)
      if (described.type !== declaredType) {
        throw new Error(`声明的类型 ${declaredType} 与密钥数据 ${described.type} 不一致`)
      }
      keys.push({
        line,
        type: described.type,
        bits: described.bits,
        curve: described.curve,
        comment: tokens.slice(blobIndex + 1).join(' '),
        rawLine: trimmed,
        sha256: fingerprintSha256(blob),
        md5: fingerprintMd5(blob)
      })
    } catch (err) {
      issues.push({ line, message: err instanceof Error ? err.message : '解析失败' })
    }
  })

  return { keys, issues }
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run src/views/tools/PasswordSsh/__tests__/sshKey.spec.ts`
Expected: PASS（9 个用例全绿）。若某个指纹与断言不符，先确认 `@noble/hashes` 的导入路径是否正确，再对照 Step 2 的探测结果；**不要**放宽断言，这三个向量来自 `ssh-keygen` 本身。

- [ ] **Step 7: 跑全量测试并提交**

Run: `npm test`
Expected: 既有用例 + 新增用例全部 PASS。

```bash
git add package.json package-lock.json src/views/tools/PasswordSsh/utils/sshKey.ts src/views/tools/PasswordSsh/__tests__/sshKey.spec.ts
git commit -m "feat(password-ssh): 新增 SSH 公钥解析与 SHA256/MD5 指纹纯函数与单测"
```

---

### Task 2: SSH Key 页签视图

**Files:**
- Modify: `src/views/tools/PasswordSsh/PasswordSsh.vue`（替换 `panel === 'ssh'` 分支的占位内容）

**Interfaces:**
- Consumes: `parsePublicKeys` / `ParsedPublicKey`（Task 1）
- Produces: SSH 页签真实实现，快照字段 `{ sshInput }`（与既有的密码生成字段并列）

- [ ] **Step 1: 在脚本区接入解析**

在 `src/views/tools/PasswordSsh/PasswordSsh.vue` 的 `<script setup>` **顶部 import 区**追加（与既有 import 放在一起，不要插到 ref 声明之后）：

```ts
import { parsePublicKeys, type ParsedPublicKey } from './utils/sshKey'
```

并在既有 `const props = defineProps<...>()` 之后的状态区追加：

```ts
const sshInput = ref<string>(props.initialSnapshot?.sshInput ?? '')
const sshKeys = ref<ParsedPublicKey[]>([])
const sshIssues = ref<{ line: number; message: string }[]>([])
let sshTimer: ReturnType<typeof setTimeout> | null = null

function runSshParse() {
  const result = parsePublicKeys(sshInput.value)
  sshKeys.value = result.keys
  sshIssues.value = result.issues
}

function scheduleSshParse() {
  if (sshTimer) clearTimeout(sshTimer)
  sshTimer = setTimeout(runSshParse, 250)
}
```

在既有的 `snapshotPayload()` 里补上 SSH 输入（让快照同时覆盖两个页签）：

```ts
    sshInput: sshInput.value,
```

在 `onBeforeUnmount` 里清理定时器：

```ts
  if (sshTimer) clearTimeout(sshTimer)
```

- [ ] **Step 2: 把占位 section 换成真实内容**

把 `<template>` 中 `v-else` 的 SSH 占位 `<section>` 整块替换为：

```vue
      <section v-else class="space-y-4">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-500 dark:text-slate-400">粘贴 OpenSSH 公钥，支持 authorized_keys 多行与 # 注释</span>
            <NButton size="tiny" @click="runSshParse">解析</NButton>
          </div>
          <NInput
            v-model:value="sshInput"
            type="textarea"
            :autosize="{ minRows: 5, maxRows: 10 }"
            placeholder="ssh-ed25519 AAAAC3Nza... user@host"
            @update:value="scheduleSshParse"
          />
        </div>

        <NAlert v-if="sshIssues.length" type="error" :bordered="false">
          <div v-for="issue in sshIssues" :key="issue.line">第 {{ issue.line }} 行：{{ issue.message }}</div>
        </NAlert>

        <div v-for="key in sshKeys" :key="key.line" class="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium">{{ key.type }}</span>
            <NTag v-if="key.curve" size="small">{{ key.curve }}</NTag>
            <NTag v-else-if="key.bits" size="small">{{ key.bits }} 位</NTag>
            <span v-if="key.comment" class="text-xs text-slate-400 truncate">{{ key.comment }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-16 text-xs text-slate-500 dark:text-slate-400 shrink-0">SHA256</span>
            <code class="flex-1 text-xs font-mono break-all">{{ key.sha256 }}</code>
            <NButton size="tiny" @click="copyText(key.sha256)">复制</NButton>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-16 text-xs text-slate-500 dark:text-slate-400 shrink-0">MD5</span>
            <code class="flex-1 text-xs font-mono break-all">{{ key.md5 }}</code>
            <NButton size="tiny" @click="copyText(key.md5)">复制</NButton>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-16 text-xs text-slate-500 dark:text-slate-400 shrink-0">整行</span>
            <code class="flex-1 text-xs font-mono truncate">{{ key.rawLine }}</code>
            <NButton size="tiny" @click="copyText(key.rawLine)">复制</NButton>
          </div>
        </div>

        <p v-if="!sshKeys.length && !sshIssues.length" class="text-xs text-slate-400">粘贴公钥后自动解析</p>
      </section>
```

- [ ] **Step 3: 类型检查与构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，构建通过。

- [ ] **Step 4: 提交**

```bash
git add src/views/tools/PasswordSsh/PasswordSsh.vue
git commit -m "feat(password-ssh): SSH Key 页签接入公钥解析与指纹展示"
```

---

### Task 3: SQL 压缩器（utils/sqlMinify.ts）

**Files:**
- Create: `src/views/tools/SqlFormatter/utils/sqlMinify.ts`
- Test: `src/views/tools/SqlFormatter/__tests__/sqlMinify.spec.ts`

**Interfaces:**
- Produces: `minifySql(text: string): string`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/SqlFormatter/__tests__/sqlMinify.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { minifySql } from '../utils/sqlMinify'

describe('sqlMinify 压缩器', () => {
  it('剥离行注释与块注释', () => {
    expect(minifySql('SELECT 1 -- 注释\nFROM t')).toBe('SELECT 1 FROM t')
    expect(minifySql('SELECT /* 块注释 */ 1')).toBe('SELECT 1')
  })

  it('字符串字面量内的注释符号原样保留', () => {
    expect(minifySql("SELECT '-- not comment'")).toBe("SELECT '-- not comment'")
    expect(minifySql("SELECT '/* x */'")).toBe("SELECT '/* x */'")
  })

  it('无空白的双减号不当作注释', () => {
    expect(minifySql('SELECT a--b FROM t')).toBe('SELECT a--b FROM t')
  })

  it('美元引用内部原样保留', () => {
    expect(minifySql('SELECT $$a  -- b$$')).toBe('SELECT $$a  -- b$$')
    expect(minifySql('SELECT $tag$ x  y $tag$')).toBe('SELECT $tag$ x  y $tag$')
  })

  it('保留 MySQL 可执行版本注释', () => {
    expect(minifySql('SELECT /*!40000 SQL_NO_CACHE */ 1')).toBe('SELECT /*!40000 SQL_NO_CACHE */ 1')
  })

  it('反引号与双引号标识符原样保留', () => {
    expect(minifySql('SELECT `a  b` FROM "c  d"')).toBe('SELECT `a  b` FROM "c  d"')
  })

  it('折叠空白并 trim', () => {
    expect(minifySql('SELECT\n    1\nFROM   t')).toBe('SELECT 1 FROM t')
    expect(minifySql('   SELECT 1   ')).toBe('SELECT 1')
  })

  it('单引号内的转义引号不提前结束字符串', () => {
    expect(minifySql("SELECT 'it''s  ok'")).toBe("SELECT 'it''s  ok'")
  })

  it('空输入返回空串', () => {
    expect(minifySql('   ')).toBe('')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/SqlFormatter/__tests__/sqlMinify.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../utils/sqlMinify"`。

- [ ] **Step 3: 实现 sqlMinify.ts**

创建 `src/views/tools/SqlFormatter/utils/sqlMinify.ts`：

```ts
// 读取一个被 quote 包裹的字面量/标识符，返回结束位置（不含结尾引号之后的内容）。
// 处理两种转义：SQL 标准的双写引号（''）与反斜杠转义。
function readQuoted(text: string, start: number, quote: string): number {
  let i = start + 1
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === quote) {
      if (text[i + 1] === quote) {
        i += 2
        continue
      }
      return i + 1
    }
    i += 1
  }
  return text.length
}

// 识别 $$ 或 $tag$ 形式的分隔符；不是美元引用则返回 null
function readDollarDelimiter(text: string, start: number): string | null {
  const match = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(start))
  return match ? match[0] : null
}

export function minifySql(text: string): string {
  const out: string[] = []
  let i = 0
  let pendingSpace = false

  const flushSpace = () => {
    if (pendingSpace && out.length > 0) out.push(' ')
    pendingSpace = false
  }

  while (i < text.length) {
    const ch = text[i]

    // 字符串字面量与引用标识符：整段原样保留
    if (ch === "'" || ch === '"' || ch === '`') {
      flushSpace()
      const end = readQuoted(text, i, ch)
      out.push(text.slice(i, end))
      i = end
      continue
    }

    // 美元引用：整段原样保留
    if (ch === '$') {
      const delimiter = readDollarDelimiter(text, i)
      if (delimiter) {
        flushSpace()
        const closeAt = text.indexOf(delimiter, i + delimiter.length)
        const end = closeAt < 0 ? text.length : closeAt + delimiter.length
        out.push(text.slice(i, end))
        i = end
        continue
      }
    }

    // 行注释：-- 后必须跟空白或行尾（MySQL 规则），否则当普通字符
    if (ch === '-' && text[i + 1] === '-' && (i + 2 >= text.length || /\s/.test(text[i + 2]))) {
      const newline = text.indexOf('\n', i)
      i = newline < 0 ? text.length : newline
      pendingSpace = true
      continue
    }

    // 块注释：/*! 是 MySQL 可执行版本注释，必须原样保留
    if (ch === '/' && text[i + 1] === '*') {
      const closeAt = text.indexOf('*/', i + 2)
      const end = closeAt < 0 ? text.length : closeAt + 2
      if (text[i + 2] === '!') {
        flushSpace()
        out.push(text.slice(i, end))
      } else {
        pendingSpace = true
      }
      i = end
      continue
    }

    if (/\s/.test(ch)) {
      pendingSpace = true
      i += 1
      continue
    }

    flushSpace()
    out.push(ch)
    i += 1
  }

  return out.join('').trim()
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/SqlFormatter/__tests__/sqlMinify.spec.ts`
Expected: PASS（9 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/SqlFormatter/utils/sqlMinify.ts src/views/tools/SqlFormatter/__tests__/sqlMinify.spec.ts
git commit -m "feat(sql-formatter): 新增引号与注释感知的 SQL 单行压缩器与单测"
```

---

### Task 4: SQL 格式化包装（utils/sqlFormat.ts）

**Files:**
- Create: `src/views/tools/SqlFormatter/utils/sqlFormat.ts`
- Test: `src/views/tools/SqlFormatter/__tests__/sqlFormat.spec.ts`

**Interfaces:**
- Consumes: `sql-formatter`
- Produces:
  - `type SqlDialect = 'sql' | 'mysql' | 'postgresql' | 'sqlite' | 'transactsql' | 'plsql'`
  - `type KeywordCase = 'upper' | 'lower' | 'preserve'`
  - `DIALECTS: { label: string; value: SqlDialect }[]`
  - `formatSql(text: string, dialect: SqlDialect, keywordCase: KeywordCase): { output: string; error?: string }`

- [ ] **Step 1: 写失败测试**

创建 `src/views/tools/SqlFormatter/__tests__/sqlFormat.spec.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { DIALECTS, formatSql } from '../utils/sqlFormat'

describe('sqlFormat 格式化', () => {
  it('暴露 6 种常用方言', () => {
    expect(DIALECTS.map(d => d.value)).toEqual(['sql', 'mysql', 'postgresql', 'sqlite', 'transactsql', 'plsql'])
  })

  it('按方言格式化并大写关键字', () => {
    const result = formatSql('select id, name from users where id=1', 'mysql', 'upper')
    expect(result.error).toBeUndefined()
    expect(result.output).toContain('SELECT')
    expect(result.output).toContain('FROM')
    expect(result.output).toContain('WHERE')
    expect(result.output.split('\n').length).toBeGreaterThan(1)
  })

  it('关键字小写', () => {
    const result = formatSql('SELECT 1', 'sql', 'lower')
    expect(result.output).toContain('select')
  })

  it('关键字保持原样', () => {
    const result = formatSql('Select 1', 'sql', 'preserve')
    expect(result.output).toContain('Select')
  })

  it('六种方言都能格式化同一段 SQL', () => {
    for (const dialect of DIALECTS.map(d => d.value)) {
      const result = formatSql('select a from t', dialect, 'upper')
      expect(result.error).toBeUndefined()
      expect(result.output).toContain('SELECT')
    }
  })

  it('无法解析的输入返回 error 而不是抛异常', () => {
    const result = formatSql("SELECT 'unterminated", 'sql', 'upper')
    expect(result.error).toBeTruthy()
    expect(result.output).toBe('')
  })

  it('空输入返回空结果且不报错', () => {
    expect(formatSql('   ', 'sql', 'upper')).toEqual({ output: '' })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/views/tools/SqlFormatter/__tests__/sqlFormat.spec.ts`
Expected: FAIL，报 `Failed to resolve import "../utils/sqlFormat"`。

- [ ] **Step 3: 实现 sqlFormat.ts**

创建 `src/views/tools/SqlFormatter/utils/sqlFormat.ts`：

```ts
import { format } from 'sql-formatter'

export type SqlDialect = 'sql' | 'mysql' | 'postgresql' | 'sqlite' | 'transactsql' | 'plsql'

export type KeywordCase = 'upper' | 'lower' | 'preserve'

export const DIALECTS: { label: string; value: SqlDialect }[] = [
  { label: '标准 SQL', value: 'sql' },
  { label: 'MySQL', value: 'mysql' },
  { label: 'PostgreSQL', value: 'postgresql' },
  { label: 'SQLite', value: 'sqlite' },
  { label: 'SQL Server', value: 'transactsql' },
  { label: 'Oracle', value: 'plsql' }
]

export const KEYWORD_CASES: { label: string; value: KeywordCase }[] = [
  { label: '大写', value: 'upper' },
  { label: '小写', value: 'lower' },
  { label: '保持原样', value: 'preserve' }
]

export function formatSql(
  text: string,
  dialect: SqlDialect,
  keywordCase: KeywordCase
): { output: string; error?: string } {
  if (!text.trim()) return { output: '' }
  try {
    const output = format(text, {
      language: dialect,
      keywordCase,
      tabWidth: 2,
      linesBetweenQueries: 2
    })
    return { output }
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : 'SQL 格式化失败' }
  }
}
```

注意：`sql-formatter` 的 `language` 字段接受方言名；若某个方言名不被当前版本接受（例如库重命名过），以 Step 4 的失败信息为准修正 `DIALECTS` 与映射，不要放宽测试。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/views/tools/SqlFormatter/__tests__/sqlFormat.spec.ts`
Expected: PASS（7 个用例全绿）。若「无法解析的输入返回 error」这条失败（说明该版本对未闭合字符串也宽容），换一个该版本确实会抛错的输入（例如方言特定语法错误），并把新输入写进测试。

- [ ] **Step 5: 提交**

```bash
git add src/views/tools/SqlFormatter/utils/sqlFormat.ts src/views/tools/SqlFormatter/__tests__/sqlFormat.spec.ts
git commit -m "feat(sql-formatter): 新增多方言 SQL 格式化包装与单测"
```

---

### Task 5: SqlFormatter 视图与 App.vue 注册

**Files:**
- Create: `src/views/tools/SqlFormatter/SqlFormatter.vue`
- Modify: `src/App.vue`（异步组件声明 + `resolveBaseComponent` 分支）

**Interfaces:**
- Consumes: `formatSql` / `DIALECTS` / `KEYWORD_CASES` / `SqlDialect` / `KeywordCase`（Task 4）、`minifySql`（Task 3）
- Produces: `SqlFormatter.vue`，快照字段 `{ input, dialect, keywordCase, mode }`

- [ ] **Step 1: 创建视图组件**

创建 `src/views/tools/SqlFormatter/SqlFormatter.vue`：

```vue
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NRadioButton, NRadioGroup, NSelect, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { DIALECTS, KEYWORD_CASES, formatSql, type KeywordCase, type SqlDialect } from './utils/sqlFormat'
import { minifySql } from './utils/sqlMinify'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

type Mode = 'format' | 'minify'

const SAMPLE = [
  'select u.id, u.name, count(o.id) as order_count',
  'from users u',
  'left join orders o on o.user_id = u.id',
  'where u.status = "active" and o.created_at >= "2024-01-01"',
  'group by u.id, u.name',
  'order by order_count desc'
].join('\n')

const dialect = ref<SqlDialect>(props.initialSnapshot?.dialect ?? 'sql')
const keywordCase = ref<KeywordCase>(props.initialSnapshot?.keywordCase ?? 'upper')
const mode = ref<Mode>(props.initialSnapshot?.mode ?? 'format')
const errorMessage = ref<string>('')
const output = ref<string>('')
const manualMode = ref<boolean>(false)
const editorEl = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let runTimer: ReturnType<typeof setTimeout> | null = null

const dialectOptions = DIALECTS.map(item => ({ label: item.label, value: item.value }))

function getInput(): string {
  return editorView ? editorView.state.doc.toString() : ''
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    input: getInput(),
    dialect: dialect.value,
    keywordCase: keywordCase.value,
    mode: mode.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function runConvert() {
  const text = getInput()
  if (!text.trim()) {
    errorMessage.value = ''
    output.value = ''
    return
  }
  if (mode.value === 'minify') {
    errorMessage.value = ''
    output.value = minifySql(text)
    return
  }
  const result = formatSql(text, dialect.value, keywordCase.value)
  if (result.error) {
    errorMessage.value = result.error
    return
  }
  errorMessage.value = ''
  output.value = result.output
}

function scheduleRun() {
  if (runTimer) clearTimeout(runTimer)
  runTimer = setTimeout(runConvert, 250)
}

function handleDocChange() {
  manualMode.value = getInput().length > 1024 * 1024
  scheduleSnapshot()
  if (manualMode.value) return
  scheduleRun()
}

function getEditorTheme(isDark: boolean) {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        fontSize: '13px',
        backgroundColor: isDark ? '#090d16' : '#ffffff',
        color: isDark ? '#e2e8f0' : '#1e293b'
      },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        lineHeight: '1.6'
      },
      '.cm-gutters': {
        backgroundColor: isDark ? '#070a10' : '#f8fafc',
        color: isDark ? '#475569' : '#94a3b8',
        borderRight: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0'
      }
    },
    { dark: isDark }
  )
}

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value)
  message.success('已复制')
}

onMounted(async () => {
  await nextTick()
  if (!editorEl.value) return
  editorView = new EditorView({
    state: EditorState.create({
      doc: props.initialSnapshot?.input ?? SAMPLE,
      extensions: [
        basicSetup,
        getEditorTheme(themeStore.isDark),
        EditorView.updateListener.of(update => {
          if (update.docChanged) handleDocChange()
        })
      ]
    }),
    parent: editorEl.value
  })
  runConvert()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  if (runTimer) clearTimeout(runTimer)
  saveSnapshot()
  editorView?.destroy()
  editorView = null
})

watch([dialect, keywordCase, mode], () => {
  saveSnapshot()
  runConvert()
})

const outputLabel = computed(() => (mode.value === 'minify' ? '压缩结果' : '格式化结果'))
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">SQL 格式化与压缩</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">多方言美化、关键字大小写与单行压缩</p>
      </div>
      <div class="flex items-center gap-3">
        <NSelect v-model:value="dialect" class="w-36" size="small" :options="dialectOptions" />
        <NRadioGroup v-model:value="keywordCase" size="small">
          <NRadioButton v-for="item in KEYWORD_CASES" :key="item.value" :value="item.value">{{ item.label }}</NRadioButton>
        </NRadioGroup>
        <NRadioGroup v-model:value="mode" size="small">
          <NRadioButton value="format">格式化</NRadioButton>
          <NRadioButton value="minify">压缩</NRadioButton>
        </NRadioGroup>
        <NButton v-if="manualMode" size="small" type="primary" @click="runConvert">执行</NButton>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
      <NAlert v-if="manualMode" type="warning" :bordered="false">输入超过 1MB，已关闭自动派生，请手动点击「执行」。</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">SQL 输入</div>
        <div ref="editorEl" class="flex-1 min-h-0 overflow-hidden"></div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">{{ outputLabel }}</span>
          <NButton size="tiny" @click="copyOutput">复制</NButton>
        </div>
        <pre class="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono leading-relaxed">{{ output }}</pre>
      </section>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 在 App.vue 注册**

`src/App.vue` 异步组件声明区追加（放在 `TomlValidator` 声明之后）：

```ts
const SqlFormatter = defineAsyncComponent(() => import('@/views/tools/SqlFormatter/SqlFormatter.vue'))
```

`resolveBaseComponent` 内、`return ToolPlaceholder` 之前追加：

```ts
  if (toolId === 'sql-formatter' || toolId === 'sql_formatter') {
    return SqlFormatter
  }
```

- [ ] **Step 3: 类型检查与构建**

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，产出 `dist/assets/SqlFormatter-*.js`。

- [ ] **Step 4: 提交**

```bash
git add src/views/tools/SqlFormatter/SqlFormatter.vue src/App.vue
git commit -m "feat(sql-formatter): 新增 SQL 格式化与压缩视图并注册工具入口"
```

---

### Task 6: 全量回归与验收

**Files:** 无新增（只跑验证；若发现回归，修正对应任务的文件后重跑）

- [ ] **Step 1: 前端全量测试与构建**

Run: `npm test`
Expected: 既有用例 + 批次 C 新增的 3 组用例全部 PASS。

Run: `npm run build`
Expected: `vue-tsc --noEmit` 无报错，`dist/assets/` 下能看到 `SqlFormatter-*.js`。

- [ ] **Step 2: Rust 回归（批次 C 不涉及 Rust 改动，仅确认未破）**

Run: `cargo clippy --all-targets -- -D warnings`（工作目录 `src-tauri`）
Expected: 无 warning。

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部通过。注意：`test_http` 组用例会在沙箱内因禁止绑定本地回环端口而失败，属环境限制；需在沙箱外重跑 `cargo test --manifest-path Cargo.toml --test test_http` 确认 6 个用例全绿。

- [ ] **Step 3: 依赖与约束核对**

Run: `git diff HEAD --stat -- src-tauri/ src/types/tool.ts`
Expected: 无输出（两个路径都不应出现在改动里）。

Run:
```bash
node -e "const p=require('./package.json'); const known=['@codemirror/lang-json','@codemirror/language','@codemirror/state','@codemirror/view','@tauri-apps/api','@tauri-apps/plugin-window-state','codemirror','json-bigint','naive-ui','nanoid','pinia','vue','smol-toml','yaml']; console.log(Object.keys(p.dependencies).filter(k=>!known.includes(k)))"
```
Expected: 只输出 `[ '@noble/hashes', 'sql-formatter' ]`。

- [ ] **Step 4: 人工验收清单（dev 服务）**

启动 `npm run dev`（默认 1420），逐项确认：

1. `password-ssh` 的 SSH Key 页签不再是占位文案；粘贴 ed25519 公钥后展示类型、SHA256 与 MD5 指纹。
2. 粘贴混合内容（合法行 + 一行非法）时，合法行照常展示，非法行提示「第 N 行：原因」。
3. 指纹与 `ssh-keygen -lf <file>` 输出一致。
4. `sql-formatter` 不再是占位页；切换方言与关键字大小写，输出随之变化。
5. 切到「压缩」模式，多行 SQL 变单行；含 `-- 注释` 与 `/* 注释 */` 的输入被正确剥离，`/*!40000 ... */` 被保留。
6. 关闭 Tab 再打开，两个工具的输入与视图选项均还原。

- [ ] **Step 5: 确认提交历史与工作区状态**

Run: `git log --oneline -8`
Expected: 看到本计划各任务的提交记录。

Run: `git status --short`
Expected: 无未提交改动。

- [ ] **Step 6: 向用户汇报**

汇报内容：SSH 页签与 `sql-formatter` 的实现范围、新增的两个依赖、跑过的验证命令与结果、指纹与 `ssh-keygen` 的一致性证据，以及「Excel/CSV 转 JSON/SQL 归第三期」这一已确认的边界。

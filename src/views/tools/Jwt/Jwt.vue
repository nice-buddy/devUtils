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
    { text: decoded.value.rawHeader, cls: 'text-rose-500 dark:text-rose-400' },
    { text: '.', cls: 'text-slate-400' },
    { text: decoded.value.rawPayload, cls: 'text-violet-500 dark:text-violet-400' },
    { text: '.', cls: 'text-slate-400' },
    { text: decoded.value.rawSignature, cls: 'text-cyan-600 dark:text-cyan-400' }
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

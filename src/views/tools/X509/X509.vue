<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, useMessage } from 'naive-ui'
import { useTabStore } from '@/stores/tabStore'
import { parseCertificate, type CertificateInfo } from './utils/parseCert'
import { expiryLevel, formatFingerprint, formatPublicKey, oidLabel } from './utils/certView'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

const SAMPLE_CERT = `-----BEGIN CERTIFICATE-----
MIID2TCCAsGgAwIBAgIUen4jqLHX2bpcAZlSmmZ3RmUYl9AwDQYJKoZIhvcNAQEL
BQAwbDELMAkGA1UEBhMCQ04xEDAOBgNVBAgMB0JlaWppbmcxEDAOBgNVBAcMB0Jl
aWppbmcxETAPBgNVBAoMCERldlV0aWxzMQ4wDAYDVQQLDAVUb29sczEWMBQGA1UE
AwwNZGV2dXRpbHMudGVzdDAeFw0yNjA5MjgwNjM5NDdaFw0zNjA5MjUwNjM5NDda
MGwxCzAJBgNVBAYTAkNOMRAwDgYDVQQIDAdCZWlqaW5nMRAwDgYDVQQHDAdCZWlq
aW5nMREwDwYDVQQKDAhEZXZVdGlsczEOMAwGA1UECwwFVG9vbHMxFjAUBgNVBAMM
DWRldnV0aWxzLnRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCr
7WpKUUbLqF9KH16ec2OvKAfJOmilQSwHHNKFrTmjGw5jWMYySnV1AmiV1rpvQB14
soST13Vp3u2abbECJge0TGEZP6/XKNGiY+Rj6AXq3TUkGKDHA+scsyBUMoPmqVCe
z9s+c0SjZr781V+KF+wwUI+Y2KJ92en9Ps8Dl2c+JOLsMpi05H8cETfoELT1LQOf
UmcaZeB5boV2zPN1OUIloPDhk8bAnOZ2Kd/iuRDNZDsuLLR7WQb2sLMI9NoO+QKM
F9ppj9rQTQ6Ce+0Me80K5xvK4J7MPJGO78Zd5uVc1KKA7zNy6kv/MGrqI/FWjlmM
zFnuDpfBBBuG1YHVjknvAgMBAAGjczBxMB0GA1UdDgQWBBRSw4ST7XHAEviLxhN3
G8C/QNT0EDAfBgNVHSMEGDAWgBRSw4ST7XHAEviLxhN3G8C/QNT0EDAPBgNVHRMB
Af8EBTADAQH/MB4GA1UdEQQXMBWCDWRldnV0aWxzLnRlc3SHBH8AAAEwDQYJKoZI
hvcNAQELBQADggEBAFcXprEnOxAiawjYQwuGLUEyUx3Pe5cHrs1XndoCVNiZa7OH
U/AtI1xPcQVljSZFraYvn0VkZT0p1k8wOmVuKqVmX2XzXp2af4mCzRNAeGiu5JKS
oJ0LBqTzzy9kqMT68fL6Ow/MzQlWiRbBZrFKyXkcwy5URe0wGOTT8EXDmFh1g8kU
pYEKyxI9Y4hHb/KbvHkV1ODfIEvjwlqmFZybPglAMUqVyKEgf7F9xfY2koGE0f9/
oshiEx4Jh+P+yYKx+K87gvDY4xJlVX206k+6AcO6FTpSE2GIsj68xjKsMYSPFWY4
T8PZ78fO6v6n2fkBld9KjX1CCmzdDJ60tvc6vA4=
-----END CERTIFICATE-----
`

const EXPIRY_TEXT: Record<string, string> = {
  ok: '有效',
  soon: '30 天内到期',
  expired: '已过期'
}

const input = ref<string>(props.initialSnapshot?.input ?? '')
const info = ref<CertificateInfo | null>(null)
const errorMessage = ref<string>('')
const loading = ref(false)
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const badgeLevel = computed(() => (info.value ? expiryLevel(info.value.daysRemaining) : 'ok'))
const badgeText = computed(() => EXPIRY_TEXT[badgeLevel.value])
const badgeClass = computed(() => {
  if (badgeLevel.value === 'expired') {
    return 'px-1.5 py-0.5 rounded text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
  }
  if (badgeLevel.value === 'soon') {
    return 'px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
  }
  return 'px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
})

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, { input: input.value })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

async function parse() {
  const text = input.value.trim()
  if (!text) {
    info.value = null
    errorMessage.value = ''
    return
  }
  loading.value = true
  try {
    info.value = await parseCertificate(text)
    errorMessage.value = ''
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

function fillSample() {
  input.value = SAMPLE_CERT
  parse()
}

function clearAll() {
  input.value = ''
  info.value = null
  errorMessage.value = ''
}

function copyText(text: string, label: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success(label)
}

watch(input, scheduleSnapshot)

onMounted(() => {
  if (input.value.trim()) parse()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">X.509 证书解析</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">支持 PEM / DER(hex) / Base64，解析主体、有效期、扩展与指纹</p>
      </div>
      <div class="flex items-center gap-2">
        <NButton size="small" @click="fillSample">填入示例证书</NButton>
        <NButton size="small" @click="clearAll">清空</NButton>
        <NButton size="small" type="primary" :loading="loading" @click="parse">解析</NButton>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">证书内容</div>
        <textarea
          v-model="input"
          class="flex-1 min-h-0 w-full resize-none bg-transparent p-3 text-xs font-mono outline-none"
          placeholder="粘贴 PEM、DER(hex) 或 Base64"
        ></textarea>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">解析结果</span>
          <div class="flex items-center gap-2">
            <NButton v-if="info" size="tiny" @click="copyText(info.pem, '已复制 PEM')">复制 PEM</NButton>
            <NButton v-if="info" size="tiny" @click="copyText(info.fingerprints.sha256, '已复制 SHA-256')">复制 SHA-256</NButton>
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-3 space-y-3 text-xs">
          <p v-if="!info" class="text-slate-400">粘贴证书后点「解析」</p>
          <template v-else>
            <div class="rounded border border-slate-200 dark:border-slate-800 p-2 space-y-1">
              <div class="flex items-center justify-between">
                <span class="font-medium">概要</span>
                <span :class="badgeClass">{{ badgeText }}</span>
              </div>
              <div>Subject CN：{{ info.subject.commonName || '-' }}</div>
              <div>Issuer CN：{{ info.issuer.commonName || '-' }}</div>
              <div>有效期：{{ info.notBefore }} → {{ info.notAfter }}</div>
              <div>剩余天数：{{ info.daysRemaining }}</div>
              <div>序列号：<span class="font-mono break-all">{{ info.serialHex }}</span></div>
              <div>版本：{{ info.version }}<span v-if="info.selfSigned"> · 自签</span></div>
            </div>

            <div class="rounded border border-slate-200 dark:border-slate-800 p-2 space-y-1">
              <div class="font-medium">主体 / 签发者</div>
              <div>Subject DN：<span class="font-mono break-all">{{ info.subject.raw }}</span></div>
              <div>Issuer DN：<span class="font-mono break-all">{{ info.issuer.raw }}</span></div>
              <div>O：{{ info.subject.organization.join(', ') || '-' }}</div>
              <div>OU：{{ info.subject.organizationalUnit.join(', ') || '-' }}</div>
              <div>C / ST / L：{{ info.subject.country.join(', ') || '-' }} / {{ info.subject.state.join(', ') || '-' }} / {{ info.subject.locality.join(', ') || '-' }}</div>
            </div>

            <div class="rounded border border-slate-200 dark:border-slate-800 p-2 space-y-1">
              <div class="font-medium">公钥与签名</div>
              <div>公钥：{{ formatPublicKey(info.publicKeyAlgorithm, info.publicKeyBits) }}</div>
              <div>签名算法：{{ oidLabel(info.signatureAlgorithm) }}</div>
              <div>CA：{{ info.isCa ? '是' : '否' }}<span v-if="info.pathLenConstraint !== null"> · pathLen={{ info.pathLenConstraint }}</span></div>
            </div>

            <div class="rounded border border-slate-200 dark:border-slate-800 p-2 space-y-1">
              <div class="font-medium">扩展</div>
              <div>SAN：{{ info.subjectAltNames.join('  |  ') || '-' }}</div>
              <div>Key Usage：{{ info.keyUsage.join(', ') || '-' }}</div>
              <div>Extended Key Usage：{{ info.extendedKeyUsage.join(', ') || '-' }}</div>
            </div>

            <div class="rounded border border-slate-200 dark:border-slate-800 p-2 space-y-1">
              <div class="font-medium">指纹</div>
              <div class="font-mono break-all">SHA-1：{{ formatFingerprint(info.fingerprints.sha1) }}</div>
              <div class="font-mono break-all">SHA-256：{{ formatFingerprint(info.fingerprints.sha256) }}</div>
            </div>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

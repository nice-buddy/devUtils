<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  NAlert,
  NButton,
  NInputNumber,
  NRadioButton,
  NRadioGroup,
  NSlider,
  NSwitch,
  NTag,
  useMessage
} from 'naive-ui'
import { useTabStore } from '@/stores/tabStore'
import { estimateEntropy, generatePasswords, type PasswordOptions } from './utils/password'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

type Panel = 'password' | 'ssh'

const panel = ref<Panel>(props.initialSnapshot?.panel ?? 'password')
const length = ref<number>(props.initialSnapshot?.length ?? 16)
const charsets = ref({
  upper: props.initialSnapshot?.charsets?.upper ?? true,
  lower: props.initialSnapshot?.charsets?.lower ?? true,
  digits: props.initialSnapshot?.charsets?.digits ?? true,
  symbols: props.initialSnapshot?.charsets?.symbols ?? true
})
const excludeAmbiguous = ref<boolean>(props.initialSnapshot?.excludeAmbiguous ?? true)
const count = ref<number>(props.initialSnapshot?.count ?? 1)
const persistResults = ref<boolean>(props.initialSnapshot?.persistResults ?? false)
const results = ref<string[]>(props.initialSnapshot?.results ?? [])
const errorMessage = ref<string>('')
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const options = computed<PasswordOptions>(() => ({
  length: length.value,
  upper: charsets.value.upper,
  lower: charsets.value.lower,
  digits: charsets.value.digits,
  symbols: charsets.value.symbols,
  excludeAmbiguous: excludeAmbiguous.value,
  count: count.value
}))

const entropy = computed(() => estimateEntropy(options.value))
const strengthLabel = computed(() => ({ weak: '弱', medium: '中', strong: '强' })[entropy.value.level])

function snapshotPayload(): Record<string, any> {
  const payload: Record<string, any> = {
    panel: panel.value,
    length: length.value,
    charsets: { ...charsets.value },
    excludeAmbiguous: excludeAmbiguous.value,
    count: count.value,
    persistResults: persistResults.value
  }
  if (persistResults.value) payload.results = [...results.value]
  return payload
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, snapshotPayload())
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function generate() {
  const { passwords, error } = generatePasswords(options.value)
  if (error) {
    errorMessage.value = error
    return
  }
  errorMessage.value = ''
  results.value = passwords
  saveSnapshot()
}

function copyText(text: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success('已复制')
}

watch([panel, length, charsets, excludeAmbiguous, count], scheduleSnapshot, { deep: true })
// 敏感开关不走防抖：关闭时立即写库，快照里不再携带 results。
watch(persistResults, () => saveSnapshot())

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">强密码生成与 SSH Key</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">crypto.getRandomValues 随机源，每个字符类别至少落一个</p>
      </div>
      <NRadioGroup v-model:value="panel" size="small">
        <NRadioButton value="password">密码生成</NRadioButton>
        <NRadioButton value="ssh">SSH Key</NRadioButton>
      </NRadioGroup>
    </header>

    <div class="flex-1 min-h-0 overflow-auto p-4 space-y-4">
      <section v-if="panel === 'password'" class="space-y-4">
        <div class="flex items-center gap-3">
          <span class="w-20 text-xs text-slate-500 dark:text-slate-400">长度</span>
          <NSlider v-model:value="length" class="max-w-md" :min="4" :max="128" />
          <NInputNumber v-model:value="length" class="w-24" size="small" :min="4" :max="128" />
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="charsets.upper" size="small" />大写 A-Z</span>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="charsets.lower" size="small" />小写 a-z</span>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="charsets.digits" size="small" />数字 0-9</span>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="charsets.symbols" size="small" />符号</span>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="excludeAmbiguous" size="small" />排除易混淆字符 0O1lI|</span>
        </div>
        <div class="flex items-center gap-4">
          <span class="flex items-center gap-2 text-xs">
            数量
            <NInputNumber v-model:value="count" class="w-20" size="small" :min="1" :max="20" />
          </span>
          <NButton type="primary" size="small" @click="generate">生成</NButton>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="persistResults" size="small" />持久化生成结果</span>
        </div>
        <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
        <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>强度：{{ entropy.bits }} bits</span>
          <NTag size="small" :type="entropy.level === 'strong' ? 'success' : entropy.level === 'medium' ? 'warning' : 'error'">
            {{ strengthLabel }}
          </NTag>
        </div>
        <div class="space-y-2">
          <div v-for="(password, index) in results" :key="`${index}-${password}`" class="flex items-center gap-3">
            <code class="flex-1 font-mono text-xs break-all">{{ password }}</code>
            <NButton size="tiny" @click="copyText(password)">复制</NButton>
          </div>
          <p v-if="!results.length" class="text-xs text-slate-400">点击「生成」创建密码</p>
        </div>
      </section>

      <section v-else class="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500 dark:text-slate-400">
        SSH Key 指纹解析将在第二阶段批次 C 交付（需要引入成熟的密钥解析能力）。
      </section>
    </div>
  </div>
</template>

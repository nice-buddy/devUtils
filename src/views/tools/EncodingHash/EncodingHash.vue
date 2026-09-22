<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  NSelect,
  NRadioGroup,
  NRadioButton,
  NInput,
  NButton,
  NSwitch,
  NProgress,
  NTag,
  NAlert,
  useMessage
} from 'naive-ui'
import { invoke, Channel } from '@tauri-apps/api/core'
import { useTabStore } from '@/stores/tabStore'
import {
  base64Encode,
  base64Decode,
  urlEncode,
  urlDecode,
  unicodeEncode,
  unicodeDecode,
  hexEncode,
  hexDecode,
  htmlEncode,
  htmlDecode
} from './utils/encoders'

interface HashProgress {
  readBytes: number
  totalBytes: number
}

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

// --- Navigation State ---
const mainTab = ref<'encoding' | 'hash'>(props.initialSnapshot?.mainTab ?? 'encoding')
const hashSubTab = ref<'text' | 'file'>(props.initialSnapshot?.hashSubTab ?? 'text')

// --- Tab 1: Encoding State ---
type EncodingType = 'base64' | 'url' | 'unicode' | 'hex' | 'html'
const encodingType = ref<EncodingType>(props.initialSnapshot?.encodingType ?? 'base64')
const encodingMode = ref<'encode' | 'decode'>(props.initialSnapshot?.encodingMode ?? 'encode')
const encodingInput = ref<string>(props.initialSnapshot?.encodingInput ?? '')

// Options
const base64UrlSafe = ref<boolean>(props.initialSnapshot?.base64UrlSafe ?? false)
const urlMode = ref<'component' | 'uri'>(props.initialSnapshot?.urlMode ?? 'component')
const unicodeEscapeAll = ref<boolean>(props.initialSnapshot?.unicodeEscapeAll ?? false)
const hexDelimiter = ref<string>(props.initialSnapshot?.hexDelimiter ?? '')
const hexUppercase = ref<boolean>(props.initialSnapshot?.hexUppercase ?? false)

const encodingError = ref<string>('')

const encodingTypes = [
  { label: 'Base64 编码', value: 'base64' },
  { label: 'URL 百分号编码', value: 'url' },
  { label: 'Unicode 转义 (\\u)', value: 'unicode' },
  { label: '十六进制 Hex', value: 'hex' },
  { label: 'HTML 实体编码', value: 'html' }
]

const hexDelimiterOptions = [
  { label: '无分隔符 (紧凑)', value: '' },
  { label: '空格分隔 (48 65 6c)', value: ' ' },
  { label: '短横线分隔 (48-65-6c)', value: '-' },
  { label: '冒号分隔 (48:65:6c)', value: ':' }
]

const urlModeOptions = [
  { label: '组件模式 (encodeURIComponent)', value: 'component' },
  { label: 'URI 完整模式 (encodeURI)', value: 'uri' }
]

// Compute encoded/decoded output
const encodingOutput = computed(() => {
  encodingError.value = ''
  if (!encodingInput.value) return ''

  try {
    if (encodingMode.value === 'encode') {
      switch (encodingType.value) {
        case 'base64':
          return base64Encode(encodingInput.value, { urlSafe: base64UrlSafe.value })
        case 'url':
          return urlEncode(encodingInput.value, { mode: urlMode.value })
        case 'unicode':
          return unicodeEncode(encodingInput.value, { escapeAll: unicodeEscapeAll.value })
        case 'hex':
          return hexEncode(encodingInput.value, {
            delimiter: hexDelimiter.value,
            uppercase: hexUppercase.value
          })
        case 'html':
          return htmlEncode(encodingInput.value)
      }
    } else {
      switch (encodingType.value) {
        case 'base64':
          return base64Decode(encodingInput.value, { urlSafe: base64UrlSafe.value })
        case 'url':
          return urlDecode(encodingInput.value, { mode: urlMode.value })
        case 'unicode':
          return unicodeDecode(encodingInput.value)
        case 'hex':
          return hexDecode(encodingInput.value)
        case 'html':
          return htmlDecode(encodingInput.value)
      }
    }
  } catch (err: any) {
    encodingError.value = err?.message || '解码发生错误'
    return ''
  }
  return ''
})

function swapEncoding() {
  if (encodingOutput.value) {
    encodingInput.value = encodingOutput.value
    encodingMode.value = encodingMode.value === 'encode' ? 'decode' : 'encode'
  }
}

function clearEncodingInput() {
  encodingInput.value = ''
  encodingError.value = ''
}

function loadSampleEncoding() {
  if (encodingMode.value === 'encode') {
    switch (encodingType.value) {
      case 'base64':
        encodingInput.value = 'DevUtils 开发者工具箱 🚀 现代化跨平台应用'
        break
      case 'url':
        encodingInput.value = 'https://devutils.app/search?query=开发者 工具&page=1#anchor'
        break
      case 'unicode':
        encodingInput.value = 'Hello 世界! 跨平台开发'
        break
      case 'hex':
        encodingInput.value = 'DevUtils 2026'
        break
      case 'html':
        encodingInput.value = '<div class="alert" data-tag="demo">Fish & Chips "rocks"</div>'
        break
    }
  } else {
    switch (encodingType.value) {
      case 'base64':
        encodingInput.value = 'RGV2VXRpbHMg5byA5Y+R6ICF5bel5YW3566xIPCfmYAg546w5Luj5YyW6Leo5bmz5Y+w5bqU55So'
        break
      case 'url':
        encodingInput.value = 'https%3A%2F%2Fdevutils.app%2Fsearch%3Fquery%3D%E5%BC%80%E5%8F%91%E8%80%85%20%E5%B7%A5%E5%85%B7'
        break
      case 'unicode':
        encodingInput.value = 'Hello \\u4e16\\u754c! \\u8de8\\u5e73\\u53f0\\u5f00\\u53d1'
        break
      case 'hex':
        encodingInput.value = '44 65 76 55 74 69 6c 73 20 32 30 32 36'
        break
      case 'html':
        encodingInput.value = '&lt;div class=&quot;alert&quot;&gt;Fish &amp; Chips&lt;/div&gt;'
        break
    }
  }
}

function copyToClipboard(text: string, label = '内容') {
  if (!text) {
    message.warning('无内容可复制')
    return
  }
  navigator.clipboard.writeText(text).then(
    () => message.success(`已复制${label}到剪贴板`),
    () => message.error('复制失败，请手动选择复制')
  )
}

function getByteCount(str: string): number {
  return new TextEncoder().encode(str).byteLength
}

// --- Tab 2.1: Text Hash State ---
const textHashInput = ref<string>(props.initialSnapshot?.textHashInput ?? '')
const textHashAlgo = ref<string>(props.initialSnapshot?.textHashAlgo ?? 'sha-256')
const textHashUppercase = ref<boolean>(props.initialSnapshot?.textHashUppercase ?? false)
const textHashHmacEnabled = ref<boolean>(props.initialSnapshot?.textHashHmacEnabled ?? false)
const textHashKey = ref<string>(props.initialSnapshot?.textHashKey ?? '')

const textHashResult = ref<string>('')
const textHashError = ref<string>('')

const HASH_ALGORITHMS = [
  { label: 'MD5 (32 位 / 128 bit)', value: 'md5' },
  { label: 'MD5 (16 位 / 64 bit)', value: 'md5-16' },
  { label: 'SHA-1 (160 bit)', value: 'sha-1' },
  { label: 'SHA-256 (256 bit)', value: 'sha-256' },
  { label: 'SHA-512 (512 bit)', value: 'sha-512' },
  { label: 'SHA3-256 (Keccak 256)', value: 'sha3-256' },
  { label: 'SHA3-512 (Keccak 512)', value: 'sha3-512' }
]

// All algorithms matrix results for quick glance
const allHashes = ref<Array<{ name: string; algo: string; hash: string }>>([])

let textHashSeq = 0
let textHashDebounceTimer: any = null

async function updateTextHash() {
  const seq = ++textHashSeq
  textHashError.value = ''
  try {
    const key = textHashHmacEnabled.value && textHashKey.value.trim() ? textHashKey.value : null
    const res = await invoke<string>('compute_text_hash', {
      text: textHashInput.value,
      algorithm: textHashAlgo.value,
      key
    })
    if (seq !== textHashSeq) return
    textHashResult.value = textHashUppercase.value ? res.toUpperCase() : res.toLowerCase()
  } catch (err: any) {
    if (seq !== textHashSeq) return
    textHashError.value = String(err)
    textHashResult.value = ''
  }

  // Update matrix list
  if (textHashInput.value) {
    try {
      const key = textHashHmacEnabled.value && textHashKey.value.trim() ? textHashKey.value : null
      const algos = ['md5', 'md5-16', 'sha-1', 'sha-256', 'sha-512', 'sha3-256', 'sha3-512']
      const results = await Promise.all(
        algos.map(async (algo) => {
          const h = await invoke<string>('compute_text_hash', {
            text: textHashInput.value,
            algorithm: algo,
            key
          })
          return {
            name: algo.toUpperCase(),
            algo,
            hash: textHashUppercase.value ? h.toUpperCase() : h.toLowerCase()
          }
        })
      )
      if (seq === textHashSeq) {
        allHashes.value = results
      }
    } catch {
      // Keep silent
    }
  } else {
    allHashes.value = []
  }
}

function debouncedUpdateTextHash() {
  if (textHashDebounceTimer) clearTimeout(textHashDebounceTimer)
  textHashDebounceTimer = setTimeout(() => {
    updateTextHash()
  }, 150)
}

watch(
  [textHashInput, textHashAlgo, textHashUppercase, textHashHmacEnabled, textHashKey],
  () => {
    debouncedUpdateTextHash()
  },
  { immediate: true }
)

// --- Tab 2.2: Streaming File Hash State ---
const fileHashAlgo = ref<string>(props.initialSnapshot?.fileHashAlgo ?? 'sha-256')
const selectedFilePath = ref<string>(props.initialSnapshot?.selectedFilePath ?? '')
const fileHashStatus = ref<'idle' | 'running' | 'completed' | 'cancelled' | 'error'>('idle')
const fileHashError = ref<string>('')
const fileHashResult = ref<string>('')
const fileHashUppercase = ref<boolean>(false)
const expectedChecksum = ref<string>('')

// Progress metrics
const readBytes = ref<number>(0)
const totalBytes = ref<number>(0)
const speedBytesPerSec = ref<number>(0)
const startTime = ref<number>(0)
const lastSpeedCheckTime = ref<number>(0)
const lastReadBytes = ref<number>(0)
let currentTaskId = ''

const isDragging = ref<boolean>(false)

const progressPercentage = computed(() => {
  if (fileHashStatus.value === 'completed') return 100
  if (totalBytes.value === 0) return 0
  return Math.min(100, Math.round((readBytes.value / totalBytes.value) * 1000) / 10)
})

const formattedSpeed = computed(() => {
  if (speedBytesPerSec.value === 0) return '0 B/s'
  return `${formatBytes(speedBytesPerSec.value)}/s`
})

const checksumMatch = computed(() => {
  if (!expectedChecksum.value.trim() || !fileHashResult.value) return null
  return expectedChecksum.value.trim().toLowerCase() === fileHashResult.value.toLowerCase()
})

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  if (e.dataTransfer && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0]
    // In Tauri webview environment, file.path is available on File objects
    const path = (file as any).path || file.name
    selectedFilePath.value = path
    fileHashStatus.value = 'idle'
    fileHashResult.value = ''
    fileHashError.value = ''
  }
}

async function startFileHash() {
  const path = selectedFilePath.value.trim()
  if (!path) {
    message.warning('请先输入或拖入待计算的文件路径')
    return
  }

  currentTaskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  fileHashStatus.value = 'running'
  fileHashError.value = ''
  fileHashResult.value = ''
  readBytes.value = 0
  totalBytes.value = 0
  speedBytesPerSec.value = 0
  startTime.value = Date.now()
  lastSpeedCheckTime.value = Date.now()
  lastReadBytes.value = 0

  const onProgress = new Channel<HashProgress>()
  onProgress.onmessage = (progress) => {
    readBytes.value = progress.readBytes
    totalBytes.value = progress.totalBytes

    const now = Date.now()
    const dt = (now - lastSpeedCheckTime.value) / 1000
    if (dt >= 0.3) {
      const deltaBytes = progress.readBytes - lastReadBytes.value
      speedBytesPerSec.value = deltaBytes / dt
      lastSpeedCheckTime.value = now
      lastReadBytes.value = progress.readBytes
    }
  }

  try {
    const res = await invoke<string>('compute_file_hash', {
      taskId: currentTaskId,
      filePath: path,
      algorithm: fileHashAlgo.value,
      onProgress
    })
    fileHashResult.value = fileHashUppercase.value ? res.toUpperCase() : res.toLowerCase()
    fileHashStatus.value = 'completed'
    readBytes.value = totalBytes.value
    message.success('文件哈希计算完毕')
  } catch (err: any) {
    const errMsg = String(err)
    if (errMsg.includes('Cancelled')) {
      fileHashStatus.value = 'cancelled'
      message.info('已取消文件哈希计算')
    } else {
      fileHashStatus.value = 'error'
      fileHashError.value = errMsg
      message.error(`计算失败: ${errMsg}`)
    }
  }
}

async function cancelFileHash() {
  if (fileHashStatus.value === 'running' && currentTaskId) {
    try {
      await invoke('cancel_file_hash', { taskId: currentTaskId })
    } catch (err) {
      console.error('Cancel request error:', err)
    }
  }
}

let unlistenDragDrop: (() => void) | null = null

onMounted(async () => {
  try {
    const { getCurrentWebview } = await import('@tauri-apps/api/webview')
    const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop' && event.payload.paths && event.payload.paths.length > 0) {
        selectedFilePath.value = event.payload.paths[0]
        fileHashStatus.value = 'idle'
        fileHashResult.value = ''
        fileHashError.value = ''
      }
    })
    unlistenDragDrop = unlisten
  } catch {
    // Non-Tauri or test environment fallback
  }
})

onUnmounted(() => {
  if (textHashDebounceTimer) {
    clearTimeout(textHashDebounceTimer)
  }
  if (unlistenDragDrop) {
    unlistenDragDrop()
  }
  if (fileHashStatus.value === 'running' && currentTaskId) {
    cancelFileHash()
  }
})

// Snapshot persistence
watch(
  [
    mainTab,
    hashSubTab,
    encodingType,
    encodingMode,
    encodingInput,
    base64UrlSafe,
    urlMode,
    unicodeEscapeAll,
    hexDelimiter,
    hexUppercase,
    textHashInput,
    textHashAlgo,
    textHashHmacEnabled,
    textHashKey,
    fileHashAlgo,
    selectedFilePath
  ],
  () => {
    tabStore.updateTabSnapshot(props.tabId, {
      mainTab: mainTab.value,
      hashSubTab: hashSubTab.value,
      encodingType: encodingType.value,
      encodingMode: encodingMode.value,
      encodingInput: encodingInput.value,
      base64UrlSafe: base64UrlSafe.value,
      urlMode: urlMode.value,
      unicodeEscapeAll: unicodeEscapeAll.value,
      hexDelimiter: hexDelimiter.value,
      hexUppercase: hexUppercase.value,
      textHashInput: textHashInput.value,
      textHashAlgo: textHashAlgo.value,
      textHashHmacEnabled: textHashHmacEnabled.value,
      textHashKey: textHashKey.value,
      fileHashAlgo: fileHashAlgo.value,
      selectedFilePath: selectedFilePath.value
    })
  }
)
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <!-- Top Header & Primary Navigation -->
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm">
          #
        </div>
        <div>
          <h1 class="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
            编码转换与哈希工作室
          </h1>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">
            Base64 / URL / Hex / Unicode / HTML 实体互转与 2MB 缓冲区流式大文件哈希
          </p>
        </div>
      </div>

      <!-- Main Tab Switcher -->
      <NRadioGroup v-model:value="mainTab" size="small">
        <NRadioButton value="encoding">
          <span class="flex items-center gap-1.5 px-1">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            信息编码转换
          </span>
        </NRadioButton>
        <NRadioButton value="hash">
          <span class="flex items-center gap-1.5 px-1">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            摘要与哈希计算
          </span>
        </NRadioButton>
      </NRadioGroup>
    </header>

    <!-- Main Workspace Content -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <!-- ================= TAB 1: ENCODING CONVERTER ================= -->
      <div v-if="mainTab === 'encoding'" class="h-full flex flex-col p-4 gap-3 overflow-hidden">
        <!-- Control Toolbar -->
        <div class="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm">
          <div class="flex flex-wrap items-center gap-3">
            <!-- Encoding Type -->
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">格式类别:</span>
              <NSelect
                v-model:value="encodingType"
                :options="encodingTypes"
                size="small"
                class="w-44"
              />
            </div>

            <!-- Encode / Decode Mode -->
            <NRadioGroup v-model:value="encodingMode" size="small">
              <NRadioButton value="encode">编码 (Encode)</NRadioButton>
              <NRadioButton value="decode">解码 (Decode)</NRadioButton>
            </NRadioGroup>

            <!-- Contextual Options -->
            <!-- Base64 Options -->
            <div v-if="encodingType === 'base64'" class="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
              <NSwitch v-model:value="base64UrlSafe" size="small" />
              <span class="text-xs text-slate-600 dark:text-slate-300">URL-Safe (替代 +/ 且去 =)</span>
            </div>

            <!-- URL Options -->
            <div v-if="encodingType === 'url'" class="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
              <NSelect
                v-model:value="urlMode"
                :options="urlModeOptions"
                size="small"
                class="w-56"
              />
            </div>

            <!-- Unicode Options -->
            <div v-if="encodingType === 'unicode' && encodingMode === 'encode'" class="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
              <NSwitch v-model:value="unicodeEscapeAll" size="small" />
              <span class="text-xs text-slate-600 dark:text-slate-300">转义全部字符 (含 ASCII)</span>
            </div>

            <!-- Hex Options -->
            <div v-if="encodingType === 'hex'" class="flex items-center gap-3 pl-2 border-l border-slate-200 dark:border-slate-700">
              <div v-if="encodingMode === 'encode'" class="flex items-center gap-1.5">
                <span class="text-xs text-slate-500">分隔符:</span>
                <NSelect
                  v-model:value="hexDelimiter"
                  :options="hexDelimiterOptions"
                  size="small"
                  class="w-40"
                />
              </div>
              <div class="flex items-center gap-1.5">
                <NSwitch v-model:value="hexUppercase" size="small" />
                <span class="text-xs text-slate-600 dark:text-slate-300">大写十六进制</span>
              </div>
            </div>
          </div>

          <!-- Quick Action Buttons -->
          <div class="flex items-center gap-2">
            <NButton size="small" secondary @click="loadSampleEncoding">
              载入示例
            </NButton>
            <NButton size="small" tertiary @click="clearEncodingInput">
              清空
            </NButton>
          </div>
        </div>

        <!-- Error Notification Bar -->
        <NAlert v-if="encodingError" type="error" closable class="py-1 shrink-0 text-xs">
          {{ encodingError }}
        </NAlert>

        <!-- Panels Layout: Input (Left) & Output (Right) -->
        <div class="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0">
          <!-- Left: Input Panel -->
          <div class="flex flex-col bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80 overflow-hidden shadow-sm">
            <div class="px-3 py-2 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/50">
              <div class="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
                <span>{{ encodingMode === 'encode' ? '原文输入 (UTF-8)' : '待解码内容' }}</span>
              </div>
              <div class="flex items-center gap-3 text-[11px]">
                <span>{{ encodingInput.length }} 字符</span>
                <span>{{ getByteCount(encodingInput) }} 字节</span>
              </div>
            </div>
            <div class="flex-1 p-2">
              <NInput
                v-model:value="encodingInput"
                type="textarea"
                placeholder="请输入或粘贴文本内容..."
                class="h-full w-full font-mono text-xs resize-none"
                :autosize="false"
              />
            </div>
          </div>

          <!-- Right: Output Panel -->
          <div class="flex flex-col bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80 overflow-hidden shadow-sm">
            <div class="px-3 py-2 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/50">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-slate-700 dark:text-slate-200">
                  {{ encodingMode === 'encode' ? '编码输出结果' : '解码还原内容 (UTF-8)' }}
                </span>
                <NButton
                  size="tiny"
                  secondary
                  type="primary"
                  @click="swapEncoding"
                  :disabled="!encodingOutput"
                  title="将输出作为输入并反转编解码方向"
                >
                  ⇄ 互换并翻转
                </NButton>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[11px]">{{ encodingOutput.length }} 字符</span>
                <NButton
                  size="tiny"
                  type="primary"
                  @click="copyToClipboard(encodingOutput, '编码结果')"
                  :disabled="!encodingOutput"
                >
                  复制结果
                </NButton>
              </div>
            </div>
            <div class="flex-1 p-2">
              <NInput
                :value="encodingOutput"
                type="textarea"
                readonly
                placeholder="转换结果将实时呈现..."
                class="h-full w-full font-mono text-xs resize-none bg-slate-50/30 dark:bg-slate-900/40"
                :autosize="false"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- ================= TAB 2: HASH STUDIO ================= -->
      <div v-else class="h-full flex flex-col p-4 gap-3 overflow-hidden">
        <!-- Sub-Navigation Header -->
        <div class="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 flex items-center justify-between shrink-0 shadow-sm">
          <NRadioGroup v-model:value="hashSubTab" size="small">
            <NRadioButton value="text">
              <span class="flex items-center gap-1.5 px-1">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                文本摘要与 HMAC 加盐
              </span>
            </NRadioButton>
            <NRadioButton value="file">
              <span class="flex items-center gap-1.5 px-1">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                大文件流式哈希 (2MB 恒定内存)
              </span>
            </NRadioButton>
          </NRadioGroup>
        </div>

        <!-- Sub-Tab 2.1: Text Hash -->
        <div v-if="hashSubTab === 'text'" class="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 overflow-y-auto">
          <!-- Left: Input & Primary Result (7 cols) -->
          <div class="lg:col-span-7 flex flex-col gap-3">
            <!-- Configuration Bar -->
            <div class="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2 shadow-sm">
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-slate-500">主算法:</span>
                <NSelect
                  v-model:value="textHashAlgo"
                  :options="HASH_ALGORITHMS"
                  size="small"
                  class="w-56"
                />
              </div>

              <div class="flex items-center gap-4">
                <div class="flex items-center gap-1.5">
                  <NSwitch v-model:value="textHashUppercase" size="small" />
                  <span class="text-xs text-slate-600 dark:text-slate-300">大写十六进制</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <NSwitch v-model:value="textHashHmacEnabled" size="small" />
                  <span class="text-xs text-slate-600 dark:text-slate-300">HMAC 加盐</span>
                </div>
              </div>
            </div>

            <!-- HMAC Secret Input (if enabled) -->
            <div v-if="textHashHmacEnabled" class="bg-amber-50/50 dark:bg-amber-950/20 p-2.5 rounded-xl border border-amber-200/80 dark:border-amber-800/50 flex items-center gap-2">
              <span class="text-xs font-semibold text-amber-700 dark:text-amber-400 shrink-0">HMAC 密钥:</span>
              <NInput
                v-model:value="textHashKey"
                type="text"
                placeholder="输入加盐私钥 (Secret Key)..."
                size="small"
                class="font-mono text-xs"
              />
            </div>

            <!-- Input Text Area -->
            <div class="flex-1 flex flex-col bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80 overflow-hidden shadow-sm min-h-[160px]">
              <div class="px-3 py-2 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-800/50">
                <span class="font-semibold text-slate-700 dark:text-slate-200">输入待哈希明文</span>
                <div class="flex items-center gap-3 text-[11px]">
                  <span>{{ textHashInput.length }} 字符</span>
                  <span>{{ getByteCount(textHashInput) }} 字节</span>
                </div>
              </div>
              <div class="flex-1 p-2">
                <NInput
                  v-model:value="textHashInput"
                  type="textarea"
                  placeholder="输入任意字符串实时计算哈希摘要..."
                  class="h-full w-full font-mono text-xs resize-none"
                  :autosize="false"
                />
              </div>
            </div>

            <!-- Primary Highlight Result Card -->
            <div class="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm flex flex-col gap-2">
              <div class="flex items-center justify-between text-xs text-slate-500">
                <span class="font-semibold text-slate-700 dark:text-slate-200">
                  {{ textHashAlgo.toUpperCase() }} {{ textHashHmacEnabled ? '(HMAC)' : '摘要' }}
                </span>
                <span class="text-[11px] font-mono text-slate-400">
                  {{ textHashResult.length * 4 }} bits / {{ textHashResult.length }} chars
                </span>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex-1 font-mono text-xs p-2 bg-slate-100/70 dark:bg-slate-900 rounded-lg text-indigo-600 dark:text-indigo-400 break-all select-all border border-slate-200/60 dark:border-slate-800">
                  {{ textHashResult || '等待输入...' }}
                </div>
                <NButton
                  type="primary"
                  size="small"
                  @click="copyToClipboard(textHashResult, `${textHashAlgo.toUpperCase()} 哈希`)"
                  :disabled="!textHashResult"
                >
                  复制
                </NButton>
              </div>
            </div>
          </div>

          <!-- Right: All Algorithms Matrix (5 cols) -->
          <div class="lg:col-span-5 flex flex-col bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80 overflow-hidden shadow-sm">
            <div class="px-3 py-2 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs bg-slate-50/50 dark:bg-slate-800/50">
              <span class="font-semibold text-slate-700 dark:text-slate-200">常见算法全量矩阵</span>
              <span class="text-[11px] text-slate-400">点击行复制对应哈希</span>
            </div>
            <div class="flex-1 p-2 overflow-y-auto space-y-2">
              <div
                v-for="item in allHashes"
                :key="item.algo"
                @click="copyToClipboard(item.hash, item.name)"
                class="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 hover:border-indigo-400 dark:hover:border-indigo-500 cursor-pointer transition-colors group"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    {{ item.name }}
                  </span>
                  <span class="text-[10px] text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    点击复制
                  </span>
                </div>
                <div class="font-mono text-[11px] text-slate-800 dark:text-slate-300 break-all">
                  {{ item.hash }}
                </div>
              </div>
              <div v-if="allHashes.length === 0" class="h-32 flex items-center justify-center text-xs text-slate-400">
                暂无数据，请在左侧输入明文
              </div>
            </div>
          </div>
        </div>

        <!-- Sub-Tab 2.2: Streaming File Hash -->
        <div v-else class="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto">
          <!-- File Selection Zone -->
          <div
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDrop"
            :class="[
              'p-6 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center text-center cursor-pointer',
              isDragging
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:border-indigo-400'
            ]"
          >
            <div class="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2">
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
            </div>
            <p class="text-sm font-semibold text-slate-800 dark:text-slate-200">
              拖拽本地大文件至此，或在下方输入绝对路径
            </p>
            <p class="text-xs text-slate-400 mt-1 max-w-md">
              底层采用 2MB 固定缓冲区流式读取 Hasher，内存恒定在 30MB 以内，支持 10GB+ 超大文件与毫秒级即时取消。
            </p>
          </div>

          <!-- Configuration & Action Toolbar -->
          <div class="bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div class="flex-1 flex items-center gap-2 min-w-[300px]">
              <span class="text-xs font-semibold text-slate-500 shrink-0">文件路径:</span>
              <NInput
                v-model:value="selectedFilePath"
                placeholder="例如: /Users/username/Downloads/ubuntu.iso"
                size="small"
                clearable
                class="font-mono text-xs"
              />
            </div>

            <div class="flex items-center gap-3">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-semibold text-slate-500">算法:</span>
                <NSelect
                  v-model:value="fileHashAlgo"
                  :options="HASH_ALGORITHMS"
                  size="small"
                  class="w-44"
                />
              </div>

              <!-- Action Controls -->
              <NButton
                v-if="fileHashStatus !== 'running'"
                type="primary"
                size="small"
                @click="startFileHash"
                :disabled="!selectedFilePath.trim()"
              >
                开始流式哈希
              </NButton>

              <NButton
                v-else
                type="error"
                size="small"
                @click="cancelFileHash"
              >
                取消计算
              </NButton>
            </div>
          </div>

          <!-- Progress & Status Monitor Card -->
          <div
            v-if="fileHashStatus !== 'idle'"
            class="bg-white dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm flex flex-col gap-3"
          >
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-2">
                <span class="font-bold text-slate-700 dark:text-slate-200">计算状态:</span>
                <NTag
                  size="small"
                  :type="
                    fileHashStatus === 'running'
                      ? 'info'
                      : fileHashStatus === 'completed'
                      ? 'success'
                      : fileHashStatus === 'cancelled'
                      ? 'warning'
                      : 'error'
                  "
                >
                  {{
                    fileHashStatus === 'running'
                      ? '正在流式读取中...'
                      : fileHashStatus === 'completed'
                      ? '计算完成'
                      : fileHashStatus === 'cancelled'
                      ? '已取消'
                      : '计算异常'
                  }}
                </NTag>
              </div>

              <div class="flex items-center gap-4 text-xs font-mono text-slate-500">
                <span>读取速度: <b class="text-indigo-600 dark:text-indigo-400">{{ formattedSpeed }}</b></span>
                <span>进度: <b>{{ formatBytes(readBytes) }} / {{ formatBytes(totalBytes) }}</b></span>
              </div>
            </div>

            <!-- Progress Bar -->
            <NProgress
              type="line"
              :percentage="progressPercentage"
              :status="
                fileHashStatus === 'running'
                  ? 'info'
                  : fileHashStatus === 'completed'
                  ? 'success'
                  : fileHashStatus === 'cancelled'
                  ? 'warning'
                  : 'error'
              "
              :processing="fileHashStatus === 'running'"
            />
          </div>

          <!-- Result Display & Checksum Verification -->
          <div
            v-if="fileHashResult"
            class="bg-white dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm flex flex-col gap-3"
          >
            <div class="flex items-center justify-between text-xs text-slate-500">
              <span class="font-bold text-slate-700 dark:text-slate-200">
                {{ fileHashAlgo.toUpperCase() }} 计算结果
              </span>
              <div class="flex items-center gap-3">
                <div class="flex items-center gap-1.5">
                  <NSwitch v-model:value="fileHashUppercase" size="small" />
                  <span class="text-xs text-slate-600 dark:text-slate-300">大写结果</span>
                </div>
                <NButton
                  type="primary"
                  size="tiny"
                  @click="copyToClipboard(fileHashUppercase ? fileHashResult.toUpperCase() : fileHashResult.toLowerCase(), '文件哈希')"
                >
                  复制哈希
                </NButton>
              </div>
            </div>

            <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs text-indigo-600 dark:text-indigo-400 break-all select-all">
              {{ fileHashUppercase ? fileHashResult.toUpperCase() : fileHashResult.toLowerCase() }}
            </div>

            <!-- Checksum Verifier -->
            <div class="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center gap-3">
              <span class="text-xs font-semibold text-slate-500 shrink-0">哈希完整性校验:</span>
              <NInput
                v-model:value="expectedChecksum"
                placeholder="粘贴待比对的校验哈希 (例如官网发布的 checksums.txt)..."
                size="small"
                class="font-mono text-xs flex-1"
                clearable
              />
              <div v-if="checksumMatch !== null" class="shrink-0">
                <NTag v-if="checksumMatch" type="success" size="small">
                  ✓ 哈希一致 (完整)
                </NTag>
                <NTag v-else type="error" size="small">
                  ✕ 哈希不匹配 (可能已损坏或被篡改)
                </NTag>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

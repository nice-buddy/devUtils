<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { json } from '@codemirror/lang-json'
import { EditorState, Compartment } from '@codemirror/state'
import { useThemeStore } from '@/stores/themeStore'
import HtmlPreviewIframe from './HtmlPreviewIframe.vue'
import { PostmanResponseModel } from '../types'
import { formatResponseBody, LARGE_RESPONSE_THRESHOLD_BYTES } from '../utils/responseFormatter'

const props = defineProps<{
  response: PostmanResponseModel | null
  loading: boolean
  error: string | null
}>()

const message = useMessage()
const themeStore = useThemeStore()

const activeTab = ref<'pretty' | 'raw' | 'preview' | 'headers'>('pretty')

// Large Response Threshold Guard (> 1MB)
const isLargePayload = computed<boolean>(() => {
  if (!props.response) return false
  return Boolean(
    props.response.isLarge ||
    props.response.sizeBytes > LARGE_RESPONSE_THRESHOLD_BYTES ||
    (props.response.body && props.response.body.length > LARGE_RESPONSE_THRESHOLD_BYTES)
  )
})

const contentType = computed(() => {
  if (!props.response?.headers) return ''
  for (const [k, v] of Object.entries(props.response.headers)) {
    if (k.toLowerCase() === 'content-type') return v
  }
  return ''
})

const isImageResponse = computed(() => {
  return contentType.value.toLowerCase().startsWith('image/')
})

// Auto switch tab if image response
watch(
  () => props.response,
  (res) => {
    if (res?.isBinary && isImageResponse.value) {
      activeTab.value = 'preview'
    } else if (res?.isBinary && activeTab.value !== 'preview' && activeTab.value !== 'headers') {
      activeTab.value = 'preview'
    }
  }
)

// CodeMirror for Pretty & Raw Response
const editorEl = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
const themeCompartment = new Compartment()
const langCompartment = new Compartment()

function getLangExtension() {
  if (isLargePayload.value || activeTab.value !== 'pretty' || props.response?.isBinary) {
    return []
  }
  return json()
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
      },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: isDark ? '#312e81' : '#c7d2fe'
      }
    },
    { dark: isDark }
  )
}

const formattedPrettyText = computed(() => {
  if (!props.response?.body) return ''
  return formatResponseBody(props.response.body, isLargePayload.value)
})

function initResponseEditor() {
  if (!editorEl.value || editorView) return

  const initialDoc =
    activeTab.value === 'pretty' ? formattedPrettyText.value : props.response?.body || ''

  editorView = new EditorView({
    state: EditorState.create({
      doc: initialDoc,
      extensions: [
        basicSetup,
        langCompartment.of(getLangExtension()),
        themeCompartment.of(getEditorTheme(themeStore.isDark)),
        EditorView.editable.of(false),
        EditorState.readOnly.of(true)
      ]
    }),
    parent: editorEl.value
  })
}

function updateEditorContent() {
  if (!editorView) {
    initResponseEditor()
    return
  }
  const content =
    activeTab.value === 'pretty' ? formattedPrettyText.value : props.response?.body || ''
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: content },
    effects: langCompartment.reconfigure(getLangExtension())
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getStatusBadgeClass(status: number): string {
  if (status >= 200 && status < 300) {
    return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
  }
  if (status >= 300 && status < 400) {
    return 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
  }
  if (status >= 400 && status < 500) {
    return 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
  }
  return 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'
}

async function copyResponseBody() {
  if (!props.response?.body) return
  try {
    await navigator.clipboard.writeText(props.response.body)
    message.success('响应体已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

async function copyHeaderValue(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

async function copyTempFilePath() {
  if (!props.response?.tempFilePath) return
  try {
    await navigator.clipboard.writeText(props.response.tempFilePath)
    message.success('已复制缓存文件路径')
  } catch {
    message.error('复制失败')
  }
}

watch(
  () => props.response,
  async () => {
    await nextTick()
    updateEditorContent()
  }
)

watch(activeTab, async (tab) => {
  if (tab === 'pretty' || tab === 'raw') {
    await nextTick()
    if (!editorView) {
      initResponseEditor()
    } else {
      updateEditorContent()
      editorView.requestMeasure()
    }
  }
})

watch(
  () => themeStore.isDark,
  (dark) => {
    if (editorView) {
      editorView.dispatch({
        effects: themeCompartment.reconfigure(getEditorTheme(dark))
      })
    }
  }
)

onMounted(() => {
  if (props.response && (activeTab.value === 'pretty' || activeTab.value === 'raw')) {
    initResponseEditor()
  }
})

onBeforeUnmount(() => {
  if (editorView) {
    editorView.destroy()
    editorView = null
  }
})
</script>

<template>
  <div class="h-full w-full flex flex-col bg-white dark:bg-slate-900 overflow-hidden">
    <!-- Response Header Bar -->
    <div class="h-9 px-3 bg-slate-100/70 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">
      <!-- Tabs: Pretty, Raw, Preview, Headers -->
      <div class="flex items-center gap-1 font-medium">
        <button
          @click="activeTab = 'pretty'"
          :class="[
            'px-2.5 py-1 rounded transition-colors',
            activeTab === 'pretty'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          ]"
        >
          Pretty 格式化
        </button>
        <button
          @click="activeTab = 'raw'"
          :class="[
            'px-2.5 py-1 rounded transition-colors',
            activeTab === 'raw'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          ]"
        >
          Raw 原始
        </button>
        <button
          @click="activeTab = 'preview'"
          :class="[
            'px-2.5 py-1 rounded transition-colors',
            activeTab === 'preview'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          ]"
        >
          {{ isImageResponse ? '图片预览' : '网页/媒体预览' }}
        </button>
        <button
          @click="activeTab = 'headers'"
          :class="[
            'px-2.5 py-1 rounded transition-colors flex items-center gap-1',
            activeTab === 'headers'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          ]"
        >
          <span>Headers</span>
          <span
            v-if="response && Object.keys(response.headers).length > 0"
            class="px-1 text-[10px] rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono"
          >
            {{ Object.keys(response.headers).length }}
          </span>
        </button>
      </div>

      <!-- Right: Status, Duration, Size, Copy -->
      <div v-if="response" class="flex items-center gap-2.5">
        <span
          :class="[
            'px-2 py-0.5 rounded text-[11px] font-mono font-bold border',
            getStatusBadgeClass(response.status)
          ]"
        >
          {{ response.status }} {{ response.statusText }}
        </span>

        <span class="text-[11px] font-mono text-slate-500" title="响应总耗时（含网络传输与下载）">
          ⏱ {{ response.durationMs }} ms
        </span>

        <span class="text-[11px] font-mono text-slate-500" title="响应体体积">
          📦 {{ formatSize(response.sizeBytes) }}
        </span>

        <button
          @click="copyResponseBody"
          class="text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors ml-1"
          title="复制完整响应体"
        >
          复制
        </button>
      </div>
    </div>

    <!-- Sub Warning Bar (Large Payload Guard > 1MB) -->
    <div
      v-if="response && isLargePayload"
      class="h-7 px-3 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-900/60 flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 shrink-0"
    >
      <div class="flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>
          {{ response.isLarge ? '响应体积超过 5MB，已开启大报文分块轻量只读保护' : '响应体积超过 1MB，大文本保护已生效（禁用重度 AST 语法树解析并展示原始文本以保障流畅）' }}
        </span>
      </div>
      <div v-if="response.tempFilePath" class="flex items-center gap-2">
        <span class="text-[11px] font-mono opacity-80 truncate max-w-xs" :title="response.tempFilePath">缓存: {{ response.tempFilePath }}</span>
        <button @click="copyTempFilePath" class="underline hover:text-amber-900 dark:hover:text-amber-100 text-[11px]">复制路径</button>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="flex-1 min-h-0 relative overflow-hidden bg-white dark:bg-slate-900">
      <!-- Loading State -->
      <div
        v-if="loading"
        class="h-full w-full flex flex-col items-center justify-center gap-3 text-slate-400"
      >
        <div class="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <span class="text-xs font-mono">正在执行网络请求并流式接收响应体...</span>
      </div>

      <!-- Error State -->
      <div
        v-else-if="error"
        class="h-full w-full flex flex-col items-center justify-center p-6 text-center"
      >
        <div class="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-500 flex items-center justify-center mb-3">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h4 class="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">请求失败</h4>
        <p class="text-xs font-mono text-rose-500 max-w-md break-all">{{ error }}</p>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!response"
        class="h-full w-full flex flex-col items-center justify-center text-slate-400 gap-1.5"
      >
        <span class="text-xs">暂无响应，点击上方“发送”按钮调试接口</span>
      </div>

      <!-- Result View: Pretty & Raw (CodeMirror) -->
      <div
        v-show="response && (activeTab === 'pretty' || activeTab === 'raw')"
        class="h-full w-full"
      >
        <div ref="editorEl" class="h-full w-full overflow-hidden"></div>
      </div>

      <!-- Result View: Media / Image Preview or HTML Preview (Strictly Sandboxed) -->
      <div
        v-if="response && activeTab === 'preview'"
        class="h-full w-full"
      >
        <div
          v-if="response.isBinary && isImageResponse && response.bodyBase64"
          class="h-full w-full flex flex-col items-center justify-center p-4 overflow-auto bg-slate-100/70 dark:bg-slate-950/70"
        >
          <img
            :src="'data:' + (contentType || 'image/png') + ';base64,' + response.bodyBase64"
            class="max-w-full max-h-full object-contain rounded shadow-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            alt="Response Image Preview"
          />
          <span class="text-xs text-slate-500 font-mono mt-2">{{ contentType }} ({{ formatSize(response.sizeBytes) }})</span>
        </div>
        <div
          v-else-if="response.isBinary"
          class="h-full w-full flex flex-col items-center justify-center p-6 gap-3 text-slate-500"
        >
          <div class="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-xl">
            📦
          </div>
          <span class="text-xs font-semibold">二进制数据流 ({{ contentType || 'application/octet-stream' }})</span>
          <span class="text-xs text-slate-400 font-mono">{{ formatSize(response.sizeBytes) }}</span>
        </div>
        <HtmlPreviewIframe v-else :content="response.body" />
      </div>

      <!-- Result View: Headers Table -->
      <div
        v-if="response && activeTab === 'headers'"
        class="h-full w-full overflow-auto p-3"
      >
        <div class="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden bg-white dark:bg-slate-950">
          <table class="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th class="w-1/3 py-2 px-3 border-r border-slate-200 dark:border-slate-800">响应头名称 (Key)</th>
                <th class="py-2 px-3">响应头数值 (Value)</th>
                <th class="w-12 py-2 px-3 text-center"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(val, key) in response.headers"
                :key="key"
                class="border-b border-slate-100 dark:border-slate-900/60 hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
              >
                <td class="py-1.5 px-3 font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                  {{ key }}
                </td>
                <td class="py-1.5 px-3 text-slate-600 dark:text-slate-400 break-all select-text">
                  {{ val }}
                </td>
                <td class="py-1.5 px-3 text-center">
                  <button
                    @click="copyHeaderValue(val)"
                    class="text-indigo-600 dark:text-indigo-400 hover:underline text-[11px]"
                  >
                    复制
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

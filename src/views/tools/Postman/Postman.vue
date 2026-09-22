<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { useTabStore } from '@/stores/tabStore'
import RequestPanel from './components/RequestPanel.vue'
import ResponsePanel from './components/ResponsePanel.vue'
import { parseCurl, exportToCurl } from './utils/curlParser'
import {
  PostmanRequestModel,
  PostmanResponseModel,
  HistoryItem,
  HTTP_METHODS,
  getMethodColor,
  getMethodBg,
  KeyValueItem
} from './types'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const dialog = useDialog()
const tabStore = useTabStore()

// Default request model
function createDefaultRequest(): PostmanRequestModel {
  return {
    method: 'GET',
    url: 'https://httpbin.org/get',
    params: [
      { key: 'page', value: '1', enabled: true },
      { key: 'limit', value: '20', enabled: true }
    ],
    headers: [
      { key: 'Accept', value: 'application/json', enabled: true },
      { key: 'User-Agent', value: 'DevUtils-Postman/1.0', enabled: true }
    ],
    bodyType: 'none',
    rawType: 'json',
    bodyRaw: '{\n  "name": "DevUtils",\n  "active": true\n}',
    formData: [],
    urlencodedData: [],
    binaryFilePath: '',
    auth: {
      type: 'none',
      bearerToken: '',
      basicUsername: '',
      basicPassword: '',
      apiKeyName: 'X-API-KEY',
      apiKeyValue: '',
      apiKeyAddTo: 'header'
    },
    settings: {
      ignoreSsl: false,
      followRedirects: true,
      timeoutMs: 30000,
      proxy: ''
    }
  }
}

// Request & Response state
const request = ref<PostmanRequestModel>(
  props.initialSnapshot?.request ? JSON.parse(JSON.stringify(props.initialSnapshot.request)) : createDefaultRequest()
)
const response = ref<PostmanResponseModel | null>(props.initialSnapshot?.response ?? null)
const loading = ref(false)
const errorMessage = ref<string | null>(null)

// History drawer state
const showHistory = ref(false)
const historyList = ref<HistoryItem[]>([])
const loadingHistory = ref(false)

// cURL import dialog state
const showCurlModal = ref(false)
const curlInputText = ref('')

// Environment variables state
const showEnvModal = ref(false)
const envVariables = ref<KeyValueItem[]>([
  { key: 'baseUrl', value: 'https://httpbin.org', enabled: true }
])

// Snapshot persistence
function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    request: JSON.parse(JSON.stringify(request.value)),
    response: response.value ? JSON.parse(JSON.stringify(response.value)) : null
  })
}

// URL & Params Synchronization
let isSyncing = false

function syncUrlToParams() {
  if (isSyncing) return
  isSyncing = true
  try {
    const rawUrl = request.value.url.trim()
    const questionIdx = rawUrl.indexOf('?')
    if (questionIdx > -1) {
      const queryStr = rawUrl.substring(questionIdx + 1)
      const searchParams = new URLSearchParams(queryStr)
      const newParams: KeyValueItem[] = []
      searchParams.forEach((val, key) => {
        newParams.push({ key, value: val, enabled: true })
      })
      if (newParams.length > 0) {
        request.value.params = newParams
      }
    }
  } catch {
    // Ignore URL parse errors
  } finally {
    isSyncing = false
  }
}

function syncParamsToUrl() {
  if (isSyncing) return
  isSyncing = true
  try {
    let baseUrl = request.value.url.trim()
    const questionIdx = baseUrl.indexOf('?')
    if (questionIdx > -1) {
      baseUrl = baseUrl.substring(0, questionIdx)
    }

    const enabledParams = request.value.params.filter((p) => p.enabled && p.key.trim())
    if (enabledParams.length > 0) {
      const searchParams = new URLSearchParams()
      for (const p of enabledParams) {
        searchParams.append(p.key.trim(), p.value)
      }
      request.value.url = `${baseUrl}?${searchParams.toString()}`
    } else {
      request.value.url = baseUrl
    }
  } catch {
    // Ignore
  } finally {
    isSyncing = false
  }
}

function handleUrlInput() {
  syncUrlToParams()
  saveSnapshot()
}

function handleParamsChange() {
  syncParamsToUrl()
  saveSnapshot()
}

// Variable replacement helper: replaces {{varName}}
function resolveVariables(text: string): string {
  if (!text) return ''
  let resolved = text
  for (const item of envVariables.value) {
    if (item.enabled && item.key.trim()) {
      const regex = new RegExp(`\\{\\{${item.key.trim()}\\}\\}`, 'g')
      resolved = resolved.replace(regex, item.value)
    }
  }
  return resolved
}

// Send HTTP Request
async function handleSend() {
  if (!request.value.url.trim()) {
    message.warning('请输入请求 URL')
    return
  }

  loading.value = true
  errorMessage.value = null
  response.value = null

  try {
    // 1. 替换环境变量与 URL 处理
    const finalUrl = resolveVariables(request.value.url.trim())
    let cleanUrl = finalUrl
    const hasParamsInTable = request.value.params.some((p) => p.key.trim())
    if (hasParamsInTable) {
      const qIdx = cleanUrl.indexOf('?')
      if (qIdx > -1) {
        cleanUrl = cleanUrl.substring(0, qIdx)
      }
    }

    // 2. 收集请求头与 Query 参数并注入鉴权信息
    const finalHeaders: KeyValueItem[] = request.value.headers.map((h) => ({
      ...h,
      key: resolveVariables(h.key),
      value: resolveVariables(h.value)
    }))

    const finalParams: KeyValueItem[] = request.value.params.map((p) => ({
      ...p,
      key: resolveVariables(p.key),
      value: resolveVariables(p.value)
    }))

    const authType = request.value.auth.type?.toLowerCase()

    // 处理 Auth 注入
    if (authType === 'bearer' && request.value.auth.bearerToken.trim()) {
      const token = resolveVariables(request.value.auth.bearerToken.trim())
      finalHeaders.push({
        key: 'Authorization',
        value: `Bearer ${token}`,
        enabled: true
      })
    } else if (
      authType === 'basic' &&
      (request.value.auth.basicUsername || request.value.auth.basicPassword)
    ) {
      const u = resolveVariables(request.value.auth.basicUsername)
      const p = resolveVariables(request.value.auth.basicPassword)
      const encoded = btoa(`${u}:${p}`)
      finalHeaders.push({
        key: 'Authorization',
        value: `Basic ${encoded}`,
        enabled: true
      })
    } else if (
      authType === 'apikey' &&
      request.value.auth.apiKeyName.trim() &&
      request.value.auth.apiKeyValue.trim()
    ) {
      const k = resolveVariables(request.value.auth.apiKeyName.trim())
      const v = resolveVariables(request.value.auth.apiKeyValue.trim())
      if (request.value.auth.apiKeyAddTo === 'header') {
        finalHeaders.push({ key: k, value: v, enabled: true })
      } else if (request.value.auth.apiKeyAddTo === 'query') {
        finalParams.push({ key: k, value: v, enabled: true })
      }
    }

    // 3. 处理 Body 中的环境变量
    const finalBodyRaw = request.value.bodyRaw ? resolveVariables(request.value.bodyRaw) : ''

    // 4. 组装发往 Rust 后端 reqwest 的 payload
    const payload = {
      method: request.value.method,
      url: cleanUrl,
      headers: finalHeaders,
      params: finalParams,
      body_type: request.value.bodyType,
      raw_type: request.value.rawType,
      body_raw: finalBodyRaw,
      form_data: request.value.formData.map((f) => ({
        ...f,
        key: resolveVariables(f.key),
        value: resolveVariables(f.value)
      })),
      urlencoded_data: request.value.urlencodedData.map((u) => ({
        ...u,
        key: resolveVariables(u.key),
        value: resolveVariables(u.value)
      })),
      binary_file_path: request.value.binaryFilePath || null,
      timeout_ms: request.value.settings.timeoutMs || 30000,
      ignore_ssl: request.value.settings.ignoreSsl,
      follow_redirects: request.value.settings.followRedirects,
      proxy: request.value.settings.proxy?.trim() || null
    }

    const result = await invoke<{
      status: number
      status_text: string
      headers: Record<string, string>
      body: string
      duration_ms: number
      size_bytes: number
    }>('http_execute', { req: payload })

    response.value = {
      status: result.status,
      statusText: result.status_text,
      headers: result.headers,
      body: result.body,
      durationMs: result.duration_ms,
      sizeBytes: result.size_bytes
    }

    saveSnapshot()

    if (showHistory.value) {
      fetchHistory()
    }
  } catch (err: any) {
    errorMessage.value = typeof err === 'string' ? err : err?.message || '网络请求执行失败'
  } finally {
    loading.value = false
  }
}

// History loading & management
async function fetchHistory() {
  loadingHistory.value = true
  try {
    const rows = await invoke<any[]>('db_query', {
      query:
        'SELECT id, method, url, status_code, duration_ms, request_data_json, response_summary_json, executed_at FROM http_history ORDER BY executed_at DESC LIMIT 50',
      params: []
    })

    historyList.value = rows.map((r) => ({
      id: r.id,
      method: r.method,
      url: r.url,
      statusCode: r.status_code,
      durationMs: r.duration_ms,
      requestDataJson: r.request_data_json,
      responseSummaryJson: r.response_summary_json,
      executedAt: r.executed_at
    }))
  } catch (e) {
    // ignore
  } finally {
    loadingHistory.value = false
  }
}

function restoreFromHistory(item: HistoryItem) {
  if (item.requestDataJson) {
    try {
      const parsedReq = JSON.parse(item.requestDataJson)
      request.value.method = parsedReq.method || 'GET'
      request.value.url = parsedReq.url || ''
      request.value.headers = parsedReq.headers || []
      request.value.params = parsedReq.params || []
      request.value.bodyType = parsedReq.body_type || 'none'
      request.value.bodyRaw = parsedReq.body_raw || ''
      request.value.formData = parsedReq.form_data || []
      request.value.urlencodedData = parsedReq.urlencoded_data || []
      request.value.binaryFilePath = parsedReq.binary_file_path || ''
      if (parsedReq.timeout_ms) request.value.settings.timeoutMs = parsedReq.timeout_ms
      if (parsedReq.ignore_ssl !== undefined) request.value.settings.ignoreSsl = parsedReq.ignore_ssl
      if (parsedReq.follow_redirects !== undefined) request.value.settings.followRedirects = parsedReq.follow_redirects
      if (parsedReq.proxy) request.value.settings.proxy = parsedReq.proxy

      saveSnapshot()
      message.success(`已恢复历史请求: ${item.method} ${item.url}`)
    } catch {
      message.error('无法解析该条历史请求记录')
    }
  }
}

async function clearAllHistory() {
  dialog.warning({
    title: '确认清空历史记录？',
    content: '清空后将删除本地 SQLite 中存储的所有 Postman 请求记录，操作不可撤销。',
    positiveText: '确认清空',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await invoke('db_execute', {
          query: 'DELETE FROM http_history',
          params: []
        })
        historyList.value = []
        message.success('已清空请求历史记录')
      } catch {
        message.error('清空历史记录失败')
      }
    }
  })
}

// cURL import / export
function openCurlModal() {
  curlInputText.value = ''
  showCurlModal.value = true
}

function handleImportCurl() {
  if (!curlInputText.value.trim()) {
    message.warning('请输入有效的 cURL 命令')
    return
  }

  try {
    const parsed = parseCurl(curlInputText.value)
    request.value.method = parsed.method || 'GET'
    request.value.url = parsed.url || ''

    // 请求头
    const headers: KeyValueItem[] = []
    for (const [k, v] of Object.entries(parsed.headers)) {
      headers.push({ key: k, value: v, enabled: true })
    }
    request.value.headers = headers

    // 请求体
    if (parsed.body) {
      request.value.bodyType = 'raw'
      request.value.bodyRaw = parsed.body
      request.value.rawType = parsed.body.startsWith('{') ? 'json' : 'text'
    } else {
      request.value.bodyType = 'none'
    }

    if (parsed.params.length > 0) {
      request.value.params = parsed.params.map(p => ({
        key: p.key,
        value: p.value,
        enabled: p.enabled ?? true
      }))
    }

    showCurlModal.value = false
    saveSnapshot()
    message.success('已成功导入 cURL 命令并填入请求器')
  } catch (err: any) {
    message.error(`解析 cURL 失败: ${err?.message || err}`)
  }
}

async function handleCopyAsCurl() {
  try {
    const curl = exportToCurl({
      method: request.value.method,
      url: request.value.url,
      headers: request.value.headers,
      body: request.value.bodyType === 'raw' ? request.value.bodyRaw : undefined,
      bodyType: request.value.bodyType,
      auth: request.value.auth,
      formData: request.value.formData,
      urlencodedData: request.value.urlencodedData
    })
    await navigator.clipboard.writeText(curl)
    message.success('已将当前请求生成 cURL 命令并复制到剪贴板')
  } catch {
    message.error('复制 cURL 失败')
  }
}

// Global keyboard shortcut: Cmd+Enter / Ctrl+Enter to send request
function handleGlobalKeydown(e: KeyboardEvent) {
  if (tabStore.activeTabId !== props.tabId) return
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    handleSend()
  }
}

watch(showHistory, (show) => {
  if (show) {
    fetchHistory()
  }
})

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <div class="h-full w-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 overflow-hidden select-none">
    <!-- Top Workbench Header: Method, URL, Send, and Actions -->
    <header class="p-3 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-2 shrink-0">
      <div class="flex items-center gap-2">
        <!-- Request Method Select -->
        <div class="relative shrink-0">
          <select
            v-model="request.method"
            @change="saveSnapshot"
            :class="[
              'h-9 pl-3 pr-7 rounded-lg text-xs font-bold border transition-colors outline-none cursor-pointer appearance-none bg-white dark:bg-slate-900',
              getMethodBg(request.method)
            ]"
          >
            <option v-for="m in HTTP_METHODS" :key="m" :value="m">
              {{ m }}
            </option>
          </select>
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <!-- URL Input with {{var}} Support -->
        <div class="flex-1 min-w-0 relative flex items-center">
          <input
            type="text"
            v-model="request.url"
            @input="handleUrlInput"
            placeholder="输入请求 URL，支持 {{baseUrl}} 变量引用..."
            class="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-xs"
          />
        </div>

        <!-- Send Button -->
        <button
          @click="handleSend"
          :disabled="loading"
          class="h-9 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold shadow-sm shadow-indigo-500/20 disabled:opacity-50 transition-all flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <span v-if="loading" class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
          <span>发送</span>
          <kbd class="hidden sm:inline font-mono text-[10px] opacity-70 bg-white/20 px-1 py-0.5 rounded">⌘↵</kbd>
        </button>

        <!-- Divider -->
        <div class="h-5 w-[1px] bg-slate-200 dark:bg-slate-800 mx-0.5"></div>

        <!-- Toolbar Utility Buttons: cURL & History & Env -->
        <button
          @click="openCurlModal"
          class="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0"
          title="从终端 cURL 命令快速解析并导入"
        >
          <span>导入 cURL</span>
        </button>

        <button
          @click="handleCopyAsCurl"
          class="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0"
          title="将当前请求转为终端可直接执行的 cURL 命令"
        >
          <span>复制 cURL</span>
        </button>

        <button
          @click="showEnvModal = true"
          :class="[
            'h-9 px-2.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0',
            envVariables.length > 0
              ? 'border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
          ]"
          title="管理环境变量 (支持在 URL、Header、Body 中以 {{key}} 形式引用)"
        >
          <span>环境变量</span>
          <span
            v-if="envVariables.length > 0"
            class="px-1 text-[10px] rounded-full bg-indigo-100 dark:bg-indigo-900/60 font-mono"
          >
            {{ envVariables.length }}
          </span>
        </button>

        <button
          @click="showHistory = !showHistory"
          :class="[
            'h-9 px-2.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0',
            showHistory
              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          ]"
          title="查看最近执行的 HTTP 请求历史日志"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>历史</span>
        </button>
      </div>
    </header>

    <!-- Main Body Canvas: Split between Request Panel and Response Panel -->
    <div class="flex-1 min-h-0 w-full flex overflow-hidden relative">
      <!-- Left: Request Configuration Panel -->
      <div class="h-full w-1/2 min-w-[320px] flex flex-col overflow-hidden">
        <RequestPanel
          v-model="request"
          @change="handleParamsChange"
        />
      </div>

      <!-- Right: Response Result Panel -->
      <div class="h-full w-1/2 min-w-[320px] flex flex-col overflow-hidden">
        <ResponsePanel
          :response="response"
          :loading="loading"
          :error="errorMessage"
        />
      </div>

      <!-- Slide-out Drawer: HTTP History Log -->
      <div
        v-if="showHistory"
        class="absolute inset-y-0 right-0 w-80 bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-20 flex flex-col"
      >
        <!-- History Header -->
        <div class="h-11 px-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">
          <div class="flex items-center gap-2">
            <span class="font-bold text-slate-800 dark:text-slate-200">请求历史日志</span>
            <span class="text-[10px] text-slate-400 font-mono">SQLite (上限500条)</span>
          </div>
          <div class="flex items-center gap-2">
            <button
              @click="clearAllHistory"
              class="text-[11px] text-rose-500 hover:underline"
              title="清空历史"
            >
              清空
            </button>
            <button
              @click="showHistory = false"
              class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- History Items List -->
        <div class="flex-1 min-h-0 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-900">
          <div
            v-if="loadingHistory"
            class="h-32 flex items-center justify-center text-xs text-slate-400"
          >
            加载历史记录中...
          </div>
          <div
            v-else-if="historyList.length === 0"
            class="h-32 flex items-center justify-center text-xs text-slate-400"
          >
            暂无历史请求记录
          </div>
          <div
            v-else
            v-for="item in historyList"
            :key="item.id"
            @click="restoreFromHistory(item)"
            class="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/60 rounded cursor-pointer transition-colors text-left"
          >
            <div class="flex items-center justify-between gap-1 mb-1">
              <span :class="['text-[11px] font-mono', getMethodColor(item.method)]">
                {{ item.method }}
              </span>
              <span
                v-if="item.statusCode"
                :class="[
                  'px-1.5 py-0.2 rounded text-[10px] font-mono font-bold',
                  item.statusCode >= 200 && item.statusCode < 300
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                ]"
              >
                {{ item.statusCode }}
              </span>
            </div>
            <div class="text-xs font-mono text-slate-700 dark:text-slate-300 truncate mb-1" :title="item.url">
              {{ item.url }}
            </div>
            <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span>⏱ {{ item.durationMs }}ms</span>
              <span>{{ new Date(item.executedAt).toLocaleTimeString() }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- cURL Import Modal Dialog -->
    <div
      v-if="showCurlModal"
      class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4"
    >
      <div class="w-full max-w-xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        <div class="h-11 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <span class="text-sm font-bold text-slate-900 dark:text-slate-100">导入 cURL 命令行</span>
          <button @click="showCurlModal = false" class="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div class="p-4 flex flex-col gap-2">
          <p class="text-xs text-slate-500">
            请粘贴完整的 cURL 命令（支持多行折行、-X、-H、-d 等参数）：
          </p>
          <textarea
            v-model="curlInputText"
            placeholder="curl -X POST &quot;https://api.example.com/login&quot; -H &quot;Content-Type: application/json&quot; -d '{&quot;user&quot;:&quot;admin&quot;}'"
            class="w-full h-40 p-3 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 outline-none resize-none focus:border-indigo-500"
          ></textarea>
        </div>
        <div class="h-12 px-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 shrink-0">
          <button
            @click="showCurlModal = false"
            class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            取消
          </button>
          <button
            @click="handleImportCurl"
            class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs"
          >
            解析并载入
          </button>
        </div>
      </div>
    </div>

    <!-- Environment Variables Modal Dialog -->
    <div
      v-if="showEnvModal"
      class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4"
    >
      <div class="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        <div class="h-11 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <span class="text-sm font-bold text-slate-900 dark:text-slate-100">环境变量管理</span>
          <button @click="showEnvModal = false" class="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div class="p-4 flex flex-col gap-3">
          <p class="text-xs text-slate-500">
            在请求的 URL、Header 或 Body 中输入 <code class="font-mono text-indigo-600">\{\{变量名\}\}</code>，请求发送时将自动替换为对应的变量值。
          </p>

          <div class="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-950">
            <table class="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th class="w-8 py-1.5 px-2 text-center"></th>
                  <th class="w-1/3 py-1.5 px-2 border-r border-slate-200 dark:border-slate-800">变量名 (Key)</th>
                  <th class="py-1.5 px-2">变量值 (Value)</th>
                  <th class="w-10 py-1.5 px-2 text-center"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(item, idx) in envVariables"
                  :key="idx"
                  class="border-b border-slate-100 dark:border-slate-900/60"
                >
                  <td class="py-1 px-2 text-center">
                    <input
                      type="checkbox"
                      v-model="item.enabled"
                      class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td class="py-1 px-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      v-model="item.key"
                      placeholder="变量名"
                      class="w-full bg-transparent outline-none text-slate-800 dark:text-slate-200"
                    />
                  </td>
                  <td class="py-1 px-2">
                    <input
                      type="text"
                      v-model="item.value"
                      placeholder="变量值"
                      class="w-full bg-transparent outline-none text-slate-800 dark:text-slate-200"
                    />
                  </td>
                  <td class="py-1 px-2 text-center">
                    <button
                      @click="envVariables.splice(idx, 1)"
                      class="text-slate-400 hover:text-rose-500"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <button
            @click="envVariables.push({ key: '', value: '', enabled: true })"
            class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline self-start font-medium"
          >
            + 添加变量
          </button>
        </div>
        <div class="h-12 px-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end shrink-0">
          <button
            @click="showEnvModal = false"
            class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

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

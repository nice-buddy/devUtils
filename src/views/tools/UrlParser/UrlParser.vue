<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NSwitch, useMessage } from 'naive-ui'
import { useTabStore } from '@/stores/tabStore'
import { buildUrl, parseUrl, type ParsedUrl, type QueryEntry } from './utils/urlParser'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

const rawUrl = ref<string>(props.initialSnapshot?.rawUrl ?? 'https://api.example.com:8443/v1/search?q=devutils&page=1')
const autoDecode = ref<boolean>(props.initialSnapshot?.autoDecode ?? true)
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const parsed = ref<ParsedUrl>(parseUrl(rawUrl.value, autoDecode.value))
const builtUrl = computed(() => buildUrl(parsed.value, autoDecode.value))
const fields = [
  { key: 'protocol', label: '协议' },
  { key: 'username', label: '用户名' },
  { key: 'password', label: '密码' },
  { key: 'host', label: '主机' },
  { key: 'port', label: '端口' },
  { key: 'path', label: '路径' },
  { key: 'hash', label: '锚点' }
] as const

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, { rawUrl: rawUrl.value, autoDecode: autoDecode.value })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function cloneParsed(): ParsedUrl {
  return { ...parsed.value, entries: parsed.value.entries.map(entry => ({ ...entry })) }
}

function applyDraft(mutate: (draft: ParsedUrl) => void) {
  const draft = cloneParsed()
  mutate(draft)
  rawUrl.value = buildUrl(draft, autoDecode.value)
}

function updateField(key: (typeof fields)[number]['key'], value: string) {
  applyDraft(draft => {
    draft[key] = value
  })
}

function updateEntry(index: number, patch: Partial<QueryEntry>) {
  applyDraft(draft => {
    const current = draft.entries[index]
    const nextHasEquals = patch.hasEquals ?? (patch.value !== undefined ? true : current.hasEquals)
    draft.entries[index] = { ...current, ...patch, hasEquals: nextHasEquals }
  })
}

function addEntry() {
  applyDraft(draft => {
    draft.entries.push({ key: '', value: '', enabled: true, hasEquals: true })
  })
}

function removeEntry(index: number) {
  applyDraft(draft => {
    draft.entries.splice(index, 1)
  })
}

function copyBuiltUrl() {
  if (!builtUrl.value) return
  navigator.clipboard.writeText(builtUrl.value)
  message.success('已复制拼装结果')
}

watch([rawUrl, autoDecode], () => {
  const next = parseUrl(rawUrl.value, autoDecode.value)
  // 非法输入保留上一次有效解析结果，只更新错误信息，避免输出区闪空。
  parsed.value = next.valid ? next : { ...parsed.value, valid: false, error: next.error, schemeInserted: next.schemeInserted }
  scheduleSnapshot()
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
        <h1 class="text-sm font-bold tracking-tight">URL 解析与构造器</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">结构化拆解与 Query 参数双向表格编辑</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-500 dark:text-slate-400">自动解码</span>
        <NSwitch v-model:value="autoDecode" size="small" />
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0">
      <NInput v-model:value="rawUrl" type="text" placeholder="https://example.com/path?a=1" />
    </div>

    <div class="px-4 pt-2 shrink-0">
      <NAlert v-if="!parsed.valid" type="error" :bordered="false">{{ parsed.error }}</NAlert>
      <NAlert v-else-if="parsed.schemeInserted" type="warning" :bordered="false">输入未包含协议，已按 https 解析。</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">结构字段</div>
        <div class="flex-1 min-h-0 overflow-auto p-3 space-y-2">
          <div v-for="field in fields" :key="field.key" class="flex items-center gap-2">
            <span class="w-16 text-xs text-slate-500 dark:text-slate-400">{{ field.label }}</span>
            <NInput :value="parsed[field.key]" size="small" @update:value="value => updateField(field.key, value)" />
          </div>
        </div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">Query 参数（{{ parsed.entries.length }}）</span>
          <NButton size="tiny" @click="addEntry">新增参数</NButton>
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-3 space-y-2">
          <div v-for="(entry, index) in parsed.entries" :key="index" class="flex items-center gap-2">
            <NSwitch :value="entry.enabled" size="small" @update:value="value => updateEntry(index, { enabled: value })" />
            <NInput :value="entry.key" size="small" placeholder="key" @update:value="value => updateEntry(index, { key: value })" />
            <NInput :value="entry.value" size="small" placeholder="value" @update:value="value => updateEntry(index, { value })" />
            <NButton size="tiny" quaternary @click="removeEntry(index)">删除</NButton>
          </div>
          <p v-if="!parsed.entries.length" class="text-xs text-slate-400">暂无 Query 参数</p>
        </div>
      </section>
    </div>

    <footer class="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-500 dark:text-slate-400 shrink-0">拼装结果</span>
        <code class="flex-1 truncate text-xs font-mono">{{ builtUrl }}</code>
        <NButton size="tiny" @click="copyBuiltUrl">复制</NButton>
      </div>
    </footer>
  </div>
</template>

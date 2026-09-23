<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { NAlert, NButton, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { convertFrom, type SourceFormat } from './utils/convert'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

const SAMPLE_JSON = [
  '{',
  '  "app": {',
  '    "name": "devutils",',
  '    "servers": [{ "url": "https://a.example.com" }]',
  '  }',
  '}'
].join('\n')

const FORMATS: { key: SourceFormat; label: string }[] = [
  { key: 'json', label: 'JSON' },
  { key: 'yaml', label: 'YAML' },
  { key: 'properties', label: 'Properties' }
]

const source = ref<SourceFormat>(props.initialSnapshot?.source ?? 'json')
const errorMessage = ref<string>('')
const warningText = ref<string>('')
const manualMode = ref<boolean>(false)
const paneEls: Record<SourceFormat, HTMLElement | null> = { json: null, yaml: null, properties: null }
const editors: Partial<Record<SourceFormat, EditorView>> = {}
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let convertTimer: ReturnType<typeof setTimeout> | null = null
let applying = false

function setPaneRef(format: SourceFormat, el: unknown) {
  paneEls[format] = (el as HTMLElement | null) ?? null
}

function paneText(format: SourceFormat): string {
  return editors[format]?.state.doc.toString() ?? ''
}

function setPaneText(format: SourceFormat, text: string) {
  const view = editors[format]
  if (!view || view.state.doc.toString() === text) return
  applying = true
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
  applying = false
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    source: source.value,
    json: paneText('json'),
    yaml: paneText('yaml'),
    properties: paneText('properties')
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function runConvert() {
  const active = source.value
  const outcome = convertFrom(active, paneText(active))
  if (outcome.error) {
    errorMessage.value = outcome.error
    return
  }
  errorMessage.value = ''
  warningText.value = outcome.warnings.join('；')
  for (const { key } of FORMATS) {
    if (key === active) continue
    setPaneText(key, outcome[key])
  }
}

function scheduleConvert() {
  if (convertTimer) clearTimeout(convertTimer)
  convertTimer = setTimeout(runConvert, 250)
}

function resetPanes() {
  setPaneText('json', SAMPLE_JSON)
  setPaneText('yaml', '')
  setPaneText('properties', '')
  source.value = 'json'
  manualMode.value = false
  runConvert()
}

function handleChange(format: SourceFormat) {
  source.value = format
  manualMode.value = paneText(format).length > 1024 * 1024
  scheduleSnapshot()
  if (manualMode.value) return
  scheduleConvert()
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

function copyPane(format: SourceFormat) {
  const text = paneText(format)
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success('已复制')
}

onMounted(async () => {
  await nextTick()
  const initial: Record<SourceFormat, string> = {
    json: props.initialSnapshot?.json ?? SAMPLE_JSON,
    yaml: props.initialSnapshot?.yaml ?? '',
    properties: props.initialSnapshot?.properties ?? ''
  }
  for (const { key } of FORMATS) {
    const parent = paneEls[key]
    if (!parent) continue
    editors[key] = new EditorView({
      state: EditorState.create({
        doc: initial[key],
        extensions: [
          basicSetup,
          getEditorTheme(themeStore.isDark),
          EditorView.updateListener.of(update => {
            if (!update.docChanged || applying) return
            handleChange(key)
          })
        ]
      }),
      parent
    })
  }
  runConvert()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  if (convertTimer) clearTimeout(convertTimer)
  saveSnapshot()
  for (const view of Object.values(editors)) view?.destroy()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">YAML / Properties / JSON 互转</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">编辑任意一栏，其余两栏自动派生</p>
      </div>
      <div class="flex items-center gap-2">
        <NButton size="small" @click="resetPanes">重置</NButton>
        <NButton v-if="manualMode" size="small" type="primary" @click="runConvert">转换</NButton>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
      <NAlert v-else-if="warningText" type="warning" :bordered="false">{{ warningText }}</NAlert>
      <NAlert v-if="manualMode" type="warning" :bordered="false">输入超过 1MB，已关闭自动派生，请手动点击「转换」。</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-3 gap-3 p-3">
      <section
        v-for="format in FORMATS"
        :key="format.key"
        class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900"
      >
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">{{ format.label }}</span>
          <NButton size="tiny" @click="copyPane(format.key)">复制</NButton>
        </div>
        <div :ref="el => setPaneRef(format.key, el)" class="flex-1 min-h-0 overflow-hidden"></div>
      </section>
    </div>
  </div>
</template>

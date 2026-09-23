<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { NAlert, NButton, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { validateToml } from './utils/tomlValidator'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

const SAMPLE = [
  '[app]',
  'name = "devutils"',
  'port = 8080',
  '',
  '[[app.servers]]',
  'url = "https://a.example.com"'
].join('\n')

const errorMessage = ref<string>('')
const output = ref<string>('')
const editorEl = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

function getInput(): string {
  return editorView ? editorView.state.doc.toString() : ''
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, { input: getInput() })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function runValidate() {
  const result = validateToml(getInput())
  if (!result.valid) {
    errorMessage.value =
      result.line === undefined
        ? (result.error ?? 'TOML 校验失败')
        : `第 ${result.line} 行${result.column === undefined ? '' : `第 ${result.column} 列`}：${result.error}`
    return
  }
  errorMessage.value = ''
  output.value = result.output
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
          if (update.docChanged) scheduleSnapshot()
        })
      ]
    }),
    parent: editorEl.value
  })
  runValidate()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
  editorView?.destroy()
  editorView = null
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">TOML 语法校验器</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">语法校验、行列错误定位与格式化输出</p>
      </div>
      <NButton size="small" type="primary" @click="runValidate">校验</NButton>
    </header>

    <div v-if="errorMessage" class="px-4 pt-3 shrink-0">
      <NAlert type="error" :bordered="false">{{ errorMessage }}</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">TOML 输入</div>
        <div ref="editorEl" class="flex-1 min-h-0 overflow-hidden"></div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">规范化输出</span>
          <NButton size="tiny" @click="copyOutput">复制</NButton>
        </div>
        <pre class="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono leading-relaxed">{{ output }}</pre>
      </section>
    </div>
  </div>
</template>

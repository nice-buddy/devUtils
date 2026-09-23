<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NRadioButton, NRadioGroup, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { validateYaml, type YamlOutputMode } from './utils/yamlValidator'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

const SAMPLE = ['app:', '  name: devutils', '  servers:', '    - url: https://a.example.com'].join('\n')

const mode = ref<YamlOutputMode>(props.initialSnapshot?.mode ?? 'pretty')
const errorMessage = ref<string>('')
const warningText = ref<string>('')
const output = ref<string>('')
const editorEl = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

function getInput(): string {
  return editorView ? editorView.state.doc.toString() : ''
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, { input: getInput(), mode: mode.value })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function runValidate() {
  const result = validateYaml(getInput(), mode.value)
  warningText.value = result.warnings.join('；')
  if (!result.valid) {
    errorMessage.value =
      result.line === undefined
        ? (result.error ?? 'YAML 校验失败')
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

watch(mode, () => {
  saveSnapshot()
  runValidate()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">YAML 语法校验器</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">语法校验、行列错误定位与格式化 / 压缩输出</p>
      </div>
      <div class="flex items-center gap-3">
        <NRadioGroup v-model:value="mode" size="small">
          <NRadioButton value="pretty">格式化</NRadioButton>
          <NRadioButton value="compact">压缩</NRadioButton>
        </NRadioGroup>
        <NButton size="small" type="primary" @click="runValidate">校验</NButton>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
      <NAlert v-else-if="warningText" type="warning" :bordered="false">{{ warningText }}</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">YAML 输入</div>
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

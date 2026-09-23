<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NRadioButton, NRadioGroup, NSelect, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { Compartment, EditorState } from '@codemirror/state'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { DIALECTS, KEYWORD_CASES, formatSql, type KeywordCase, type SqlDialect } from './utils/sqlFormat'
import { minifySql } from './utils/sqlMinify'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

type Mode = 'format' | 'minify'

const SAMPLE = [
  'select u.id, u.name, count(o.id) as order_count',
  'from users u',
  'left join orders o on o.user_id = u.id',
  'where u.status = "active" and o.created_at >= "2024-01-01"',
  'group by u.id, u.name',
  'order by order_count desc'
].join('\n')

const dialect = ref<SqlDialect>(props.initialSnapshot?.dialect ?? 'sql')
const keywordCase = ref<KeywordCase>(props.initialSnapshot?.keywordCase ?? 'upper')
const mode = ref<Mode>(props.initialSnapshot?.mode ?? 'format')
const errorMessage = ref<string>('')
const output = ref<string>('')
const manualMode = ref<boolean>(false)
const editorEl = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let runTimer: ReturnType<typeof setTimeout> | null = null

const themeCompartment = new Compartment()

const dialectOptions = DIALECTS.map(item => ({ label: item.label, value: item.value }))

function getInput(): string {
  return editorView ? editorView.state.doc.toString() : ''
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    input: getInput(),
    dialect: dialect.value,
    keywordCase: keywordCase.value,
    mode: mode.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function runConvert() {
  const text = getInput()
  if (!text.trim()) {
    errorMessage.value = ''
    output.value = ''
    return
  }
  if (mode.value === 'minify') {
    errorMessage.value = ''
    output.value = minifySql(text)
    return
  }
  const result = formatSql(text, dialect.value, keywordCase.value)
  if (result.error) {
    errorMessage.value = result.error
    return
  }
  errorMessage.value = ''
  output.value = result.output
}

function scheduleRun() {
  if (runTimer) clearTimeout(runTimer)
  runTimer = setTimeout(runConvert, 250)
}

function handleDocChange() {
  manualMode.value = getInput().length > 1024 * 1024
  scheduleSnapshot()
  if (manualMode.value) return
  scheduleRun()
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
        themeCompartment.of(getEditorTheme(themeStore.isDark)),
        EditorView.updateListener.of(update => {
          if (update.docChanged) handleDocChange()
        })
      ]
    }),
    parent: editorEl.value
  })
  runConvert()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  if (runTimer) clearTimeout(runTimer)
  saveSnapshot()
  editorView?.destroy()
  editorView = null
})

watch([dialect, keywordCase, mode], () => {
  saveSnapshot()
  runConvert()
})

watch(
  () => themeStore.isDark,
  dark => {
    if (editorView) {
      editorView.dispatch({ effects: themeCompartment.reconfigure(getEditorTheme(dark)) })
    }
  }
)

const outputLabel = computed(() => (mode.value === 'minify' ? '压缩结果' : '格式化结果'))
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">SQL 格式化与压缩</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">多方言美化、关键字大小写与单行压缩</p>
      </div>
      <div class="flex items-center gap-3">
        <NSelect v-model:value="dialect" class="w-36" size="small" :options="dialectOptions" />
        <NRadioGroup v-model:value="keywordCase" size="small">
          <NRadioButton v-for="item in KEYWORD_CASES" :key="item.value" :value="item.value">{{ item.label }}</NRadioButton>
        </NRadioGroup>
        <NRadioGroup v-model:value="mode" size="small">
          <NRadioButton value="format">格式化</NRadioButton>
          <NRadioButton value="minify">压缩</NRadioButton>
        </NRadioGroup>
        <NButton v-if="manualMode" size="small" type="primary" @click="runConvert">执行</NButton>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
      <NAlert v-if="manualMode" type="warning" :bordered="false">输入超过 1MB，已关闭自动派生，请手动点击「执行」。</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">SQL 输入</div>
        <div ref="editorEl" class="flex-1 min-h-0 overflow-hidden"></div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">{{ outputLabel }}</span>
          <NButton size="tiny" @click="copyOutput">复制</NButton>
        </div>
        <pre class="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono leading-relaxed">{{ output }}</pre>
      </section>
    </div>
  </div>
</template>

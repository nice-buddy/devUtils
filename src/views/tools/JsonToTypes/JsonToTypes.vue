<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NRadioButton, NRadioGroup, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { json } from '@codemirror/lang-json'
import { EditorState } from '@codemirror/state'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { inferFromJson, type Language, type TypeNode } from './utils/typeInfer'
import { generators } from './utils/generators'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

const SAMPLE = ['{', '  "id": 1892837482910293847,', '  "name": "devutils",', '  "tags": ["json", "types"],', '  "owner": { "id": 1, "email": null }', '}'].join('\n')

const languages = [
  { label: 'TypeScript', value: 'ts' },
  { label: 'Go', value: 'go' },
  { label: 'Java', value: 'java' },
  { label: 'Rust', value: 'rust' }
]

const language = ref<Language>(props.initialSnapshot?.language ?? 'ts')
const rootName = ref<string>(props.initialSnapshot?.rootName ?? 'RootObject')
const root = ref<TypeNode | null>(null)
const errorMessage = ref<string>('')
const manualMode = ref<boolean>(false)
const editorEl = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let inferTimer: ReturnType<typeof setTimeout> | null = null

const output = computed(() => (root.value ? generators[language.value](root.value, rootName.value) : ''))
const languageLabel = computed(() => languages.find(item => item.value === language.value)?.label ?? '')

function getInput(): string {
  return editorView ? editorView.state.doc.toString() : ''
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    raw: getInput(),
    language: language.value,
    rootName: rootName.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function runInference() {
  const { root: inferred, error } = inferFromJson(getInput())
  if (error) {
    errorMessage.value = error
    return
  }
  errorMessage.value = ''
  root.value = inferred
}

function handleDocChange() {
  manualMode.value = getInput().length > 1024 * 1024
  scheduleSnapshot()
  if (manualMode.value) return
  if (inferTimer) clearTimeout(inferTimer)
  inferTimer = setTimeout(runInference, 300)
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

onMounted(async () => {
  await nextTick()
  if (!editorEl.value) return
  const initialDoc = props.initialSnapshot?.raw ?? SAMPLE
  manualMode.value = initialDoc.length > 1024 * 1024
  editorView = new EditorView({
    state: EditorState.create({
      doc: initialDoc,
      extensions: [
        basicSetup,
        json(),
        getEditorTheme(themeStore.isDark),
        EditorView.updateListener.of(update => {
          if (update.docChanged) handleDocChange()
        })
      ]
    }),
    parent: editorEl.value
  })
  runInference()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  if (inferTimer) clearTimeout(inferTimer)
  saveSnapshot()
  editorView?.destroy()
  editorView = null
})

watch([language, rootName], () => saveSnapshot())

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value)
  message.success('已复制生成结果')
}
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">JSON 转强类型结构体</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">单文档全量数组合并推导，19 位大整数无损识别</p>
      </div>
      <div class="flex items-center gap-3">
        <NInput v-model:value="rootName" size="small" class="w-40" placeholder="根类型名" />
        <NRadioGroup v-model:value="language" size="small">
          <NRadioButton v-for="item in languages" :key="item.value" :value="item.value">{{ item.label }}</NRadioButton>
        </NRadioGroup>
      </div>
    </header>

    <div v-if="errorMessage" class="px-4 pt-3 shrink-0">
      <NAlert type="error" :bordered="false">{{ errorMessage }}</NAlert>
    </div>
    <div v-else-if="manualMode" class="px-4 pt-3 shrink-0">
      <NAlert type="warning" :bordered="false">输入超过 1MB，已关闭实时推导，请手动点击「生成」。</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">JSON 输入</span>
          <NButton v-if="manualMode" size="tiny" type="primary" @click="runInference">生成</NButton>
        </div>
        <div ref="editorEl" class="flex-1 min-h-0 overflow-hidden"></div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">{{ languageLabel }} 输出</span>
          <NButton size="tiny" @click="copyOutput">复制</NButton>
        </div>
        <pre class="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono leading-relaxed text-slate-800 dark:text-slate-100">{{ output }}</pre>
      </section>
    </div>
  </div>
</template>

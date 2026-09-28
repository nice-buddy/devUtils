<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NRadioButton, NRadioGroup, NSelect, NSwitch, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { Compartment, EditorState } from '@codemirror/state'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { parseDelimitedText, type ParsedTable } from './utils/parseTable'
import { rowsToArrayOfArrays, rowsToJsonArray } from './utils/toJson'
import { rowsToInsertSql, type SqlInsertDialect } from './utils/toSql'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

const AUTO_RUN_MAX_BYTES = 1024 * 1024

const SAMPLE = ['id\tname\tactive', '1\t张三\ttrue', '2\t李四\tfalse'].join('\n')

const DELIMITERS = [
  { label: '自动探测', value: '' },
  { label: '制表符 (TSV)', value: '\t' },
  { label: '逗号 (CSV)', value: ',' },
  { label: '分号', value: ';' },
  { label: '竖线', value: '|' }
]

const DIALECTS: { label: string; value: SqlInsertDialect }[] = [
  { label: '标准 SQL', value: 'sql' },
  { label: 'MySQL', value: 'mysql' },
  { label: 'PostgreSQL', value: 'postgresql' },
  { label: 'SQLite', value: 'sqlite' },
  { label: 'SQL Server', value: 'transactsql' },
  { label: 'Oracle', value: 'plsql' }
]

const input = ref<string>(props.initialSnapshot?.input ?? SAMPLE)
const delimiter = ref<string>(props.initialSnapshot?.delimiter ?? '')
const hasHeader = ref<boolean>(props.initialSnapshot?.hasHeader ?? true)
const emptyAsNull = ref<boolean>(props.initialSnapshot?.emptyAsNull ?? true)
const outputMode = ref<'json' | 'array' | 'sql'>(props.initialSnapshot?.outputMode ?? 'json')
const dialect = ref<SqlInsertDialect>(props.initialSnapshot?.dialect ?? 'mysql')
const table = ref<string>(props.initialSnapshot?.table ?? 'my_table')
const multiRow = ref<boolean>(props.initialSnapshot?.multiRow ?? false)
const parsed = ref<ParsedTable | null>(null)
const output = ref<string>('')
const manualMode = ref<boolean>(false)
const editorEl = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let runTimer: ReturnType<typeof setTimeout> | null = null

const themeCompartment = new Compartment()

const outputLabel = computed(() => (outputMode.value === 'sql' ? 'SQL 输出' : 'JSON 输出'))

function getInput(): string {
  return editorView ? editorView.state.doc.toString() : input.value
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    input: getInput(),
    delimiter: delimiter.value,
    hasHeader: hasHeader.value,
    emptyAsNull: emptyAsNull.value,
    outputMode: outputMode.value,
    dialect: dialect.value,
    table: table.value,
    multiRow: multiRow.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function runConvert() {
  const text = getInput()
  if (!text.trim()) {
    parsed.value = null
    output.value = ''
    return
  }
  const result = parseDelimitedText(text, {
    delimiter: delimiter.value || undefined,
    hasHeader: hasHeader.value
  })
  parsed.value = result
  if (outputMode.value === 'json') {
    output.value = rowsToJsonArray(result.headers, result.rows, { emptyAsNull: emptyAsNull.value })
    return
  }
  if (outputMode.value === 'array') {
    output.value = rowsToArrayOfArrays(result.rows, {
      emptyAsNull: emptyAsNull.value,
      includeHeader: hasHeader.value,
      headers: result.headers
    })
    return
  }
  output.value = rowsToInsertSql(dialect.value, table.value, result.headers, result.rows, { multiRow: multiRow.value })
}

function scheduleRun() {
  manualMode.value = getInput().length > AUTO_RUN_MAX_BYTES
  if (manualMode.value) return
  if (runTimer) clearTimeout(runTimer)
  runTimer = setTimeout(runConvert, 250)
}

function handleDocChange() {
  input.value = getInput()
  scheduleSnapshot()
  scheduleRun()
}

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value)
  message.success('已复制')
}

async function importFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  const text = await file.text()
  if (editorView) {
    editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: text } })
  }
  input.value = text
  runConvert()
  saveSnapshot()
  // 允许重复选择同一个文件
  target.value = ''
}

function getEditorTheme(isDark: boolean) {
  return EditorView.theme(
    {
      '&': { height: '100%', fontSize: '13px', backgroundColor: isDark ? '#090d16' : '#ffffff', color: isDark ? '#e2e8f0' : '#1e293b' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', lineHeight: '1.6' },
      '.cm-gutters': { backgroundColor: isDark ? '#070a10' : '#f8fafc', color: isDark ? '#475569' : '#94a3b8', borderRight: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0' }
    },
    { dark: isDark }
  )
}

onMounted(async () => {
  await nextTick()
  if (editorEl.value) {
    editorView = new EditorView({
      state: EditorState.create({
        doc: input.value,
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
  }
  runConvert()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  if (runTimer) clearTimeout(runTimer)
  saveSnapshot()
  editorView?.destroy()
  editorView = null
})

watch([delimiter, hasHeader, emptyAsNull, outputMode, dialect, table, multiRow], () => {
  runConvert()
  scheduleSnapshot()
})

watch(
  () => themeStore.isDark,
  dark => {
    if (editorView) editorView.dispatch({ effects: themeCompartment.reconfigure(getEditorTheme(dark)) })
  }
)
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 shrink-0 space-y-2">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-sm font-bold tracking-tight">Excel / CSV 转 JSON 与 SQL</h1>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">粘贴 TSV/CSV 或选择文件，自动推导类型并生成 JSON 或多方言 INSERT</p>
        </div>
        <div class="flex items-center gap-2">
          <label class="text-xs">
            <input type="file" accept=".csv,.tsv,.txt" class="hidden" @change="importFile" />
            <span class="inline-flex items-center px-2 py-1 rounded border border-slate-300 dark:border-slate-700 cursor-pointer text-xs">选择文件…</span>
          </label>
          <NButton v-if="manualMode" size="small" type="primary" @click="runConvert">转换</NButton>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <NSelect v-model:value="delimiter" class="w-36" size="small" :options="DELIMITERS" />
        <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="hasHeader" size="small" />首行为表头</span>
        <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="emptyAsNull" size="small" />空值转 null</span>
        <NRadioGroup v-model:value="outputMode" size="small">
          <NRadioButton value="json">JSON 数组</NRadioButton>
          <NRadioButton value="array">数组的数组</NRadioButton>
          <NRadioButton value="sql">SQL INSERT</NRadioButton>
        </NRadioGroup>
        <template v-if="outputMode === 'sql'">
          <NSelect v-model:value="dialect" class="w-36" size="small" :options="DIALECTS" />
          <NInput v-model:value="table" class="w-40" size="small" placeholder="表名" />
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="multiRow" size="small" />多行批量</span>
        </template>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="manualMode" type="warning" :bordered="false">输入超过 1MB，已关闭自动转换，请手动点击「转换」。</NAlert>
      <NAlert v-if="parsed" type="info" :bordered="false">
        {{ parsed.rows.length }} 行 × {{ parsed.headers.length }} 列，跳过 {{ parsed.skippedBlankLines }} 个空行
      </NAlert>
      <NAlert v-for="warning in parsed?.warnings.slice(0, 10) ?? []" :key="warning.line" type="warning" :bordered="false">
        {{ warning.message }}
      </NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">表格文本</div>
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

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { json } from '@codemirror/lang-json'
import { EditorState, Compartment } from '@codemirror/state'
import { useThemeStore } from '@/stores/themeStore'
import { useTabStore } from '@/stores/tabStore'
import { runDiff } from './utils/diffService'
import {
  processDiff,
  prepareSemanticJson,
  type ProcessedDiff
} from './utils/diffProcessor'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const themeStore = useThemeStore()
const tabStore = useTabStore()

// Sample data demonstrating key reordering, additions, deletions, modifications, and 19-digit snowflake BigInt
const SAMPLE_ORIGINAL = `{
  "serviceName": "payment-gateway",
  "version": "1.4.2",
  "active": true,
  "config": {
    "timeoutMs": 5000,
    "maxRetries": 3,
    "snowflakeMachineId": 9223372036854775807
  },
  "endpoints": [
    "/api/v1/charge",
    "/api/v1/refund"
  ],
  "deprecatedEndpoint": "/api/v0/pay",
  "maintainer": "dev-team@company.internal"
}`

const SAMPLE_MODIFIED = `{
  "version": "1.5.0",
  "maintainer": "dev-team@company.internal",
  "active": true,
  "serviceName": "payment-gateway",
  "config": {
    "snowflakeMachineId": 9223372036854775807,
    "maxRetries": 5,
    "timeoutMs": 5000
  },
  "endpoints": [
    "/api/v1/charge",
    "/api/v1/refund",
    "/api/v1/webhook"
  ],
  "rateLimit": {
    "requestsPerMinute": 1200
  }
}`

// State
const originalText = ref<string>(props.initialSnapshot?.originalText ?? SAMPLE_ORIGINAL)
const modifiedText = ref<string>(props.initialSnapshot?.modifiedText ?? SAMPLE_MODIFIED)
const viewMode = ref<'split' | 'unified' | 'edit'>(props.initialSnapshot?.viewMode ?? 'split')
const isSemanticJson = ref<boolean>(props.initialSnapshot?.isSemanticJson ?? false)
const activeHunkIndex = ref<number>(0)
const semanticWarning = ref<string>('')

// Container ref for scoped DOM queries
const containerRef = ref<HTMLDivElement | null>(null)

// Large payload detection (> 2MB or > 5000 lines)
const LARGE_PAYLOAD_BYTES = 2 * 1024 * 1024 // 2MB
const LARGE_PAYLOAD_LINES = 5000

function countLines(str: string): number {
  if (!str) return 0
  let count = 1
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) === 10) count++
  }
  return count
}

const isLargePayload = computed(() => {
  const orig = originalText.value || ''
  const mod = modifiedText.value || ''
  if (orig.length + mod.length > LARGE_PAYLOAD_BYTES) return true
  const totalLines = countLines(orig) + countLines(mod)
  return totalLines > LARGE_PAYLOAD_LINES
})

// Processed diff state
const processed = ref<ProcessedDiff>({
  sideBySideRows: [],
  unifiedRows: [],
  stats: { additions: 0, deletions: 0, modifications: 0, totalHunks: 0 }
})

// CodeMirror editor DOM refs
const originalEditorEl = ref<HTMLDivElement | null>(null)
const modifiedEditorEl = ref<HTMLDivElement | null>(null)
let originalView: EditorView | null = null
let modifiedView: EditorView | null = null

const themeCompartmentOriginal = new Compartment()
const themeCompartmentModified = new Compartment()

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
      '.cm-activeLine': {
        backgroundColor: isDark ? '#1e293b33' : '#f1f5f980'
      },
      '.cm-activeLineGutter': {
        backgroundColor: isDark ? '#1e293b66' : '#e2e8f0',
        color: isDark ? '#94a3b8' : '#334155'
      },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: isDark ? '#312e81' : '#c7d2fe'
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: isDark ? '#818cf8' : '#4f46e5'
      }
    },
    { dark: isDark }
  )
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    originalText: originalText.value,
    modifiedText: modifiedText.value,
    viewMode: viewMode.value,
    isSemanticJson: isSemanticJson.value
  })
}

let computeDiffDebounceTimer: ReturnType<typeof setTimeout> | null = null

async function updateDiff(immediate = false) {
  if (computeDiffDebounceTimer) {
    clearTimeout(computeDiffDebounceTimer)
    computeDiffDebounceTimer = null
  }

  const run = async () => {
    let orig = originalText.value
    let mod = modifiedText.value

    semanticWarning.value = ''

    if (isSemanticJson.value) {
      if (isLargePayload.value) {
        semanticWarning.value = '大文本保护模式生效中，已跳过复杂 JSON 递归键排序以防界面卡顿'
      } else if (orig.trim() || mod.trim()) {
        const prep = prepareSemanticJson(orig, mod, 2)
        if (prep.success) {
          orig = prep.original
          mod = prep.modified
        } else {
          semanticWarning.value = '非合法 JSON，已自动回退为纯文本行比对'
        }
      }
    }

    const diffItems = await runDiff(orig, mod)
    processed.value = processDiff(diffItems)

    if (processed.value.stats.totalHunks > 0) {
      if (activeHunkIndex.value >= processed.value.stats.totalHunks) {
        activeHunkIndex.value = 0
      }
    } else {
      activeHunkIndex.value = 0
    }

    saveSnapshot()
  }

  if (immediate) {
    await run()
  } else {
    const debounceDelay = isLargePayload.value ? 600 : 150
    computeDiffDebounceTimer = setTimeout(run, debounceDelay)
  }
}

// Editor initialization & sync
function initOriginalEditor() {
  if (!originalEditorEl.value || originalView) return

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      originalText.value = update.state.doc.toString()
      updateDiff()
    }
  })

  originalView = new EditorView({
    state: EditorState.create({
      doc: originalText.value,
      extensions: [
        basicSetup,
        json(),
        themeCompartmentOriginal.of(getEditorTheme(themeStore.isDark)),
        updateListener
      ]
    }),
    parent: originalEditorEl.value
  })
}

function initModifiedEditor() {
  if (!modifiedEditorEl.value || modifiedView) return

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      modifiedText.value = update.state.doc.toString()
      updateDiff()
    }
  })

  modifiedView = new EditorView({
    state: EditorState.create({
      doc: modifiedText.value,
      extensions: [
        basicSetup,
        json(),
        themeCompartmentModified.of(getEditorTheme(themeStore.isDark)),
        updateListener
      ]
    }),
    parent: modifiedEditorEl.value
  })
}

function setOriginalEditorText(text: string) {
  originalText.value = text
  if (originalView) {
    originalView.dispatch({
      changes: { from: 0, to: originalView.state.doc.length, insert: text }
    })
  }
}

function setModifiedEditorText(text: string) {
  modifiedText.value = text
  if (modifiedView) {
    modifiedView.dispatch({
      changes: { from: 0, to: modifiedView.state.doc.length, insert: text }
    })
  }
}

// Virtual scrolling state & computed windowing
const ROW_HEIGHT = 28
const OVERSCAN_COUNT = 25

const splitScrollContainer = ref<HTMLDivElement | null>(null)
const splitScrollTop = ref(0)
const splitContainerHeight = ref(800)

const unifiedScrollContainer = ref<HTMLDivElement | null>(null)
const unifiedScrollTop = ref(0)
const unifiedContainerHeight = ref(800)

function onSplitScroll(e: Event) {
  const el = e.target as HTMLDivElement
  splitScrollTop.value = el.scrollTop
  if (el.clientHeight > 0) splitContainerHeight.value = el.clientHeight
}

function onUnifiedScroll(e: Event) {
  const el = e.target as HTMLDivElement
  unifiedScrollTop.value = el.scrollTop
  if (el.clientHeight > 0) unifiedContainerHeight.value = el.clientHeight
}

// Side-by-side virtual window
const splitStartIndex = computed(() => {
  return Math.max(0, Math.floor(splitScrollTop.value / ROW_HEIGHT) - OVERSCAN_COUNT)
})

const splitEndIndex = computed(() => {
  const total = processed.value.sideBySideRows.length
  const visibleCount = Math.ceil(splitContainerHeight.value / ROW_HEIGHT)
  return Math.min(total, Math.floor(splitScrollTop.value / ROW_HEIGHT) + visibleCount + OVERSCAN_COUNT)
})

const visibleSideBySideRows = computed(() => {
  return processed.value.sideBySideRows.slice(splitStartIndex.value, splitEndIndex.value)
})

const splitTopSpacer = computed(() => splitStartIndex.value * ROW_HEIGHT)
const splitBottomSpacer = computed(() => {
  const remaining = processed.value.sideBySideRows.length - splitEndIndex.value
  return Math.max(0, remaining * ROW_HEIGHT)
})

// Unified virtual window
const unifiedStartIndex = computed(() => {
  return Math.max(0, Math.floor(unifiedScrollTop.value / ROW_HEIGHT) - OVERSCAN_COUNT)
})

const unifiedEndIndex = computed(() => {
  const total = processed.value.unifiedRows.length
  const visibleCount = Math.ceil(unifiedContainerHeight.value / ROW_HEIGHT)
  return Math.min(total, Math.floor(unifiedScrollTop.value / ROW_HEIGHT) + visibleCount + OVERSCAN_COUNT)
})

const visibleUnifiedRows = computed(() => {
  return processed.value.unifiedRows.slice(unifiedStartIndex.value, unifiedEndIndex.value)
})

const unifiedTopSpacer = computed(() => unifiedStartIndex.value * ROW_HEIGHT)
const unifiedBottomSpacer = computed(() => {
  const remaining = processed.value.unifiedRows.length - unifiedEndIndex.value
  return Math.max(0, remaining * ROW_HEIGHT)
})

// Navigation & jumping
function scrollToActiveHunk() {
  const hunkIdx = activeHunkIndex.value
  if (viewMode.value === 'split' && splitScrollContainer.value) {
    const rowIdx = processed.value.sideBySideRows.findIndex(r => r.hunkIndex === hunkIdx)
    if (rowIdx !== -1) {
      splitScrollContainer.value.scrollTop = Math.max(0, rowIdx * ROW_HEIGHT - 60)
    }
  } else if (viewMode.value === 'unified' && unifiedScrollContainer.value) {
    const rowIdx = processed.value.unifiedRows.findIndex(r => r.hunkIndex === hunkIdx)
    if (rowIdx !== -1) {
      unifiedScrollContainer.value.scrollTop = Math.max(0, rowIdx * ROW_HEIGHT - 60)
    }
  }
}

function handleNextDiff() {
  if (processed.value.stats.totalHunks === 0) return
  if (activeHunkIndex.value < processed.value.stats.totalHunks - 1) {
    activeHunkIndex.value++
  } else {
    activeHunkIndex.value = 0 // loop
  }
  scrollToActiveHunk()
}

function handlePrevDiff() {
  if (processed.value.stats.totalHunks === 0) return
  if (activeHunkIndex.value > 0) {
    activeHunkIndex.value--
  } else {
    activeHunkIndex.value = processed.value.stats.totalHunks - 1 // loop
  }
  scrollToActiveHunk()
}

function handleKeyDown(e: KeyboardEvent) {
  if (tabStore.activeTabId !== props.tabId) return

  if (viewMode.value !== 'edit' && e.altKey && (e.key === 'ArrowDown' || e.key === 'Down')) {
    e.preventDefault()
    handleNextDiff()
  } else if (viewMode.value !== 'edit' && e.altKey && (e.key === 'ArrowUp' || e.key === 'Up')) {
    e.preventDefault()
    handlePrevDiff()
  } else if (e.altKey && e.key === 'Enter') {
    e.preventDefault()
    viewMode.value = viewMode.value === 'edit' ? 'split' : 'edit'
    saveSnapshot()
  }
}

// Toolbar Action Handlers
function handleSwap() {
  const temp = originalText.value
  setOriginalEditorText(modifiedText.value)
  setModifiedEditorText(temp)
  updateDiff(true)
  message.success('已左右互换原始与修改文本')
}

function handleClear() {
  setOriginalEditorText('')
  setModifiedEditorText('')
  updateDiff(true)
  message.info('已清空两端文本')
}

function handleLoadSample() {
  setOriginalEditorText(SAMPLE_ORIGINAL)
  setModifiedEditorText(SAMPLE_MODIFIED)
  updateDiff(true)
  message.success('已载入包含 19 位雪花数值与乱序键名的演示比对文本')
}

function toggleSemanticJson() {
  isSemanticJson.value = !isSemanticJson.value
  updateDiff(true)
  if (isSemanticJson.value) {
    message.success('已开启 JSON 语义比对（递归按键排序 + BigInt AST 保护）')
  } else {
    message.info('已恢复纯文本比对模式')
  }
}

async function handlePasteToOriginal() {
  try {
    const text = await navigator.clipboard.readText()
    setOriginalEditorText(text)
    updateDiff(true)
    message.success('已粘贴到原始文本')
  } catch {
    message.error('无法读取剪贴板，请手动粘贴')
  }
}

async function handlePasteToModified() {
  try {
    const text = await navigator.clipboard.readText()
    setModifiedEditorText(text)
    updateDiff(true)
    message.success('已粘贴到修改后文本')
  } catch {
    message.error('无法读取剪贴板，请手动粘贴')
  }
}

// Watchers
watch(
  () => themeStore.isDark,
  (dark) => {
    if (originalView) {
      originalView.dispatch({
        effects: themeCompartmentOriginal.reconfigure(getEditorTheme(dark))
      })
    }
    if (modifiedView) {
      modifiedView.dispatch({
        effects: themeCompartmentModified.reconfigure(getEditorTheme(dark))
      })
    }
  }
)

watch(viewMode, async (mode) => {
  saveSnapshot()
  await nextTick()
  if (splitScrollContainer.value && splitScrollContainer.value.clientHeight > 0) {
    splitContainerHeight.value = splitScrollContainer.value.clientHeight
  }
  if (unifiedScrollContainer.value && unifiedScrollContainer.value.clientHeight > 0) {
    unifiedContainerHeight.value = unifiedScrollContainer.value.clientHeight
  }
  if (mode === 'edit') {
    if (!originalView) initOriginalEditor()
    if (!modifiedView) initModifiedEditor()
    originalView?.requestMeasure()
    modifiedView?.requestMeasure()
  }
})

onMounted(() => {
  updateDiff(true)
  window.addEventListener('keydown', handleKeyDown)
  nextTick(() => {
    if (splitScrollContainer.value && splitScrollContainer.value.clientHeight > 0) {
      splitContainerHeight.value = splitScrollContainer.value.clientHeight
    }
    if (unifiedScrollContainer.value && unifiedScrollContainer.value.clientHeight > 0) {
      unifiedContainerHeight.value = unifiedScrollContainer.value.clientHeight
    }
  })
  if (viewMode.value === 'edit') {
    initOriginalEditor()
    initModifiedEditor()
    nextTick(() => {
      originalView?.requestMeasure()
      modifiedView?.requestMeasure()
    })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown)
  if (computeDiffDebounceTimer) {
    clearTimeout(computeDiffDebounceTimer)
    computeDiffDebounceTimer = null
  }
  if (originalView) {
    originalView.destroy()
    originalView = null
  }
  if (modifiedView) {
    modifiedView.destroy()
    modifiedView = null
  }
})
</script>

<template>
  <div class="h-full w-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 overflow-hidden select-none">
    <!-- Top Control Header -->
    <header class="h-11 px-3 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
      <!-- Left: Title, View Switcher & JSON Semantic Toggle -->
      <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
        <div class="flex items-center gap-1.5 mr-2 shrink-0">
          <span class="w-6 h-6 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-200 dark:border-indigo-800">
            ◫
          </span>
          <span class="text-xs font-bold text-slate-800 dark:text-slate-100 hidden sm:inline">文本与 JSON 对比</span>
        </div>

        <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1"></div>

        <!-- View Mode Segmented Controls -->
        <div class="flex items-center bg-slate-100 dark:bg-slate-800/90 rounded p-0.5 text-xs font-medium shrink-0">
          <button
            @click="viewMode = 'split'"
            :class="[
              'px-2 py-0.5 rounded transition-all flex items-center gap-1',
              viewMode === 'split'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            ]"
            title="双栏并排比对视图"
          >
            <span>◫</span>
            <span>双栏比对</span>
          </button>
          <button
            @click="viewMode = 'unified'"
            :class="[
              'px-2 py-0.5 rounded transition-all flex items-center gap-1',
              viewMode === 'unified'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            ]"
            title="单栏统一合并比对视图"
          >
            <span>☰</span>
            <span>单栏比对</span>
          </button>
          <button
            @click="viewMode = 'edit'"
            :class="[
              'px-2 py-0.5 rounded transition-all flex items-center gap-1',
              viewMode === 'edit'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            ]"
            title="编辑左右两侧源文本 (Alt + Enter)"
          >
            <span>✏️</span>
            <span>编辑源文本</span>
          </button>
        </div>

        <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1"></div>

        <!-- JSON Semantic Diff Toggle -->
        <button
          @click="toggleSemanticJson"
          :class="[
            'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all shrink-0 border',
            isSemanticJson
              ? 'bg-indigo-50 dark:bg-indigo-950/70 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          ]"
          title="启用后将递归按键名排序并无损保留 19 位超长大整数数值字面量"
        >
          <span
            :class="[
              'w-2 h-2 rounded-full transition-colors',
              isSemanticJson ? 'bg-indigo-500 animate-pulse' : 'bg-slate-400'
            ]"
          ></span>
          <span>JSON 语义比对：按键排序预处理</span>
        </button>
      </div>

      <!-- Right: Summary Statistics, Diff Jumpers & Actions -->
      <div class="flex items-center gap-2 shrink-0">
        <!-- Summary Stats Badges (+新增 / -删除 / ~变更) -->
        <div class="flex items-center gap-1 font-mono text-[11px] shrink-0">
          <span
            class="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 font-medium"
            title="新增行数"
          >
            +{{ processed.stats.additions }} 新增
          </span>
          <span
            class="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60 font-medium"
            title="删除行数"
          >
            -{{ processed.stats.deletions }} 删除
          </span>
          <span
            class="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60 font-medium"
            title="修改/变更块数"
          >
            ~{{ processed.stats.modifications }} 变更
          </span>
        </div>

        <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1"></div>

        <!-- Diff Jump Navigation Buttons -->
        <div class="flex items-center bg-slate-100 dark:bg-slate-800 rounded p-0.5 text-xs font-mono shrink-0">
          <button
            @click="handlePrevDiff"
            :disabled="processed.stats.totalHunks === 0"
            class="px-1.5 py-0.5 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent transition-all flex items-center"
            title="上一处差异 (Alt + ↑)"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>

          <span class="px-1.5 text-[11px] text-slate-500 min-w-[58px] text-center">
            {{ processed.stats.totalHunks > 0 ? `${activeHunkIndex + 1}/${processed.stats.totalHunks}` : '无差异' }}
          </span>

          <button
            @click="handleNextDiff"
            :disabled="processed.stats.totalHunks === 0"
            class="px-1.5 py-0.5 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent transition-all flex items-center"
            title="下一处差异 (Alt + ↓)"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1"></div>

        <!-- Global Actions -->
        <button
          @click="handleSwap"
          class="px-2 py-1 rounded text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          title="左右文本对调互换"
        >
          左右互换
        </button>

        <button
          @click="handleClear"
          class="px-2 py-1 rounded text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 transition-colors shrink-0"
          title="清空两端内容"
        >
          清空
        </button>

        <button
          @click="handleLoadSample"
          class="px-2 py-1 rounded text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors shrink-0"
          title="载入包含 19 位雪花数值与乱序键名的演示比对文本"
        >
          载入示例
        </button>
      </div>
    </header>

    <!-- Sub Warning Bar (Large Payload Guard) -->
    <div
      v-if="isLargePayload"
      class="h-7 px-3 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-900/60 flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 shrink-0"
    >
      <div class="flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>输入文本总计超过 2MB 或 5000 行，大文本保护模式已生效以避免界面卡死</span>
      </div>
    </div>

    <!-- Sub Warning Bar (If JSON Semantic Mode fails parse) -->
    <div
      v-if="semanticWarning"
      class="h-7 px-3 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-900/60 flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 shrink-0"
    >
      <div class="flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>{{ semanticWarning }}</span>
      </div>
      <button
        @click="semanticWarning = ''"
        class="text-amber-500 hover:text-amber-700 dark:hover:text-amber-200"
      >
        ✕
      </button>
    </div>

    <!-- Main Canvas -->
    <div ref="containerRef" class="flex-1 min-h-0 w-full flex overflow-hidden">
      <!-- 1. EDIT MODE: Side-by-Side CodeMirror 6 Editors -->
      <div
        v-show="viewMode === 'edit'"
        class="h-full w-full flex overflow-hidden"
      >
        <!-- Left Editor: Original Text -->
        <div class="h-full w-1/2 flex flex-col border-r border-slate-200 dark:border-slate-800">
          <div class="h-7 px-3 bg-slate-100 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span class="font-semibold text-slate-700 dark:text-slate-300">原始文本 (Original)</span>
            <div class="flex items-center gap-2">
              <span class="font-mono text-[10px] text-slate-400">
                {{ originalText ? originalText.split('\n').length : 0 }} 行 · {{ originalText.length }} 字符
              </span>
              <button
                @click="handlePasteToOriginal"
                class="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                粘贴
              </button>
            </div>
          </div>
          <div ref="originalEditorEl" class="flex-1 min-h-0 w-full overflow-hidden"></div>
        </div>

        <!-- Right Editor: Modified Text -->
        <div class="h-full w-1/2 flex flex-col bg-white dark:bg-slate-950">
          <div class="h-7 px-3 bg-slate-100 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span class="font-semibold text-slate-700 dark:text-slate-300">修改后文本 (Modified)</span>
            <div class="flex items-center gap-2">
              <span class="font-mono text-[10px] text-slate-400">
                {{ modifiedText ? modifiedText.split('\n').length : 0 }} 行 · {{ modifiedText.length }} 字符
              </span>
              <button
                @click="handlePasteToModified"
                class="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                粘贴
              </button>
            </div>
          </div>
          <div ref="modifiedEditorEl" class="flex-1 min-h-0 w-full overflow-hidden"></div>
        </div>
      </div>

      <!-- 2. SIDE-BY-SIDE (SPLIT) DIFF VIEW -->
      <div
        v-if="viewMode === 'split'"
        class="h-full w-full flex flex-col overflow-hidden bg-white dark:bg-slate-950"
      >
        <!-- Column Headers -->
        <div class="h-6 w-full flex border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/80 text-[11px] text-slate-500 font-medium shrink-0">
          <div class="w-1/2 px-3 flex items-center justify-between border-r border-slate-200 dark:border-slate-800">
            <span>原始文本 (Original)</span>
            <span class="text-[10px] text-slate-400 font-mono">{{ originalText.split('\n').length }} 行</span>
          </div>
          <div class="w-1/2 px-3 flex items-center justify-between">
            <span>修改后文本 (Modified)</span>
            <span class="text-[10px] text-slate-400 font-mono">{{ modifiedText.split('\n').length }} 行</span>
          </div>
        </div>

        <!-- Scrollable Diff Table -->
        <div
          ref="splitScrollContainer"
          @scroll.passive="onSplitScroll"
          class="flex-1 min-h-0 w-full overflow-auto font-mono text-[12px] leading-relaxed"
        >
          <!-- Empty State -->
          <div
            v-if="processed.sideBySideRows.length === 0"
            class="h-full w-full flex flex-col items-center justify-center p-8 text-slate-400 text-xs"
          >
            <p>暂无文本可比对，请在工具栏中点击“载入示例”或切换到“编辑源文本”输入文本。</p>
          </div>

          <table
            v-else
            class="w-full border-collapse table-fixed select-text"
          >
            <colgroup>
              <col class="w-10" />
              <col class="w-4" />
              <col class="w-[calc(50%-3.5rem)]" />
              <col class="w-10" />
              <col class="w-4" />
              <col class="w-[calc(50%-3.5rem)]" />
            </colgroup>
            <tbody>
              <!-- Top Spacer for Virtual Scroll -->
              <tr v-if="splitTopSpacer > 0" :style="{ height: splitTopSpacer + 'px' }" class="border-none pointer-events-none">
                <td colspan="6" class="p-0 m-0 border-none"></td>
              </tr>

              <tr
                v-for="row in visibleSideBySideRows"
                :key="row.id"
                :data-hunk-index="row.hunkIndex !== null ? row.hunkIndex : undefined"
                :class="[
                  'border-b border-slate-100 dark:border-slate-900/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors',
                  row.hunkIndex !== null && row.hunkIndex === activeHunkIndex
                    ? 'ring-1 ring-inset ring-indigo-500/80 bg-indigo-500/[0.04]'
                    : ''
                ]"
                style="height: 28px;"
              >
                <!-- Left Line Number -->
                <td
                  :class="[
                    'py-0.5 px-1.5 text-right select-none font-mono text-[11px] border-r border-slate-200 dark:border-slate-800/80',
                    row.left.tag === 'delete'
                      ? 'bg-rose-100/70 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 font-medium'
                      : row.left.tag === 'empty'
                      ? 'bg-slate-100/30 dark:bg-slate-900/30 text-transparent'
                      : 'bg-slate-50 dark:bg-slate-900/40 text-slate-400'
                  ]"
                >
                  {{ row.left.lineNum ?? '' }}
                </td>

                <!-- Left Tag Indicator -->
                <td
                  :class="[
                    'py-0.5 text-center select-none font-bold text-xs',
                    row.left.tag === 'delete'
                      ? 'bg-rose-100/40 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                      : row.left.tag === 'empty'
                      ? 'bg-slate-100/20 dark:bg-slate-900/20'
                      : ''
                  ]"
                >
                  {{ row.left.tag === 'delete' ? '-' : '' }}
                </td>

                <!-- Left Content with Character-level Highlight -->
                <td
                  :class="[
                    'py-0.5 px-2 whitespace-pre font-mono border-r border-slate-200 dark:border-slate-800',
                    row.left.tag === 'delete'
                      ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200'
                      : row.left.tag === 'empty'
                      ? 'bg-slate-50/40 dark:bg-slate-900/20'
                      : 'text-slate-800 dark:text-slate-200'
                  ]"
                >
                  <template v-if="row.left.inline_spans && row.left.inline_spans.length > 0">
                    <span
                      v-for="(span, sIdx) in row.left.inline_spans"
                      :key="sIdx"
                      :class="span.tag === 'delete' ? 'bg-rose-200 dark:bg-rose-900/80 text-rose-950 dark:text-rose-100 rounded-[2px] px-[1px] font-semibold' : ''"
                    >{{ span.text }}</span>
                  </template>
                  <template v-else>
                    {{ row.left.text }}
                  </template>
                </td>

                <!-- Right Line Number -->
                <td
                  :class="[
                    'py-0.5 px-1.5 text-right select-none font-mono text-[11px] border-r border-slate-200 dark:border-slate-800/80',
                    row.right.tag === 'insert'
                      ? 'bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-medium'
                      : row.right.tag === 'empty'
                      ? 'bg-slate-100/30 dark:bg-slate-900/30 text-transparent'
                      : 'bg-slate-50 dark:bg-slate-900/40 text-slate-400'
                  ]"
                >
                  {{ row.right.lineNum ?? '' }}
                </td>

                <!-- Right Tag Indicator -->
                <td
                  :class="[
                    'py-0.5 text-center select-none font-bold text-xs',
                    row.right.tag === 'insert'
                      ? 'bg-emerald-100/40 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                      : row.right.tag === 'empty'
                      ? 'bg-slate-100/20 dark:bg-slate-900/20'
                      : ''
                  ]"
                >
                  {{ row.right.tag === 'insert' ? '+' : '' }}
                </td>

                <!-- Right Content with Character-level Highlight -->
                <td
                  :class="[
                    'py-0.5 px-2 whitespace-pre font-mono',
                    row.right.tag === 'insert'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                      : row.right.tag === 'empty'
                      ? 'bg-slate-50/40 dark:bg-slate-900/20'
                      : 'text-slate-800 dark:text-slate-200'
                  ]"
                >
                  <template v-if="row.right.inline_spans && row.right.inline_spans.length > 0">
                    <span
                      v-for="(span, sIdx) in row.right.inline_spans"
                      :key="sIdx"
                      :class="span.tag === 'insert' ? 'bg-emerald-200 dark:bg-emerald-900/80 text-emerald-950 dark:text-emerald-100 rounded-[2px] px-[1px] font-semibold' : ''"
                    >{{ span.text }}</span>
                  </template>
                  <template v-else>
                    {{ row.right.text }}
                  </template>
                </td>
              </tr>

              <!-- Bottom Spacer for Virtual Scroll -->
              <tr v-if="splitBottomSpacer > 0" :style="{ height: splitBottomSpacer + 'px' }" class="border-none pointer-events-none">
                <td colspan="6" class="p-0 m-0 border-none"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 3. UNIFIED (INLINE) DIFF VIEW -->
      <div
        v-else-if="viewMode === 'unified'"
        class="h-full w-full flex flex-col overflow-hidden bg-white dark:bg-slate-950"
      >
        <!-- Column Headers -->
        <div class="h-6 w-full flex border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/80 text-[11px] text-slate-500 font-medium shrink-0">
          <div class="w-12 text-center border-r border-slate-200 dark:border-slate-800">原行</div>
          <div class="w-12 text-center border-r border-slate-200 dark:border-slate-800">新行</div>
          <div class="w-6 text-center border-r border-slate-200 dark:border-slate-800">标记</div>
          <div class="flex-1 px-3">统一合并对比内容 (Unified Content)</div>
        </div>

        <!-- Scrollable Unified Table -->
        <div
          ref="unifiedScrollContainer"
          @scroll.passive="onUnifiedScroll"
          class="flex-1 min-h-0 w-full overflow-auto font-mono text-[12px] leading-relaxed"
        >
          <!-- Empty State -->
          <div
            v-if="processed.unifiedRows.length === 0"
            class="h-full w-full flex flex-col items-center justify-center p-8 text-slate-400 text-xs"
          >
            <p>暂无文本可比对，请在工具栏中点击“载入示例”或切换到“编辑源文本”输入文本。</p>
          </div>

          <table
            v-else
            class="w-full border-collapse table-fixed select-text"
          >
            <colgroup>
              <col class="w-12" />
              <col class="w-12" />
              <col class="w-6" />
              <col class="w-[calc(100%-7.5rem)]" />
            </colgroup>
            <tbody>
              <!-- Top Spacer for Virtual Scroll -->
              <tr v-if="unifiedTopSpacer > 0" :style="{ height: unifiedTopSpacer + 'px' }" class="border-none pointer-events-none">
                <td colspan="4" class="p-0 m-0 border-none"></td>
              </tr>

              <tr
                v-for="row in visibleUnifiedRows"
                :key="row.id"
                :data-hunk-index="row.hunkIndex !== null ? row.hunkIndex : undefined"
                :class="[
                  'border-b border-slate-100 dark:border-slate-900/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors',
                  row.tag === 'delete'
                    ? 'bg-rose-50/80 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200'
                    : row.tag === 'insert'
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                    : 'text-slate-800 dark:text-slate-200',
                  row.hunkIndex !== null && row.hunkIndex === activeHunkIndex
                    ? 'ring-1 ring-inset ring-indigo-500/80 bg-indigo-500/[0.04]'
                    : ''
                ]"
                style="height: 28px;"
              >
                <!-- Old Line Num -->
                <td
                  :class="[
                    'py-0.5 px-1.5 text-right select-none font-mono text-[11px] border-r border-slate-200 dark:border-slate-800/80',
                    row.tag === 'delete'
                      ? 'bg-rose-100/70 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 font-medium'
                      : 'bg-slate-50 dark:bg-slate-900/40 text-slate-400'
                  ]"
                >
                  {{ row.oldLineNum ?? '' }}
                </td>

                <!-- New Line Num -->
                <td
                  :class="[
                    'py-0.5 px-1.5 text-right select-none font-mono text-[11px] border-r border-slate-200 dark:border-slate-800/80',
                    row.tag === 'insert'
                      ? 'bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-medium'
                      : 'bg-slate-50 dark:bg-slate-900/40 text-slate-400'
                  ]"
                >
                  {{ row.newLineNum ?? '' }}
                </td>

                <!-- Tag (+ / - / space) -->
                <td
                  :class="[
                    'py-0.5 text-center select-none font-bold text-xs border-r border-slate-200 dark:border-slate-800/80',
                    row.tag === 'delete'
                      ? 'bg-rose-100/40 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                      : row.tag === 'insert'
                      ? 'bg-emerald-100/40 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-300 dark:text-slate-600'
                  ]"
                >
                  {{ row.tag === 'delete' ? '-' : row.tag === 'insert' ? '+' : ' ' }}
                </td>

                <!-- Content with Character-level Highlight -->
                <td class="py-0.5 px-2.5 whitespace-pre font-mono">
                  <template v-if="row.inline_spans && row.inline_spans.length > 0">
                    <span
                      v-for="(span, sIdx) in row.inline_spans"
                      :key="sIdx"
                      :class="span.tag === 'delete' ? 'bg-rose-200 dark:bg-rose-900/80 text-rose-950 dark:text-rose-100 rounded-[2px] px-[1px] font-semibold' : span.tag === 'insert' ? 'bg-emerald-200 dark:bg-emerald-900/80 text-emerald-950 dark:text-emerald-100 rounded-[2px] px-[1px] font-semibold' : ''"
                    >{{ span.text }}</span>
                  </template>
                  <template v-else>
                    {{ row.text }}
                  </template>
                </td>
              </tr>

              <!-- Bottom Spacer for Virtual Scroll -->
              <tr v-if="unifiedBottomSpacer > 0" :style="{ height: unifiedBottomSpacer + 'px' }" class="border-none pointer-events-none">
                <td colspan="4" class="p-0 m-0 border-none"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Bottom Status Bar -->
    <footer class="h-7 px-3 bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono shrink-0">
      <!-- Left: Keybinding Hint -->
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5">
          <kbd class="px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700">Alt+↑</kbd>
          <kbd class="px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700">Alt+↓</kbd>
          <span>差异跳转</span>
        </div>
        <div class="flex items-center gap-1.5">
          <kbd class="px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700">Alt+Enter</kbd>
          <span>比对/编辑切换</span>
        </div>
      </div>

      <!-- Center / Right: Mode & Hunk Summary -->
      <div class="flex items-center gap-3">
        <span v-if="isLargePayload" class="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800 text-[10px] font-sans">
          大文本保护
        </span>
        <span v-if="isSemanticJson" class="text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span class="font-sans font-medium text-[10px]">JSON 语义按键预排序 + AST 大整数保护激活</span>
        </span>
        <span v-else class="text-slate-400 font-sans text-[10px]">
          纯文本行级比对
        </span>

        <span class="text-slate-400">·</span>
        <span class="text-slate-600 dark:text-slate-300 font-sans">
          共 {{ processed.stats.totalHunks }} 处差异
        </span>
      </div>
    </footer>
  </div>
</template>

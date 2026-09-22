<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { json } from '@codemirror/lang-json'
import { EditorState, Compartment } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { formatJson, minifyJson, LosslessJSON } from './utils/losslessJson'
import { repairJson } from './utils/jsonRepair'
import { queryJsonPath } from './utils/jsonPath'
import { useThemeStore } from '@/stores/themeStore'
import { useTabStore } from '@/stores/tabStore'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const themeStore = useThemeStore()
const tabStore = useTabStore()

// State
const isSplit = ref<boolean>(props.initialSnapshot?.isSplit ?? true)
const indentSize = ref<number>(props.initialSnapshot?.indentSize ?? 2)
const jsonPathQuery = ref<string>(props.initialSnapshot?.jsonPathQuery ?? '')
const cursorPath = ref<string>('$')
const errorMessage = ref<string>('')
const hasSnowflakeId = ref<boolean>(false)
const rawCharCount = ref<number>(0)
const rawLineCount = ref<number>(1)

// DOM refs for editor containers
const inputEditorEl = ref<HTMLDivElement | null>(null)
const outputEditorEl = ref<HTMLDivElement | null>(null)

// CodeMirror instances
let inputView: EditorView | null = null
let outputView: EditorView | null = null

const themeCompartmentInput = new Compartment()
const themeCompartmentOutput = new Compartment()

// Default sample data with 19-digit snowflake IDs, single quotes, comments, trailing commas
const SAMPLE_DATA = `{
  // 用户基础信息与订单状态
  "orderId": 1892837482910293847,
  "status": "SUCCESS",
  "meta": {
    "traceId": 9223372036854775807,
    "source": "desktop-client",
  },
  "items": [
    {
      "itemId": 1892837482910293848,
      "title": "DevUtils 专业版套件",
      "price": 199.00,
      'sku': 'DEV-PRO-001',
    },
    {
      "itemId": 1892837482910293849,
      "title": "离线本地开发者工具箱",
      "price": 299.00,
      'sku': 'DEV-SUITE-002',
    }
  ],
}`

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

function getCursorJsonPath(state: EditorState, pos: number): string {
  try {
    const tree = syntaxTree(state)
    let node: any = tree.resolveInner(pos, -1)
    const segments: string[] = []

    while (node && node.name !== 'JsonText') {
      if (node.name === 'Property') {
        const propNameNode = node.getChild('PropertyName')
        if (propNameNode) {
          let name = state.sliceDoc(propNameNode.from, propNameNode.to)
          name = name.replace(/^['"]|['"]$/g, '')
          segments.unshift(name)
        }
      } else if (node.name === 'Array') {
        let index = 0
        let child = node.firstChild
        let foundIndex = 0
        while (child) {
          if (child.name !== '[' && child.name !== ']' && child.name !== ',') {
            if (pos >= child.from && pos <= child.to) {
              foundIndex = index
              break
            }
            index++
          }
          child = child.nextSibling
        }
        segments.unshift(`[${foundIndex}]`)
      }
      node = node.parent
    }

    if (segments.length === 0) return '$'
    let result = '$'
    for (const seg of segments) {
      if (seg.startsWith('[')) {
        result += seg
      } else {
        result += `.${seg}`
      }
    }
    return result
  } catch {
    return '$'
  }
}

function updateValidationAndStats(doc: string) {
  rawCharCount.value = doc.length
  rawLineCount.value = doc ? doc.split('\n').length : 1
  hasSnowflakeId.value = /\b\d{16,}\b/.test(doc)

  if (!doc.trim()) {
    errorMessage.value = ''
    return
  }

  try {
    LosslessJSON.parse(doc)
    errorMessage.value = ''
  } catch (err: any) {
    errorMessage.value = err.message || 'JSON 语法错误'
  }
}

function saveSnapshot() {
  const raw = inputView ? inputView.state.doc.toString() : ''
  const output = outputView ? outputView.state.doc.toString() : ''
  tabStore.updateTabSnapshot(props.tabId, {
    raw,
    output,
    isSplit: isSplit.value,
    indentSize: indentSize.value,
    jsonPathQuery: jsonPathQuery.value
  })
}

function initInputEditor() {
  if (!inputEditorEl.value || inputView) return

  const initialDoc = props.initialSnapshot?.raw ?? SAMPLE_DATA

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const doc = update.state.doc.toString()
      updateValidationAndStats(doc)
      saveSnapshot()
    }
    if (update.selectionSet || update.docChanged) {
      const pos = update.state.selection.main.head
      cursorPath.value = getCursorJsonPath(update.state, pos)
    }
  })

  inputView = new EditorView({
    state: EditorState.create({
      doc: initialDoc,
      extensions: [
        basicSetup,
        json(),
        themeCompartmentInput.of(getEditorTheme(themeStore.isDark)),
        updateListener
      ]
    }),
    parent: inputEditorEl.value
  })

  updateValidationAndStats(initialDoc)
}

function initOutputEditor() {
  if (!outputEditorEl.value || outputView) return

  const initialOutput = props.initialSnapshot?.output ?? ''

  outputView = new EditorView({
    state: EditorState.create({
      doc: initialOutput,
      extensions: [
        basicSetup,
        json(),
        themeCompartmentOutput.of(getEditorTheme(themeStore.isDark))
      ]
    }),
    parent: outputEditorEl.value
  })
}

function setInputContent(text: string) {
  if (!inputView) return
  inputView.dispatch({
    changes: { from: 0, to: inputView.state.doc.length, insert: text }
  })
}

function setOutputContent(text: string) {
  if (!outputView) return
  outputView.dispatch({
    changes: { from: 0, to: outputView.state.doc.length, insert: text }
  })
}

function getInputContent(): string {
  return inputView ? inputView.state.doc.toString() : ''
}

// Action Handlers
function handleFormat() {
  const raw = getInputContent()
  if (!raw.trim()) {
    message.warning('请输入需要格式化的 JSON 内容')
    return
  }
  try {
    const formatted = formatJson(raw, indentSize.value, false)
    if (isSplit.value) {
      setOutputContent(formatted)
    } else {
      setInputContent(formatted)
    }
    message.success('格式化成功（AST 大整数无损保护）')
    saveSnapshot()
  } catch (err: any) {
    message.error(`格式化失败：${err.message || '格式错误'}`)
  }
}

function handleSortKeys() {
  const raw = getInputContent()
  if (!raw.trim()) {
    message.warning('请输入需要排序的 JSON 内容')
    return
  }
  try {
    const sorted = formatJson(raw, indentSize.value, true)
    if (isSplit.value) {
      setOutputContent(sorted)
    } else {
      setInputContent(sorted)
    }
    message.success('键名已按首字母递归排序')
    saveSnapshot()
  } catch (err: any) {
    message.error(`排序失败：${err.message || '格式错误'}`)
  }
}

function handleMinify() {
  const raw = getInputContent()
  if (!raw.trim()) {
    message.warning('请输入需要压缩的 JSON 内容')
    return
  }
  try {
    const minified = minifyJson(raw)
    if (isSplit.value) {
      setOutputContent(minified)
    } else {
      setInputContent(minified)
    }
    message.success('单行压缩完成（AST 大整数无损保留）')
    saveSnapshot()
  } catch (err: any) {
    message.error(`压缩失败：${err.message || '格式错误'}`)
  }
}

function handleRepair() {
  const raw = getInputContent()
  if (!raw.trim()) {
    message.warning('请输入需要修复的 JSON 内容')
    return
  }
  try {
    const repaired = repairJson(raw)
    // Attempt to format the repaired json if valid
    let finalOutput = repaired
    try {
      finalOutput = formatJson(repaired, indentSize.value, false)
    } catch {
      // Keep repaired text as-is
    }
    setInputContent(finalOutput)
    if (isSplit.value) {
      setOutputContent(finalOutput)
    }
    message.success('容错修复完成（已纠正单引号、尾随逗号与清除注释）')
    saveSnapshot()
  } catch (err: any) {
    message.error(`修复异常：${err.message || '无法修复'}`)
  }
}

function handleExecuteJsonPath() {
  const raw = getInputContent()
  if (!raw.trim()) {
    message.warning('请输入 JSON 内容后再执行查询')
    return
  }
  const query = jsonPathQuery.value.trim()
  if (!query) {
    message.info('请输入 JSONPath 表达式，如 $.items[0].id')
    return
  }

  try {
    const result = queryJsonPath(raw, query)
    if (!result || result.trim() === '') {
      message.warning(`路径 "${query}" 未检索到匹配节点`)
      if (isSplit.value) setOutputContent('')
      return
    }

    if (isSplit.value) {
      setOutputContent(result)
    } else {
      setInputContent(result)
    }
    message.success(`JSONPath 提取成功`)
    saveSnapshot()
  } catch (err: any) {
    message.error(`JSONPath 执行失败：${err.message}`)
  }
}

function handleResetJsonPath() {
  jsonPathQuery.value = ''
  if (isSplit.value) {
    setOutputContent('')
  }
  saveSnapshot()
}

function handleClear() {
  setInputContent('')
  if (isSplit.value) setOutputContent('')
  message.info('已清空内容')
  saveSnapshot()
}

async function handleCopy() {
  const contentToCopy = isSplit.value && outputView?.state.doc.length
    ? outputView.state.doc.toString()
    : getInputContent()

  if (!contentToCopy) {
    message.warning('没有可复制的内容')
    return
  }

  try {
    await navigator.clipboard.writeText(contentToCopy)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败，请手动选择复制')
  }
}

function handleLoadSample() {
  setInputContent(SAMPLE_DATA)
  if (isSplit.value) {
    setOutputContent('')
  }
  message.success('已载入 19 位雪花数值测试示例')
}

function handleCopyCursorPath() {
  if (!cursorPath.value) return
  navigator.clipboard.writeText(cursorPath.value)
  message.success(`已复制路径: ${cursorPath.value}`)
}

function handleFillCursorPath() {
  jsonPathQuery.value = cursorPath.value
  message.info(`已填入: ${cursorPath.value}`)
}

function handleApplyOutputToInput() {
  if (!outputView) return
  const out = outputView.state.doc.toString()
  if (!out) return
  setInputContent(out)
  message.success('已将输出结果应用到输入编辑器')
}

// Watch theme change to reconfigure CodeMirror editors
watch(
  () => themeStore.isDark,
  (dark) => {
    if (inputView) {
      inputView.dispatch({
        effects: themeCompartmentInput.reconfigure(getEditorTheme(dark))
      })
    }
    if (outputView) {
      outputView.dispatch({
        effects: themeCompartmentOutput.reconfigure(getEditorTheme(dark))
      })
    }
  }
)

// Watch split mode toggle
watch(isSplit, (split) => {
  saveSnapshot()
  if (split) {
    setTimeout(() => {
      initOutputEditor()
    }, 50)
  }
})

onMounted(() => {
  initInputEditor()
  if (isSplit.value) {
    initOutputEditor()
  }
})

onBeforeUnmount(() => {
  if (inputView) {
    inputView.destroy()
    inputView = null
  }
  if (outputView) {
    outputView.destroy()
    outputView = null
  }
})
</script>

<template>
  <div class="h-full w-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 overflow-hidden select-none">
    <!-- Top Control Toolbar -->
    <header class="h-11 px-3 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
      <!-- Left: Title & Actions -->
      <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
        <div class="flex items-center gap-1.5 mr-2 shrink-0">
          <span class="w-6 h-6 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-200 dark:border-indigo-800">
            {}
          </span>
          <span class="text-xs font-bold text-slate-800 dark:text-slate-100 hidden sm:inline">JSON 套件</span>
          <span class="px-1.5 py-0.5 text-[10px] font-medium rounded bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
            AST 无损
          </span>
        </div>

        <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1"></div>

        <!-- Action Buttons -->
        <button
          @click="handleFormat"
          class="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors shrink-0"
          title="美化 JSON 排版，精确保留大整数"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
          </svg>
          <span>格式化</span>
        </button>

        <button
          @click="handleSortKeys"
          class="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors shrink-0"
          title="按字母升序递归排序所有对象字段键名"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
          </svg>
          <span>排序键名</span>
        </button>

        <button
          @click="handleMinify"
          class="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors shrink-0"
          title="去除空白符单行压缩，大数值字面量不受影响"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          <span>压缩</span>
        </button>

        <button
          @click="handleRepair"
          class="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 transition-colors shrink-0"
          title="智能清除注释、单引号纠正双引号、剔除尾随逗号"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>容错修复</span>
        </button>

        <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1"></div>

        <button
          @click="handleCopy"
          class="px-2 py-1 rounded text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          title="复制当前有效结果"
        >
          复制
        </button>

        <button
          @click="handleClear"
          class="px-2 py-1 rounded text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 transition-colors shrink-0"
          title="清空编辑器"
        >
          清空
        </button>

        <button
          @click="handleLoadSample"
          class="px-2 py-1 rounded text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors shrink-0"
          title="载入带 19 位雪花数值与容错特性的演示数据"
        >
          载入示例
        </button>
      </div>

      <!-- Right: View & Indent Toggles -->
      <div class="flex items-center gap-2 shrink-0">
        <!-- Indent Switcher -->
        <div class="flex items-center bg-slate-100 dark:bg-slate-800 rounded p-0.5 text-[11px] font-mono">
          <button
            @click="indentSize = 2; handleFormat()"
            :class="[
              'px-1.5 py-0.5 rounded transition-all',
              indentSize === 2
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            ]"
          >
            2 空格
          </button>
          <button
            @click="indentSize = 4; handleFormat()"
            :class="[
              'px-1.5 py-0.5 rounded transition-all',
              indentSize === 4
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            ]"
          >
            4 空格
          </button>
        </div>

        <!-- Pane Layout Mode: Split vs Single -->
        <div class="flex items-center bg-slate-100 dark:bg-slate-800 rounded p-0.5 text-xs">
          <button
            @click="isSplit = false"
            :class="[
              'px-2 py-0.5 rounded transition-all flex items-center gap-1',
              !isSplit
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            ]"
            title="单栏沉浸编辑模式"
          >
            单栏
          </button>
          <button
            @click="isSplit = true"
            :class="[
              'px-2 py-0.5 rounded transition-all flex items-center gap-1',
              isSplit
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            ]"
            title="双栏输入/输出对比模式"
          >
            双栏
          </button>
        </div>
      </div>
    </header>

    <!-- Sub Header: JSONPath Filter Bar -->
    <div class="h-9 px-3 bg-slate-100/70 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0">
      <div class="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 shrink-0 font-medium">
        <svg class="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span>JSONPath:</span>
      </div>

      <div class="flex-1 flex items-center relative">
        <input
          v-model="jsonPathQuery"
          @keyup.enter="handleExecuteJsonPath"
          type="text"
          placeholder="输入 JSONPath 查询表达式（如 $.items[*].itemId 或 $.meta.traceId）按回车提取..."
          class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 rounded px-2.5 py-1 text-xs font-mono text-slate-800 dark:text-slate-200 outline-none transition-colors"
        />
        <button
          v-if="jsonPathQuery"
          @click="handleResetJsonPath"
          class="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
          title="清除查询"
        >
          ✕
        </button>
      </div>

      <button
        @click="handleExecuteJsonPath"
        class="px-2.5 py-1 rounded text-xs font-medium bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors shrink-0"
      >
        提取
      </button>
    </div>

    <!-- Main Editor Canvas Area -->
    <div class="flex-1 min-h-0 w-full flex overflow-hidden">
      <!-- Left Editor: Input / Single Editor -->
      <div
        :class="[
          'h-full flex flex-col min-w-0 transition-all overflow-hidden',
          isSplit ? 'w-1/2 border-r border-slate-200 dark:border-slate-800' : 'w-full'
        ]"
      >
        <div v-if="isSplit" class="h-6 px-3 bg-slate-100 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <span>原始输入 (Raw Input)</span>
          <span class="font-mono text-[10px] text-slate-400">{{ rawLineCount }} 行 · {{ rawCharCount }} 字符</span>
        </div>
        <div ref="inputEditorEl" class="flex-1 min-h-0 w-full overflow-hidden"></div>
      </div>

      <!-- Right Editor: Split Mode Output Pane -->
      <div
        v-if="isSplit"
        class="h-full w-1/2 flex flex-col min-w-0 bg-white dark:bg-slate-950 overflow-hidden"
      >
        <div class="h-6 px-3 bg-slate-100 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <div class="flex items-center gap-2">
            <span>处理输出 (Output / Query Result)</span>
            <span v-if="jsonPathQuery" class="px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 text-[10px] font-mono">
              {{ jsonPathQuery }}
            </span>
          </div>
          <button
            @click="handleApplyOutputToInput"
            class="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            title="将输出结果复制覆盖至左侧输入栏"
          >
            ← 同步至输入
          </button>
        </div>
        <div ref="outputEditorEl" class="flex-1 min-h-0 w-full overflow-hidden"></div>
      </div>
    </div>

    <!-- Bottom Status Bar -->
    <footer class="h-7 px-3 bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono shrink-0">
      <!-- Left: Cursor JSONPath -->
      <div class="flex items-center gap-2 truncate">
        <span class="text-slate-400">当前节点:</span>
        <button
          @click="handleCopyCursorPath"
          class="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
          title="点击复制此节点路径"
        >
          <span>{{ cursorPath }}</span>
        </button>
        <button
          @click="handleFillCursorPath"
          class="text-[10px] px-1 py-0.2 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          title="填入顶部 JSONPath 过滤器"
        >
          填入查询
        </button>
      </div>

      <!-- Center / Right: BigInt Protection Status & Validation -->
      <div class="flex items-center gap-3 shrink-0">
        <!-- Snowflake BigInt detection indicator -->
        <div v-if="hasSnowflakeId" class="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span class="text-[10px] font-sans font-medium">AST 大整数保护激活</span>
        </div>

        <!-- Syntax status badge -->
        <div class="flex items-center gap-1">
          <span
            :class="[
              'w-2 h-2 rounded-full',
              errorMessage ? 'bg-rose-500' : 'bg-emerald-500'
            ]"
          ></span>
          <span :class="errorMessage ? 'text-rose-500 font-sans' : 'text-emerald-600 dark:text-emerald-400 font-sans'">
            {{ errorMessage ? 'JSON 语法错误' : '合法 JSON' }}
          </span>
        </div>
      </div>
    </footer>
  </div>
</template>

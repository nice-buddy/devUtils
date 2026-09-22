<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { json } from '@codemirror/lang-json'
import { EditorState, Compartment } from '@codemirror/state'
import { useThemeStore } from '@/stores/themeStore'
import {
  PostmanRequestModel,
  KeyValueItem
} from '../types'

const props = defineProps<{
  modelValue: PostmanRequestModel
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: PostmanRequestModel): void
  (e: 'change'): void
}>()

const themeStore = useThemeStore()
const activeTab = ref<'params' | 'headers' | 'body' | 'auth' | 'settings'>('params')
const isBulkHeaders = ref(false)
const bulkHeadersText = ref('')

// CodeMirror for Raw Body
const codeEditorEl = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
const themeCompartment = new Compartment()

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

function initEditor() {
  if (!codeEditorEl.value || editorView) return

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const text = update.state.doc.toString()
      props.modelValue.bodyRaw = text
      emit('change')
    }
  })

  editorView = new EditorView({
    state: EditorState.create({
      doc: props.modelValue.bodyRaw || '',
      extensions: [
        basicSetup,
        json(),
        themeCompartment.of(getEditorTheme(themeStore.isDark)),
        updateListener
      ]
    }),
    parent: codeEditorEl.value
  })
}

// Params operations
function addParam() {
  props.modelValue.params.push({ key: '', value: '', enabled: true, description: '' })
  emit('change')
}

function removeParam(index: number) {
  props.modelValue.params.splice(index, 1)
  emit('change')
}

// Headers operations
function addHeader() {
  props.modelValue.headers.push({ key: '', value: '', enabled: true, description: '' })
  emit('change')
}

function removeHeader(index: number) {
  props.modelValue.headers.splice(index, 1)
  emit('change')
}

function syncBulkHeadersToHeaders() {
  const lines = bulkHeadersText.value.split('\n')
  const newHeaders: KeyValueItem[] = []
  for (const line of lines) {
    const idx = line.indexOf(':')
    if (idx > -1) {
      newHeaders.push({
        key: line.slice(0, idx).trim(),
        value: line.slice(idx + 1).trim(),
        enabled: true
      })
    } else if (line.trim()) {
      newHeaders.push({
        key: line.trim(),
        value: '',
        enabled: true
      })
    }
  }
  props.modelValue.headers = newHeaders.length > 0 ? newHeaders : [{ key: '', value: '', enabled: true }]
  emit('change')
}

function toggleBulkHeaders() {
  isBulkHeaders.value = !isBulkHeaders.value
  if (isBulkHeaders.value) {
    // 转换为多行文本
    bulkHeadersText.value = props.modelValue.headers
      .filter((h) => h.key.trim())
      .map((h) => `${h.key}: ${h.value}`)
      .join('\n')
  } else {
    // 解析多行文本
    syncBulkHeadersToHeaders()
  }
}

// Form Data operations
function addFormData() {
  props.modelValue.formData.push({ key: '', value: '', enabled: true, itemType: 'text' })
  emit('change')
}

function removeFormData(index: number) {
  props.modelValue.formData.splice(index, 1)
  emit('change')
}

// URL Encoded operations
function addUrlencoded() {
  props.modelValue.urlencodedData.push({ key: '', value: '', enabled: true })
  emit('change')
}

function removeUrlencoded(index: number) {
  props.modelValue.urlencodedData.splice(index, 1)
  emit('change')
}

// Theme watcher
watch(
  () => themeStore.isDark,
  (dark) => {
    if (editorView) {
      editorView.dispatch({
        effects: themeCompartment.reconfigure(getEditorTheme(dark))
      })
    }
  }
)

watch(
  () => props.modelValue.bodyRaw,
  (newVal) => {
    if (editorView && editorView.state.doc.toString() !== newVal) {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: newVal || '' }
      })
    }
  }
)

watch(
  () => props.modelValue.bodyType,
  async (type) => {
    if (type === 'raw') {
      await nextTick()
      initEditor()
    }
    emit('change')
  }
)

watch(activeTab, async (tab) => {
  if (tab === 'body' && props.modelValue.bodyType === 'raw') {
    await nextTick()
    if (!editorView) {
      initEditor()
    } else {
      editorView.requestMeasure()
    }
  }
})

onMounted(() => {
  if (props.modelValue.params.length === 0) {
    props.modelValue.params.push({ key: '', value: '', enabled: true })
  }
  if (props.modelValue.headers.length === 0) {
    props.modelValue.headers.push({ key: '', value: '', enabled: true })
  }
  if (props.modelValue.formData.length === 0) {
    props.modelValue.formData.push({ key: '', value: '', enabled: true, itemType: 'text' })
  }
  if (props.modelValue.urlencodedData.length === 0) {
    props.modelValue.urlencodedData.push({ key: '', value: '', enabled: true })
  }
  if (activeTab.value === 'body' && props.modelValue.bodyType === 'raw') {
    initEditor()
  }
})

onBeforeUnmount(() => {
  if (editorView) {
    editorView.destroy()
    editorView = null
  }
})
</script>

<template>
  <div class="h-full w-full flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 overflow-hidden">
    <!-- Sub-tab Navigation Bar -->
    <div class="h-9 px-3 bg-slate-100/70 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">
      <div class="flex items-center gap-1 font-medium">
        <button
          @click="activeTab = 'params'"
          :class="[
            'px-2.5 py-1 rounded transition-colors flex items-center gap-1.5',
            activeTab === 'params'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          ]"
        >
          <span>参数</span>
          <span
            v-if="modelValue.params.filter(p => p.enabled && p.key.trim()).length > 0"
            class="w-1.5 h-1.5 rounded-full bg-indigo-500"
          ></span>
        </button>

        <button
          @click="activeTab = 'headers'"
          :class="[
            'px-2.5 py-1 rounded transition-colors flex items-center gap-1.5',
            activeTab === 'headers'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          ]"
        >
          <span>请求头</span>
          <span
            v-if="modelValue.headers.filter(h => h.enabled && h.key.trim()).length > 0"
            class="w-1.5 h-1.5 rounded-full bg-indigo-500"
          ></span>
        </button>

        <button
          @click="activeTab = 'body'"
          :class="[
            'px-2.5 py-1 rounded transition-colors flex items-center gap-1.5',
            activeTab === 'body'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          ]"
        >
          <span>请求体</span>
          <span
            v-if="modelValue.bodyType !== 'none'"
            class="w-1.5 h-1.5 rounded-full bg-indigo-500"
          ></span>
        </button>

        <button
          @click="activeTab = 'auth'"
          :class="[
            'px-2.5 py-1 rounded transition-colors flex items-center gap-1.5',
            activeTab === 'auth'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          ]"
        >
          <span>鉴权</span>
          <span
            v-if="modelValue.auth.type !== 'none'"
            class="w-1.5 h-1.5 rounded-full bg-indigo-500"
          ></span>
        </button>

        <button
          @click="activeTab = 'settings'"
          :class="[
            'px-2.5 py-1 rounded transition-colors',
            activeTab === 'settings'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          ]"
        >
          <span>设置</span>
        </button>
      </div>

      <!-- Action items per tab -->
      <div v-if="activeTab === 'headers'" class="flex items-center gap-2">
        <button
          @click="toggleBulkHeaders"
          class="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          {{ isBulkHeaders ? '键值编辑' : '批量编辑' }}
        </button>
      </div>
    </div>

    <!-- Sub-tab Content Area -->
    <div class="flex-1 min-h-0 overflow-auto p-2">
      <!-- 1. PARAMS TAB -->
      <div v-if="activeTab === 'params'" class="h-full flex flex-col">
        <div class="text-[11px] text-slate-400 mb-2 px-1">
          Query 参数将自动与上方 URL 双向实时同步
        </div>
        <div class="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden bg-white dark:bg-slate-950">
          <table class="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th class="w-8 py-1.5 px-2 text-center"></th>
                <th class="w-1/3 py-1.5 px-2 border-r border-slate-200 dark:border-slate-800">参数名 (Key)</th>
                <th class="py-1.5 px-2">参数值 (Value)</th>
                <th class="w-10 py-1.5 px-2 text-center"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(param, idx) in modelValue.params"
                :key="idx"
                class="border-b border-slate-100 dark:border-slate-900/60 hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
              >
                <td class="py-1 px-2 text-center">
                  <input
                    type="checkbox"
                    v-model="param.enabled"
                    @change="emit('change')"
                    class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </td>
                <td class="py-1 px-2 border-r border-slate-200 dark:border-slate-800">
                  <input
                    type="text"
                    v-model="param.key"
                    @input="emit('change')"
                    placeholder="Key"
                    class="w-full bg-transparent outline-none text-slate-800 dark:text-slate-200"
                  />
                </td>
                <td class="py-1 px-2">
                  <input
                    type="text"
                    v-model="param.value"
                    @input="emit('change')"
                    placeholder="Value"
                    class="w-full bg-transparent outline-none text-slate-800 dark:text-slate-200"
                  />
                </td>
                <td class="py-1 px-2 text-center">
                  <button
                    @click="removeParam(idx)"
                    class="text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="mt-2">
          <button
            @click="addParam"
            class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
          >
            + 添加参数行
          </button>
        </div>
      </div>

      <!-- 2. HEADERS TAB -->
      <div v-if="activeTab === 'headers'" class="h-full flex flex-col">
        <!-- Bulk Editor -->
        <div v-if="isBulkHeaders" class="h-full flex flex-col">
          <div class="text-[11px] text-slate-400 mb-2">
            每行输入一个请求头，格式为 `Key: Value`
          </div>
          <textarea
            v-model="bulkHeadersText"
            @input="syncBulkHeadersToHeaders"
            placeholder="Content-Type: application/json&#10;Authorization: Bearer token"
            class="flex-1 w-full p-2 text-xs font-mono rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 outline-none resize-none focus:border-indigo-500"
          ></textarea>
        </div>

        <!-- Key-Value Table -->
        <div v-else class="h-full flex flex-col">
          <div class="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden bg-white dark:bg-slate-950">
            <table class="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th class="w-8 py-1.5 px-2 text-center"></th>
                  <th class="w-1/3 py-1.5 px-2 border-r border-slate-200 dark:border-slate-800">Header 名称</th>
                  <th class="py-1.5 px-2">Header 数值</th>
                  <th class="w-10 py-1.5 px-2 text-center"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(header, idx) in modelValue.headers"
                  :key="idx"
                  class="border-b border-slate-100 dark:border-slate-900/60 hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                >
                  <td class="py-1 px-2 text-center">
                    <input
                      type="checkbox"
                      v-model="header.enabled"
                      @change="emit('change')"
                      class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td class="py-1 px-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      v-model="header.key"
                      @input="emit('change')"
                      placeholder="Header Name"
                      class="w-full bg-transparent outline-none text-slate-800 dark:text-slate-200"
                    />
                  </td>
                  <td class="py-1 px-2">
                    <input
                      type="text"
                      v-model="header.value"
                      @input="emit('change')"
                      placeholder="Header Value"
                      class="w-full bg-transparent outline-none text-slate-800 dark:text-slate-200"
                    />
                  </td>
                  <td class="py-1 px-2 text-center">
                    <button
                      @click="removeHeader(idx)"
                      class="text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="mt-2 flex items-center gap-3">
            <button
              @click="addHeader"
              class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
            >
              + 添加请求头
            </button>
          </div>
        </div>
      </div>

      <!-- 3. BODY TAB -->
      <div v-if="activeTab === 'body'" class="h-full flex flex-col">
        <!-- Body Type Radio Selector -->
        <div class="flex items-center gap-3 pb-2 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 shrink-0">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" value="none" v-model="modelValue.bodyType" class="text-indigo-600" />
            <span>none</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" value="raw" v-model="modelValue.bodyType" class="text-indigo-600" />
            <span>raw</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" value="x-www-form-urlencoded" v-model="modelValue.bodyType" class="text-indigo-600" />
            <span>x-www-form-urlencoded</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" value="form-data" v-model="modelValue.bodyType" class="text-indigo-600" />
            <span>form-data</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" value="binary" v-model="modelValue.bodyType" class="text-indigo-600" />
            <span>binary</span>
          </label>

          <div v-if="modelValue.bodyType === 'raw'" class="ml-auto flex items-center gap-1.5">
            <span class="text-[11px] text-slate-400">格式:</span>
            <select
              v-model="modelValue.rawType"
              class="bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5 text-xs border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 outline-none"
            >
              <option value="json">JSON (application/json)</option>
              <option value="text">Text (text/plain)</option>
              <option value="xml">XML (application/xml)</option>
              <option value="html">HTML (text/html)</option>
            </select>
          </div>
        </div>

        <!-- Body Type: None -->
        <div
          v-if="modelValue.bodyType === 'none'"
          class="flex-1 flex items-center justify-center text-slate-400 text-xs"
        >
          该请求不携带请求体 (Body)
        </div>

        <!-- Body Type: Raw CodeMirror -->
        <div
          v-else-if="modelValue.bodyType === 'raw'"
          class="flex-1 min-h-0 pt-2 flex flex-col"
        >
          <div ref="codeEditorEl" class="flex-1 min-h-0 w-full border border-slate-200 dark:border-slate-800 rounded overflow-hidden"></div>
        </div>

        <!-- Body Type: x-www-form-urlencoded -->
        <div
          v-else-if="modelValue.bodyType === 'x-www-form-urlencoded'"
          class="flex-1 min-h-0 pt-2 flex flex-col"
        >
          <div class="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden bg-white dark:bg-slate-950">
            <table class="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th class="w-8 py-1.5 px-2 text-center"></th>
                  <th class="w-1/3 py-1.5 px-2 border-r border-slate-200 dark:border-slate-800">Key</th>
                  <th class="py-1.5 px-2">Value</th>
                  <th class="w-10 py-1.5 px-2 text-center"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(item, idx) in modelValue.urlencodedData"
                  :key="idx"
                  class="border-b border-slate-100 dark:border-slate-900/60 hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                >
                  <td class="py-1 px-2 text-center">
                    <input
                      type="checkbox"
                      v-model="item.enabled"
                      @change="emit('change')"
                      class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td class="py-1 px-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      v-model="item.key"
                      @input="emit('change')"
                      placeholder="Key"
                      class="w-full bg-transparent outline-none text-slate-800 dark:text-slate-200"
                    />
                  </td>
                  <td class="py-1 px-2">
                    <input
                      type="text"
                      v-model="item.value"
                      @input="emit('change')"
                      placeholder="Value"
                      class="w-full bg-transparent outline-none text-slate-800 dark:text-slate-200"
                    />
                  </td>
                  <td class="py-1 px-2 text-center">
                    <button
                      @click="removeUrlencoded(idx)"
                      class="text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="mt-2">
            <button
              @click="addUrlencoded"
              class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
            >
              + 添加表单项
            </button>
          </div>
        </div>

        <!-- Body Type: form-data (multipart) -->
        <div
          v-else-if="modelValue.bodyType === 'form-data'"
          class="flex-1 min-h-0 pt-2 flex flex-col"
        >
          <div class="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden bg-white dark:bg-slate-950">
            <table class="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th class="w-8 py-1.5 px-2 text-center"></th>
                  <th class="w-1/4 py-1.5 px-2 border-r border-slate-200 dark:border-slate-800">Key</th>
                  <th class="w-20 py-1.5 px-2 border-r border-slate-200 dark:border-slate-800">类型</th>
                  <th class="py-1.5 px-2">数值 / 本地文件绝对路径</th>
                  <th class="w-10 py-1.5 px-2 text-center"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(item, idx) in modelValue.formData"
                  :key="idx"
                  class="border-b border-slate-100 dark:border-slate-900/60 hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                >
                  <td class="py-1 px-2 text-center">
                    <input
                      type="checkbox"
                      v-model="item.enabled"
                      @change="emit('change')"
                      class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td class="py-1 px-2 border-r border-slate-200 dark:border-slate-800">
                    <input
                      type="text"
                      v-model="item.key"
                      @input="emit('change')"
                      placeholder="Key"
                      class="w-full bg-transparent outline-none text-slate-800 dark:text-slate-200"
                    />
                  </td>
                  <td class="py-1 px-2 border-r border-slate-200 dark:border-slate-800">
                    <select
                      v-model="item.itemType"
                      @change="emit('change')"
                      class="bg-transparent outline-none text-slate-600 dark:text-slate-300 text-xs"
                    >
                      <option value="text">Text</option>
                      <option value="file">File</option>
                    </select>
                  </td>
                  <td class="py-1 px-2">
                    <input
                      type="text"
                      v-model="item.value"
                      @input="emit('change')"
                      :placeholder="item.itemType === 'file' ? '/path/to/file.jpg' : 'Value'"
                      class="w-full bg-transparent outline-none text-slate-800 dark:text-slate-200"
                    />
                  </td>
                  <td class="py-1 px-2 text-center">
                    <button
                      @click="removeFormData(idx)"
                      class="text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="mt-2">
            <button
              @click="addFormData"
              class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
            >
              + 添加 Multipart 项
            </button>
          </div>
        </div>

        <!-- Body Type: binary -->
        <div
          v-else-if="modelValue.bodyType === 'binary'"
          class="flex-1 min-h-0 pt-4 flex flex-col gap-2 max-w-lg"
        >
          <label class="text-xs font-medium text-slate-700 dark:text-slate-300">
            本地二进制文件绝对路径:
          </label>
          <div class="flex items-center gap-2">
            <input
              type="text"
              v-model="modelValue.binaryFilePath"
              @input="emit('change')"
              placeholder="例如: /Users/username/data.bin"
              class="flex-1 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono outline-none focus:border-indigo-500"
            />
            <button
              v-if="modelValue.binaryFilePath"
              @click="modelValue.binaryFilePath = ''; emit('change')"
              class="px-2 py-1.5 rounded bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 hover:text-rose-500"
            >
              清除
            </button>
          </div>
          <p class="text-[11px] text-slate-400">
            直接将本地指定文件的全部字节流注入到请求体中 (Streaming upload)。
          </p>
        </div>
      </div>

      <!-- 4. AUTH TAB -->
      <div v-if="activeTab === 'auth'" class="h-full flex flex-col max-w-md gap-4 py-2">
        <div class="flex items-center gap-3">
          <label class="text-xs font-medium text-slate-600 dark:text-slate-400 w-24">鉴权类型:</label>
          <select
            v-model="modelValue.auth.type"
            @change="emit('change')"
            class="flex-1 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 outline-none"
          >
            <option value="none">No Auth (无需鉴权)</option>
            <option value="bearer">Bearer Token</option>
            <option value="basic">Basic Auth</option>
            <option value="apikey">API Key</option>
          </select>
        </div>

        <!-- Bearer Token -->
        <div v-if="modelValue.auth.type === 'bearer'" class="flex flex-col gap-2">
          <label class="text-xs font-medium text-slate-600 dark:text-slate-400">Token 令牌:</label>
          <input
            type="password"
            v-model="modelValue.auth.bearerToken"
            @input="emit('change')"
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            class="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono outline-none focus:border-indigo-500"
          />
        </div>

        <!-- Basic Auth -->
        <div v-if="modelValue.auth.type === 'basic'" class="flex flex-col gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-slate-600 dark:text-slate-400">用户名 (Username):</label>
            <input
              type="text"
              v-model="modelValue.auth.basicUsername"
              @input="emit('change')"
              class="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono outline-none focus:border-indigo-500"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-slate-600 dark:text-slate-400">密码 (Password):</label>
            <input
              type="password"
              v-model="modelValue.auth.basicPassword"
              @input="emit('change')"
              class="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <!-- API Key -->
        <div v-if="modelValue.auth.type === 'apikey'" class="flex flex-col gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-slate-600 dark:text-slate-400">Key 名称 (例如 X-API-KEY):</label>
            <input
              type="text"
              v-model="modelValue.auth.apiKeyName"
              @input="emit('change')"
              class="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono outline-none focus:border-indigo-500"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-slate-600 dark:text-slate-400">Key 数值:</label>
            <input
              type="password"
              v-model="modelValue.auth.apiKeyValue"
              @input="emit('change')"
              class="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono outline-none focus:border-indigo-500"
            />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-500">添加到:</span>
            <label class="text-xs flex items-center gap-1 cursor-pointer">
              <input type="radio" value="header" v-model="modelValue.auth.apiKeyAddTo" @change="emit('change')" />
              <span>Header</span>
            </label>
            <label class="text-xs flex items-center gap-1 cursor-pointer">
              <input type="radio" value="query" v-model="modelValue.auth.apiKeyAddTo" @change="emit('change')" />
              <span>Query Params</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 5. SETTINGS TAB -->
      <div v-if="activeTab === 'settings'" class="h-full flex flex-col max-w-md gap-4 py-2">
        <label class="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
          <div class="flex flex-col">
            <span class="font-medium">忽略 SSL 证书错误 (自签名证书)</span>
            <span class="text-[11px] text-slate-400">禁用证书合法性与过期校验</span>
          </div>
          <input
            type="checkbox"
            v-model="modelValue.settings.ignoreSsl"
            @change="emit('change')"
            class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </label>

        <label class="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
          <div class="flex flex-col">
            <span class="font-medium">自动跟踪 HTTP 重定向 (Follow Redirects)</span>
            <span class="text-[11px] text-slate-400">最大跟踪 10 次 3xx 重定向跳转</span>
          </div>
          <input
            type="checkbox"
            v-model="modelValue.settings.followRedirects"
            @change="emit('change')"
            class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </label>

        <div class="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
          <div class="flex flex-col">
            <span class="font-medium">超时时间 (Timeout)</span>
            <span class="text-[11px] text-slate-400">请求最大等待毫秒数</span>
          </div>
          <div class="flex items-center gap-1">
            <input
              type="number"
              v-model.number="modelValue.settings.timeoutMs"
              @input="emit('change')"
              class="w-24 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono outline-none text-right focus:border-indigo-500"
            />
            <span class="text-slate-400">ms</span>
          </div>
        </div>

        <div class="flex flex-col gap-1 text-xs text-slate-700 dark:text-slate-300">
          <span class="font-medium">自定义网络代理 (Proxy)</span>
          <input
            type="text"
            v-model="modelValue.settings.proxy"
            @input="emit('change')"
            placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
            class="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono outline-none focus:border-indigo-500"
          />
        </div>
      </div>
    </div>
  </div>
</template>

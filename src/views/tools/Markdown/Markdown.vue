<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NSwitch, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { Compartment, EditorState } from '@codemirror/state'
import { markdown as markdownLanguage } from '@codemirror/lang-markdown'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { saveTextFile } from '@/utils/fileSave'
import { buildSrcdoc, markdownToHtml } from './utils/renderMarkdown'
import { highlightCode, sanitizeHtml } from './utils/preview'
import { scrollRatio, targetScrollTop } from './utils/scrollSync'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

const SAMPLE = [
  '# DevUtils Markdown 预览',
  '',
  '支持 **GFM**：表格、任务列表、删除线、自动链接。',
  '',
  '| 能力 | 状态 |',
  '| --- | --- |',
  '| 表格 | ✅ |',
  '| 任务列表 | ✅ |',
  '',
  '- [x] 双向同步滚动',
  '- [ ] 导出 PDF',
  '',
  '```js',
  'const sum = (a, b) => a + b',
  '```'
].join('\n')

const markdown = ref<string>(props.initialSnapshot?.markdown ?? SAMPLE)
const syncScroll = ref<boolean>(props.initialSnapshot?.syncScroll ?? true)
const exportPath = ref<string>(props.initialSnapshot?.exportPath ?? '~/Downloads/devutils-preview.html')
const errorMessage = ref<string>('')
const previewHtml = ref<string>('')
const sanitizedFlag = ref<boolean>(false)
const editorEl = ref<HTMLDivElement | null>(null)
const iframeEl = ref<HTMLIFrameElement | null>(null)
let editorView: EditorView | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let renderTimer: ReturnType<typeof setTimeout> | null = null
let syncing = false

const themeCompartment = new Compartment()

const srcdoc = computed(() => buildSrcdoc(previewHtml.value, themeStore.isDark))

function getMarkdown(): string {
  return editorView ? editorView.state.doc.toString() : markdown.value
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    markdown: getMarkdown(),
    syncScroll: syncScroll.value,
    exportPath: exportPath.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function render() {
  const { html, error } = markdownToHtml(getMarkdown())
  if (error) {
    errorMessage.value = error
    return
  }
  errorMessage.value = ''
  const clean = sanitizeHtml(html)
  sanitizedFlag.value = clean !== html
  previewHtml.value = highlightCode(clean)
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = setTimeout(render, 250)
}

function handleDocChange() {
  markdown.value = getMarkdown()
  scheduleSnapshot()
  scheduleRender()
}

function copyText(text: string, label: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success(label)
}

async function exportHtml() {
  const doc = buildSrcdoc(previewHtml.value, themeStore.isDark)
  const path = exportPath.value.trim()
  if (!path) {
    message.warning('请先填写导出路径')
    return
  }
  try {
    const bytes = await saveTextFile(path, doc)
    message.success(`已导出 ${bytes} 字节到 ${path}`)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}

// --- 双向同步滚动 ---
function syncToIframe() {
  if (!syncScroll.value || syncing || !editorView || !iframeEl.value) return
  const doc = iframeEl.value.contentDocument
  if (!doc) return
  const scroller = editorView.scrollDOM
  const ratio = scrollRatio({ scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight })
  syncing = true
  doc.documentElement.scrollTop = targetScrollTop(
    { scrollHeight: doc.documentElement.scrollHeight, clientHeight: doc.documentElement.clientHeight },
    ratio
  )
  requestAnimationFrame(() => {
    syncing = false
  })
}

function attachPreviewScroll() {
  const doc = iframeEl.value?.contentDocument
  if (!doc) return
  doc.addEventListener('scroll', () => {
    if (!syncScroll.value || syncing || !editorView) return
    const root = doc.documentElement
    const ratio = scrollRatio({ scrollTop: root.scrollTop, scrollHeight: root.scrollHeight, clientHeight: root.clientHeight })
    syncing = true
    editorView.scrollDOM.scrollTop = targetScrollTop(
      { scrollHeight: editorView.scrollDOM.scrollHeight, clientHeight: editorView.scrollDOM.clientHeight },
      ratio
    )
    requestAnimationFrame(() => {
      syncing = false
    })
  })
}

function getEditorTheme(isDark: boolean) {
  return EditorView.theme(
    {
      '&': { height: '100%', fontSize: '13px', backgroundColor: isDark ? '#090d16' : '#ffffff', color: isDark ? '#e2e8f0' : '#1e293b' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', lineHeight: '1.7' },
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
        doc: markdown.value,
        extensions: [
          basicSetup,
          markdownLanguage(),
          themeCompartment.of(getEditorTheme(themeStore.isDark)),
          EditorView.updateListener.of(update => {
            if (update.docChanged) handleDocChange()
          })
        ]
      }),
      parent: editorEl.value
    })
    editorView.scrollDOM.addEventListener('scroll', syncToIframe)
  }
  render()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  if (renderTimer) clearTimeout(renderTimer)
  saveSnapshot()
  editorView?.scrollDOM.removeEventListener('scroll', syncToIframe)
  editorView?.destroy()
  editorView = null
})

watch(syncScroll, saveSnapshot)
watch(exportPath, scheduleSnapshot)
watch(
  () => themeStore.isDark,
  dark => {
    if (editorView) editorView.dispatch({ effects: themeCompartment.reconfigure(getEditorTheme(dark)) })
  }
)
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">Markdown / HTML 预览</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">GFM 实时渲染、双向同步滚动、代码块高亮与 HTML 导出</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="syncScroll" size="small" />同步滚动</span>
        <NButton size="small" @click="copyText(getMarkdown(), '已复制 Markdown')">复制 Markdown</NButton>
        <NButton size="small" @click="copyText(srcdoc, '已复制 HTML')">复制 HTML</NButton>
        <NInput v-model:value="exportPath" size="small" class="w-56" placeholder="~/Downloads/devutils-preview.html" />
        <NButton size="small" type="primary" @click="exportHtml">导出 .html</NButton>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">Markdown</div>
        <div ref="editorEl" class="flex-1 min-h-0 overflow-hidden"></div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">预览（沙箱 iframe）</span>
          <span class="text-[11px] text-slate-400">{{ markdown.length }} 字符<span v-if="sanitizedFlag"> · 已消毒</span></span>
        </div>
        <iframe
          ref="iframeEl"
          class="flex-1 min-h-0 w-full border-none bg-white"
          sandbox="allow-same-origin"
          :srcdoc="srcdoc"
          @load="attachPreviewScroll"
        ></iframe>
      </section>
    </div>
  </div>
</template>

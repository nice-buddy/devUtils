<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NInputNumber, NRadioButton, NRadioGroup, NSlider, useMessage } from 'naive-ui'
import { useTabStore } from '@/stores/tabStore'
import { saveBase64File } from '@/utils/fileSave'
import { base64ToBytes, bytesToBase64, parseDataUrl, toDataUrl } from './utils/dataUrl'
import { targetSize } from './utils/imageResize'
import { minifySvg } from './utils/svgMinify'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

type Mode = 'toBase64' | 'toImage' | 'svg'

const mode = ref<Mode>(props.initialSnapshot?.mode ?? 'toBase64')
const base64Input = ref<string>(props.initialSnapshot?.base64Input ?? '')
const svgInput = ref<string>(props.initialSnapshot?.svgInput ?? '')
const scale = ref<number>(props.initialSnapshot?.scale ?? 100)
const quality = ref<number>(props.initialSnapshot?.quality ?? 0.8)
const savePath = ref<string>(props.initialSnapshot?.savePath ?? '')
const errorMessage = ref<string>('')
const dataUrl = ref<string>('')
const rawBase64 = ref<string>('')
const sourceBytes = ref<number>(0)
const outputBytes = ref<number>(0)
const compressedUrl = ref<string>('')
const svgOutput = ref<string>('')
const imageEl = ref<HTMLImageElement | null>(null)
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const previewSrc = computed(() => dataUrl.value || compressedUrl.value)
const mime = computed(() => parseDataUrl(dataUrl.value).mime ?? 'image/png')

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    mode: mode.value,
    base64Input: base64Input.value,
    svgInput: svgInput.value,
    scale: scale.value,
    quality: quality.value,
    savePath: savePath.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function applyDataUrl(next: string, bytes: number) {
  dataUrl.value = next
  const parsed = parseDataUrl(next)
  rawBase64.value = parsed.base64
  sourceBytes.value = bytes
  errorMessage.value = parsed.error ?? ''
  compressedUrl.value = ''
  outputBytes.value = 0
}

function readFile(file: File) {
  const reader = new FileReader()
  reader.onload = () => applyDataUrl(String(reader.result), file.size)
  reader.onerror = () => {
    errorMessage.value = '读取文件失败'
  }
  reader.readAsDataURL(file)
}

function onPaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        event.preventDefault()
        readFile(file)
        return
      }
    }
  }
}

function onPickFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) readFile(file)
  target.value = ''
}

function decodeBase64Input() {
  const parsed = parseDataUrl(base64Input.value)
  if (parsed.error) {
    errorMessage.value = parsed.error
    return
  }
  errorMessage.value = ''
  dataUrl.value = parsed.mime ? toDataUrl(parsed.mime, parsed.base64) : toDataUrl('image/png', parsed.base64)
  rawBase64.value = parsed.base64
  sourceBytes.value = base64ToBytes(parsed.base64).length
  compressedUrl.value = ''
  outputBytes.value = 0
}

async function compress() {
  if (!previewSrc.value || !imageEl.value) {
    errorMessage.value = '请先载入图片'
    return
  }
  const image = imageEl.value
  const { width, height } = targetSize(image.naturalWidth, image.naturalHeight, scale.value / 100)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    errorMessage.value = '当前环境不支持 Canvas'
    return
  }
  ctx.drawImage(image, 0, 0, width, height)
  const type = mime.value === 'image/jpeg' || mime.value === 'image/webp' ? mime.value : 'image/png'
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality.value))
  if (!blob) {
    errorMessage.value = '压缩失败'
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    compressedUrl.value = String(reader.result)
    outputBytes.value = blob.size
  }
  reader.readAsDataURL(blob)
}

function runSvgMinify() {
  svgOutput.value = minifySvg(svgInput.value)
  sourceBytes.value = new TextEncoder().encode(svgInput.value).length
  outputBytes.value = new TextEncoder().encode(svgOutput.value).length
}

async function saveToFile() {
  if (mode.value === 'svg' ? !svgOutput.value : !rawBase64.value) {
    errorMessage.value = '没有可保存的内容'
    return
  }
  const path = savePath.value.trim()
  if (!path) {
    errorMessage.value = '请填写保存路径'
    return
  }
  try {
    const bytes =
      mode.value === 'svg'
        ? await saveBase64File(path, bytesToBase64(new TextEncoder().encode(svgOutput.value)))
        : await saveBase64File(path, rawBase64.value)
    errorMessage.value = ''
    message.success(`已保存 ${bytes} 字节到 ${path}`)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}

function copyText(text: string, label: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success(label)
}

watch([mode, base64Input, svgInput, scale, quality, savePath], scheduleSnapshot)

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 shrink-0 space-y-2">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-sm font-bold tracking-tight">图片与 Base64 / SVG</h1>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">粘贴剪贴板图片或选择文件，转换、缩放重编码、SVG 压缩与另存</p>
        </div>
        <NRadioGroup v-model:value="mode" size="small">
          <NRadioButton value="toBase64">图片 → Base64</NRadioButton>
          <NRadioButton value="toImage">Base64 → 图片</NRadioButton>
          <NRadioButton value="svg">SVG 压缩</NRadioButton>
        </NRadioGroup>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-500 dark:text-slate-400 shrink-0">保存路径</span>
        <NInput v-model:value="savePath" size="small" class="flex-1" placeholder="~/Downloads/devutils-image.png" />
        <NButton size="small" type="primary" @click="saveToFile">保存到文件</NButton>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 gap-3">
        <template v-if="mode === 'toBase64'">
          <div
            class="flex-1 min-h-0 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-2 text-xs text-slate-500"
            tabindex="0"
            @paste="onPaste"
          >
            <span>点这里后按 Ctrl/Cmd+V 粘贴剪贴板图片</span>
            <label class="text-indigo-600 dark:text-indigo-400 cursor-pointer">
              <input type="file" accept="image/*" class="hidden" @change="onPickFile" />
              或选择本地图片…
            </label>
          </div>
        </template>

        <template v-else-if="mode === 'toImage'">
          <div class="flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
            <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span class="text-xs font-medium">Base64 / DataURL</span>
              <NButton size="tiny" @click="decodeBase64Input">解码</NButton>
            </div>
            <textarea
              v-model="base64Input"
              class="flex-1 min-h-0 w-full resize-none bg-transparent p-3 text-xs font-mono outline-none"
              placeholder="粘贴 DataURL 或纯 Base64"
            ></textarea>
          </div>
        </template>

        <template v-else>
          <div class="flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
            <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span class="text-xs font-medium">SVG 源码</span>
              <NButton size="tiny" @click="runSvgMinify">压缩</NButton>
            </div>
            <textarea
              v-model="svgInput"
              class="flex-1 min-h-0 w-full resize-none bg-transparent p-3 text-xs font-mono outline-none"
              placeholder="粘贴 SVG 源码"
            ></textarea>
          </div>
        </template>

        <div class="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shrink-0 space-y-2">
          <div class="flex items-center gap-3 text-xs">
            <span class="shrink-0">缩放 {{ scale }}%</span>
            <NSlider v-model:value="scale" :min="10" :max="100" class="flex-1" />
            <span class="shrink-0">质量 {{ quality.toFixed(2) }}</span>
            <NInputNumber v-model:value="quality" size="tiny" class="w-20" :min="0.1" :max="1" :step="0.05" />
            <NButton size="tiny" @click="compress">压缩</NButton>
          </div>
          <div class="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>原始 {{ sourceBytes }} B</span>
            <span v-if="outputBytes">→ 输出 {{ outputBytes }} B</span>
          </div>
        </div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">预览与输出</span>
          <div class="flex items-center gap-2">
            <NButton v-if="mode === 'toBase64' && dataUrl" size="tiny" @click="copyText(dataUrl, '已复制 DataURL')">复制 DataURL</NButton>
            <NButton v-if="mode === 'toBase64' && rawBase64" size="tiny" @click="copyText(rawBase64, '已复制 Base64')">复制 Base64</NButton>
            <NButton v-if="mode === 'svg' && svgOutput" size="tiny" @click="copyText(svgOutput, '已复制压缩结果')">复制 SVG</NButton>
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-3 space-y-3">
          <img v-if="previewSrc" ref="imageEl" :src="previewSrc" class="max-w-full max-h-72 object-contain mx-auto" alt="preview" />
          <p v-else class="text-xs text-slate-400">暂无图片</p>
          <pre v-if="mode === 'toBase64' && rawBase64" class="text-[11px] font-mono break-all whitespace-pre-wrap max-h-40 overflow-auto">{{ rawBase64 }}</pre>
          <pre v-if="mode === 'svg' && svgOutput" class="text-[11px] font-mono break-all whitespace-pre-wrap max-h-60 overflow-auto">{{ svgOutput }}</pre>
        </div>
      </section>
    </div>
  </div>
</template>

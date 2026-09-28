<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NColorPicker, NInput, NInputNumber, NRadioButton, NRadioGroup, useMessage } from 'naive-ui'
import { toCanvas } from 'qrcode'
import { useTabStore } from '@/stores/tabStore'
import { saveBase64File } from '@/utils/fileSave'
import { contrastRatio, normalizeQrOptions, type QrEcc, type QrOptions } from './utils/qrOptions'
import { decodeQr, type QrDecodeResult } from './utils/decodeQr'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

type Mode = 'generate' | 'decode'

const MAX_DECODE_EDGE = 4096
const DEFAULT_SAVE_PATH = '~/Downloads/devutils-qrcode.png'
const ECC_OPTIONS: QrEcc[] = ['L', 'M', 'Q', 'H']

const mode = ref<Mode>(props.initialSnapshot?.mode === 'decode' ? 'decode' : 'generate')
const initialOptions = normalizeQrOptions({
  ecc: props.initialSnapshot?.ecc,
  size: props.initialSnapshot?.size,
  margin: props.initialSnapshot?.margin,
  fg: props.initialSnapshot?.fg,
  bg: props.initialSnapshot?.bg
})
const text = ref<string>(props.initialSnapshot?.text ?? '')
const ecc = ref<QrEcc>(initialOptions.ecc)
const size = ref<number>(initialOptions.size)
const margin = ref<number>(initialOptions.margin)
const fg = ref<string>(initialOptions.fg)
const bg = ref<string>(initialOptions.bg)
const savePath = ref<string>(props.initialSnapshot?.savePath ?? DEFAULT_SAVE_PATH)
const errorMessage = ref<string>('')
const generatedText = ref<string>('')
const decodeResult = ref<QrDecodeResult | null>(null)
const decodeError = ref<string>('')
const previewUrl = ref<string>('')
const canvasEl = ref<HTMLCanvasElement | null>(null)
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const options = computed<QrOptions>(() =>
  normalizeQrOptions({
    ecc: ecc.value,
    size: size.value,
    margin: margin.value,
    fg: fg.value,
    bg: bg.value
  })
)
const lowContrast = computed(() => contrastRatio(options.value.fg, options.value.bg) < 3)

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    mode: mode.value,
    text: text.value,
    ecc: options.value.ecc,
    size: options.value.size,
    margin: options.value.margin,
    fg: options.value.fg,
    bg: options.value.bg,
    savePath: savePath.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

async function generate() {
  const content = text.value
  if (!content) {
    generatedText.value = ''
    errorMessage.value = ''
    return
  }
  if (!canvasEl.value) return
  try {
    await toCanvas(canvasEl.value, content, {
      errorCorrectionLevel: options.value.ecc,
      width: options.value.size,
      margin: options.value.margin,
      color: { dark: options.value.fg, light: options.value.bg }
    })
    generatedText.value = content
    errorMessage.value = ''
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}

function canvasBase64(): string {
  const url = canvasEl.value?.toDataURL('image/png') ?? ''
  const comma = url.indexOf(',')
  return comma >= 0 ? url.slice(comma + 1) : ''
}

async function exportPng() {
  const base64 = canvasBase64()
  if (!base64) {
    errorMessage.value = '请先生成二维码'
    return
  }
  const path = savePath.value.trim()
  if (!path) {
    errorMessage.value = '请填写保存路径'
    return
  }
  try {
    const bytes = await saveBase64File(path, base64)
    errorMessage.value = ''
    message.success(`已保存 ${bytes} 字节到 ${path}`)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}

async function loadImageFile(file: File) {
  decodeError.value = ''
  decodeResult.value = null
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DECODE_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      decodeError.value = '当前环境不支持 Canvas'
      return
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    previewUrl.value = canvas.toDataURL('image/png')
    const imageData = ctx.getImageData(0, 0, width, height)
    const result = decodeQr({ data: imageData.data, width, height })
    if (!result) {
      decodeError.value = '未识别到二维码，试试更清晰或更大的图片'
      return
    }
    decodeResult.value = result
  } catch {
    decodeError.value = '读取图片失败'
  } finally {
    // ImageBitmap 持有原生位图内存，显式释放，避免大图解码后长期占用
    bitmap?.close()
  }
}

function onDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    event.preventDefault()
    loadImageFile(file)
  }
}

function onPaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        event.preventDefault()
        loadImageFile(file)
        return
      }
    }
  }
}

function onPickFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) loadImageFile(file)
  target.value = ''
}

function copyText(value: string, label: string) {
  if (!value) return
  navigator.clipboard.writeText(value)
  message.success(label)
}

function copyDataUrl() {
  copyText(canvasEl.value?.toDataURL('image/png') ?? '', '已复制 DataURL')
}

watch([mode, text, ecc, size, margin, fg, bg, savePath], scheduleSnapshot)
watch([text, ecc, size, margin, fg, bg], () => {
  if (mode.value === 'generate') generate()
})
watch(mode, async value => {
  if (value !== 'generate') return
  await nextTick()
  generate()
})

onMounted(() => {
  if (mode.value === 'generate' && text.value) generate()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">二维码生成与解码</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">文本生成二维码，或粘贴 / 拖入图片解出二维码内容</p>
      </div>
      <NRadioGroup v-model:value="mode" size="small">
        <NRadioButton value="generate">生成</NRadioButton>
        <NRadioButton value="decode">解码</NRadioButton>
      </NRadioGroup>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
      <NAlert v-if="mode === 'generate' && lowContrast" type="warning" :bordered="false">前景与背景对比度过低，扫码可能失败</NAlert>
      <NAlert v-if="decodeError" type="warning" :bordered="false">{{ decodeError }}</NAlert>
    </div>

    <div v-if="mode === 'generate'" class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 gap-3">
        <div class="flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
          <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">内容</div>
          <textarea
            v-model="text"
            class="flex-1 min-h-0 w-full resize-none bg-transparent p-3 text-xs font-mono outline-none"
            placeholder="https://example.com"
          ></textarea>
        </div>

        <div class="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shrink-0 space-y-2 text-xs">
          <div class="flex items-center gap-2">
            <span class="shrink-0">纠错等级</span>
            <NRadioGroup v-model:value="ecc" size="small">
              <NRadioButton v-for="level in ECC_OPTIONS" :key="level" :value="level">{{ level }}</NRadioButton>
            </NRadioGroup>
            <span class="shrink-0 ml-2">尺寸</span>
            <NInputNumber v-model:value="size" size="tiny" class="w-24" :min="128" :max="1024" :step="32" />
            <span class="shrink-0">边距</span>
            <NInputNumber v-model:value="margin" size="tiny" class="w-20" :min="0" :max="8" />
          </div>
          <div class="flex items-center gap-2">
            <span class="shrink-0">前景</span>
            <NColorPicker v-model:value="fg" size="small" :show-alpha="false" />
            <span class="shrink-0">背景</span>
            <NColorPicker v-model:value="bg" size="small" :show-alpha="false" />
          </div>
        </div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">预览与导出</span>
          <div class="flex items-center gap-2">
            <NButton v-if="generatedText" size="tiny" @click="copyDataUrl">复制 DataURL</NButton>
            <NButton v-if="generatedText" size="tiny" type="primary" @click="exportPng">导出 PNG</NButton>
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-3 flex flex-col items-center gap-3">
          <canvas ref="canvasEl" class="max-w-full h-auto border border-slate-200 dark:border-slate-800"></canvas>
          <p v-if="!generatedText" class="text-xs text-slate-400">输入内容后自动生成</p>
          <div class="w-full flex items-center gap-2">
            <span class="text-xs text-slate-500 dark:text-slate-400 shrink-0">保存路径</span>
            <NInput v-model:value="savePath" size="small" class="flex-1" placeholder="~/Downloads/devutils-qrcode.png" />
          </div>
        </div>
      </section>
    </div>

    <div v-else class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 gap-3">
        <div
          class="flex-1 min-h-0 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-2 text-xs text-slate-500"
          tabindex="0"
          @paste="onPaste"
          @drop="onDrop"
          @dragover.prevent
        >
          <span>点这里后按 Ctrl/Cmd+V 粘贴二维码图片，或把图片拖进来</span>
          <label class="text-indigo-600 dark:text-indigo-400 cursor-pointer">
            <input type="file" accept="image/*" class="hidden" @change="onPickFile" />
            或选择本地图片…
          </label>
        </div>
        <div class="shrink-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 flex items-center justify-center min-h-[8rem]">
          <img v-if="previewUrl" :src="previewUrl" class="max-h-32 object-contain" alt="qr-source" />
          <span v-else class="text-xs text-slate-400">暂无图片</span>
        </div>
      </section>

      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span class="text-xs font-medium">解码结果</span>
          <NButton v-if="decodeResult" size="tiny" @click="copyText(decodeResult.text, '已复制解码文本')">复制文本</NButton>
        </div>
        <div class="flex-1 min-h-0 overflow-auto p-3 space-y-3">
          <p v-if="!decodeResult" class="text-xs text-slate-400">尚未解出内容</p>
          <template v-else>
            <pre class="text-xs font-mono break-all whitespace-pre-wrap">{{ decodeResult.text }}</pre>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">版本 {{ decodeResult.version }} · {{ decodeResult.bytes }} 字节</p>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NInputNumber, NSlider, useMessage } from 'naive-ui'
import { useTabStore } from '@/stores/tabStore'
import { hslToRgb, parseColor, rgbToHsl, toHex, toHslString, toRgbString, type Rgba } from './utils/colorConvert'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

const input = ref<string>(props.initialSnapshot?.input ?? '#6366f1')
const recent = ref<string[]>(props.initialSnapshot?.recent ?? [])
const errorMessage = ref<string>('')
const current = ref<Rgba | null>(null)
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window

const hexValue = computed(() => (current.value ? toHex(current.value) : ''))
const rgbValue = computed(() => (current.value ? toRgbString(current.value) : ''))
const hslValue = computed(() => (current.value ? toHslString(current.value) : ''))
const hsl = computed(() => (current.value ? rgbToHsl(current.value) : { h: 0, s: 0, l: 0 }))

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, { input: input.value, recent: [...recent.value] })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function pushRecent(hex: string) {
  const next = [hex, ...recent.value.filter(item => item !== hex)].slice(0, 12)
  recent.value = next
}

function runParse(record = false) {
  const result = parseColor(input.value)
  if (result.error) {
    errorMessage.value = result.error
    return
  }
  errorMessage.value = ''
  current.value = result.value ?? null
  if (record && result.value) pushRecent(toHex(result.value))
}

function applyRgba(next: Rgba) {
  current.value = next
  errorMessage.value = ''
  input.value = toHex(next)
  pushRecent(input.value)
}

function updateChannel(key: 'r' | 'g' | 'b', value: number | null) {
  if (!current.value) return
  applyRgba({ ...current.value, [key]: value ?? 0 })
}

function updateAlpha(value: number) {
  if (!current.value) return
  applyRgba({ ...current.value, a: value / 100 })
}

function updateHsl(key: 'h' | 's' | 'l', value: number | null) {
  if (!current.value) return
  const next = { ...hsl.value, [key]: value ?? 0 }
  applyRgba(hslToRgb(next.h, next.s, next.l, current.value.a))
}

function onNativeColor(event: Event) {
  const value = (event.target as HTMLInputElement).value
  input.value = value
  runParse(true)
}

function copy(text: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success('已复制')
}

async function pickWithEyeDropper() {
  const Ctor = (window as any).EyeDropper
  if (!Ctor) return
  try {
    const result = await new Ctor().open()
    input.value = result.sRGBHex
    runParse(true)
  } catch {
    // 用户取消取色，静默忽略
  }
}

onMounted(() => runParse())

watch(input, () => {
  runParse(true)
  scheduleSnapshot()
})

watch(recent, scheduleSnapshot, { deep: true })
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 shrink-0">
      <h1 class="text-sm font-bold tracking-tight">颜色转换与拾取</h1>
      <p class="text-[11px] text-slate-500 dark:text-slate-400">HEX / RGB / HSL 互转，支持 #RGB、#RRGGBBAA、rgb()、hsl() 与 16 个基础命名色</p>
    </header>

    <div class="flex-1 min-h-0 overflow-auto p-4 space-y-4">
      <div class="flex items-center gap-3">
        <NInput v-model:value="input" class="max-w-md" size="small" placeholder="#6366f1" />
        <input
          type="color"
          class="h-7 w-10 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
          :value="hexValue.slice(0, 7) || '#000000'"
          @input="onNativeColor"
        />
        <NButton v-if="hasEyeDropper" size="small" @click="pickWithEyeDropper">吸管</NButton>
      </div>

      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>

      <div v-if="current" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="space-y-3">
          <div class="h-24 rounded-lg border border-slate-200 dark:border-slate-800" :style="{ backgroundColor: hexValue }"></div>
          <div class="flex items-center gap-2">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">HEX</span>
            <code class="flex-1 text-xs font-mono">{{ hexValue }}</code>
            <NButton size="tiny" @click="copy(hexValue)">复制</NButton>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">RGB</span>
            <code class="flex-1 text-xs font-mono">{{ rgbValue }}</code>
            <NButton size="tiny" @click="copy(rgbValue)">复制</NButton>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">HSL</span>
            <code class="flex-1 text-xs font-mono">{{ hslValue }}</code>
            <NButton size="tiny" @click="copy(hslValue)">复制</NButton>
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">R</span>
            <NSlider class="flex-1" :min="0" :max="255" :value="current.r" @update:value="updateChannel('r', $event)" />
            <NInputNumber class="w-20" size="small" :min="0" :max="255" :value="current.r" @update:value="updateChannel('r', $event)" />
          </div>
          <div class="flex items-center gap-3">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">G</span>
            <NSlider class="flex-1" :min="0" :max="255" :value="current.g" @update:value="updateChannel('g', $event)" />
            <NInputNumber class="w-20" size="small" :min="0" :max="255" :value="current.g" @update:value="updateChannel('g', $event)" />
          </div>
          <div class="flex items-center gap-3">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">B</span>
            <NSlider class="flex-1" :min="0" :max="255" :value="current.b" @update:value="updateChannel('b', $event)" />
            <NInputNumber class="w-20" size="small" :min="0" :max="255" :value="current.b" @update:value="updateChannel('b', $event)" />
          </div>
          <div class="flex items-center gap-3">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">Alpha</span>
            <NSlider class="flex-1" :min="0" :max="100" :value="Math.round(current.a * 100)" @update:value="updateAlpha" />
            <span class="w-20 text-xs text-right">{{ Math.round(current.a * 100) }}%</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">H</span>
            <NSlider class="flex-1" :min="0" :max="360" :value="hsl.h" @update:value="updateHsl('h', $event)" />
            <NInputNumber class="w-20" size="small" :min="0" :max="360" :value="hsl.h" @update:value="updateHsl('h', $event)" />
          </div>
          <div class="flex items-center gap-3">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">S</span>
            <NSlider class="flex-1" :min="0" :max="100" :value="hsl.s" @update:value="updateHsl('s', $event)" />
            <NInputNumber class="w-20" size="small" :min="0" :max="100" :value="hsl.s" @update:value="updateHsl('s', $event)" />
          </div>
          <div class="flex items-center gap-3">
            <span class="w-14 text-xs text-slate-500 dark:text-slate-400">L</span>
            <NSlider class="flex-1" :min="0" :max="100" :value="hsl.l" @update:value="updateHsl('l', $event)" />
            <NInputNumber class="w-20" size="small" :min="0" :max="100" :value="hsl.l" @update:value="updateHsl('l', $event)" />
          </div>
        </div>
      </div>

      <div class="space-y-2">
        <span class="text-xs text-slate-500 dark:text-slate-400">最近使用色</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="item in recent"
            :key="item"
            class="h-7 w-7 rounded border border-slate-300 dark:border-slate-700"
            :style="{ backgroundColor: item }"
            :title="item"
            @click="input = item; runParse(true)"
          ></button>
          <span v-if="!recent.length" class="text-xs text-slate-400">暂无记录</span>
        </div>
      </div>
    </div>
  </div>
</template>

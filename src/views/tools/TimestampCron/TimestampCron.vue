<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  NRadioGroup,
  NRadioButton,
  NInput,
  NSelect,
  NDatePicker,
  NButton,
  NTag,
  NAlert,
  NTable,
  useMessage
} from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { useTabStore } from '@/stores/tabStore'
import {
  TimeUnit,
  convertTimestamp,
  timestampToDate,
  dateToTimestamp,
  formatDateMatrix,
  generateUnixDateCommands,
  explainCronChinese,
  getTimezoneMatrix
} from './utils/timeConverter'

interface CronRunItem {
  timeStr: string
  timestampMs: number
  isDst: boolean
  timezoneAbbr: string
}

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

// --- Top Level Tab Navigation ---
type MainTab = 'timestamp' | 'timezone' | 'cron'
const activeTab = ref<MainTab>(props.initialSnapshot?.activeTab ?? 'timestamp')

// ================= TAB 1: TIMESTAMP CONVERTER & CLOCK =================
// Dynamic Clock State
const clockRunning = ref<boolean>(true)
const currentClockDate = ref<Date>(new Date())
let clockTimer: any = null

function updateClock() {
  if (clockRunning.value) {
    currentClockDate.value = new Date()
  }
}

function toggleClock() {
  clockRunning.value = !clockRunning.value
  if (clockRunning.value) {
    currentClockDate.value = new Date()
  }
}

const currentSeconds = computed(() => Math.floor(currentClockDate.value.getTime() / 1000).toString())
const currentMilliseconds = computed(() => currentClockDate.value.getTime().toString())
const currentNanoseconds = computed(() => `${currentClockDate.value.getTime()}000000`)

// Conversion State
const timestampInput = ref<string>(
  props.initialSnapshot?.timestampInput ?? Date.now().toString()
)
const timestampUnit = ref<TimeUnit>(props.initialSnapshot?.timestampUnit ?? 'ms')
const datePickerValue = ref<number | null>(Date.now())
const conversionError = ref<string>('')
const extraNanoseconds = ref<string>('000000')

const timeUnitOptions = [
  { label: '秒 (s) - 10 位', value: 's' },
  { label: '毫秒 (ms) - 13 位', value: 'ms' },
  { label: '微秒 (μs) - 16 位', value: 'us' },
  { label: '纳秒 (ns) - 19 位', value: 'ns' }
]

// When user edits timestamp input
function onTimestampInputChange() {
  conversionError.value = ''
  if (!timestampInput.value.trim()) {
    datePickerValue.value = null
    extraNanoseconds.value = '000000'
    return
  }
  try {
    const { date, extraNs } = timestampToDate(timestampInput.value, timestampUnit.value)
    datePickerValue.value = date.getTime()
    extraNanoseconds.value = extraNs
  } catch (err: any) {
    conversionError.value = err.message || '无效的时间戳'
    datePickerValue.value = null
  }
}

// When user changes unit
function onUnitChange(newUnit: TimeUnit) {
  if (!timestampInput.value.trim()) {
    timestampUnit.value = newUnit
    return
  }
  try {
    const converted = convertTimestamp(timestampInput.value, timestampUnit.value, newUnit)
    timestampUnit.value = newUnit
    timestampInput.value = converted
    onTimestampInputChange()
  } catch {
    timestampUnit.value = newUnit
  }
}

// When user selects date in DatePicker
function onDatePickerChange(val: number | null) {
  if (val === null || isNaN(val)) {
    timestampInput.value = ''
    extraNanoseconds.value = '000000'
    datePickerValue.value = null
    return
  }
  datePickerValue.value = val
  const d = new Date(val)
  if (isNaN(d.getTime())) {
    timestampInput.value = ''
    datePickerValue.value = null
    return
  }
  const msBig = BigInt(val)
  let baseTs: string
  if (timestampUnit.value === 'ns') {
    const extra = BigInt(extraNanoseconds.value || '0')
    baseTs = (msBig * 1_000_000n + extra).toString()
  } else if (timestampUnit.value === 'us') {
    const extra = BigInt((extraNanoseconds.value || '000').slice(0, 3))
    baseTs = (msBig * 1_000n + extra).toString()
  } else {
    baseTs = dateToTimestamp(d, timestampUnit.value)
  }
  timestampInput.value = baseTs
  conversionError.value = ''
}

// Fill with current time
function fillCurrentTimestamp() {
  const now = new Date()
  datePickerValue.value = now.getTime()
  timestampInput.value = dateToTimestamp(now, timestampUnit.value)
  extraNanoseconds.value = '000000'
  conversionError.value = ''
}

// Derived formats & Unix commands
const derivedDate = computed(() => {
  if (datePickerValue.value === null || isNaN(datePickerValue.value)) return null
  const d = new Date(datePickerValue.value)
  if (isNaN(d.getTime())) return null
  return d
})

const dateFormats = computed(() => {
  if (!derivedDate.value) return null
  return formatDateMatrix(derivedDate.value)
})

const unixCommands = computed(() => {
  if (!derivedDate.value) return null
  const sec = Math.floor(derivedDate.value.getTime() / 1000)
  return generateUnixDateCommands(sec)
})

// ================= TAB 2: TIMEZONE MATRIX =================
const timezoneBaseDate = ref<number | null>(
  props.initialSnapshot?.timezoneBaseDate ?? Date.now()
)

const timezoneList = computed(() => {
  const d = timezoneBaseDate.value ? new Date(timezoneBaseDate.value) : new Date()
  return getTimezoneMatrix(d)
})

function resetTimezoneBaseToNow() {
  timezoneBaseDate.value = Date.now()
}

// ================= TAB 3: CRON PREDICTION =================
const cronPattern = ref<string>(
  props.initialSnapshot?.cronPattern ?? '30 9 * * 1-5'
)
const cronTimezone = ref<string>(
  props.initialSnapshot?.cronTimezone ?? 'Asia/Shanghai'
)
const cronCount = ref<number>(
  props.initialSnapshot?.cronCount ?? 10
)

const cronRuns = ref<CronRunItem[]>([])
const cronError = ref<string>('')
const cronLoading = ref<boolean>(false)

const cronPresets = [
  { label: '每分钟 (* * * * *)', value: '* * * * *' },
  { label: '每小时整点 (0 * * * *)', value: '0 * * * *' },
  { label: '每天凌晨 02:00 (0 2 * * *)', value: '0 2 * * *' },
  { label: '工作日上午 09:30 (30 9 * * 1-5)', value: '30 9 * * 1-5' },
  { label: '每周一 08:00 (0 8 * * 1)', value: '0 8 * * 1' },
  { label: '每月 1 日午夜 (0 0 1 * *)', value: '0 0 1 * *' },
  { label: '工作日 09:30:00 (6 位含秒: 0 30 9 * * 1-5)', value: '0 30 9 * * 1-5' }
]

const timezoneOptions = [
  { label: '北京时间 (Asia/Shanghai, UTC+8)', value: 'Asia/Shanghai' },
  { label: '世界协调时间 (UTC)', value: 'UTC' },
  { label: '纽约时间 (America/New_York, EST/EDT)', value: 'America/New_York' },
  { label: '伦敦时间 (Europe/London, GMT/BST)', value: 'Europe/London' },
  { label: '东京时间 (Asia/Tokyo, JST)', value: 'Asia/Tokyo' },
  { label: '旧金山/洛杉矶 (America/Los_Angeles, PST/PDT)', value: 'America/Los_Angeles' }
]

const cronExplanation = computed(() => {
  return explainCronChinese(cronPattern.value)
})

let cronDebounceTimer: any = null

async function executeCronPrediction() {
  cronError.value = ''
  if (!cronPattern.value.trim()) {
    cronRuns.value = []
    return
  }

  cronLoading.value = true
  try {
    const runs = await invoke<CronRunItem[]>('predict_cron_runs', {
      pattern: cronPattern.value.trim(),
      timezoneStr: cronTimezone.value,
      count: cronCount.value
    })
    cronRuns.value = runs
  } catch (err: any) {
    cronError.value = String(err)
    cronRuns.value = []
  } finally {
    cronLoading.value = false
  }
}

function debouncedPredictCron() {
  if (cronDebounceTimer) clearTimeout(cronDebounceTimer)
  cronDebounceTimer = setTimeout(() => {
    executeCronPrediction()
  }, 200)
}

function selectCronPreset(preset: string) {
  cronPattern.value = preset
}

function formatCountdown(targetMs: number): string {
  const now = currentClockDate.value.getTime()
  const diffMs = targetMs - now
  if (diffMs <= 0) return '已执行 / 正在触发'
  const diffSec = Math.floor(diffMs / 1000)
  const days = Math.floor(diffSec / 86400)
  const hours = Math.floor((diffSec % 86400) / 3600)
  const minutes = Math.floor((diffSec % 3600) / 60)
  const seconds = diffSec % 60

  const parts = []
  if (days > 0) parts.push(`${days} 天`)
  if (hours > 0) parts.push(`${hours} 小时`)
  if (minutes > 0) parts.push(`${minutes} 分钟`)
  if (parts.length === 0 || (days === 0 && hours === 0)) parts.push(`${seconds} 秒`)
  return parts.join(' ') + ' 后'
}

function copyToClipboard(text: string, label = '内容') {
  if (!text) {
    message.warning('无内容可复制')
    return
  }
  navigator.clipboard.writeText(text).then(
    () => message.success(`已复制 ${label} 到剪贴板`),
    () => message.error('复制失败，请手动选择复制')
  )
}

function copyAllCronRuns() {
  if (cronRuns.value.length === 0) {
    message.warning('当前无推演结果')
    return
  }
  const text = cronRuns.value
    .map((r, i) => `${i + 1}. ${r.timeStr} (${r.timezoneAbbr}${r.isDst ? ', DST' : ''}) - ts: ${r.timestampMs}`)
    .join('\n')
  copyToClipboard(text, '全部 Cron 推演列表')
}

// Lifecycle
onMounted(() => {
  clockTimer = setInterval(updateClock, 500)
  onTimestampInputChange()
  executeCronPrediction()
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  if (cronDebounceTimer) clearTimeout(cronDebounceTimer)
})

// Snapshot persistence
const effectiveTabId = computed(() => props.tabId || tabStore.activeTabId)

watch(
  [activeTab, timestampInput, timestampUnit, timezoneBaseDate, cronPattern, cronTimezone, cronCount],
  () => {
    if (!effectiveTabId.value) return
    tabStore.updateTabSnapshot(effectiveTabId.value, {
      activeTab: activeTab.value,
      timestampInput: timestampInput.value,
      timestampUnit: timestampUnit.value,
      timezoneBaseDate: timezoneBaseDate.value,
      cronPattern: cronPattern.value,
      cronTimezone: cronTimezone.value,
      cronCount: cronCount.value
    })
  }
)

watch([cronPattern, cronTimezone, cronCount], () => {
  debouncedPredictCron()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <!-- Top Header & Primary Navigation -->
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h1 class="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
            时间戳、时区与 Cron 中心
          </h1>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">
            19 位纳秒级无损转换、世界时区矩阵与基于 Rust croner + chrono-tz 的夏令时感知 Cron 推演
          </p>
        </div>
      </div>

      <!-- Main Tab Switcher -->
      <NRadioGroup v-model:value="activeTab" size="small">
        <NRadioButton value="timestamp">
          <span class="flex items-center gap-1.5 px-1">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            时间戳与时钟
          </span>
        </NRadioButton>
        <NRadioButton value="timezone">
          <span class="flex items-center gap-1.5 px-1">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
            </svg>
            世界时区对照
          </span>
        </NRadioButton>
        <NRadioButton value="cron">
          <span class="flex items-center gap-1.5 px-1">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Cron 表达式推演
          </span>
        </NRadioButton>
      </NRadioGroup>
    </header>

    <!-- Main Workspace Content -->
    <div class="flex-1 min-h-0 overflow-y-auto p-4">
      <!-- ================= TAB 1: TIMESTAMP CONVERSION & CLOCK ================= -->
      <div v-if="activeTab === 'timestamp'" class="max-w-5xl mx-auto flex flex-col gap-4">
        <!-- Live Real-Time Clock Banner -->
        <div class="bg-white dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-mono font-bold text-lg">
              ⏱
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-slate-400">当前本地时间</span>
                <NTag size="tiny" :type="clockRunning ? 'success' : 'warning'" round>
                  {{ clockRunning ? '运行中' : '已暂停' }}
                </NTag>
              </div>
              <div class="text-xl font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {{ formatDateMatrix(currentClockDate).local }}
              </div>
            </div>
          </div>

          <!-- Fast Copy Current Timestamps -->
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-200/60 dark:border-slate-700">
              <span class="text-[11px] text-slate-400">秒:</span>
              <span class="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{{ currentSeconds }}</span>
              <button
                @click="copyToClipboard(currentSeconds, '秒级时间戳')"
                class="ml-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                title="复制秒"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>

            <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-200/60 dark:border-slate-700">
              <span class="text-[11px] text-slate-400">毫秒:</span>
              <span class="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{{ currentMilliseconds }}</span>
              <button
                @click="copyToClipboard(currentMilliseconds, '毫秒时间戳')"
                class="ml-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                title="复制毫秒"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>

            <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-200/60 dark:border-slate-700">
              <span class="text-[11px] text-slate-400">纳秒:</span>
              <span class="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{{ currentNanoseconds.slice(0, 10) }}...</span>
              <button
                @click="copyToClipboard(currentNanoseconds, '纳秒时间戳')"
                class="ml-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                title="复制完整纳秒"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
            </div>

            <div class="flex items-center gap-2">
              <NButton size="small" secondary @click="toggleClock">
                {{ clockRunning ? '暂停时钟' : '恢复时钟' }}
              </NButton>
              <NButton size="small" type="primary" secondary @click="fillCurrentTimestamp">
                填入转换器
              </NButton>
            </div>
          </div>
        </div>

        <!-- Two-Way Conversion Card -->
        <div class="bg-white dark:bg-slate-800/80 p-5 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm flex flex-col gap-4">
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-3">
            <h2 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>时间戳与日期时间双向转换</span>
              <span class="text-xs font-normal text-slate-400">(BigInt 纳秒级安全运算)</span>
            </h2>
            <div class="flex items-center gap-2">
              <NButton size="tiny" secondary @click="fillCurrentTimestamp">当前时间</NButton>
              <NButton size="tiny" tertiary @click="timestampInput = ''; onTimestampInputChange()">清空</NButton>
            </div>
          </div>

          <!-- Error Alert -->
          <NAlert v-if="conversionError" type="error" closable class="py-1 text-xs">
            {{ conversionError }}
          </NAlert>

          <!-- Input Fields: Timestamp <-> Datetime -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <!-- Left: Timestamp input + unit -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600 dark:text-slate-300">
                时间戳数值 (纯整数字符串 / BigInt)
              </label>
              <div class="flex items-center gap-2">
                <NInput
                  v-model:value="timestampInput"
                  placeholder="例如: 1727000000123456789"
                  class="font-mono text-xs"
                  @update:value="onTimestampInputChange"
                />
                <NSelect
                  :value="timestampUnit"
                  :options="timeUnitOptions"
                  class="w-44 shrink-0"
                  size="small"
                  @update:value="onUnitChange"
                />
              </div>
            </div>

            <!-- Right: Datetime Picker -->
            <div class="flex flex-col gap-1.5">
              <label class="text-xs font-medium text-slate-600 dark:text-slate-300">
                对应本地日期时间 (双向联动)
              </label>
              <NDatePicker
                :value="datePickerValue"
                type="datetime"
                clearable
                class="w-full"
                @update:value="onDatePickerChange"
              />
            </div>
          </div>

          <!-- Nanosecond Extra Lossless Tag -->
          <div
            v-if="(timestampUnit === 'ns' || timestampUnit === 'us') && extraNanoseconds !== '000000'"
            class="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-lg p-2.5 text-xs text-indigo-700 dark:text-indigo-300"
          >
            <span class="font-bold">⚡ 高精度保护生效:</span>
            <span>由于标准 JS Date 仅支持毫秒精度，已将纳秒/微秒尾数 <strong>+{{ extraNanoseconds }} ns</strong> 独立保护，换算流转完全无损。</span>
          </div>

          <!-- Formats Matrix -->
          <div v-if="dateFormats" class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 flex flex-col justify-between gap-1.5">
              <div class="flex items-center justify-between text-xs text-slate-500">
                <span class="font-semibold">ISO 8601</span>
                <button
                  @click="copyToClipboard(dateFormats.iso, 'ISO 8601 格式')"
                  class="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  复制
                </button>
              </div>
              <div class="font-mono text-xs text-slate-800 dark:text-slate-200 break-all select-all">
                {{ dateFormats.iso }}
              </div>
            </div>

            <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 flex flex-col justify-between gap-1.5">
              <div class="flex items-center justify-between text-xs text-slate-500">
                <span class="font-semibold">RFC 2822 / GMT</span>
                <button
                  @click="copyToClipboard(dateFormats.rfc2822, 'RFC 2822 格式')"
                  class="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  复制
                </button>
              </div>
              <div class="font-mono text-xs text-slate-800 dark:text-slate-200 break-all select-all">
                {{ dateFormats.rfc2822 }}
              </div>
            </div>

            <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 flex flex-col justify-between gap-1.5">
              <div class="flex items-center justify-between text-xs text-slate-500">
                <span class="font-semibold">UTC 标准格式</span>
                <button
                  @click="copyToClipboard(dateFormats.utc, 'UTC 格式')"
                  class="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  复制
                </button>
              </div>
              <div class="font-mono text-xs text-slate-800 dark:text-slate-200 break-all select-all">
                {{ dateFormats.utc }}
              </div>
            </div>

            <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 flex flex-col justify-between gap-1.5">
              <div class="flex items-center justify-between text-xs text-slate-500">
                <span class="font-semibold">中文本地格式 (Local)</span>
                <button
                  @click="copyToClipboard(dateFormats.local, '本地格式')"
                  class="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  复制
                </button>
              </div>
              <div class="font-mono text-xs text-slate-800 dark:text-slate-200 break-all select-all">
                {{ dateFormats.local }}
              </div>
            </div>
          </div>

          <!-- Unix Terminal Date Commands -->
          <div v-if="unixCommands" class="mt-2 flex flex-col gap-2">
            <div class="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Unix 终端还原命令 (Terminal Date Commands)
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <!-- macOS -->
              <div class="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-xs flex flex-col gap-1.5 border border-slate-800">
                <div class="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>macOS / BSD 环境</span>
                  <button
                    @click="copyToClipboard(unixCommands.macosFormatted, 'macOS 格式化命令')"
                    class="text-indigo-400 hover:text-indigo-300"
                  >
                    复制格式化命令
                  </button>
                </div>
                <div class="flex items-center justify-between gap-2">
                  <span class="text-emerald-400 select-all">$ {{ unixCommands.macosFormatted }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 text-slate-400 text-[11px]">
                  <span class="select-all">$ {{ unixCommands.macos }}</span>
                  <button
                    @click="copyToClipboard(unixCommands.macos, 'macOS 还原命令')"
                    class="hover:text-slate-200"
                  >
                    复制基础
                  </button>
                </div>
              </div>

              <!-- Linux -->
              <div class="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-xs flex flex-col gap-1.5 border border-slate-800">
                <div class="flex items-center justify-between text-slate-400 text-[11px]">
                  <span>Linux / GNU 环境</span>
                  <button
                    @click="copyToClipboard(unixCommands.linuxFormatted, 'Linux 格式化命令')"
                    class="text-indigo-400 hover:text-indigo-300"
                  >
                    复制格式化命令
                  </button>
                </div>
                <div class="flex items-center justify-between gap-2">
                  <span class="text-emerald-400 select-all">$ {{ unixCommands.linuxFormatted }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 text-slate-400 text-[11px]">
                  <span class="select-all">$ {{ unixCommands.linux }}</span>
                  <button
                    @click="copyToClipboard(unixCommands.linux, 'Linux 还原命令')"
                    class="hover:text-slate-200"
                  >
                    复制基础
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ================= TAB 2: TIMEZONE MATRIX ================= -->
      <div v-else-if="activeTab === 'timezone'" class="max-w-5xl mx-auto flex flex-col gap-4">
        <!-- Timezone Controller -->
        <div class="bg-white dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">基准参照时间:</span>
            <NDatePicker
              v-model:value="timezoneBaseDate"
              type="datetime"
              class="w-64"
            />
            <NButton size="small" secondary @click="resetTimezoneBaseToNow">
              重置为当前时刻
            </NButton>
          </div>
          <div class="text-xs text-slate-400">
            全球主要城市时区与夏令时状态联动推演
          </div>
        </div>

        <!-- Timezone Matrix Grid Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="item in timezoneList"
            :key="item.timezone"
            class="bg-white dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm flex flex-col justify-between gap-3 hover:border-indigo-400/80 transition-colors"
          >
            <div class="flex items-start justify-between">
              <div>
                <div class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {{ item.city }}
                </div>
                <div class="text-[11px] font-mono text-slate-400 mt-0.5">
                  {{ item.timezone }}
                </div>
              </div>
              <div class="flex items-center gap-1.5">
                <NTag size="tiny" :type="item.isDst ? 'warning' : 'default'">
                  {{ item.isDst ? '夏令时 (DST)' : '标准时间' }}
                </NTag>
              </div>
            </div>

            <div class="flex items-baseline justify-between border-t border-slate-100 dark:border-slate-700/60 pt-3">
              <div>
                <div class="text-lg font-mono font-bold text-slate-800 dark:text-slate-100">
                  {{ item.timeStr.slice(11) }}
                </div>
                <div class="text-xs font-mono text-slate-400">
                  {{ item.timeStr.slice(0, 10) }}
                </div>
              </div>

              <div class="text-right">
                <NTag size="small" type="info" :bordered="false" class="font-mono text-xs">
                  {{ item.offsetStr }}
                </NTag>
                <div class="mt-1">
                  <button
                    @click="copyToClipboard(item.timeStr, `${item.city}时间`)"
                    class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    复制时刻
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ================= TAB 3: CRON PREDICTION ================= -->
      <div v-else class="max-w-5xl mx-auto flex flex-col gap-4">
        <!-- Cron Configuration Form -->
        <div class="bg-white dark:bg-slate-800/80 p-5 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm flex flex-col gap-4">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-3">
            <div>
              <h2 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Cron 表达式解析与跨时区未来执行推演</span>
              </h2>
              <p class="text-[11px] text-slate-400 mt-0.5">
                支持 5 位标准格式与 6 位/7 位现代格式（含秒），基于 Rust croner 原生推演引擎
              </p>
            </div>

            <!-- Preset Dropdown -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-500">常用预设:</span>
              <NSelect
                :options="cronPresets"
                placeholder="选择预设规则..."
                size="small"
                class="w-64"
                @update:value="selectCronPreset"
              />
            </div>
          </div>

          <!-- Pattern & Parameters Row -->
          <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            <!-- Pattern Input (6 cols) -->
            <div class="md:col-span-6 flex flex-col gap-1.5">
              <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Cron 表达式
              </label>
              <NInput
                v-model:value="cronPattern"
                placeholder="例如: 30 9 * * 1-5 或 0 30 9 * * 1-5"
                class="font-mono text-sm font-semibold"
              />
            </div>

            <!-- Timezone Select (4 cols) -->
            <div class="md:col-span-4 flex flex-col gap-1.5">
              <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                推演时区 (Timezone)
              </label>
              <NSelect
                v-model:value="cronTimezone"
                :options="timezoneOptions"
              />
            </div>

            <!-- Count (2 cols) -->
            <div class="md:col-span-2 flex flex-col gap-1.5">
              <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">
                推演次数
              </label>
              <NSelect
                v-model:value="cronCount"
                :options="[
                  { label: '未来 5 次', value: 5 },
                  { label: '未来 10 次', value: 10 },
                  { label: '未来 20 次', value: 20 }
                ]"
              />
            </div>
          </div>

          <!-- Natural Language Chinese Explanation Banner -->
          <div class="flex items-center gap-3 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/50 rounded-xl p-3">
            <div class="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
              解
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">
                中文自然语言解读
              </div>
              <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {{ cronExplanation }}
              </div>
            </div>
            <NButton size="small" type="primary" :loading="cronLoading" @click="executeCronPrediction">
              刷新推演
            </NButton>
          </div>

          <!-- Error Alert -->
          <NAlert v-if="cronError" type="error" closable class="py-1 text-xs">
            {{ cronError }}
          </NAlert>
        </div>

        <!-- Prediction Result Table -->
        <div class="bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-sm overflow-hidden flex flex-col">
          <div class="px-4 py-3 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs bg-slate-50/50 dark:bg-slate-800/50">
            <span class="font-bold text-slate-800 dark:text-slate-200">
              未来执行时间预测列表 (共 {{ cronRuns.length }} 次)
            </span>
            <NButton size="tiny" secondary @click="copyAllCronRuns" :disabled="cronRuns.length === 0">
              复制全部推演记录
            </NButton>
          </div>

          <div class="overflow-x-auto">
            <NTable :bordered="false" :single-line="false" size="small">
              <thead>
                <tr>
                  <th class="w-14 text-center">序号</th>
                  <th>预定触发时刻</th>
                  <th>相对倒计时</th>
                  <th>毫秒时间戳</th>
                  <th>时区与夏令时</th>
                  <th class="w-20 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="cronRuns.length === 0">
                  <td colspan="6" class="text-center py-8 text-slate-400 text-xs">
                    {{ cronLoading ? '正在推演计算中...' : '无推演数据，请输入有效的 Cron 表达式' }}
                  </td>
                </tr>
                <tr v-for="(run, idx) in cronRuns" :key="run.timestampMs">
                  <td class="text-center font-mono text-xs text-slate-400">
                    #{{ idx + 1 }}
                  </td>
                  <td class="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {{ run.timeStr }}
                  </td>
                  <td class="text-xs text-slate-500 dark:text-slate-400">
                    {{ formatCountdown(run.timestampMs) }}
                  </td>
                  <td class="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {{ run.timestampMs }}
                  </td>
                  <td>
                    <div class="flex items-center gap-1.5">
                      <span class="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {{ run.timezoneAbbr }}
                      </span>
                      <NTag
                        size="tiny"
                        :type="run.isDst ? 'warning' : 'default'"
                        :bordered="false"
                      >
                        {{ run.isDst ? '夏令时 (DST)' : '标准时间' }}
                      </NTag>
                    </div>
                  </td>
                  <td class="text-center">
                    <button
                      @click="copyToClipboard(run.timeStr, '触发时刻')"
                      class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      复制
                    </button>
                  </td>
                </tr>
              </tbody>
            </NTable>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

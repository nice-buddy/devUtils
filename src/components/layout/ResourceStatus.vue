<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { formatBytes, formatPercent } from '@/utils/metricsFormat'
import { getProcessMetrics } from '@/utils/processMetrics'

defineProps<{ collapsed?: boolean }>()

const POLL_INTERVAL_MS = 2000
const MAX_FAILURES = 2

const cpuPercent = ref<number | null>(null)
const memoryBytes = ref<number | null>(null)
const available = ref(true)
let timer: ReturnType<typeof setInterval> | null = null
let failures = 0

const sample = computed(() => {
  if (cpuPercent.value === null || memoryBytes.value === null) return null
  return {
    cpu: formatPercent(cpuPercent.value),
    memory: formatBytes(memoryBytes.value)
  }
})
const detail = computed(() =>
  sample.value ? `CPU ${sample.value.cpu} · 内存 ${sample.value.memory}` : '统计中…'
)
const cpuText = computed(() => sample.value?.cpu ?? '—')
const memoryText = computed(() => sample.value?.memory ?? '—')
const tooltip = computed(() => `本应用进程占用（CPU 为相对单核的百分比）\n${detail.value}`)

async function poll() {
  try {
    const metrics = await getProcessMetrics()
    cpuPercent.value = metrics.cpuPercent
    memoryBytes.value = metrics.memoryBytes
    failures = 0
  } catch {
    failures += 1
    // 没有 Tauri IPC 的环境（例如浏览器里跑验收）直接隐藏这块状态，避免留下死掉的占位。
    if (failures >= MAX_FAILURES) {
      available.value = false
      stop()
    }
  }
}

function start() {
  if (timer !== null) return
  timer = setInterval(poll, POLL_INTERVAL_MS)
}

function stop() {
  if (timer === null) return
  clearInterval(timer)
  timer = null
}

function onVisibilityChange() {
  if (document.hidden) {
    stop()
    return
  }
  poll()
  start()
}

onMounted(() => {
  poll()
  start()
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  stop()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <div v-if="available" :title="tooltip" class="text-slate-400 select-none tabular-nums">
    <span v-if="!collapsed" class="text-[10px] whitespace-nowrap">{{ detail }}</span>
    <span v-else class="flex flex-col items-center text-[9px] leading-tight whitespace-nowrap">
      <span>{{ cpuText }}</span>
      <span>{{ memoryText }}</span>
    </span>
  </div>
</template>

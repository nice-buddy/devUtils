<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NAlert, NButton, NInput, NRadioButton, NRadioGroup, NSelect, NSwitch, useMessage } from 'naive-ui'
import { useTabStore } from '@/stores/tabStore'
import { convertAll, RADIXES, type Radix } from './utils/radix'
import { convertAllCases } from './utils/caseConvert'
import { DEFAULT_LINE_OPTIONS, processLines, type LineOptions, type SortMode } from './utils/textLines'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

type Panel = 'radix' | 'case' | 'lines'

const panel = ref<Panel>(props.initialSnapshot?.panel ?? 'radix')
const radixInput = ref<string>(props.initialSnapshot?.radix?.input ?? '255')
const radixFrom = ref<Radix>(props.initialSnapshot?.radix?.from ?? 10)
const radixPrefix = ref<boolean>(props.initialSnapshot?.radix?.prefix ?? false)
const radixUpper = ref<boolean>(props.initialSnapshot?.radix?.upper ?? false)
const caseInput = ref<string>(props.initialSnapshot?.caseInput ?? 'devUtils_HTTPClient')
const linesInput = ref<string>(props.initialSnapshot?.lines?.input ?? '')
const lineOptions = ref<LineOptions>({ ...DEFAULT_LINE_OPTIONS, ...(props.initialSnapshot?.lines?.options ?? {}) })
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const radixOptions = RADIXES.map(value => ({ label: `${value} 进制`, value }))
const sortOptions: { label: string; value: SortMode }[] = [
  { label: '保持原序', value: 'none' },
  { label: '升序', value: 'asc' },
  { label: '降序', value: 'desc' }
]

const radixResult = computed(() =>
  convertAll(radixInput.value, radixFrom.value, { prefix: radixPrefix.value, upper: radixUpper.value })
)
// 非法输入只更新错误信息，保留上一次有效的四种进制结果。
const lastRadixValues = ref(radixResult.value.values)
const radixValues = computed(() => (radixResult.value.error ? lastRadixValues.value : radixResult.value.values))
watch(radixResult, value => {
  if (!value.error) lastRadixValues.value = value.values
})
const caseResult = computed(() => convertAllCases(caseInput.value))
const lineResult = computed(() => processLines(linesInput.value, lineOptions.value))

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    panel: panel.value,
    radix: {
      input: radixInput.value,
      from: radixFrom.value,
      prefix: radixPrefix.value,
      upper: radixUpper.value
    },
    caseInput: caseInput.value,
    lines: { input: linesInput.value, options: { ...lineOptions.value } }
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

watch([panel, radixInput, radixFrom, radixPrefix, radixUpper, caseInput, linesInput, lineOptions], scheduleSnapshot, {
  deep: true
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
})

function copyText(text: string) {
  if (!text) return
  navigator.clipboard.writeText(text)
  message.success('已复制')
}
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 flex items-center justify-between shrink-0">
      <div>
        <h1 class="text-sm font-bold tracking-tight">进制与命名风格转换</h1>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">BigInt 无损进制换算、命名风格切换与文本行批处理</p>
      </div>
      <NRadioGroup v-model:value="panel" size="small">
        <NRadioButton value="radix">进制转换</NRadioButton>
        <NRadioButton value="case">命名风格</NRadioButton>
        <NRadioButton value="lines">文本行处理</NRadioButton>
      </NRadioGroup>
    </header>

    <div class="flex-1 min-h-0 overflow-auto p-4 space-y-4">
      <section v-if="panel === 'radix'" class="space-y-3">
        <div class="flex items-center gap-3">
          <NInput v-model:value="radixInput" class="w-72" placeholder="输入数值，支持 0x / 0b / 0o 前缀与下划线" />
          <NSelect v-model:value="radixFrom" class="w-32" :options="radixOptions" />
          <span class="text-xs text-slate-500 dark:text-slate-400">前缀</span>
          <NSwitch v-model:value="radixPrefix" size="small" />
          <span class="text-xs text-slate-500 dark:text-slate-400">十六进制大写</span>
          <NSwitch v-model:value="radixUpper" size="small" />
        </div>
        <NAlert v-if="radixResult.error" type="error" :bordered="false">{{ radixResult.error }}</NAlert>
        <div v-for="radix in RADIXES" :key="radix" class="flex items-center gap-3">
          <span class="w-20 text-xs text-slate-500 dark:text-slate-400">{{ radix }} 进制</span>
          <NInput :value="radixValues[radix]" readonly />
          <NButton size="tiny" @click="copyText(radixValues[radix])">复制</NButton>
        </div>
      </section>

      <section v-else-if="panel === 'case'" class="space-y-3">
        <NInput v-model:value="caseInput" placeholder="输入词组，如 devUtils_HTTPClient" />
        <div v-for="item in caseResult" :key="item.style" class="flex items-center gap-3">
          <span class="w-48 text-xs text-slate-500 dark:text-slate-400">{{ item.label }}</span>
          <NInput :value="item.value" readonly />
          <NButton size="tiny" @click="copyText(item.value)">复制</NButton>
        </div>
      </section>

      <section v-else class="space-y-3">
        <NInput v-model:value="linesInput" type="textarea" :autosize="{ minRows: 6, maxRows: 12 }" placeholder="粘贴待处理的多行文本" />
        <div class="flex flex-wrap items-center gap-4">
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="lineOptions.trimEdge" size="small" />去除行首尾空白</span>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="lineOptions.dropBlank" size="small" />删除空行</span>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="lineOptions.dedupe" size="small" />去重</span>
          <span class="flex items-center gap-2 text-xs"><NSwitch v-model:value="lineOptions.ignoreCase" size="small" />忽略大小写</span>
          <NSelect v-model:value="lineOptions.sort" class="w-32" size="small" :options="sortOptions" />
        </div>
        <div class="flex items-center gap-3">
          <NInput v-model:value="lineOptions.prefix" placeholder="每行前缀" />
          <NInput v-model:value="lineOptions.suffix" placeholder="每行后缀" />
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-slate-500 dark:text-slate-400">{{ lineResult.inputCount }} 行 → {{ lineResult.outputCount }} 行</span>
          <NButton size="tiny" @click="copyText(lineResult.text)">复制结果</NButton>
        </div>
        <NInput :value="lineResult.text" type="textarea" readonly :autosize="{ minRows: 6, maxRows: 14 }" />
      </section>
    </div>
  </div>
</template>

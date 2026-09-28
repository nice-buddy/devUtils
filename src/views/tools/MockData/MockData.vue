<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { NAlert, NButton, NCheckbox, NCheckboxGroup, NInput, NInputNumber, NRadioButton, NRadioGroup, NSwitch, useMessage } from 'naive-ui'
import { customAlphabet } from 'nanoid'
import { useTabStore } from '@/stores/tabStore'
import { DEFAULT_EPOCH, nextSnowflake, type SnowflakeState } from './utils/snowflake'
import { uuidV1, uuidV4, uuidV7 } from './utils/uuid'
import { randomAddress, randomBankCard, randomCompany, randomEmail, randomIdCard, randomName, randomPhone } from './utils/mockData'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

type GenType = 'uuid-v4' | 'uuid-v7' | 'uuid-v1' | 'nanoid' | 'snowflake' | 'mock'

const TYPES: { label: string; value: GenType }[] = [
  { label: 'UUID v4', value: 'uuid-v4' },
  { label: 'UUID v7', value: 'uuid-v7' },
  { label: 'UUID v1', value: 'uuid-v1' },
  { label: 'NanoID', value: 'nanoid' },
  { label: '雪花 ID', value: 'snowflake' },
  { label: 'Mock 数据', value: 'mock' }
]

const MOCK_FIELDS = [
  { label: '姓名', value: 'name' },
  { label: '手机号', value: 'phone' },
  { label: '身份证', value: 'idCard' },
  { label: '邮箱', value: 'email' },
  { label: '地址', value: 'address' },
  { label: '公司名', value: 'company' },
  { label: '银行卡号', value: 'bankCard' }
]

const type = ref<GenType>(props.initialSnapshot?.type ?? 'uuid-v4')
const count = ref<number>(props.initialSnapshot?.count ?? 5)
const nanoidLength = ref<number>(props.initialSnapshot?.nanoidLength ?? 21)
const nanoidAlphabet = ref<string>(props.initialSnapshot?.nanoidAlphabet ?? 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-')
const epoch = ref<string>(props.initialSnapshot?.epoch ?? String(DEFAULT_EPOCH))
const machineId = ref<number>(props.initialSnapshot?.machineId ?? 1)
const splitMachineId = ref<boolean>(props.initialSnapshot?.splitMachineId ?? false)
const fields = ref<string[]>(props.initialSnapshot?.fields ?? ['name', 'phone', 'email'])
const outputFormat = ref<'list' | 'json'>(props.initialSnapshot?.outputFormat ?? 'list')
const uppercase = ref<boolean>(props.initialSnapshot?.uppercase ?? false)
const results = ref<string[]>([])
const errorMessage = ref<string>('')
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    type: type.value,
    count: count.value,
    nanoidLength: nanoidLength.value,
    nanoidAlphabet: nanoidAlphabet.value,
    epoch: epoch.value,
    machineId: machineId.value,
    splitMachineId: splitMachineId.value,
    fields: [...fields.value],
    outputFormat: outputFormat.value,
    uppercase: uppercase.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function mockRow(): Record<string, string> {
  const row: Record<string, string> = {}
  for (const field of fields.value) {
    if (field === 'name') row.name = randomName()
    if (field === 'phone') row.phone = randomPhone()
    if (field === 'idCard') row.idCard = randomIdCard()
    if (field === 'email') row.email = randomEmail()
    if (field === 'address') row.address = randomAddress()
    if (field === 'company') row.company = randomCompany()
    if (field === 'bankCard') row.bankCard = randomBankCard()
  }
  return row
}

function generate() {
  const size = Math.max(1, Math.min(1000, count.value))
  errorMessage.value = ''
  try {
    if (type.value === 'mock') {
      const rows = Array.from({ length: size }, () => mockRow())
      results.value = outputFormat.value === 'json'
        ? [JSON.stringify(rows, null, 2)]
        : rows.map(row => Object.values(row).join('\t'))
      return
    }
    if (type.value === 'snowflake') {
      let epochValue: bigint
      try {
        epochValue = BigInt(epoch.value.trim())
      } catch {
        errorMessage.value = '纪元必须是整数（毫秒）'
        return
      }
      const state: SnowflakeState = { lastTimestamp: 0, sequence: 0 }
      const machine = splitMachineId.value ? (machineId.value & 0x3ff) : (machineId.value & 0x1f)
      const ids: string[] = []
      for (let i = 0; i < size; i += 1) {
        ids.push(String(nextSnowflake(state, machine, epochValue, Date.now())))
      }
      results.value = ids
      return
    }
    if (type.value === 'nanoid') {
      if (!nanoidAlphabet.value) {
        errorMessage.value = '自定义字母表不能为空'
        return
      }
      const length = Math.max(1, Math.min(128, nanoidLength.value))
      const gen = customAlphabet(nanoidAlphabet.value, length)
      results.value = Array.from({ length: size }, () => gen())
      return
    }
    const gen = type.value === 'uuid-v4' ? uuidV4 : type.value === 'uuid-v7' ? uuidV7 : uuidV1
    results.value = Array.from({ length: size }, () => (uppercase.value ? gen().toUpperCase() : gen()))
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : '生成失败'
  }
}

function copyAll() {
  if (!results.value.length) return
  navigator.clipboard.writeText(results.value.join('\n'))
  message.success('已复制')
}

function copyOne(item: string) {
  navigator.clipboard.writeText(item)
  message.success('已复制')
}

watch([type, count, nanoidLength, nanoidAlphabet, epoch, machineId, splitMachineId, fields, outputFormat, uppercase], scheduleSnapshot, { deep: true })

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  saveSnapshot()
})
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 shrink-0">
      <h1 class="text-sm font-bold tracking-tight">UUID / 雪花 ID / Mock 数据</h1>
      <p class="text-[11px] text-slate-500 dark:text-slate-400">crypto.getRandomValues 随机源，生成结果不落库，重开需重新生成</p>
    </header>

    <div class="flex-1 min-h-0 overflow-auto p-4 space-y-4">
      <NRadioGroup v-model:value="type" size="small">
        <NRadioButton v-for="item in TYPES" :key="item.value" :value="item.value">{{ item.label }}</NRadioButton>
      </NRadioGroup>

      <div class="flex flex-wrap items-center gap-4">
        <span class="flex items-center gap-2 text-xs">
          数量
          <NInputNumber v-model:value="count" class="w-24" size="small" :min="1" :max="1000" />
        </span>
        <span v-if="type === 'nanoid'" class="flex items-center gap-2 text-xs">
          长度
          <NInputNumber v-model:value="nanoidLength" class="w-20" size="small" :min="1" :max="128" />
        </span>
        <span v-if="type === 'snowflake'" class="flex items-center gap-2 text-xs">
          机器号
          <NInputNumber v-model:value="machineId" class="w-24" size="small" :min="0" :max="1023" />
          <NSwitch v-model:value="splitMachineId" size="small" />按 5+5 拆分
        </span>
        <span v-if="type === 'uuid-v1' || type === 'uuid-v4' || type === 'uuid-v7'" class="flex items-center gap-2 text-xs">
          <NSwitch v-model:value="uppercase" size="small" />大写
        </span>
        <NButton type="primary" size="small" @click="generate">生成</NButton>
        <NButton size="small" @click="copyAll">复制全部</NButton>
      </div>

      <div v-if="type === 'nanoid'" class="flex items-center gap-2">
        <span class="w-20 text-xs text-slate-500 dark:text-slate-400">字母表</span>
        <NInput v-model:value="nanoidAlphabet" size="small" class="max-w-xl" />
      </div>

      <div v-if="type === 'snowflake'" class="flex items-center gap-2">
        <span class="w-20 text-xs text-slate-500 dark:text-slate-400">纪元</span>
        <NInput v-model:value="epoch" size="small" class="max-w-xs" />
        <span class="text-[11px] text-slate-400">默认 1288834974657（Twitter 纪元）</span>
      </div>

      <div v-if="type === 'mock'" class="space-y-2">
        <div class="flex items-center gap-3">
          <span class="text-xs text-slate-500 dark:text-slate-400">字段</span>
          <NCheckboxGroup v-model:value="fields">
            <NCheckbox v-for="item in MOCK_FIELDS" :key="item.value" :value="item.value">{{ item.label }}</NCheckbox>
          </NCheckboxGroup>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-slate-500 dark:text-slate-400">输出</span>
          <NRadioGroup v-model:value="outputFormat" size="small">
            <NRadioButton value="list">制表符列表</NRadioButton>
            <NRadioButton value="json">JSON 数组</NRadioButton>
          </NRadioGroup>
        </div>
        <p class="text-[11px] text-amber-600 dark:text-amber-400">测试号段与模拟身份证仅供本地测试，请勿用于真实业务。</p>
      </div>

      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>

      <div class="space-y-1">
        <div v-for="(item, index) in results" :key="index" class="flex items-center gap-2">
          <code class="flex-1 text-xs font-mono break-all">{{ item }}</code>
          <NButton size="tiny" @click="copyOne(item)">复制</NButton>
        </div>
        <p v-if="!results.length" class="text-xs text-slate-400">点击「生成」创建数据</p>
      </div>
    </div>
  </div>
</template>

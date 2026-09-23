<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { NAlert, NButton, NCheckbox, NInput, NSwitch, useMessage } from 'naive-ui'
import { useTabStore } from '@/stores/tabStore'
import {
  bitsToOctal,
  bitsToSymbolic,
  DEFAULT_BITS,
  octalToBits,
  symbolicToBits,
  toCommand,
  type PermBits
} from './utils/chmod'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()

const roles = [
  { key: 'owner', label: '属主 u' },
  { key: 'group', label: '属组 g' },
  { key: 'other', label: '其它 o' }
] as const
const permissions = [
  { mask: 4, label: '读 r' },
  { mask: 2, label: '写 w' },
  { mask: 1, label: '执行 x' }
] as const
const specials = [
  { key: 'setuid', label: 'setuid (SUID)' },
  { key: 'setgid', label: 'setgid (SGID)' },
  { key: 'sticky', label: 'sticky (SBIT)' }
] as const

const bits = ref<PermBits>({ ...DEFAULT_BITS, ...(props.initialSnapshot?.bits ?? {}) })
const filePath = ref<string>(props.initialSnapshot?.filePath ?? '')
const recursive = ref<boolean>(props.initialSnapshot?.recursive ?? false)
const octalInput = ref<string>('')
const symbolicInput = ref<string>('')
const octalError = ref<string>('')
const symbolicError = ref<string>('')
let snapshotTimer: ReturnType<typeof setTimeout> | null = null

const octal = computed(() => bitsToOctal(bits.value))
const symbolic = computed(() => bitsToSymbolic(bits.value))
const command = computed(() => toCommand(bits.value, { path: filePath.value, recursive: recursive.value }))

function hasPermission(role: 'owner' | 'group' | 'other', mask: number): boolean {
  return (bits.value[role] & mask) !== 0
}

function togglePermission(role: 'owner' | 'group' | 'other', mask: number, checked: boolean) {
  const current = bits.value[role]
  bits.value = { ...bits.value, [role]: checked ? current | mask : current & ~mask }
}

function commitOctal() {
  const result = octalToBits(octalInput.value)
  if ('error' in result) {
    octalError.value = result.error
    return
  }
  octalError.value = ''
  bits.value = result.bits
}

function commitSymbolic() {
  const result = symbolicToBits(symbolicInput.value)
  if ('error' in result) {
    symbolicError.value = result.error
    return
  }
  symbolicError.value = ''
  bits.value = result.bits
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    bits: { ...bits.value },
    filePath: filePath.value,
    recursive: recursive.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

watch([bits, filePath, recursive], scheduleSnapshot, { deep: true })

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
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 shrink-0">
      <h1 class="text-sm font-bold tracking-tight">Linux chmod 权限计算器</h1>
      <p class="text-[11px] text-slate-500 dark:text-slate-400">权限矩阵、八进制与符号位的双向换算</p>
    </header>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-auto">
      <section class="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
        <div v-for="role in roles" :key="role.key" class="space-y-2">
          <div class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ role.label }}</div>
          <div class="flex items-center gap-4">
            <NCheckbox
              v-for="permission in permissions"
              :key="permission.mask"
              :checked="hasPermission(role.key, permission.mask)"
              @update:checked="checked => togglePermission(role.key, permission.mask, checked)"
            >
              {{ permission.label }}
            </NCheckbox>
          </div>
        </div>
        <div class="flex items-center gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
          <span v-for="item in specials" :key="item.key" class="flex items-center gap-2 text-xs">
            <NSwitch :value="bits[item.key]" size="small" @update:value="value => (bits = { ...bits, [item.key]: value })" />
            {{ item.label }}
          </span>
        </div>
      </section>

      <section class="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div class="space-y-1">
          <span class="text-xs text-slate-500 dark:text-slate-400">数字权限（失焦 / 回车提交）</span>
          <NInput v-model:value="octalInput" placeholder="755 或 4755" @blur="commitOctal" @keyup.enter="commitOctal" />
          <NAlert v-if="octalError" type="error" :bordered="false">{{ octalError }}</NAlert>
        </div>
        <div class="space-y-1">
          <span class="text-xs text-slate-500 dark:text-slate-400">符号权限（失焦 / 回车提交）</span>
          <NInput v-model:value="symbolicInput" placeholder="rwxr-xr-x" @blur="commitSymbolic" @keyup.enter="commitSymbolic" />
          <NAlert v-if="symbolicError" type="error" :bordered="false">{{ symbolicError }}</NAlert>
        </div>
        <div class="flex items-center gap-3">
          <span class="w-20 text-xs text-slate-500 dark:text-slate-400">八进制</span>
          <NInput :value="octal" readonly />
          <NButton size="tiny" @click="copyText(octal)">复制</NButton>
        </div>
        <div class="flex items-center gap-3">
          <span class="w-20 text-xs text-slate-500 dark:text-slate-400">符号位</span>
          <NInput :value="symbolic" readonly />
          <NButton size="tiny" @click="copyText(symbolic)">复制</NButton>
        </div>
        <div class="flex items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <NInput v-model:value="filePath" placeholder="目标路径（可选）" />
          <span class="flex items-center gap-2 text-xs whitespace-nowrap"><NSwitch v-model:value="recursive" size="small" />递归 -R</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="w-20 text-xs text-slate-500 dark:text-slate-400">命令</span>
          <NInput :value="command" readonly />
          <NButton size="tiny" @click="copyText(command)">复制</NButton>
        </div>
      </section>
    </div>
  </div>
</template>

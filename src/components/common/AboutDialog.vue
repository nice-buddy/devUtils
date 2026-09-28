<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NAlert, NButton, NModal, NSpin } from 'naive-ui'
import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_VERSION,
  REPO_NAME,
  REPO_OWNER,
  REPO_URL,
  RELEASES_URL
} from '@/utils/appInfo'
import { fetchLatestRelease, openExternalUrl, type ReleaseInfo } from '@/utils/release'
import { isNewerVersion } from '@/utils/version'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [value: boolean] }>()

type CheckState = 'idle' | 'checking' | 'latest' | 'outdated' | 'no-release' | 'error'

const state = ref<CheckState>('idle')
const release = ref<ReleaseInfo | null>(null)
const errorMessage = ref('')

const visible = computed({
  get: () => props.show,
  set: value => emit('update:show', value)
})

const versionLabel = computed(() => `v${APP_VERSION}`)
const latestTag = computed(() => release.value?.tagName ?? '')
const publishedLabel = computed(() => {
  const raw = release.value?.publishedAt
  if (!raw) return ''
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
})

async function check() {
  state.value = 'checking'
  errorMessage.value = ''
  try {
    const result = await fetchLatestRelease(REPO_OWNER, REPO_NAME)
    if (!result) {
      release.value = null
      state.value = 'no-release'
      return
    }
    release.value = result
    state.value = isNewerVersion(APP_VERSION, result.tagName) ? 'outdated' : 'latest'
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
    state.value = 'error'
  }
}

async function openUrl(url: string) {
  try {
    await openExternalUrl(url)
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
    state.value = 'error'
  }
}

// 打开弹框时自动检查一次更新
watch(
  () => props.show,
  value => {
    if (value) check()
  }
)
</script>

<template>
  <NModal v-model:show="visible" :mask-closable="true">
    <div
      class="w-[540px] max-w-[92vw] rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
    >
      <div class="flex items-start gap-4 p-5">
        <img src="/app-icon.svg" alt="DevUtils" class="w-14 h-14 rounded-xl shadow-sm shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h2 class="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {{ APP_NAME }}
            </h2>
            <span
              class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono text-slate-500 dark:text-slate-400"
            >
              {{ versionLabel }}
            </span>
          </div>
          <p class="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {{ APP_DESCRIPTION }}
          </p>
          <button
            class="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            @click="openUrl(REPO_URL)"
          >
            {{ REPO_URL }}
          </button>
        </div>
      </div>

      <div class="border-t border-slate-200 dark:border-slate-800 px-5 py-4 space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-slate-600 dark:text-slate-300">版本更新</span>
          <NButton size="tiny" :loading="state === 'checking'" @click="check">检查更新</NButton>
        </div>

        <div
          v-if="state === 'checking'"
          class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
        >
          <NSpin :size="14" />
          正在检查更新…
        </div>

        <p v-else-if="state === 'latest'" class="text-xs text-emerald-600 dark:text-emerald-400">
          已是最新版本（{{ latestTag || versionLabel }}）
        </p>

        <p v-else-if="state === 'no-release'" class="text-xs text-slate-500 dark:text-slate-400">
          仓库还没有发布过正式版本
        </p>

        <NAlert v-else-if="state === 'error'" type="error" :bordered="false">
          {{ errorMessage }}
        </NAlert>

        <template v-else-if="state === 'outdated'">
          <p class="text-xs font-medium text-indigo-600 dark:text-indigo-400">
            发现新版本 {{ latestTag }}<span v-if="publishedLabel"> · {{ publishedLabel }}</span>
          </p>
          <pre
            class="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300"
          >{{ release?.body || '（该版本未提供更新说明）' }}</pre>
          <NButton
            size="small"
            type="primary"
            @click="openUrl(release?.htmlUrl || RELEASES_URL)"
          >
            前往 GitHub 下载
          </NButton>
        </template>
      </div>

      <div
        class="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-5 py-3"
      >
        <NButton size="tiny" quaternary @click="openUrl(RELEASES_URL)">全部版本</NButton>
        <NButton size="small" @click="visible = false">关闭</NButton>
      </div>
    </div>
  </NModal>
</template>

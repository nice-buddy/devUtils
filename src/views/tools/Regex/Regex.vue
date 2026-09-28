<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NCheckbox, NCheckboxGroup, NInput, useMessage } from 'naive-ui'
import { EditorView, basicSetup } from 'codemirror'
import { Compartment, EditorState } from '@codemirror/state'
import { useTabStore } from '@/stores/tabStore'
import { useThemeStore } from '@/stores/themeStore'
import { applyReplace, buildSegments, compileRegex, runMatches, type RegexMatch } from './utils/regexTester'
import { REGEX_PRESETS } from './utils/regexPresets'

const props = defineProps<{
  tabId: string
  initialSnapshot?: Record<string, any>
}>()

const message = useMessage()
const tabStore = useTabStore()
const themeStore = useThemeStore()

const AUTO_RUN_MAX_BYTES = 256 * 1024

const pattern = ref<string>(props.initialSnapshot?.pattern ?? '\\d+')
const flags = ref<string[]>(props.initialSnapshot?.flags ?? ['g'])
const testText = ref<string>(props.initialSnapshot?.testText ?? '订单 2026-09-28 金额 1280 元，编号 42')
const replacement = ref<string>(props.initialSnapshot?.replacement ?? '')
const errorMessage = ref<string>('')
const matches = ref<RegexMatch[]>([])
const truncated = ref<boolean>(false)
const manualMode = ref<boolean>(false)
const editorEl = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let runTimer: ReturnType<typeof setTimeout> | null = null

const themeCompartment = new Compartment()

const flagString = computed(() => flags.value.join(''))
const segments = computed(() => buildSegments(testText.value, matches.value))
const replaceOutput = computed(() => {
  const { regex } = compileRegex(pattern.value, flagString.value)
  if (!regex || !replacement.value) return ''
  return applyReplace(testText.value, regex, replacement.value)
})

function getTestText(): string {
  return editorView ? editorView.state.doc.toString() : testText.value
}

function saveSnapshot() {
  tabStore.updateTabSnapshot(props.tabId, {
    pattern: pattern.value,
    flags: [...flags.value],
    testText: getTestText(),
    replacement: replacement.value
  })
}

function scheduleSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(saveSnapshot, 250)
}

function run() {
  const { regex, error } = compileRegex(pattern.value, flagString.value)
  if (error) {
    errorMessage.value = error
    matches.value = []
    truncated.value = false
    return
  }
  errorMessage.value = ''
  const result = runMatches(getTestText(), regex as RegExp)
  matches.value = result.matches
  truncated.value = result.truncated
}

function scheduleRun() {
  manualMode.value = getTestText().length > AUTO_RUN_MAX_BYTES
  if (manualMode.value) return
  if (runTimer) clearTimeout(runTimer)
  runTimer = setTimeout(run, 250)
}

function handleDocChange() {
  testText.value = getTestText()
  scheduleSnapshot()
  scheduleRun()
}

function loadPreset(index: number) {
  const preset = REGEX_PRESETS[index]
  if (!preset) return
  pattern.value = preset.pattern
  flags.value = preset.flags.split('')
  if (editorView) {
    editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: preset.sample } })
    testText.value = preset.sample
  }
  run()
  saveSnapshot()
}

function copyReplaceOutput() {
  if (!replaceOutput.value) return
  navigator.clipboard.writeText(replaceOutput.value)
  message.success('已复制')
}

function getEditorTheme(isDark: boolean) {
  return EditorView.theme(
    {
      '&': { height: '100%', fontSize: '13px', backgroundColor: isDark ? '#090d16' : '#ffffff', color: isDark ? '#e2e8f0' : '#1e293b' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', lineHeight: '1.6' },
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
        doc: testText.value,
        extensions: [
          basicSetup,
          themeCompartment.of(getEditorTheme(themeStore.isDark)),
          EditorView.updateListener.of(update => {
            if (update.docChanged) handleDocChange()
          })
        ]
      }),
      parent: editorEl.value
    })
  }
  run()
})

onBeforeUnmount(() => {
  if (snapshotTimer) clearTimeout(snapshotTimer)
  if (runTimer) clearTimeout(runTimer)
  saveSnapshot()
  editorView?.destroy()
  editorView = null
})

watch([pattern, flags], () => {
  run()
  scheduleSnapshot()
}, { deep: true })

watch(replacement, scheduleSnapshot)

watch(
  () => themeStore.isDark,
  dark => {
    if (editorView) editorView.dispatch({ effects: themeCompartment.reconfigure(getEditorTheme(dark)) })
  }
)
</script>

<template>
  <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 overflow-hidden">
    <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 px-4 py-2 shrink-0 space-y-2">
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-400">/</span>
        <NInput v-model:value="pattern" size="small" class="flex-1" placeholder="正则表达式" />
        <span class="text-xs text-slate-400">/{{ flagString }}</span>
        <NButton v-if="manualMode" size="small" type="primary" @click="run">运行</NButton>
      </div>
      <div class="flex items-center gap-3">
        <NCheckboxGroup v-model:value="flags" size="small">
          <NCheckbox v-for="flag in ['g', 'i', 'm', 's', 'u', 'y']" :key="flag" :value="flag">{{ flag }}</NCheckbox>
        </NCheckboxGroup>
        <span class="text-xs text-slate-400">{{ matches.length }} 个匹配<span v-if="truncated">（已截断到上限）</span></span>
      </div>
    </header>

    <div class="px-4 pt-3 shrink-0 space-y-2">
      <NAlert v-if="errorMessage" type="error" :bordered="false">{{ errorMessage }}</NAlert>
      <NAlert v-if="manualMode" type="warning" :bordered="false">测试文本超过 256KB，已关闭自动运行，请手动点击「运行」。</NAlert>
    </div>

    <div class="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3">
      <section class="flex flex-col min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
        <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">测试文本</div>
        <div ref="editorEl" class="flex-1 min-h-0 overflow-hidden"></div>
        <div class="border-t border-slate-200 dark:border-slate-800 p-2 space-y-2 shrink-0">
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-500 dark:text-slate-400 shrink-0">替换为</span>
            <NInput v-model:value="replacement" size="tiny" placeholder="支持 $1 / $& / $$ / $<name>" />
            <NButton size="tiny" @click="copyReplaceOutput">复制结果</NButton>
          </div>
          <pre class="max-h-24 overflow-auto text-xs font-mono whitespace-pre-wrap">{{ replaceOutput }}</pre>
        </div>
      </section>

      <section class="flex flex-col min-h-0 gap-3">
        <div class="flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 flex flex-col">
          <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">高亮预览</div>
          <div class="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono whitespace-pre-wrap break-all">
            <span
              v-for="(segment, index) in segments"
              :key="index"
              :class="segment.matchIndex >= 0 ? 'bg-amber-200/70 dark:bg-amber-500/30 text-amber-900 dark:text-amber-100 rounded-sm' : ''"
            >{{ segment.text }}</span>
          </div>
        </div>

        <div class="h-2/5 min-h-0 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 flex flex-col">
          <div class="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 text-xs font-medium">匹配明细</div>
          <div class="flex-1 min-h-0 overflow-auto p-2 space-y-1">
            <div v-for="(match, index) in matches" :key="index" class="text-xs border-b border-slate-100 dark:border-slate-800 pb-1">
              <div class="flex items-center gap-2">
                <span class="text-slate-400">#{{ index + 1 }}</span>
                <span class="text-slate-400">@{{ match.index }}</span>
                <code class="font-mono break-all">{{ match.value || '(空匹配)' }}</code>
              </div>
              <div v-for="group in match.groups" :key="`${index}-${group.index}-${group.name ?? ''}`" class="pl-4 text-slate-500 dark:text-slate-400">
                {{ group.name ? `$${group.name}` : `$${group.index}` }} = <code class="font-mono">{{ group.value ?? '(未匹配)' }}</code>
              </div>
            </div>
            <p v-if="!matches.length" class="text-xs text-slate-400">暂无匹配</p>
          </div>
        </div>

        <div class="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shrink-0">
          <div class="text-xs font-medium mb-1">内置规则库</div>
          <div class="flex flex-wrap gap-1">
            <NButton v-for="(preset, index) in REGEX_PRESETS" :key="preset.name" size="tiny" @click="loadPreset(index)">
              {{ preset.name }}
            </NButton>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

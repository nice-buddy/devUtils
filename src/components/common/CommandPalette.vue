<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { TOOLS, ToolDefinition, getCategoryMeta } from '@/types/tool'
import { useTabStore } from '@/stores/tabStore'
import { useCommandPalette } from '@/composables/useCommandPalette'

const tabStore = useTabStore()
const { isCommandPaletteOpen, close } = useCommandPalette()

const searchQuery = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLDivElement | null>(null)

const filteredTools = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) {
    // When query is empty, prioritize MVP tools, then others
    return [...TOOLS].sort((a, b) => (b.isMvp ? 1 : 0) - (a.isMvp ? 1 : 0))
  }
  return TOOLS.filter(tool => {
    return (
      tool.name.toLowerCase().includes(q) ||
      tool.id.toLowerCase().includes(q) ||
      tool.description.toLowerCase().includes(q) ||
      tool.category.toLowerCase().includes(q) ||
      tool.keywords?.some(k => k.toLowerCase().includes(q))
    )
  })
})

watch(filteredTools, () => {
  selectedIndex.value = 0
})

watch(isCommandPaletteOpen, (open) => {
  if (open) {
    searchQuery.value = ''
    selectedIndex.value = 0
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
})

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (isCommandPaletteOpen.value) {
      close()
    } else {
      isCommandPaletteOpen.value = true
    }
  } else if (e.key === 'Escape' && isCommandPaletteOpen.value) {
    e.preventDefault()
    close()
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (!isCommandPaletteOpen.value) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (filteredTools.value.length > 0) {
      selectedIndex.value = (selectedIndex.value + 1) % filteredTools.value.length
      scrollToSelected()
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (filteredTools.value.length > 0) {
      selectedIndex.value = (selectedIndex.value - 1 + filteredTools.value.length) % filteredTools.value.length
      scrollToSelected()
    }
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (filteredTools.value[selectedIndex.value]) {
      selectTool(filteredTools.value[selectedIndex.value])
    }
  }
}

function scrollToSelected() {
  nextTick(() => {
    if (!listRef.value) return
    const activeEl = listRef.value.children[selectedIndex.value] as HTMLElement | undefined
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  })
}

function selectTool(tool: ToolDefinition) {
  tabStore.openTab(tool.id, tool.name)
  close()
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isCommandPaletteOpen"
      class="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-slate-900/50 backdrop-blur-sm transition-opacity"
      @click.self="close"
    >
      <div
        class="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[70vh] animate-in fade-in zoom-in-95 duration-150"
        @keydown="handleKeyDown"
      >
        <!-- Search Input Bar -->
        <div class="flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800 gap-3">
          <svg class="w-5 h-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref="inputRef"
            v-model="searchQuery"
            type="text"
            class="flex-1 bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none text-base font-normal"
            placeholder="搜索工具名称、功能或拼音关键字..."
          />
          <kbd class="px-2 py-0.5 text-xs font-mono font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
            ESC
          </kbd>
        </div>

        <!-- Tool Results List -->
        <div
          ref="listRef"
          class="flex-1 overflow-y-auto p-2 space-y-1"
        >
          <div
            v-for="(tool, index) in filteredTools"
            :key="tool.id"
            @click="selectTool(tool)"
            @mouseenter="selectedIndex = index"
            :class="[
              'flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-left',
              selectedIndex === index
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            ]"
          >
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <div
                :class="[
                  'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0',
                  selectedIndex === index
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                ]"
              >
                {{ tool.name.slice(0, 1) }}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
                    {{ tool.name }}
                  </span>
                  <span
                    v-if="tool.isMvp"
                    class="px-1.5 py-0.2 text-[10px] font-bold rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 shrink-0"
                  >
                    MVP
                  </span>
                </div>
                <div class="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {{ tool.description }}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0 ml-3">
              <span class="text-xs text-slate-400 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                {{ getCategoryMeta(tool.category)?.name || tool.category }}
              </span>
              <span
                v-if="selectedIndex === index"
                class="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-medium"
              >
                ↵ 打开
              </span>
            </div>
          </div>

          <div
            v-if="filteredTools.length === 0"
            class="py-12 text-center text-sm text-slate-400"
          >
            没有找到与 “{{ searchQuery }}” 匹配的工具
          </div>
        </div>

        <!-- Footer Shortcuts -->
        <div class="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between text-xs text-slate-400">
          <div class="flex items-center gap-4">
            <span><kbd class="font-mono bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">↑↓</kbd> 切换选项</span>
            <span><kbd class="font-mono bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">↵</kbd> 打开新实例</span>
            <span><kbd class="font-mono bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">ESC</kbd> 关闭</span>
          </div>
          <span class="text-slate-400 font-medium">DevUtils 快速命令</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

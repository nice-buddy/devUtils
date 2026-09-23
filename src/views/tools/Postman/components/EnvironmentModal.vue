<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import { nanoid } from 'nanoid'
import type { KeyValueItem } from '../types'

export interface HttpEnvironment {
  id: string
  name: string
  variables: KeyValueItem[]
  isActive: boolean
}

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'change', activeVars: KeyValueItem[], activeEnvName: string): void
}>()

const message = useMessage()
const environments = ref<HttpEnvironment[]>([])
const selectedEnvId = ref<string>('')
const loading = ref(false)

async function loadEnvironments() {
  loading.value = true
  try {
    const rows = await invoke<any[]>('db_query', {
      query: 'SELECT id, name, variables_json, is_active FROM http_environments ORDER BY created_at ASC',
      params: []
    })

    if (rows && rows.length > 0) {
      environments.value = rows.map((r) => {
        let vars: KeyValueItem[] = []
        try {
          vars = JSON.parse(r.variables_json)
        } catch {
          vars = []
        }
        return {
          id: r.id,
          name: r.name,
          variables: vars,
          isActive: r.is_active === 1
        }
      })
    } else {
      // 默认初始化一套基础环境
      const defaultId = `env_${nanoid(8)}`
      const defaultVars: KeyValueItem[] = [
        { key: 'baseUrl', value: 'https://httpbin.org', enabled: true }
      ]
      await invoke('db_execute', {
        query: 'INSERT INTO http_environments (id, name, variables_json, is_active, created_at) VALUES (?1, ?2, ?3, 1, ?4)',
        params: [defaultId, '开发测试环境', JSON.stringify(defaultVars), Date.now()]
      })
      environments.value = [
        {
          id: defaultId,
          name: '开发测试环境',
          variables: defaultVars,
          isActive: true
        }
      ]
    }

    const activeEnv = environments.value.find((e) => e.isActive) || environments.value[0]
    if (activeEnv) {
      selectedEnvId.value = activeEnv.id
      emitActive(activeEnv)
    }
  } catch {
    // 离线/测试环境降级容错
    if (environments.value.length === 0) {
      environments.value = [
        {
          id: 'env_default',
          name: '默认离线环境',
          variables: [{ key: 'baseUrl', value: 'https://httpbin.org', enabled: true }],
          isActive: true
        }
      ]
      selectedEnvId.value = 'env_default'
      emitActive(environments.value[0])
    }
  } finally {
    loading.value = false
  }
}

function emitActive(env: HttpEnvironment) {
  emit('change', env.variables.filter((v) => v.enabled && v.key.trim()), env.name)
}

const currentEnv = ref<HttpEnvironment | null>(null)

watch(
  [selectedEnvId, environments],
  () => {
    currentEnv.value = environments.value.find((e) => e.id === selectedEnvId.value) || null
  },
  { deep: true, immediate: true }
)

watch(
  () => props.show,
  (val) => {
    if (val) {
      loadEnvironments()
    }
  }
)

function addVariable() {
  if (!currentEnv.value) return
  currentEnv.value.variables.push({ key: '', value: '', enabled: true })
}

function removeVariable(idx: number) {
  if (!currentEnv.value) return
  currentEnv.value.variables.splice(idx, 1)
}

async function addEnvironment() {
  const newId = `env_${nanoid(8)}`
  const newEnv: HttpEnvironment = {
    id: newId,
    name: `新环境 ${environments.value.length + 1}`,
    variables: [{ key: 'baseUrl', value: 'http://localhost:3000', enabled: true }],
    isActive: false
  }
  environments.value.push(newEnv)
  selectedEnvId.value = newId

  try {
    await invoke('db_execute', {
      query: 'INSERT INTO http_environments (id, name, variables_json, is_active, created_at) VALUES (?1, ?2, ?3, 0, ?4)',
      params: [newId, newEnv.name, JSON.stringify(newEnv.variables), Date.now()]
    })
    message.success('已新建环境')
  } catch {
    // ignore
  }
}

async function deleteEnvironment(id: string) {
  if (environments.value.length <= 1) {
    message.warning('至少保留一套环境配置')
    return
  }

  const idx = environments.value.findIndex((e) => e.id === id)
  if (idx === -1) return
  const isDeletedActive = environments.value[idx].isActive
  environments.value.splice(idx, 1)

  try {
    await invoke('db_execute', {
      query: 'DELETE FROM http_environments WHERE id = ?1',
      params: [id]
    })
  } catch {
    // ignore
  }

  if (isDeletedActive || selectedEnvId.value === id) {
    const nextEnv = environments.value[0]
    selectedEnvId.value = nextEnv.id
    await setActiveEnvironment(nextEnv.id)
  }
  message.success('已删除环境')
}

async function setActiveEnvironment(id: string) {
  for (const env of environments.value) {
    env.isActive = env.id === id
  }
  selectedEnvId.value = id

  try {
    await invoke('db_execute', {
      query: 'UPDATE http_environments SET is_active = CASE WHEN id = ?1 THEN 1 ELSE 0 END',
      params: [id]
    })
  } catch {
    // ignore
  }

  const active = environments.value.find((e) => e.id === id)
  if (active) {
    emitActive(active)
    message.success(`已切换活跃环境为: ${active.name}`)
  }
}

async function saveCurrentEnvironment() {
  if (!currentEnv.value) return
  try {
    await invoke('db_execute', {
      query: 'UPDATE http_environments SET name = ?1, variables_json = ?2 WHERE id = ?3',
      params: [
        currentEnv.value.name,
        JSON.stringify(currentEnv.value.variables),
        currentEnv.value.id
      ]
    })
    if (currentEnv.value.isActive) {
      emitActive(currentEnv.value)
    }
    message.success('环境配置保存成功')
  } catch {
    message.error('保存环境配置失败')
  }
}

onMounted(() => {
  loadEnvironments()
})
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
    @click.self="emit('update:show', false)"
  >
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-200"
    >
      <!-- Modal Header -->
      <div class="h-12 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-950">
        <div class="flex items-center gap-2">
          <span class="w-6 h-6 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
            🌱
          </span>
          <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">Postman 环境变量管理器</h3>
        </div>
        <button
          @click="emit('update:show', false)"
          class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm p-1 rounded"
        >
          ✕
        </button>
      </div>

      <!-- Modal Body (Two columns: Environments list & Variables table) -->
      <div class="flex-1 min-h-0 flex overflow-hidden">
        <!-- Left: Environment List -->
        <div class="w-56 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-slate-950/50 shrink-0">
          <div class="p-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-500">环境列表</span>
            <button
              @click="addEnvironment"
              class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
            >
              + 新增
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-1.5 space-y-1">
            <div
              v-for="env in environments"
              :key="env.id"
              @click="selectedEnvId = env.id"
              :class="[
                'px-2.5 py-2 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors group',
                selectedEnvId === env.id
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
              ]"
            >
              <div class="flex items-center gap-1.5 truncate">
                <span
                  v-if="env.isActive"
                  class="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
                  title="当前活跃生效的环境"
                ></span>
                <span v-else class="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0"></span>
                <span class="truncate">{{ env.name }}</span>
              </div>

              <div class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  v-if="!env.isActive"
                  @click.stop="setActiveEnvironment(env.id)"
                  class="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline"
                  title="切换为当前发送请求时生效的环境"
                >
                  激活
                </button>
                <button
                  @click.stop="deleteEnvironment(env.id)"
                  class="text-[10px] text-rose-500 hover:underline ml-1"
                  title="删除此环境"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Variables Editor -->
        <div v-if="currentEnv" class="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">
          <div class="h-10 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/30 dark:bg-slate-950/30">
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-400">环境名称:</span>
              <input
                v-model="currentEnv.name"
                class="bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 text-xs font-semibold focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-200 px-1 py-0.5"
              />
            </div>
            <div class="flex items-center gap-2">
              <button
                v-if="!currentEnv.isActive"
                @click="setActiveEnvironment(currentEnv.id)"
                class="px-2 py-1 rounded text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 font-medium"
              >
                设为生效环境
              </button>
              <span v-else class="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                生效中
              </span>
            </div>
          </div>

          <!-- Variables Table -->
          <div class="flex-1 overflow-auto p-4">
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
              在请求 URL、Headers 与 Body 中使用 <code v-pre class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-indigo-600 dark:text-indigo-400">{{变量名}}</code> 即可自动插值。
            </p>

            <div class="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table class="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th class="w-8 py-2 px-2 text-center"></th>
                    <th class="w-1/3 py-2 px-3 border-r border-slate-200 dark:border-slate-800">变量名 (Key)</th>
                    <th class="py-2 px-3">当前变量值 (Value)</th>
                    <th class="w-10 py-2 px-2 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(item, idx) in currentEnv.variables"
                    :key="idx"
                    class="border-b border-slate-100 dark:border-slate-900/60 hover:bg-slate-50/50 dark:hover:bg-slate-900/30"
                  >
                    <td class="py-1.5 px-2 text-center">
                      <input
                        type="checkbox"
                        v-model="item.enabled"
                        class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td class="py-1 px-3 border-r border-slate-200 dark:border-slate-800">
                      <input
                        v-model="item.key"
                        type="text"
                        placeholder="例如 baseUrl"
                        class="w-full bg-transparent outline-none text-slate-800 dark:text-slate-200"
                      />
                    </td>
                    <td class="py-1 px-3">
                      <input
                        v-model="item.value"
                        type="text"
                        placeholder="例如 https://api.example.com"
                        class="w-full bg-transparent outline-none text-slate-800 dark:text-slate-200"
                      />
                    </td>
                    <td class="py-1 px-2 text-center">
                      <button
                        @click="removeVariable(idx)"
                        class="text-slate-400 hover:text-rose-500 transition-colors"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="mt-2.5">
              <button
                @click="addVariable"
                class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
              >
                + 添加变量
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="h-12 px-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5 shrink-0 bg-slate-50 dark:bg-slate-950">
        <button
          @click="emit('update:show', false)"
          class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
        >
          关闭
        </button>
        <button
          @click="saveCurrentEnvironment"
          class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors"
        >
          保存配置
        </button>
      </div>
    </div>
  </div>
</template>

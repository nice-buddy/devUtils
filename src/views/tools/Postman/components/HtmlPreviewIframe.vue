<template>
  <div class="w-full h-full relative overflow-hidden bg-white">
    <iframe
      class="w-full h-full border-none bg-white"
      sandbox=""
      :srcdoc="safeHtmlContent"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ content: string }>()
const safeHtmlContent = computed(() => props.content || '')
</script>

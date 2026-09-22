import { ref } from 'vue'

const isCommandPaletteOpen = ref(false)

export function useCommandPalette() {
  function open() {
    isCommandPaletteOpen.value = true
  }

  function close() {
    isCommandPaletteOpen.value = false
  }

  function toggle() {
    isCommandPaletteOpen.value = !isCommandPaletteOpen.value
  }

  return {
    isCommandPaletteOpen,
    open,
    close,
    toggle
  }
}

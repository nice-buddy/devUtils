import { configDefaults, defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true
  },
  test: {
    // CI tier: heavy local benchmarks under tests/manual run via `npm run test:benchmark`.
    exclude: [...configDefaults.exclude, 'tests/manual/**']
  }
})

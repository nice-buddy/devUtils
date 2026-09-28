import { readFileSync } from 'node:fs'
import { configDefaults, defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// 版本号从 package.json 注入，发布流程会在构建前用 tag 覆盖它
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, './package.json'), 'utf-8'))

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
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

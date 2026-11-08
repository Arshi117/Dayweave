import { resolve } from 'node:path'
import { defineConfig, mergeConfig } from 'vite'
import { rendererConfig } from './electron.vite.config'

export default defineConfig(mergeConfig(rendererConfig, {
  root: resolve(__dirname, 'src/renderer'),
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
}))

import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { readdirSync, readFileSync } from 'node:fs'
import type { Plugin, UserConfig } from 'vite'

// Some Chinese teaching-system PDFs refer to standard CJK fonts instead of
// embedding them. Keep PDF.js character maps and font resources fully offline.
const pdfAssetRoot = resolve(__dirname, 'node_modules/pdfjs-dist')
const pdfResourcePlugin: Plugin = {
  name: 'dayweave-pdf-resources',
  generateBundle() {
    for (const directory of ['cmaps', 'standard_fonts', 'wasm']) for (const file of readdirSync(resolve(pdfAssetRoot, directory), { withFileTypes: true })) {
      if (file.isFile()) this.emitFile({ type: 'asset', fileName: 'pdfjs/' + directory + '/' + file.name, source: readFileSync(resolve(pdfAssetRoot, directory, file.name)) })
    }
  },
  configureServer(server) {
    server.middlewares.use('/pdfjs', (req, res, next) => {
      const match = /^\/(cmaps|standard_fonts|wasm)\/([a-zA-Z0-9_.-]+)$/.exec((req.url || '').split('?')[0])
      if (!match || match[2].startsWith('.')) { next(); return }
      try { const bytes = readFileSync(resolve(pdfAssetRoot, match[1], match[2])); res.setHeader('Content-Type', match[2].endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'); res.end(bytes) }
      catch { next() }
    })
  },
}

export const rendererConfig: UserConfig = {
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  resolve: { alias: { '@renderer': resolve(__dirname, 'src/renderer/src') } },
  plugins: [react(), pdfResourcePlugin],
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['node-ical'] })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: rendererConfig,
})

import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const library = JSON.parse(readFileSync(new URL('./registry/pid/library.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __SYMBOL_COUNT__: library.symbols.length },
  server: { port: 5190 },
  build: { chunkSizeWarningLimit: 2000 },
})

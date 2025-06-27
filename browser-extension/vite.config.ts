import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [
    vue(),
    crx({ manifest }),
  ],
  build: {
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        content: 'src/content/index.ts',
        background: 'src/background.ts',
      },
    },
  },
  server: {
    port: 3000,
    hmr: {
      port: 3001,
    },
  },
})
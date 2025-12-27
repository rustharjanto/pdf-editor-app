// Ganti isi vite.config.js dengan:
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/pdf-editor-app/',  // NAMA REPOSITORY ANDA
  build: {
    target: 'esnext',
    rollupOptions: {
      input: './index.html'
    },
    outDir: 'dist'
  },
  server: {
    port: 5173,
    host: 'localhost',
    hmr: {
      protocol: 'ws',
      host: 'localhost'
    },
    open: true
  }
})
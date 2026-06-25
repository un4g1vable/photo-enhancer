import { defineConfig } from 'vite'

// base задаётся через переменную окружения при сборке под GitHub Pages
// (например: BASE=/photo-enhancer/ npm run build). По умолчанию — относительный путь.
export default defineConfig({
  base: process.env.BASE || '/',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
  worker: {
    format: 'es',
  },
})

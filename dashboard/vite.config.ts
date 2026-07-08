import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Собираем прямо в ../docs — оттуда раздаёт GitHub Pages.
export default defineConfig({
  base: './', // относительные пути — работают и на GitHub Pages, и при локальной проверке
  plugins: [react()],
  build: { outDir: '../docs', emptyOutDir: true },
})

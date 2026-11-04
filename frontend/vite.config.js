import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@campaign-sheet': fileURLToPath(new URL('../shared/campaignSpreadsheet.js', import.meta.url)),
    },
  },
  server: { fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  optimizeDeps: {
    include: [
      'react',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      '@tanstack/react-query',
      'motion/react',
      'react-day-picker',
    ],
  },
})

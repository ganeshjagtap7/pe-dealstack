import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: '.',
  server: {
    port: 3000,
    open: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        pricing: resolve(__dirname, 'pricing.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        crm: resolve(__dirname, 'crm.html'),
        deal: resolve(__dirname, 'deal.html'),
        vdr: resolve(__dirname, 'vdr.html'),
      },
    },
  },
})

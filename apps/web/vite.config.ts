import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'fs'

// Plugin to copy static js files after build
function copyStaticFiles() {
  return {
    name: 'copy-static-files',
    closeBundle() {
      const jsDir = resolve(__dirname, 'js')
      const distJsDir = resolve(__dirname, 'dist/js')

      if (existsSync(jsDir)) {
        mkdirSync(distJsDir, { recursive: true })
        readdirSync(jsDir).forEach(file => {
          if (file.endsWith('.js')) {
            copyFileSync(resolve(jsDir, file), resolve(distJsDir, file))
          }
        })
        console.log('Copied js/ folder to dist/js/')
      }

      // Also copy standalone JS files from root
      const rootFiles = ['dashboard.js', 'deal.js', 'memo-builder.js']
      rootFiles.forEach(file => {
        const src = resolve(__dirname, file)
        if (existsSync(src)) {
          copyFileSync(src, resolve(__dirname, 'dist', file))
          console.log(`Copied ${file} to dist/`)
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), copyStaticFiles()],
  root: '.',
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        landingpage: resolve(__dirname, 'landingpage.html'),
        pricing: resolve(__dirname, 'pricing.html'),
        login: resolve(__dirname, 'login.html'),
        signup: resolve(__dirname, 'signup.html'),
        'forgot-password': resolve(__dirname, 'forgot-password.html'),
        'reset-password': resolve(__dirname, 'reset-password.html'),
        'verify-email': resolve(__dirname, 'verify-email.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        crm: resolve(__dirname, 'crm.html'),
        'crm-dynamic': resolve(__dirname, 'crm-dynamic.html'),
        deal: resolve(__dirname, 'deal.html'),
        'memo-builder': resolve(__dirname, 'memo-builder.html'),
        vdr: resolve(__dirname, 'vdr.html'),
      },
    },
  },
})

import { defineConfig, loadEnv, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'fs'

// Plugin to inject environment variables into all HTML pages
// This allows plain <script> files (like auth.js) to access env config via window.__ENV
function injectEnvConfig(): Plugin {
  let envConfig: string
  return {
    name: 'inject-env-config',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, 'VITE_')
      // Fall back to non-VITE_ prefixed process.env vars (for Render/production builds)
      envConfig = JSON.stringify({
        SUPABASE_URL: env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
        SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
        API_URL: env.VITE_API_URL || process.env.API_URL || '',
        SENTRY_DSN: env.VITE_SENTRY_DSN || process.env.SENTRY_DSN || '',
      })
    },
    transformIndexHtml(html) {
      const sentryScript = `<script src="https://browser.sentry-cdn.com/8.48.0/bundle.min.js" crossorigin="anonymous"></script>
  <script>
    if (window.__ENV && window.__ENV.SENTRY_DSN) {
      Sentry.init({ dsn: window.__ENV.SENTRY_DSN, environment: window.location.hostname === 'localhost' ? 'development' : 'production', tracesSampleRate: 0.1 });
    }
  </script>`
      return html.replace('</head>', `  <script>window.__ENV=${envConfig}</script>\n  ${sentryScript}\n</head>`)
    },
  }
}

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
      const rootFiles = ['dashboard.js', 'deal.js', 'memo-builder.js', 'admin-dashboard.js']
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
  plugins: [injectEnvConfig(), react(), copyStaticFiles()],
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
        solutions: resolve(__dirname, 'solutions.html'),
        resources: resolve(__dirname, 'resources.html'),
        company: resolve(__dirname, 'company.html'),
        'privacy-policy': resolve(__dirname, 'privacy-policy.html'),
        'terms-of-service': resolve(__dirname, 'terms-of-service.html'),
        login: resolve(__dirname, 'login.html'),
        signup: resolve(__dirname, 'signup.html'),
        'forgot-password': resolve(__dirname, 'forgot-password.html'),
        'reset-password': resolve(__dirname, 'reset-password.html'),
        'verify-email': resolve(__dirname, 'verify-email.html'),
        'accept-invite': resolve(__dirname, 'accept-invite.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        crm: resolve(__dirname, 'crm.html'),
        'crm-dynamic': resolve(__dirname, 'crm-dynamic.html'),
        deal: resolve(__dirname, 'deal.html'),
        'deal-intake': resolve(__dirname, 'deal-intake.html'),
        'memo-builder': resolve(__dirname, 'memo-builder.html'),
        vdr: resolve(__dirname, 'vdr.html'),
        settings: resolve(__dirname, 'settings.html'),
        'admin-dashboard': resolve(__dirname, 'admin-dashboard.html'),
        'coming-soon': resolve(__dirname, 'coming-soon.html'),
        'documentation': resolve(__dirname, 'documentation.html'),
        'api-reference': resolve(__dirname, 'api-reference.html'),
        'help-center': resolve(__dirname, 'help-center.html'),
      },
    },
  },
})

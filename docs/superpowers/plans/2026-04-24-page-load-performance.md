# Page Load Performance Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce page-to-page navigation time from 2-5s to under 1s by eliminating cold start bottlenecks, redundant network calls, and render-blocking resources.

**Architecture:** Split the single API serverless function into two (lightweight CRUD vs heavy AI), replace Tailwind CDN with build-time CSS, optimize auth flow to avoid redundant Supabase calls, and add Vercel cache headers for static assets.

**Tech Stack:** Vercel serverless functions, Vite + Tailwind CSS (build-time), Supabase Auth, Express

---

### Task 1: Split API into Lightweight and AI Serverless Functions

The single `api/index.ts` handler imports ALL route modules (including LangChain 24MB, OpenAI 13MB, Azure 13MB) on every cold start. Splitting into two functions means `/api/users/me`, `/api/deals`, `/api/notifications` etc. cold-start in <500ms instead of 3-5s.

**Files:**
- Create: `api/index.ts` (rewrite — lightweight routes only)
- Create: `api/ai.ts` (new — AI-heavy routes)
- Create: `apps/api/src/app-lite.ts` (lightweight Express app)
- Create: `apps/api/src/app-ai.ts` (AI-heavy Express app)
- Modify: `vercel.json` (add second function + rewrites)
- Modify: `apps/api/src/app.ts` (keep as-is for local dev, reference only)

- [ ] **Step 1: Create `apps/api/src/app-lite.ts` — lightweight Express app**

This app includes ONLY the fast CRUD routes (no AI/LangChain imports). Copy the shared middleware setup from `app.ts` but only mount non-AI routes.

```typescript
import * as Sentry from '@sentry/node';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import dealsRouter from './routes/deals.js';
import companiesRouter from './routes/companies.js';
import activitiesRouter from './routes/activities.js';
import documentsRouter from './routes/documents.js';
import documentsAlertsRouter from './routes/documents-alerts.js';
import watchlistRouter from './routes/watchlist.js';
import foldersRouter from './routes/folders.js';
import usersRouter from './routes/users.js';
import notificationsRouter from './routes/notifications.js';
import invitationsRouter from './routes/invitations.js';
import invitationsAcceptRouter from './routes/invitations-accept.js';
import templatesRouter from './routes/templates.js';
import auditRouter from './routes/audit.js';
import tasksRouter from './routes/tasks.js';
import contactsRouter from './routes/contacts.js';
import exportRouter from './routes/export.js';
import dealImportRouter from './routes/deal-import.js';
import { supabase } from './supabase.js';
import { authMiddleware } from './middleware/auth.js';
import { orgMiddleware } from './middleware/orgScope.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { log } from './utils/logger.js';

dotenv.config();

const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missingRequired = requiredEnvVars.filter(key => !process.env[key]);
if (missingRequired.length > 0) {
  log.error('Missing required environment variables', undefined, { missing: missingRequired });
  throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
}

if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

const app = express();

// Security headers (same as app.ts)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://cdn.sheetjs.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co"],
      connectSrc: ["'self'", "https://*.supabase.co", "https://api.openai.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

const extraOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins = [
  'https://pe-os.onrender.com',
  'https://pe-dealstack.vercel.app',
  'https://lmmos.ai',
  'https://www.lmmos.ai',
  ...extraOrigins,
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:5173'] : []),
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      log.warn('CORS request rejected', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(requestIdMiddleware);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health/ready', async (_req, res) => {
  try {
    const dbStart = Date.now();
    const { error: dbError } = await supabase.from('Deal').select('count', { count: 'exact', head: true });
    res.json({
      timestamp: new Date().toISOString(),
      status: dbError ? 'degraded' : 'healthy',
      services: { database: { ok: !dbError, latencyMs: Date.now() - dbStart } },
    });
  } catch {
    res.status(503).json({ status: 'unhealthy', timestamp: new Date().toISOString() });
  }
});

// API info
app.get('/api', (_req, res) => {
  res.json({ message: 'AI CRM API v0.1.0 (lite)' });
});

// Public routes
app.use('/api/public/invitations', invitationsAcceptRouter);

// Protected routes — lightweight CRUD only
app.use('/api/deals/import', authMiddleware, orgMiddleware, dealImportRouter);
app.use('/api/deals', authMiddleware, orgMiddleware, dealsRouter);
app.use('/api/companies', authMiddleware, orgMiddleware, companiesRouter);
app.use('/api', authMiddleware, orgMiddleware, activitiesRouter);
app.use('/api/documents', authMiddleware, orgMiddleware, documentsAlertsRouter);
app.use('/api', authMiddleware, orgMiddleware, documentsRouter);
app.use('/api', authMiddleware, orgMiddleware, foldersRouter);
app.use('/api/users', authMiddleware, orgMiddleware, usersRouter);
app.use('/api/notifications', authMiddleware, orgMiddleware, notificationsRouter);
app.use('/api/invitations', authMiddleware, orgMiddleware, invitationsRouter);
app.use('/api/templates', authMiddleware, orgMiddleware, templatesRouter);
app.use('/api/audit', authMiddleware, orgMiddleware, auditRouter);
app.use('/api/tasks', authMiddleware, orgMiddleware, tasksRouter);
app.use('/api/export', authMiddleware, orgMiddleware, exportRouter);
app.use('/api/contacts', authMiddleware, orgMiddleware, contactsRouter);
app.use('/api/watchlist', authMiddleware, orgMiddleware, watchlistRouter);

if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
```

- [ ] **Step 2: Create `apps/api/src/app-ai.ts` — AI-heavy Express app**

This app only mounts the AI-dependent routes: `ai`, `chat`, `financials`, `memos`, `ingest`, `onboarding`.

```typescript
import * as Sentry from '@sentry/node';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import aiRouter from './routes/ai.js';
import chatRouter from './routes/chat.js';
import financialsRouter from './routes/financials.js';
import memosRouter from './routes/memos.js';
import ingestRouter from './routes/ingest.js';
import onboardingRouter from './routes/onboarding.js';
import { authMiddleware } from './middleware/auth.js';
import { orgMiddleware } from './middleware/orgScope.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { isAIEnabled } from './openai.js';
import { log } from './utils/logger.js';

dotenv.config();

const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missingRequired = requiredEnvVars.filter(key => !process.env[key]);
if (missingRequired.length > 0) {
  throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
}

if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

const app = express();

// Same security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://cdn.sheetjs.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co"],
      connectSrc: ["'self'", "https://*.supabase.co", "https://api.openai.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

const extraOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const allowedOrigins = [
  'https://pe-os.onrender.com',
  'https://pe-dealstack.vercel.app',
  'https://lmmos.ai',
  'https://www.lmmos.ai',
  ...extraOrigins,
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:5173'] : []),
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many AI requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many write operations, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/ai', aiLimiter);
app.use('/api/memos/*/chat', aiLimiter);
app.use('/api/memos/*/sections/*/generate', aiLimiter);
app.use('/api/ingest', writeLimiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(requestIdMiddleware);

// AI routes — all require auth + org
app.use('/api', authMiddleware, orgMiddleware, chatRouter);
app.use('/api/ingest', authMiddleware, orgMiddleware, ingestRouter);
app.use('/api/memos', authMiddleware, orgMiddleware, memosRouter);
app.use('/api/onboarding', authMiddleware, orgMiddleware, onboardingRouter);
app.use('/api', authMiddleware, orgMiddleware, financialsRouter);
app.use('/api', authMiddleware, orgMiddleware, aiRouter);

// AI status (public)
app.get('/api/ai/status', (_req, res) => {
  res.json({ enabled: isAIEnabled(), model: 'gpt-4o' });
});

if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
```

- [ ] **Step 3: Create `api/ai.ts` — Vercel handler for AI routes**

```typescript
let appPromise: Promise<any> | null = null;

function getApp() {
  if (!appPromise) {
    appPromise = import('../apps/api/dist/app-ai.js').then(m => m.default);
  }
  return appPromise;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'AI function initialization failed',
      message: error.message,
    }));
  }
}
```

- [ ] **Step 4: Rewrite `api/index.ts` to use app-lite**

```typescript
let appPromise: Promise<any> | null = null;

function getApp() {
  if (!appPromise) {
    appPromise = import('../apps/api/dist/app-lite.js').then(m => m.default);
  }
  return appPromise;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Function initialization failed',
      message: error.message,
    }));
  }
}
```

- [ ] **Step 5: Update `vercel.json` with two functions + AI rewrites**

The AI routes (`/api/ai/*`, `/api/deals/*/chat/*`, `/api/deals/*/financials/*`, `/api/memos/*`, `/api/ingest/*`, `/api/onboarding/enrich-firm`, `/api/onboarding/research-status`) go to the AI function. Everything else stays on the lite function.

```json
{
  "version": 2,
  "buildCommand": "npm run build:api && npm run build:web",
  "outputDirectory": "apps/web/dist",
  "functions": {
    "api/index.ts": {
      "includeFiles": "apps/api/dist/**",
      "maxDuration": 60
    },
    "api/ai.ts": {
      "includeFiles": "apps/api/dist/**",
      "maxDuration": 300
    }
  },
  "rewrites": [
    { "source": "/api/ai/(.*)", "destination": "/api/ai" },
    { "source": "/api/deals/:dealId/chat/(.*)", "destination": "/api/ai" },
    { "source": "/api/deals/:dealId/conversations/(.*)", "destination": "/api/ai" },
    { "source": "/api/deals/:dealId/financials/extract(.*)", "destination": "/api/ai" },
    { "source": "/api/deals/:dealId/financials/analysis(.*)", "destination": "/api/ai" },
    { "source": "/api/memos/(.*)", "destination": "/api/ai" },
    { "source": "/api/ingest/(.*)", "destination": "/api/ai" },
    { "source": "/api/onboarding/enrich-firm", "destination": "/api/ai" },
    { "source": "/api/onboarding/research-status", "destination": "/api/ai" },
    { "source": "/api/(.*)", "destination": "/api" },
    { "source": "/health", "destination": "/api" },
    { "source": "/health/ready", "destination": "/api" }
  ],
  "headers": [
    {
      "source": "/js/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ],
  "cleanUrls": true
}
```

**Important:** AI-specific rewrites MUST come before the catch-all `/api/(.*)` rewrite. Vercel matches rewrites top-to-bottom.

- [ ] **Step 6: Verify `app.ts` still works for local dev**

The original `app.ts` (with all routes) is still used by `npm run dev` for local development. No changes needed to `app.ts`. But the build command needs to compile the new files.

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors (app-lite.ts and app-ai.ts compile cleanly)

- [ ] **Step 7: Commit**

```bash
git add api/index.ts api/ai.ts apps/api/src/app-lite.ts apps/api/src/app-ai.ts vercel.json
git commit -m "perf(api): split serverless function into lite (CRUD) and AI (LangChain/OpenAI)

Lite function cold-starts in <500ms by excluding 50MB of AI dependencies.
AI-heavy routes (chat, memos, financials extraction, ingest) use separate function.
Local dev still uses unified app.ts with all routes."
```

---

### Task 2: Replace Tailwind CDN with Build-Time CSS

Every HTML page loads `https://cdn.tailwindcss.com` which JIT-compiles CSS client-side — adding 100-200ms per page. The project already has `tailwindcss`, `postcss`, and `autoprefixer` installed and configured in `tailwind.config.js`/`postcss.config.js` — they're just not being used.

**Files:**
- Create: `apps/web/css/app.css` (Tailwind entry point)
- Modify: All 30 `.html` files in `apps/web/` (remove CDN script + inline config, add CSS link)
- Modify: `apps/web/vite.config.ts` (add CSS entry)

- [ ] **Step 1: Create `apps/web/css/app.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 2: Add CSS import to Vite config**

In `apps/web/vite.config.ts`, the `injectEnvConfig` plugin's `transformIndexHtml` hook should also inject the built CSS. But actually, the simplest approach is: add a `<link>` to each HTML file pointing at the CSS, and Vite will process it through PostCSS/Tailwind at build time.

No changes to `vite.config.ts` needed — Vite already processes CSS imports through PostCSS automatically.

- [ ] **Step 3: Update all HTML files — remove Tailwind CDN, add CSS link**

For every `.html` file in `apps/web/`, make these two changes:

**Remove** these two elements (the CDN script and the inline tailwind.config):
```html
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<script>
    tailwind.config = {
        theme: {
            extend: {
                // ... all the color/font/shadow config
            },
        },
    }
</script>
```

Some files have the config in a `<script id="tailwind-config">` tag instead — remove that too.

**Add** this line in the `<head>` (after the Google Fonts links):
```html
<link rel="stylesheet" href="/css/app.css" />
```

Files to update (all in `apps/web/`):
- `index.html`, `landingpage.html`, `pricing.html`, `solutions.html`, `resources.html`, `company.html`
- `privacy-policy.html`, `terms-of-service.html`
- `login.html`, `signup.html`, `forgot-password.html`, `reset-password.html`, `verify-email.html`, `accept-invite.html`
- `dashboard.html`, `crm.html`, `crm-dynamic.html`, `deal.html`, `deal-intake.html`
- `memo-builder.html`, `vdr.html`, `settings.html`, `admin-dashboard.html`
- `coming-soon.html`, `documentation.html`, `api-reference.html`, `help-center.html`, `templates.html`
- `contacts.html`, `onboarding.html`

- [ ] **Step 4: Add Tailwind `forms` and `container-queries` plugins**

The CDN loads `?plugins=forms,container-queries`. Install and add them to the config.

Run: `cd apps/web && npm install -D @tailwindcss/forms @tailwindcss/container-queries`

Then update `tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./*.html",
    "./js/**/*.js",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'primary': '#003366',
        'primary-hover': '#002855',
        'primary-light': '#E6EEF5',
        'secondary': '#059669',
        'secondary-light': '#D1FAE5',
        'background-body': '#F8F9FA',
        'background-light': '#F8F9FA',
        'background-dark': '#101822',
        'surface-card': '#FFFFFF',
        'surface-light': '#FFFFFF',
        'surface-dark': '#1a2430',
        'border-subtle': '#E5E7EB',
        'border-light': '#E5E7EB',
        'border-dark': '#2d3748',
        'border-focus': '#CBD5E1',
        'text-main': '#111827',
        'text-secondary': '#4B5563',
        'text-muted': '#9CA3AF',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Inter', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
        'glow': '0 0 15px rgba(0, 51, 102, 0.1)',
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}
```

**Note:** The `boxShadow`, `borderRadius`, and `fontFamily.sans` values are merged from the inline config that was in the HTML files. The build-time config must include ALL of them since the CDN config is being removed.

- [ ] **Step 5: Test build and verify CSS output**

Run: `cd apps/web && npm run build`
Expected: `dist/css/app.css` (or `dist/assets/app-*.css`) is generated with all Tailwind classes.

Run: `cd apps/web && npm run preview`
Expected: Pages render with correct styling (same as before, no visual changes).

- [ ] **Step 6: Commit**

```bash
git add apps/web/css/app.css apps/web/tailwind.config.js apps/web/package.json apps/web/package-lock.json apps/web/*.html
git commit -m "perf(web): replace Tailwind CDN with build-time CSS

Removes ~150ms per page load from client-side JIT compilation.
Tailwind forms + container-queries plugins installed as dev deps.
All 30 HTML files updated to use built CSS instead of CDN script."
```

---

### Task 3: Optimize Google Fonts Loading

Every page loads Google Fonts synchronously without `display=swap`, blocking first paint by 300-500ms.

**Files:**
- Modify: All `.html` files in `apps/web/` (update font link tags)

- [ ] **Step 1: Update font links in all HTML files**

In every `.html` file, find the Google Fonts links:
```html
<link href="https://fonts.googleapis.com" rel="preconnect"/>
<link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
```

Make these changes:
1. Ensure `display=swap` is present (some files have `&amp;display=swap`, some don't — normalize all to include it)
2. Add `rel="preload"` + `as="style"` for the Inter font (critical for text rendering)
3. Remove any duplicate Material Symbols links (some pages load it twice)

Replace with:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" />
```

Apply to all 30 HTML files listed in Task 2 Step 3.

- [ ] **Step 2: Remove duplicate font links**

Some files (like `crm-dynamic.html`) load Material Symbols twice. Search for duplicates and remove them.

Run: `grep -c "Material+Symbols" apps/web/*.html` to find files with count > 1.

- [ ] **Step 3: Commit**

```bash
git add apps/web/*.html
git commit -m "perf(web): optimize Google Fonts loading with preload + display=swap

Adds preload hint for Inter font, ensures display=swap on all font links,
removes duplicate Material Symbols loads. Saves ~300ms on first paint."
```

---

### Task 4: Optimize Auth Flow — Eliminate Redundant Supabase Calls

Currently on every page load:
1. `checkAuth()` calls `getUser()` which calls BOTH `client.auth.getUser()` AND `client.auth.getSession()` (2 network calls)
2. `loadUserData()` calls `authFetch()` which calls `getAccessToken()` → `getSession()` (3rd call)
3. Then `authFetch` makes the actual `/api/users/me` request (4th call)

That's 4 sequential network calls before the page renders. We can reduce to 1-2.

**Files:**
- Modify: `apps/web/js/auth.js` (cache session, deduplicate calls)
- Modify: `apps/web/js/layout.js` (use cached user data, skip API call when cached)

- [ ] **Step 1: Add session caching to `auth.js`**

Replace the `getUser()` and `getSession()` functions with cached versions. The Supabase session is valid for 1 hour — we can cache it in memory for the page lifecycle and in `sessionStorage` across navigations.

In `apps/web/js/auth.js`, replace the `getUser`, `getSession`, and `getAccessToken` functions:

```javascript
// Session cache — avoids redundant Supabase API calls within same page
let _cachedSession = null;
let _cachedUser = null;
let _sessionFetchPromise = null;

/**
 * Get the current session (cached within page lifecycle)
 * Only makes one Supabase call per page load
 */
async function getSession() {
  if (_cachedSession) return { session: _cachedSession };

  // Deduplicate concurrent calls (e.g., checkAuth + authFetch racing)
  if (_sessionFetchPromise) return _sessionFetchPromise;

  _sessionFetchPromise = (async () => {
    try {
      const client = await initSupabase();
      const { data: { session } } = await client.auth.getSession();
      _cachedSession = session;
      return { session };
    } catch (err) {
      console.error('Get session error:', err);
      return { session: null };
    } finally {
      _sessionFetchPromise = null;
    }
  })();

  return _sessionFetchPromise;
}

/**
 * Get the current authenticated user (uses cached session)
 */
async function getUser() {
  if (_cachedUser && _cachedSession) {
    return { user: _cachedUser, session: _cachedSession };
  }

  try {
    const { session } = await getSession();
    if (session) {
      _cachedUser = session.user;
      return { user: session.user, session };
    }
    return { user: null, session: null };
  } catch (err) {
    console.error('Get user error:', err);
    return { user: null, session: null };
  }
}

/**
 * Get the access token for API calls (uses cached session)
 */
async function getAccessToken() {
  const { session } = await getSession();
  return session?.access_token || null;
}
```

This reduces 3 Supabase API calls to 1 per page load.

- [ ] **Step 2: Make `loadUserData()` skip API call when sessionStorage cache is fresh**

In `apps/web/js/layout.js`, the `loadUserData()` function already reads from `sessionStorage` cache. But it ALWAYS makes the API call too. Add a short TTL check to skip the API call if the cache is fresh (< 2 minutes old).

Find the `getCachedUser()` function and add timestamp tracking:

```javascript
function getCachedUser() {
    try {
        const cached = sessionStorage.getItem(USER_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.name && parsed.name !== 'Loading...') {
                return parsed;
            }
        }
    } catch (e) {}
    return null;
}

function cacheUserData(userData) {
    try {
        userData._cachedAt = Date.now();
        sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData));
    } catch (e) {}
}

function isCacheFresh() {
    try {
        const cached = sessionStorage.getItem(USER_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            // Cache valid for 2 minutes
            return parsed._cachedAt && (Date.now() - parsed._cachedAt) < 120000;
        }
    } catch (e) {}
    return false;
}
```

Then in `loadUserData()`, skip the API call if cache is fresh:

```javascript
async function loadUserData() {
    // If cache is fresh (< 2 min old), skip the API call
    if (isCacheFresh() && cachedUser && cachedUser.name !== 'Loading...') {
        USER = cachedUser;
        updateUserDisplay();
        updateSidebarForRole();
        window.dispatchEvent(new CustomEvent('pe-user-loaded', { detail: { user: USER } }));
        return;
    }

    try {
        if (typeof PEAuth !== 'undefined' && PEAuth.authFetch) {
            const response = await PEAuth.authFetch(`${API_BASE_URL}/users/me`);
            // ... rest of existing code
        }
    } catch (err) {
        // ... existing error handling
    }
}
```

- [ ] **Step 3: Verify auth still works**

Test manually:
1. Login works (session created)
2. Navigate between pages (no re-auth flash)
3. After 2 minutes, user data refreshes from API
4. Logout works (clears cache)

- [ ] **Step 4: Commit**

```bash
git add apps/web/js/auth.js apps/web/js/layout.js
git commit -m "perf(auth): cache Supabase session + user data, eliminate redundant API calls

Reduces 4 sequential network calls per page to 1 (first visit) or 0 (cached).
Session cached in memory (page lifecycle), user data in sessionStorage (2min TTL).
Concurrent getSession() calls deduplicated via shared promise."
```

---

### Task 5: Add Vercel Static Asset Caching Headers

Static JS, CSS, and image files should be cached aggressively by the browser. Currently no cache headers are set.

**Files:**
- Modify: `vercel.json` (already done in Task 1 Step 5 — the `headers` section)

This is already included in the `vercel.json` from Task 1 Step 5. The headers section caches `/js/*` and `/assets/*` with `immutable` for 1 year.

- [ ] **Step 1: Verify cache headers are in vercel.json**

Confirm the `headers` array from Task 1 Step 5 includes:
```json
"headers": [
  {
    "source": "/js/(.*)",
    "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
    ]
  },
  {
    "source": "/assets/(.*)",
    "headers": [
      { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
    ]
  }
]
```

No separate commit needed — already part of Task 1.

---

### Task 6: Build Verification and Smoke Test

**Files:**
- No new files

- [ ] **Step 1: Build API and verify both app files compile**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No TypeScript errors.

Run: `cd apps/api && npm run build`
Expected: `dist/app-lite.js` and `dist/app-ai.js` exist alongside `dist/app.js`.

- [ ] **Step 2: Build web and verify CSS output**

Run: `cd apps/web && npm run build`
Expected: 
- `dist/css/app.css` or `dist/assets/app-*.css` exists
- No Tailwind CDN script in any `dist/*.html` file
- All `dist/*.html` files have `<link rel="stylesheet" href="/css/app.css" />`

Verify: `grep -l "cdn.tailwindcss" apps/web/dist/*.html` should return nothing.

- [ ] **Step 3: Local dev still works**

Run: `cd apps/api && npm run dev` (uses original `app.ts` with all routes)
Run: `cd apps/web && npm run dev` (Vite dev server with Tailwind PostCSS)

Both should work exactly as before. Local dev is unchanged.

- [ ] **Step 4: Commit any build fixes**

If any build issues were found, fix and commit:
```bash
git commit -m "fix(build): resolve build issues from performance optimization"
```

- [ ] **Step 5: Final commit — update progress.md**

Document the changes in `progress.md` with IST timestamps, following the user's preferred format.

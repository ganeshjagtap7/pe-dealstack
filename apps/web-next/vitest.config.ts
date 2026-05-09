import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest config for the Next.js app.
//
// - environment: jsdom — browser-shaped globals so React Testing Library can
//   mount components without a real browser.
// - setupFiles: ./src/test/setup.ts — registers @testing-library/jest-dom
//   custom matchers (toBeInTheDocument, toHaveTextContent, ...) and any
//   global mocks (Next router, etc.).
// - alias `@/*` → `src/*` mirrors tsconfig.json paths so test imports use the
//   same `@/lib/...` shape production code does.
// - dedupe react/react-dom so RTL and the app share a single copy (the
//   monorepo root + apps/web/legacy + apps/web-next would otherwise risk
//   pulling different React majors into the same test run).
// - exclude e2e + node_modules so we don't accidentally run something we don't
//   own.
export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
    ],
    css: false,
  },
});

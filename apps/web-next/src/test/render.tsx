// renderWithProviders — RTL render wrapper that mounts the providers most
// (app)/ pages need. Mirrors the stack in src/app/(app)/layout.tsx but skips
// the Sidebar/Header chrome so unit tests aren't dragged into route-aware
// behaviour.
//
// The full layout stack is:
//   AuthProvider > UserProvider > NotificationCountProvider >
//     ToastProvider > IngestDealModalProvider
//
// Most tests only care about ToastProvider (toasts surfaced via useToast).
// The other providers fan out into Supabase/data-fetch concerns we don't want
// to fire in unit tests, so we leave them out by default and let individual
// tests opt in by passing a custom `wrapper` to RTL's `render`.
//
// `ReactNode` cast: RTL@16's d.ts uses an older @types/react flavour of
// ReactNode (where ReactPortal still requires `children`). React 19's
// @types/react widens the type. Without the cast, our React 19 elements are
// rejected as not assignable to RTL's ReactNode. The runtime behaviour is
// fine — this is purely a type-shape mismatch.

import type { ReactElement, ReactNode } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { ToastProvider } from "@/providers/ToastProvider";

interface ProviderOptions {
  /** Wrap with ToastProvider (default true). Disable if a test needs to
   *  assert raw children with no toast outlet in the DOM. */
  withToast?: boolean;
}

function Providers({ children, withToast = true }: { children: ReactNode } & ProviderOptions) {
  if (withToast) {
    return <ToastProvider>{children}</ToastProvider>;
  }
  return <>{children}</>;
}

export function renderWithProviders(
  ui: ReactElement,
  options: Omit<RenderOptions, "wrapper"> & ProviderOptions = {},
): RenderResult {
  const { withToast, ...rtlOptions } = options;
  return render(ui as Parameters<typeof render>[0], {
    wrapper: ({ children }) => (
      <Providers withToast={withToast}>{children as ReactNode}</Providers>
    ),
    ...rtlOptions,
  });
}

// Re-export RTL helpers so test files can `import { screen, ... } from "@/test/render"`
// instead of pulling from two places.
export * from "@testing-library/react";

// Vitest global setup — runs once before every test file.
//
// 1. Registers @testing-library/jest-dom matchers (toBeInTheDocument,
//    toHaveTextContent, toBeDisabled, etc.) onto Vitest's `expect`.
// 2. Mocks `next/navigation` so components that read usePathname / useRouter
//    in client code don't blow up outside the App Router runtime.
// 3. Cleans up the DOM + resets module-level mocks between tests so files
//    don't leak state into each other.

import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as React from "react";

afterEach(() => {
  cleanup();
});

// next/navigation hooks — minimal stubs sufficient for unit tests. Tests that
// need a specific pathname or push spy can re-mock via vi.mock() at top of
// their file.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// next/link — render as a plain <a> so RTL can find it by role/text.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  } & Record<string, unknown>) =>
    React.createElement("a", { href, ...rest }, children),
}));

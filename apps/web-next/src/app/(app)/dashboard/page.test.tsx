import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "@/test/render";

const getMock = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    get: (path: string) => getMock(path),
    patch: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
  NotFoundError: class NotFoundError extends Error {},
}));

vi.mock("@/providers/UserProvider", () => ({
  useUser: () => ({ user: { id: "u1", name: "Ada Lovelace" } }),
}));

import { invalidateApiCache } from "@/lib/useApiQuery";
import DashboardPage from "./page";

beforeEach(() => {
  getMock.mockReset();
  getMock.mockResolvedValue([]); // both /deals and /tasks resolve empty by default
  invalidateApiCache();
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  });
});

describe("DashboardPage (useApiQuery migration)", () => {
  it("mounts and fetches deals + tasks through the cache", async () => {
    renderWithProviders(<DashboardPage />);

    // Greeting proves the page mounted with the user wired in.
    expect(await screen.findByText(/Ada/)).toBeInTheDocument();
    // Both dashboard datasets are fetched via useApiQuery.
    expect(getMock).toHaveBeenCalledWith(expect.stringContaining("/deals?"));
    expect(getMock).toHaveBeenCalledWith(expect.stringContaining("/tasks?"));
  });

  it("renders instantly on remount (cache hit, no crash)", async () => {
    const first = renderWithProviders(<DashboardPage />);
    await screen.findByText(/Ada/);
    first.unmount();

    renderWithProviders(<DashboardPage />);
    // Cached deals/tasks hydrate synchronously; the greeting is present on the
    // first render with no loading gate throwing.
    expect(screen.getByText(/Ada/)).toBeInTheDocument();
  });
});

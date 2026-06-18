import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "@/test/render";

// Mock the API layer so the page's useApiQuery reads from here.
const getMock = vi.fn();
const deleteMock = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    get: (path: string) => getMock(path),
    delete: (path: string) => deleteMock(path),
    patch: vi.fn(),
    post: vi.fn(),
  },
  NotFoundError: class NotFoundError extends Error {},
}));

// The deals page pulls the ingest modal from a provider; stub it.
vi.mock("@/providers/IngestDealModalProvider", () => ({
  useIngestDealModal: () => ({ openDealIntake: vi.fn() }),
}));

import { invalidateApiCache } from "@/lib/useApiQuery";
import DealsPage from "./page";

const DEAL = {
  id: "d1",
  name: "Project Atlas",
  companyName: "Atlas Corp",
  stage: "DILIGENCE",
  status: "ACTIVE",
  industry: "SaaS",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  getMock.mockReset();
  deleteMock.mockReset();
  invalidateApiCache();
  // jsdom's localStorage isn't usable in this config; provide a working stub.
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

describe("DealsPage (useApiQuery migration)", () => {
  it("fetches deals on mount and leaves the loading state", async () => {
    getMock.mockResolvedValue([DEAL]);

    renderWithProviders(<DealsPage />);

    // The header count only renders once loading completes with data.
    expect(await screen.findByText(/Active Opportunities/)).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(expect.stringContaining("/deals?"));
  });

  it("serves cached deals INSTANTLY on remount (no skeleton)", async () => {
    getMock.mockResolvedValue([DEAL]);

    const first = renderWithProviders(<DealsPage />);
    await screen.findByText(/Active Opportunities/);
    first.unmount();
    getMock.mockClear();

    // Remount: the module cache hydrates synchronously — content is present on
    // the very first render, before any new fetch resolves.
    renderWithProviders(<DealsPage />);
    expect(screen.getByText(/Active Opportunities/)).toBeInTheDocument();
  });
});

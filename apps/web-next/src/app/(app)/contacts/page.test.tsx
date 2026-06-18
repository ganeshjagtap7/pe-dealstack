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

import { invalidateApiCache } from "@/lib/useApiQuery";
import ContactsPage from "./page";

const CONTACT = {
  id: "c1",
  firstName: "Grace",
  lastName: "Hopper",
  type: "INVESTOR",
  email: "grace@navy.mil",
  company: "USN",
};

function mockApi() {
  getMock.mockImplementation((path: string) => {
    if (path.startsWith("/contacts/insights")) return Promise.resolve({ scores: {} });
    if (path.startsWith("/contacts")) return Promise.resolve({ contacts: [CONTACT], total: 1 });
    return Promise.resolve({});
  });
}

beforeEach(() => {
  getMock.mockReset();
  invalidateApiCache();
  mockApi();
});

describe("ContactsPage (useApiQuery migration)", () => {
  it("loads the first page of contacts and the scores", async () => {
    renderWithProviders(<ContactsPage />);

    expect(await screen.findByText("Grace Hopper")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(expect.stringContaining("/contacts?"));
    expect(getMock).toHaveBeenCalledWith(expect.stringContaining("/contacts/insights/scores"));
  });

  it("serves cached contacts INSTANTLY on remount (no skeleton)", async () => {
    const first = renderWithProviders(<ContactsPage />);
    await screen.findByText("Grace Hopper");
    first.unmount();

    renderWithProviders(<ContactsPage />);
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
  });
});

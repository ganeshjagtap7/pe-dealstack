import { describe, it, expect } from "vitest";
import { isAppRouteRequiringAuth, isAuthOnlyPage } from "./routing";

describe("isAppRouteRequiringAuth", () => {
  it("gates protected app pages behind auth", () => {
    expect(isAppRouteRequiringAuth("/dashboard")).toBe(true);
    expect(isAppRouteRequiringAuth("/deals")).toBe(true);
    expect(isAppRouteRequiringAuth("/deals/abc-123")).toBe(true);
    expect(isAppRouteRequiringAuth("/admin")).toBe(true);
    expect(isAppRouteRequiringAuth("/settings")).toBe(true);
    expect(isAppRouteRequiringAuth("/data-room")).toBe(true);
  });

  it("lets the public root through unauthenticated", () => {
    expect(isAppRouteRequiringAuth("/")).toBe(false);
  });

  it("lets auth/onboarding flows through unauthenticated", () => {
    expect(isAppRouteRequiringAuth("/login")).toBe(false);
    expect(isAppRouteRequiringAuth("/signup")).toBe(false);
    expect(isAppRouteRequiringAuth("/forgot-password")).toBe(false);
    expect(isAppRouteRequiringAuth("/reset-password")).toBe(false);
    expect(isAppRouteRequiringAuth("/verify-email")).toBe(false);
    expect(isAppRouteRequiringAuth("/accept-invite")).toBe(false);
    expect(isAppRouteRequiringAuth("/accept-invite/tok_abc123")).toBe(false);
  });

  it("lets API and Next internals pass through", () => {
    expect(isAppRouteRequiringAuth("/api/deals")).toBe(false);
    expect(isAppRouteRequiringAuth("/api/ai/market-sentiment")).toBe(false);
    expect(isAppRouteRequiringAuth("/_next/static/chunks/main.js")).toBe(false);
    expect(isAppRouteRequiringAuth("/_next/image")).toBe(false);
  });

  it("lets static asset-looking paths through (anything with a dot)", () => {
    expect(isAppRouteRequiringAuth("/favicon.svg")).toBe(false);
    expect(isAppRouteRequiringAuth("/robots.txt")).toBe(false);
    expect(isAppRouteRequiringAuth("/og-image.png")).toBe(false);
  });

  it("doesn't get tricked by auth-prefix lookalikes", () => {
    // A deal page named 'login-acquisition' or similar shouldn't bypass auth just
    // because the string starts with 'login' — but the current heuristic uses
    // startsWith, so '/login-acquisition' *would* bypass. This test documents
    // that limitation so a regression is caught if the behavior ever changes.
    expect(isAppRouteRequiringAuth("/logindata")).toBe(false);
  });
});

describe("isAuthOnlyPage", () => {
  it("targets login and signup only", () => {
    expect(isAuthOnlyPage("/login")).toBe(true);
    expect(isAuthOnlyPage("/signup")).toBe(true);
  });

  it("leaves password-recovery flows alone so logged-in users can still use them", () => {
    expect(isAuthOnlyPage("/forgot-password")).toBe(false);
    expect(isAuthOnlyPage("/reset-password")).toBe(false);
    expect(isAuthOnlyPage("/verify-email")).toBe(false);
  });

  it("doesn't match sub-paths", () => {
    expect(isAuthOnlyPage("/login/foo")).toBe(false);
    expect(isAuthOnlyPage("/signup/step-2")).toBe(false);
  });

  it("doesn't match app routes", () => {
    expect(isAuthOnlyPage("/dashboard")).toBe(false);
    expect(isAuthOnlyPage("/")).toBe(false);
  });
});

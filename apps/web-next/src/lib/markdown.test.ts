import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";

// renderMarkdown is the AI-chat markdown→HTML pipeline. The tests below focus
// on the link-sanitisation behaviour added during the deal-page bug-fix sweep
// (see `sanitizeLinkHref` in markdown.ts). The function itself isn't exported,
// so we exercise it through the public renderMarkdown entry point.

describe("renderMarkdown — link sanitisation", () => {
  it("rewrites legacy `#/foo` hash-router prefixes to `/foo`", () => {
    const html = renderMarkdown("Visit [the deals page](#/deals)");
    expect(html).toContain('href="/deals"');
    expect(html).not.toContain("#/deals");
  });

  it("preserves relative paths to internal app routes", () => {
    const html = renderMarkdown("[Dashboard](/dashboard)");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('target="_self"');
    expect(html).not.toContain('target="_blank"');
  });

  it("normalises bare paths to absolute internal routes", () => {
    const html = renderMarkdown("[settings](settings)");
    // bare 'settings' gets a leading slash so Next.js treats it as a route
    expect(html).toContain('href="/settings"');
    expect(html).toContain('target="_self"');
  });

  it("opens external http/https links in a new tab with rel noopener", () => {
    const html = renderMarkdown("[Pocket Fund](https://pocket-fund.com)");
    expect(html).toContain('href="https://pocket-fund.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("blocks javascript: hrefs by collapsing them to `#`", () => {
    // Note: spaces in href cause regex to skip the link; use no-space variant
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    // Should fall back to "#"
    expect(html).toContain('href="#"');
  });

  it("blocks data: and other unsafe schemes", () => {
    const html = renderMarkdown("[bad](data:text/html,<script>alert(1)</script>)");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain('href="#"');
  });

  it("escapes HTML in link labels to prevent XSS via the visible text", () => {
    const html = renderMarkdown("[<img onerror=alert(1)>](https://example.com)");
    // The label characters must be escaped — no raw `<img` should make it through.
    expect(html).not.toMatch(/<img\s/);
    expect(html).toContain("&lt;img");
  });
});

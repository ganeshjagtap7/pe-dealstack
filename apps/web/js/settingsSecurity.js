/**
 * PE OS — Settings: Security augmentation
 * Renders trust/security blocks inside #section-security on settings.html,
 * appended below the existing password + 2FA UI.
 *
 * Blocks rendered (in order):
 *   1. Data home (organization name + ID)
 *   2. Encryption status
 *   3. Tenant isolation badge
 *   4. AI & LLM data handling note
 *   5. Action buttons (security PDF, sub-processors, request DPA)
 *   6. Active sessions placeholder (filled in Task 14)
 *   7. Live isolation test placeholder (admin-only, filled in Task 16)
 */

(function () {
  'use strict';

  const API_BASE_URL = window.API_BASE_URL || '/api';

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  // Fetch /api/users/me — returns { ...user, organization: {...} } from findOrCreateUser.
  // Used as the source of truth for both org info and role.
  async function loadCurrentUser() {
    try {
      if (typeof PEAuth === 'undefined' || !PEAuth.authFetch) return null;
      const res = await PEAuth.authFetch(`${API_BASE_URL}/users/me`);
      if (!res.ok) throw new Error(`Failed to load user (${res.status})`);
      return await res.json();
    } catch (err) {
      console.warn('settingsSecurity: user load failed', err);
      return null;
    }
  }

  function renderDataHomeBlock(org) {
    if (!org) return '';
    return `
      <div class="border-t border-border-subtle pt-4">
        <p class="text-sm font-semibold text-text-main mb-1">Your data home</p>
        <p class="text-xs text-text-muted mb-3">
          Your firm's data lives in a dedicated logical Postgres database, scoped by organization ID.
          Every read and write is verified server-side against this ID.
        </p>
        <div class="p-3 bg-gray-50 rounded-lg border border-border-subtle text-xs font-mono">
          <div><span class="text-text-muted">Organization:</span> <span class="text-text-main">${escapeHtml(org.name || '—')}</span></div>
          <div><span class="text-text-muted">Org ID:</span> <span class="text-text-main">${escapeHtml(org.id || '—')}</span></div>
        </div>
      </div>
    `;
  }

  function renderEncryptionBlock() {
    return `
      <div class="border-t border-border-subtle pt-4">
        <p class="text-sm font-semibold text-text-main mb-2">Encryption status</p>
        <ul class="text-xs space-y-1.5">
          <li class="flex items-center gap-2 text-text-secondary">
            <span class="material-symbols-outlined text-green-600 text-[16px]">check_circle</span>
            TLS in transit (managed by Vercel)
          </li>
          <li class="flex items-center gap-2 text-text-secondary">
            <span class="material-symbols-outlined text-green-600 text-[16px]">check_circle</span>
            AES-256 at rest (managed by Supabase)
          </li>
          <li class="flex items-center gap-2 text-text-secondary">
            <span class="material-symbols-outlined text-green-600 text-[16px]">check_circle</span>
            Encrypted automated backups
          </li>
        </ul>
      </div>
    `;
  }

  function renderIsolationBadge() {
    return `
      <div class="border-t border-border-subtle pt-4">
        <p class="text-sm font-semibold text-text-main mb-2">Tenant isolation</p>
        <div class="p-3 bg-blue-50 rounded-lg border border-blue-200 flex items-start gap-3">
          <span class="material-symbols-outlined text-[#003366]">verified_user</span>
          <div class="flex-1">
            <p class="text-xs text-text-main font-medium">34 automated cross-organization tests run on every deploy.</p>
            <p class="text-xs text-text-muted mt-1">268 org-scope checks across 45 API route files.</p>
            <a href="/security.html#isolation" class="text-xs text-[#003366] font-medium hover:underline mt-2 inline-block">Learn more →</a>
          </div>
        </div>
      </div>
    `;
  }

  function renderAIHandlingBlock() {
    return `
      <div class="border-t border-border-subtle pt-4">
        <p class="text-sm font-semibold text-text-main mb-2">AI &amp; LLM data handling</p>
        <p class="text-xs text-text-muted">
          We use the API tiers of OpenAI, Anthropic, Google, and Azure — these tiers contractually do not train models on customer data.
          Your CIMs, LOIs, and memos never feed any model.
          <a href="/security.html#ai" class="text-[#003366] hover:underline">Read full policy →</a>
        </p>
      </div>
    `;
  }

  function renderActionsBlock() {
    return `
      <div class="border-t border-border-subtle pt-4 flex flex-wrap gap-3">
        <a href="/assets/pocket-fund-security-overview.pdf" download
           class="px-4 py-2 text-sm font-medium rounded-lg border border-border-subtle hover:bg-gray-50 transition-colors flex items-center gap-2 text-text-main">
          <span class="material-symbols-outlined text-[18px]">download</span>
          Security overview (PDF)
        </a>
        <a href="/security.html#sub-processors"
           class="px-4 py-2 text-sm font-medium rounded-lg border border-border-subtle hover:bg-gray-50 transition-colors flex items-center gap-2 text-text-main">
          <span class="material-symbols-outlined text-[18px]">groups</span>
          Sub-processors
        </a>
        <a href="mailto:security@pocket-fund.com?subject=DPA%20Request"
           class="px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors flex items-center gap-2"
           style="background-color: #003366;">
          <span class="material-symbols-outlined text-[18px]">contract</span>
          Request DPA
        </a>
      </div>
    `;
  }

  function renderSessionsPlaceholder() {
    return `
      <div class="border-t border-border-subtle pt-4" id="active-sessions-block">
        <p class="text-sm font-semibold text-text-main mb-2">Active sessions</p>
        <div id="active-sessions-list" class="text-xs text-text-muted">Loading…</div>
      </div>
    `;
  }

  function renderIsolationTestPlaceholder(isAdmin) {
    if (!isAdmin) return '';
    return `
      <div class="border-t border-border-subtle pt-4" id="isolation-test-block">
        <p class="text-sm font-semibold text-text-main mb-2">Live isolation test</p>
        <p class="text-xs text-text-muted mb-3">Verify your organization is properly isolated by running cross-org access checks against your live API.</p>
        <button id="run-isolation-test-btn"
                class="px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors"
                style="background-color: #003366;">
          Run isolation test
        </button>
        <div id="isolation-test-output" class="hidden mt-3 p-3 bg-gray-900 rounded-lg text-xs font-mono text-green-400 whitespace-pre-wrap"></div>
      </div>
    `;
  }

  // Resolve the user's role from the freshest source available:
  //   1. /api/users/me response (authoritative)
  //   2. window.USER.systemRole (set by layout.js once loaded)
  //   3. window.PE_USER_ROLE (legacy fallback)
  function resolveRole(userData) {
    const candidates = [
      userData && userData.role,
      window.USER && window.USER.systemRole,
      window.PE_USER_ROLE
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim().toLowerCase();
    }
    return '';
  }

  async function init() {
    const section = document.getElementById('section-security');
    if (!section) return;

    const inner = section.querySelector('.p-6.space-y-4');
    if (!inner) {
      console.warn('settingsSecurity: could not find inner container');
      return;
    }

    // Avoid double-rendering if init() runs twice
    if (document.getElementById('settings-security-augmented')) return;

    const container = document.createElement('div');
    container.id = 'settings-security-augmented';
    container.className = 'space-y-0';
    inner.appendChild(container);

    // Load user once — supplies both org info and role
    const userData = await loadCurrentUser();
    const org = userData && userData.organization ? userData.organization : null;
    const role = resolveRole(userData);
    const isAdmin = role === 'admin' || role === 'partner' || role === 'principal';

    container.innerHTML =
      renderDataHomeBlock(org) +
      renderEncryptionBlock() +
      renderIsolationBadge() +
      renderAIHandlingBlock() +
      renderActionsBlock() +
      renderSessionsPlaceholder() +
      renderIsolationTestPlaceholder(isAdmin);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SettingsSecurity = { init };
})();

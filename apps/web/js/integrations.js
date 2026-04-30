const PROVIDER_CATALOG = [
  { id: 'granola',         name: 'Granola',         desc: 'Auto-import meeting transcripts', icon: 'mic',           phase: 1 },
  { id: 'gmail',           name: 'Gmail',           desc: 'Sync deal-related emails',        icon: 'mail',          phase: 2 },
  { id: 'google_calendar', name: 'Google Calendar', desc: 'Pre-meeting briefs & timeline',   icon: 'event',         phase: 3 },
  { id: 'fireflies',       name: 'Fireflies',       desc: 'Auto-import meeting transcripts', icon: 'mic',           phase: 'later' },
  { id: 'otter',           name: 'Otter',           desc: 'Auto-import meeting transcripts', icon: 'graphic_eq',    phase: 'later' },
];

const NAVY = '#003366';

async function authFetch(path, init = {}) {
  if (window.PEAuth?.authFetch) return window.PEAuth.authFetch(path, init);
  return fetch(path, init);
}

function statusBadge(integration) {
  if (!integration) {
    return `<span class="text-xs text-text-muted">Not connected</span>`;
  }
  const colors = {
    connected:       { bg: '#ECFDF5', fg: '#047857', label: 'Connected' },
    token_expired:   { bg: '#FFFBEB', fg: '#92400E', label: 'Reconnect needed' },
    error:           { bg: '#FEF2F2', fg: '#991B1B', label: 'Error' },
    revoked:         { bg: '#F3F4F6', fg: '#374151', label: 'Disconnected' },
  };
  const c = colors[integration.status] ?? colors.revoked;
  return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
    style="background:${c.bg};color:${c.fg}">${c.label}</span>`;
}

function renderCard(provider, integration) {
  const isComingSoon = provider.phase === 'later';
  const isAvailable  = !isComingSoon;
  const ctaLabel     = integration ? 'Disconnect' : (isAvailable ? 'Connect' : 'Coming soon');
  const ctaDisabled  = !integration && !isAvailable;
  const ctaStyle     = integration
    ? `background:#FEF2F2;color:#991B1B;border:1px solid #FCA5A5`
    : `background:${NAVY};color:#fff`;

  return `
    <div class="bg-white border border-border-subtle rounded-lg p-4 flex flex-col gap-3"
         data-provider="${provider.id}">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center"
               style="background:#E6EEF5;color:${NAVY}">
            <span class="material-symbols-outlined">${provider.icon}</span>
          </div>
          <div>
            <div class="text-sm font-semibold text-text-main">${provider.name}</div>
            <div class="text-xs text-text-muted">${provider.desc}</div>
          </div>
        </div>
        ${statusBadge(integration)}
      </div>
      ${integration?.externalAccountEmail
        ? `<div class="text-xs text-text-muted">Connected as ${integration.externalAccountEmail}</div>`
        : ''}
      <div class="flex items-center justify-between gap-2 mt-1">
        <div class="text-xs text-text-muted">
          ${integration?.lastSyncAt
            ? `Last sync: ${new Date(integration.lastSyncAt).toLocaleString()}`
            : ''}
        </div>
        <button class="text-xs font-semibold rounded-md px-3 py-1.5 transition-opacity ${ctaDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'}"
                style="${ctaStyle}"
                ${ctaDisabled ? 'disabled' : ''}
                data-action="${integration ? 'disconnect' : 'connect'}"
                data-id="${integration?.id ?? ''}">
          ${ctaLabel}
        </button>
      </div>
    </div>
  `;
}

async function fetchIntegrations() {
  try {
    const res = await authFetch('/api/integrations');
    if (!res.ok) return [];
    const json = await res.json();
    return json.integrations ?? [];
  } catch {
    return [];
  }
}

async function render() {
  const grid = document.getElementById('integrations-grid');
  if (!grid) return;
  const integrations = await fetchIntegrations();
  const byProvider = new Map(
    integrations.filter(i => i.status !== 'revoked').map(i => [i.provider, i])
  );
  grid.innerHTML = PROVIDER_CATALOG
    .map(p => renderCard(p, byProvider.get(p.id) ?? null))
    .join('');

  grid.addEventListener('click', onCardClick);
}

async function onCardClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const card = btn.closest('[data-provider]');
  const provider = card?.dataset.provider;
  if (!provider) return;

  if (action === 'connect') {
    btn.disabled = true;
    try {
      const res = await authFetch(`/api/integrations/${provider}/connect`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (err) {
      btn.disabled = false;
      alert(`Could not start connection: ${err.message}`);
    }
  } else if (action === 'disconnect') {
    if (!confirm('Disconnect this integration? Past data stays; no new sync.')) return;
    const id = btn.dataset.id;
    btn.disabled = true;
    try {
      const res = await authFetch(`/api/integrations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await render();
    } catch (err) {
      btn.disabled = false;
      alert(`Disconnect failed: ${err.message}`);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', render);
} else {
  render();
}

(async function() {
  const API = window.API_BASE_URL || '/api';

  // Gate: only render if current user is internal.
  // /api/users/me returns the User row directly (not wrapped in { user: ... }).
  // We also handle the wrapped shape defensively.
  const meRes = await PEAuth.authFetch(`${API}/users/me`).then(r => r.json()).catch(() => null);
  const me = meRes?.user ?? meRes;
  if (!me?.isInternal) {
    window.location.href = '/dashboard.html';
    return;
  }

  // Tab switching
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);
      document.getElementById('tab-' + t.dataset.tab).hidden = false;
      const renderer = window['render_' + t.dataset.tab];
      if (renderer) renderer();
    });
  });

  // -------------------- Live Feed --------------------
  window.render_feed = async function() {
    const panel = document.getElementById('tab-feed');
    panel.innerHTML = `
      <div class="filters">
        <select id="f-operation"><option value="">All operations</option></select>
        <input id="f-from" type="date" />
        <input id="f-to" type="date" />
        <label><input id="f-errors" type="checkbox" /> Errors only</label>
        <button id="f-refresh">Refresh</button>
      </div>
      <div id="feed-table" class="loading">Loading...</div>
    `;
    document.getElementById('f-refresh').addEventListener('click', loadFeed);
    document.getElementById('f-errors').addEventListener('change', loadFeed);
    document.getElementById('f-from').addEventListener('change', loadFeed);
    document.getElementById('f-to').addEventListener('change', loadFeed);
    document.getElementById('f-operation').addEventListener('change', loadFeed);
    await loadFeed();
  };

  async function loadFeed() {
    const params = new URLSearchParams();
    const op = document.getElementById('f-operation')?.value;
    const from = document.getElementById('f-from')?.value;
    const to = document.getElementById('f-to')?.value;
    const errs = document.getElementById('f-errors')?.checked;
    if (op) params.set('operation', op);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (errs) params.set('errorsOnly', 'true');
    const res = await PEAuth.authFetch(`${API}/internal/usage/events?${params}`).then(r => r.json());
    const events = res.events || [];

    // Populate operations dropdown if not already populated
    const opSelect = document.getElementById('f-operation');
    if (opSelect && opSelect.options.length <= 1) {
      const ops = [...new Set(events.map(e => e.operation))].sort();
      for (const o of ops) {
        const opt = document.createElement('option');
        opt.value = o;
        opt.textContent = o;
        opSelect.appendChild(opt);
      }
    }

    document.getElementById('feed-table').className = '';
    document.getElementById('feed-table').innerHTML = renderEventsTable(events);
  }

  function renderEventsTable(events) {
    if (!events || events.length === 0) return '<div class="empty">No events match the current filters.</div>';
    const rows = events.map(e => {
      const time = new Date(e.createdAt).toLocaleString();
      const orgName = e.Organization?.name ?? '';
      const userEmail = e.User?.email ?? '';
      const tokens = `${e.promptTokens || 0} / ${e.completionTokens || 0}`;
      const cost = `$${Number(e.costUsd ?? 0).toFixed(4)}`;
      const statusBadge = e.status === 'success'
        ? `<span class="badge badge-success">${escapeHtml(e.status)}</span>`
        : `<span class="badge badge-error">${escapeHtml(e.status)}</span>`;
      return `<tr>
        <td>${escapeHtml(time)}</td>
        <td>${escapeHtml(orgName)}</td>
        <td>${escapeHtml(userEmail)}</td>
        <td>${escapeHtml(e.operation)}</td>
        <td>${escapeHtml(e.model || '—')}</td>
        <td>${escapeHtml(tokens)}</td>
        <td>${escapeHtml(cost)}</td>
        <td>${e.credits || 0}</td>
        <td>${statusBadge}</td>
      </tr>`;
    }).join('');
    return `<table>
      <thead><tr>
        <th>Time</th><th>Org</th><th>User</th><th>Operation</th><th>Model</th>
        <th>Tokens In/Out</th><th>$ Cost</th><th>Credits</th><th>Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // -------------------- Leaderboard --------------------
  window.render_leaderboard = async function() {
    const panel = document.getElementById('tab-leaderboard');
    panel.innerHTML = `
      <div class="filters">
        <select id="lb-window">
          <option value="24h">Last 24h</option>
          <option value="7d">Last 7d</option>
          <option value="30d" selected>Last 30d</option>
        </select>
        <button id="lb-refresh">Refresh</button>
      </div>
      <div id="lb-table" class="loading">Loading...</div>
    `;
    document.getElementById('lb-window').addEventListener('change', loadLeaderboard);
    document.getElementById('lb-refresh').addEventListener('click', loadLeaderboard);
    await loadLeaderboard();
  };

  async function loadLeaderboard() {
    const windowVal = document.getElementById('lb-window').value;
    const res = await PEAuth.authFetch(`${API}/internal/usage/leaderboard?window=${windowVal}`).then(r => r.json());
    const rows = res.rows || [];

    const tbl = document.getElementById('lb-table');
    tbl.className = '';
    if (!rows.length) {
      tbl.innerHTML = '<div class="empty">No usage data in the selected window.</div>';
      return;
    }
    tbl.innerHTML = `<table>
      <thead><tr>
        <th>Org</th><th>User</th><th>Role</th>
        <th>Calls</th><th>Tokens</th><th>$ Cost</th><th>Credits</th>
        <th>Top Op</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>${rows.map(r => {
        const cls = r.isBlocked ? ' class="anomaly"' : '';
        const statusHtml = [
          r.isBlocked ? '<span class="badge badge-error">BLOCKED</span>' : '',
          r.isThrottled ? '<span class="badge badge-error">THROTTLED</span>' : '',
          (!r.isBlocked && !r.isThrottled) ? '<span class="badge badge-success">OK</span>' : '',
        ].filter(Boolean).join(' ');
        return `<tr${cls}>
          <td>${escapeHtml(r.orgName ?? '')}</td>
          <td>${escapeHtml(r.email ?? '')}</td>
          <td>${escapeHtml(r.role ?? '')}</td>
          <td>${r.calls}</td>
          <td>${r.tokens.toLocaleString()}</td>
          <td>$${r.costUsd.toFixed(4)}</td>
          <td>${r.credits}</td>
          <td>${escapeHtml(r.topOperation)}</td>
          <td>${statusHtml}</td>
          <td>
            <button data-action="throttle" data-id="${escapeHtml(r.userId)}" data-value="${!r.isThrottled}">${r.isThrottled ? 'Unthrottle' : 'Throttle'}</button>
            <button class="danger" data-action="block" data-id="${escapeHtml(r.userId)}" data-value="${!r.isBlocked}">${r.isBlocked ? 'Unblock' : 'Block'}</button>
          </td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;

    document.querySelectorAll('#lb-table button[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { action, id, value } = btn.dataset;
        if (!confirm(`${action} user ${id}?`)) return;
        await PEAuth.authFetch(`${API}/internal/users/${id}/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: value === 'true' }),
        });
        loadLeaderboard();
      });
    });
  }

  // -------------------- Cost Breakdown --------------------
  let costChart = null;
  window.render_breakdown = async function() {
    const panel = document.getElementById('tab-breakdown');
    panel.innerHTML = `
      <canvas id="cost-chart" style="max-height: 320px;"></canvas>
      <h3>Operation totals (last 30d)</h3>
      <div id="reconciliation"></div>
    `;
    const res = await PEAuth.authFetch(`${API}/internal/usage/cost-breakdown?days=30`).then(r => r.json());
    const series = res.series || [];
    const reconciliation = res.reconciliation || [];

    const allOps = [...new Set(series.flatMap(s => Object.keys(s.byOperation)))];
    const palette = ['#003366', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#ec4899', '#f97316', '#14b8a6'];
    const datasets = allOps.map((op, i) => ({
      label: op,
      data: series.map(s => Number(s.byOperation[op] ?? 0)),
      backgroundColor: palette[i % palette.length],
    }));

    if (costChart) costChart.destroy();
    costChart = new Chart(document.getElementById('cost-chart'), {
      type: 'bar',
      data: { labels: series.map(s => s.day), datasets },
      options: {
        responsive: true,
        scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => '$' + v } } },
        plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(4)}` } } },
      },
    });

    document.getElementById('reconciliation').innerHTML = reconciliation.length === 0
      ? '<div class="empty">No data yet.</div>'
      : `<table>
          <thead><tr><th>Operation</th><th>Total $ spent</th><th>Credits awarded</th><th>$ per credit</th></tr></thead>
          <tbody>${reconciliation.map(r => `
            <tr>
              <td>${escapeHtml(r.operation)}</td>
              <td>$${Number(r.costUsd).toFixed(4)}</td>
              <td>${r.credits}</td>
              <td>$${(r.credits > 0 ? Number(r.costUsd) / r.credits : 0).toFixed(6)}</td>
            </tr>
          `).join('')}</tbody>
        </table>`;
  };

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Initial render: Live Feed
  window.render_feed();
})();

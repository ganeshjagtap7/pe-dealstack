/**
 * PE OS — Onboarding Flow Controller
 *
 * Manages welcome -> checklist -> task modal flow.
 * Uses OnboardingTasks (onboarding-tasks.js) for modal content.
 * Uses PEAuth (auth.js) for authentication + API calls.
 */

(function () {
  'use strict';

  // 3 core tasks — pipeline, sources, and more live in the app
  const TASKS = [
    { id: 'firm', title: 'Define your investment focus', subtitle: 'So we can tailor findings to your strategy', icon: 'business', time: '30s' },
    { id: 'cim', title: 'Upload your first deal', subtitle: 'A CIM, teaser, or use our sample to try it out', icon: 'upload_file', time: '10s' },
    { id: 'team', title: 'Invite your team', subtitle: 'Optional — you can do this later', icon: 'group_add', time: '30s' },
  ];

  // State
  const state = {
    completed: new Set(),
    activeTaskId: null,
    data: {
      firm: { name: '', url: '', linkedin: '', aum: '' },
      sectors: [],
      sampleDeal: null,
      cimFile: null,
    },
  };

  // DOM refs
  const $ = (sel) => document.getElementById(sel);

  // ==========================================
  // Auth + Init
  // ==========================================

  async function init() {
    await PEAuth.initSupabase();
    const auth = await PEAuth.checkAuth();
    if (!auth) return;

    // Load existing onboarding state from API
    await loadOnboardingState();

    // If already fully onboarded, redirect to dashboard
    if (state.completed.size >= TASKS.length) {
      window.location.href = '/dashboard.html';
      return;
    }

    bindEvents();
    renderChecklist();
    updateProgress();
  }

  async function loadOnboardingState() {
    try {
      const resp = await PEAuth.authFetch(`${API_BASE_URL}/onboarding/status`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.steps) {
        // Map old step IDs to new ones where possible
        const stepMapping = {
          createDeal: 'firm',
          uploadDocument: 'cim',
          reviewExtraction: null,
          tryDealChat: null,
          inviteTeamMember: 'team',
        };
        Object.entries(data.steps).forEach(([oldId, done]) => {
          if (done) {
            const newId = stepMapping[oldId];
            if (newId) state.completed.add(newId);
          }
        });
      }
      // Also check for new-format completed steps
      if (data.onboardingCompleted) {
        const completedSteps = data.onboardingCompleted;
        if (Array.isArray(completedSteps)) {
          completedSteps.forEach(id => state.completed.add(id));
        }
      }
    } catch {
      // Continue with empty state
    }
  }

  // ==========================================
  // Event Binding
  // ==========================================

  function bindEvents() {
    // Welcome buttons
    $('btn-lets-go').addEventListener('click', () => startChecklist(false));
    $('btn-sample').addEventListener('click', () => startChecklist(true));

    // Enter key on welcome
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && $('view-welcome').classList.contains('active')) {
        startChecklist(false);
      }
      if (e.key === 'Escape') closeModal();
    });

    // Nav buttons
    $('skip-btn').addEventListener('click', skipAll);
    $('btn-go-home').addEventListener('click', openWorkspace);
    $('btn-open-workspace').addEventListener('click', openWorkspace);

    // Modal buttons
    $('modal-close-x').addEventListener('click', closeModal);
    $('modal-cancel').addEventListener('click', closeModal);
    $('modal-complete').addEventListener('click', completeTask);

    // Backdrop click closes modal
    $('modal-backdrop').addEventListener('click', (e) => {
      if (e.target === $('modal-backdrop')) closeModal();
    });
  }

  // ==========================================
  // Welcome -> Checklist
  // ==========================================

  function startChecklist(useSample) {
    if (useSample) {
      state.completed.add('cim');
      state.data.sampleDeal = 'luktara';
    }
    $('view-welcome').classList.remove('active');
    $('view-checklist').classList.add('active');
    renderChecklist();
    updateProgress();
    window.scrollTo(0, 0);

    // Mark welcome as shown so dashboard won't redirect back here
    markWelcomeShown();
  }

  function skipAll() {
    // Show custom confirmation modal instead of browser confirm()
    const existing = document.getElementById('ob-skip-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ob-skip-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:60;background:rgba(17,24,39,0.45);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML = `
      <div style="animation:modalIn 260ms cubic-bezier(0.16,1,0.3,1) both;background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.15);width:100%;max-width:400px;overflow:hidden;">
        <div style="padding:24px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div style="width:36px;height:36px;border-radius:8px;background:#E6EEF5;display:flex;align-items:center;justify-content:center;">
              <span class="material-symbols-outlined" style="font-size:20px;color:#003366;">info</span>
            </div>
            <h3 style="font-family:Manrope,Inter,sans-serif;font-size:16px;font-weight:700;color:#111827;margin:0;">Skip setup?</h3>
          </div>
          <p style="font-size:13.5px;color:#4B5563;line-height:1.5;margin:0;">
            You can always finish setting up later from the sidebar checklist on your dashboard.
          </p>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;padding:16px 24px;background:#F9FAFB;border-top:1px solid #E5E7EB;">
          <button id="ob-skip-cancel" style="padding:8px 16px;font-size:13px;font-weight:500;color:#4B5563;background:#fff;border:1px solid #E5E7EB;border-radius:8px;cursor:pointer;">
            Continue setup
          </button>
          <button id="ob-skip-confirm" style="padding:8px 16px;font-size:13px;font-weight:600;color:#fff;background:#003366;border:none;border-radius:8px;cursor:pointer;">
            Skip to dashboard
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('ob-skip-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('ob-skip-confirm').addEventListener('click', async () => {
      const btn = document.getElementById('ob-skip-confirm');
      btn.textContent = 'Redirecting...';
      btn.disabled = true;
      await Promise.all([markWelcomeShown(), markOnboardingSkipped()]);
      openWorkspace();
    });
  }

  function openWorkspace() {
    // If user uploaded a deal, go directly to it
    if (state.data.dealId) {
      window.location.href = `/deal.html?id=${state.data.dealId}`;
    } else {
      window.location.href = '/dashboard.html';
    }
  }

  // ==========================================
  // Checklist Rendering
  // ==========================================

  function renderChecklist() {
    const ul = $('checklist');
    ul.innerHTML = '';

    // First incomplete task
    const firstIncomplete = TASKS.find(t => !state.completed.has(t.id));

    TASKS.forEach((t, i) => {
      const isDone = state.completed.has(t.id);
      const isActive = !isDone && firstIncomplete && firstIncomplete.id === t.id;

      const li = document.createElement('li');
      li.className = `check-row ${isDone ? 'done' : ''} px-5 py-4 flex items-center gap-4`;

      // Circle
      let circleHtml;
      if (isDone) {
        circleHtml = `<span class="circle done"><span class="material-symbols-outlined">check</span></span>`;
      } else if (isActive) {
        circleHtml = `<span class="circle active">${i + 1}</span>`;
      } else {
        circleHtml = `<span class="circle pending">${i + 1}</span>`;
      }

      // Time estimate
      const timeHtml = `<span class="text-[12px] text-text-muted font-mono whitespace-nowrap">${t.time}</span>`;

      // Action button
      let actionHtml;
      if (isDone) {
        actionHtml = `<span class="material-symbols-outlined text-secondary" style="font-size:20px;font-variation-settings:'FILL' 1">check_circle</span>`;
      } else if (isActive) {
        actionHtml = `<button class="btn-primary" style="font-size:12.5px;padding:6px 12px" data-open-task="${t.id}">Continue<span class="material-symbols-outlined" style="font-size:15px">arrow_forward</span></button>`;
      } else {
        actionHtml = `<button class="btn-ghost" style="font-size:12.5px;padding:6px 12px" data-open-task="${t.id}">Start</button>`;
      }

      li.innerHTML = `
        ${circleHtml}
        <div class="flex-1 min-w-0">
          <div class="title text-[14px] font-semibold text-text-main">${t.title}</div>
          <div class="subtitle text-[12.5px] text-text-secondary mt-0.5">${t.subtitle}</div>
        </div>
        ${timeHtml}
        ${actionHtml}
      `;

      ul.appendChild(li);
    });

    // Bind task open buttons
    ul.querySelectorAll('[data-open-task]').forEach(btn => {
      btn.addEventListener('click', () => openTask(btn.dataset.openTask));
    });
  }

  function updateProgress() {
    const done = TASKS.filter(t => state.completed.has(t.id)).length;
    const total = TASKS.length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);

    $('progress-fill').style.width = pct + '%';
    $('progress-label').textContent = `Getting started \u00B7 ${done} of ${total} complete`;
    $('nav-status').textContent = done === 0 ? '' : `${done}/${total} done`;

    const titleEl = $('progress-title');
    const subEl = $('progress-sub');
    if (done === 0) {
      titleEl.textContent = 'Three steps to your first deal.';
      subEl.textContent = 'Do them in order, top to bottom. Under 3 minutes.';
    } else if (done < total) {
      titleEl.textContent = "You're making progress.";
      subEl.textContent = `${total - done} ${total - done === 1 ? 'step' : 'steps'} left. Your AI analyst is working in the background.`;
    } else {
      titleEl.textContent = "You're all set.";
      subEl.textContent = 'Your AI analyst already found things on your deal.';
    }

    const allDone = done >= total;
    $('completion-cta').classList.toggle('hidden', !allDone);

    // Load dynamic findings when all tasks are done
    if (allDone) loadCompletionFindings();
  }

  // ==========================================
  // Task Modal
  // ==========================================

  function openTask(id) {
    state.activeTaskId = id;
    const task = TASKS.find(t => t.id === id);
    if (!task) return;

    $('modal-title').textContent = task.title;
    $('modal-icon').textContent = task.icon;
    $('modal-body').innerHTML = window.OnboardingTasks.renderBody(id);
    $('modal-backdrop').classList.remove('hidden');
    $('modal-backdrop').classList.add('flex');
    document.body.style.overflow = 'hidden';

    window.OnboardingTasks.hydrate(id, state);
  }

  function closeModal() {
    $('modal-backdrop').classList.add('hidden');
    $('modal-backdrop').classList.remove('flex');
    document.body.style.overflow = '';
    state.activeTaskId = null;
  }

  function completeTask() {
    if (!state.activeTaskId) return;

    const taskId = state.activeTaskId;
    state.completed.add(taskId);

    // Persist to backend
    saveTaskCompletion(taskId);

    closeModal();
    renderChecklist();
    updateProgress();

    // Confetti on full completion
    if (TASKS.every(t => state.completed.has(t.id))) {
      fireConfetti();
      markOnboardingComplete();
    }
  }

  // ==========================================
  // Backend Persistence
  // ==========================================

  async function saveTaskCompletion(taskId) {
    try {
      // Map new task IDs to existing onboarding step IDs
      const reverseMapping = {
        firm: 'createDeal',
        cim: 'uploadDocument',
        team: 'inviteTeamMember',
      };
      const existingStepId = reverseMapping[taskId];
      if (existingStepId) {
        await PEAuth.authFetch(`${API_BASE_URL}/onboarding/complete-step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: existingStepId }),
        });
      }
    } catch {
      // Non-blocking — user can still proceed
    }
  }

  async function markWelcomeShown() {
    try {
      await PEAuth.authFetch(`${API_BASE_URL}/onboarding/welcome-shown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // Non-blocking
    }
  }

  async function markOnboardingComplete() {
    try {
      await PEAuth.authFetch(`${API_BASE_URL}/onboarding/complete-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'createDeal' }),
      });
    } catch {
      // Non-blocking
    }
  }

  async function markOnboardingSkipped() {
    try {
      await PEAuth.authFetch(`${API_BASE_URL}/onboarding/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // Non-blocking
    }
  }

  // ==========================================
  // Dynamic Completion Findings
  // ==========================================

  const SEVERITY_CONFIG = {
    critical: { icon: 'warning', iconColor: 'text-red-500', badge: 'Critical', badgeClass: 'text-red-600 bg-red-50' },
    high:     { icon: 'warning', iconColor: 'text-red-500', badge: 'High',     badgeClass: 'text-red-600 bg-red-50' },
    warning:  { icon: 'error',   iconColor: 'text-amber-500', badge: 'Watch', badgeClass: 'text-amber-700 bg-amber-50' },
    medium:   { icon: 'error',   iconColor: 'text-amber-500', badge: 'Watch', badgeClass: 'text-amber-700 bg-amber-50' },
    positive: { icon: 'trending_up', iconColor: 'text-secondary', badge: 'Positive', badgeClass: 'text-secondary bg-secondary-light' },
    low:      { icon: 'info',    iconColor: 'text-blue-500', badge: 'Info',    badgeClass: 'text-blue-600 bg-blue-50' },
  };

  async function loadCompletionFindings() {
    const container = $('completion-findings');
    const titleEl = $('completion-title');
    const subEl = $('completion-sub');

    // Show loading shimmer while fetching
    container.innerHTML = `
      <div class="space-y-2.5">
        <div class="h-16 rounded-lg bg-gray-100 animate-pulse"></div>
        <div class="h-16 rounded-lg bg-gray-100 animate-pulse"></div>
        <div class="h-16 rounded-lg bg-gray-100 animate-pulse"></div>
      </div>
    `;
    titleEl.textContent = 'Checking what your AI analyst found...';
    subEl.textContent = 'Loading findings from your deal.';

    try {
      // Fetch the user's most recent deal
      const dealsResp = await PEAuth.authFetch(`${API_BASE_URL}/deals?sortBy=updatedAt&sortOrder=desc`);
      if (!dealsResp.ok) throw new Error('No deals');
      const dealsData = await dealsResp.json();
      const deals = Array.isArray(dealsData) ? dealsData : (dealsData?.deals || []);

      if (deals.length === 0) {
        renderNoFindings(titleEl, subEl, container);
        return;
      }

      const dealId = deals[0].id;
      state.data.dealId = dealId;

      // Try fetching red flags / analysis from the deal
      const analysisResp = await PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/analysis`);
      if (analysisResp.ok) {
        const analysis = await analysisResp.json();
        const redFlags = analysis?.redFlags?.flags || analysis?.redFlags || [];

        if (redFlags.length > 0) {
          renderFindings(titleEl, subEl, container, redFlags.slice(0, 5));
          return;
        }
      }

      // Fallback: check financial statements for any data
      const finResp = await PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/financials`);
      if (finResp.ok) {
        const finData = await finResp.json();
        const statements = Array.isArray(finData) ? finData : (finData?.statements || []);
        if (statements.length > 0) {
          titleEl.textContent = `Your workspace is ready.`;
          subEl.textContent = `We extracted ${statements.length} financial statement${statements.length > 1 ? 's' : ''} from your deal. Dive in to see the full analysis.`;
          container.innerHTML = '';
          return;
        }
      }

      // No findings yet — extraction may still be running
      renderNoFindings(titleEl, subEl, container);

    } catch {
      // API error — show generic success
      renderNoFindings(titleEl, subEl, container);
    }

    // Start polling for Phase 2 if not already running
    startDeepResearchPolling();
  }

  function renderFindings(titleEl, subEl, container, flags) {
    titleEl.textContent = `Your AI analyst found ${flags.length} thing${flags.length > 1 ? 's' : ''} on your deal.`;
    subEl.textContent = "Here's a preview. Click any finding to see the exact page it came from.";

    container.innerHTML = flags.map(flag => {
      const severity = (flag.severity || flag.type || 'medium').toLowerCase();
      const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.medium;
      const title = flag.title || flag.flag || flag.description || 'Finding';
      const detail = flag.detail || flag.explanation || flag.source || '';

      return `
        <div class="border border-border-subtle rounded-lg p-3.5 flex items-start gap-3 hover:bg-gray-50 transition cursor-pointer">
          <span class="material-symbols-outlined ${config.iconColor} mt-0.5" style="font-size:20px;font-variation-settings:'FILL' 1">${config.icon}</span>
          <div class="flex-1 min-w-0">
            <div class="text-[13.5px] font-semibold">${escapeHtml(title)}</div>
            ${detail ? `<div class="text-[12px] text-text-muted mt-0.5">${escapeHtml(detail)}</div>` : ''}
          </div>
          <span class="text-[11px] font-semibold uppercase px-2 py-0.5 rounded flex-shrink-0 ${config.badgeClass}">${config.badge}</span>
        </div>
      `;
    }).join('');
  }

  function renderNoFindings(titleEl, subEl, container) {
    titleEl.textContent = 'Your workspace is ready.';
    subEl.textContent = 'Your AI analyst is still processing. Findings will appear on your dashboard shortly.';
    container.innerHTML = `
      <div class="border border-border-subtle rounded-lg p-4 flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-primary-light flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined text-primary" style="font-size:20px;font-variation-settings:'FILL' 1">auto_awesome</span>
        </div>
        <div>
          <div class="text-[13.5px] font-semibold text-text-main">AI extraction in progress</div>
          <div class="text-[12px] text-text-muted mt-0.5">Red flags, financials, and signals will stream in as they're discovered.</div>
        </div>
      </div>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ==========================================
  // Phase 2 Deep Research Polling
  // ==========================================

  let _pollInterval = null;
  let _pollCount = 0;
  const MAX_POLLS = 36; // 3 minutes at 5s intervals

  function startDeepResearchPolling() {
    if (_pollInterval) return;
    _pollCount = 0;

    _pollInterval = setInterval(async () => {
      _pollCount++;
      if (_pollCount > MAX_POLLS) {
        stopDeepResearchPolling();
        return;
      }

      try {
        const resp = await PEAuth.authFetch(`${API_BASE_URL}/onboarding/research-status`);
        if (!resp.ok) return;
        const data = await resp.json();

        if (data.phase === 2 && data.status === 'complete') {
          stopDeepResearchPolling();
          // Update preview card if still visible
          if (window._onDeepResearchComplete) window._onDeepResearchComplete(data.newInsightsCount);
          // Show notification on completion screen
          showDeepResearchNotification(data.newInsightsCount);
        }
      } catch {
        // Silent — polling is best-effort
      }
    }, 5000);
  }

  function stopDeepResearchPolling() {
    if (_pollInterval) {
      clearInterval(_pollInterval);
      _pollInterval = null;
    }
  }

  function showDeepResearchNotification(insightsCount) {
    if (insightsCount === 0) return;

    const cta = $('completion-cta');
    if (!cta || cta.classList.contains('hidden')) {
      // User hasn't reached completion screen yet — show on next load
      return;
    }

    // Create slide-in notification at top of completion CTA
    const notification = document.createElement('div');
    notification.id = 'deep-research-notification';
    notification.style.cssText = 'animation: slideDown 300ms ease-out both; margin-bottom: 12px;';
    notification.innerHTML = `
      <div class="flex items-center justify-between gap-3 p-3 rounded-lg border border-primary/20 bg-primary-light/40">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-white" style="font-size:16px;font-variation-settings:'FILL' 1">auto_awesome</span>
          </div>
          <div>
            <div class="text-[13px] font-semibold text-text-main flex items-center gap-2">
              Your AI analyst found ${insightsCount} more insight${insightsCount > 1 ? 's' : ''} about your firm
              <span class="pulse-dot"></span>
            </div>
            <button id="deep-research-view" class="text-[12px] text-primary font-medium hover:underline mt-0.5">View full profile</button>
          </div>
        </div>
        <button id="deep-research-dismiss" class="text-text-muted hover:text-text-main p-1">
          <span class="material-symbols-outlined" style="font-size:16px">close</span>
        </button>
      </div>
    `;

    // Add animation keyframe if not already present
    if (!document.getElementById('slide-down-style')) {
      const style = document.createElement('style');
      style.id = 'slide-down-style';
      style.textContent = '@keyframes slideDown { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }';
      document.head.appendChild(style);
    }

    // Insert at top of completion CTA
    cta.insertBefore(notification, cta.firstChild);

    // Bind dismiss
    const dismissBtn = document.getElementById('deep-research-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => notification.remove());
    }

    // Bind "View full profile" — reload findings
    const viewBtn = document.getElementById('deep-research-view');
    if (viewBtn) {
      viewBtn.addEventListener('click', () => {
        notification.remove();
        loadCompletionFindings(); // Reload with enriched data
      });
    }

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'fadeIn 200ms ease reverse both';
        setTimeout(() => notification.remove(), 200);
      }
    }, 8000);
  }

  // Expose for onboarding-tasks.js to trigger
  window._startDeepResearchPolling = startDeepResearchPolling;

  // ==========================================
  // Confetti
  // ==========================================

  function fireConfetti() {
    const colors = ['#003366', '#059669', '#E6EEF5', '#F59E0B', '#6366F1'];
    for (let i = 0; i < 60; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.background = colors[i % colors.length];
      c.style.left = (Math.random() * 100) + '%';
      c.style.animation = `fall ${1 + Math.random() * 1.5}s ease-out ${Math.random() * 0.4}s forwards`;
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3000);
    }
  }

  // ==========================================
  // Boot
  // ==========================================

  document.addEventListener('DOMContentLoaded', init);

})();

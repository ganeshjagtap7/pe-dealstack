// ============================================================
// AI Tools — Frontend for AI Agent Endpoints
// Contact Enrichment, Meeting Prep, Signal Monitor, Email Drafter
// Depends on: API_BASE_URL, PEAuth, showNotification, escapeHtml
// ============================================================

const AI_API = {
    enrichContact: (body) => PEAuth.authFetch(`${API_BASE_URL}/ai/enrich-contact`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
    meetingPrep: (body) => PEAuth.authFetch(`${API_BASE_URL}/ai/meeting-prep`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
    scanSignals: () => PEAuth.authFetch(`${API_BASE_URL}/ai/scan-signals`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    }),
    draftEmail: (body) => PEAuth.authFetch(`${API_BASE_URL}/ai/draft-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
    emailTemplates: () => PEAuth.authFetch(`${API_BASE_URL}/ai/email-templates`),
};

// ============================================================
// 1. CONTACT ENRICHMENT
// ============================================================

let _enriching = false;

async function enrichCurrentContact() {
    if (_enriching || !currentContact) return;
    const btn = document.getElementById('action-enrich');
    if (!btn) return;

    _enriching = true;
    const origHTML = btn.innerHTML;
    btn.innerHTML = `<span class="material-symbols-outlined text-[16px] animate-spin">sync</span> Enriching...`;
    btn.disabled = true;

    try {
        const res = await AI_API.enrichContact({ contactId: currentContact.id });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Request failed (${res.status})`);
        }
        const result = await res.json();
        showEnrichmentResults(result);

        if (result.status === 'completed') {
            showNotification('Enrichment Complete', `Contact enriched with ${result.confidence}% confidence`, 'success');
            // Refresh the detail panel to show updated data
            openDetail(currentContact.id);
        } else if (result.status === 'needs_review') {
            showNotification('Review Needed', `Low confidence (${result.confidence}%) — review suggested data`, 'warning');
        } else {
            showNotification('Enrichment Failed', result.error || 'Unknown error', 'error');
        }
    } catch (err) {
        console.error('Enrichment error:', err);
        showNotification('Error', err.message, 'error');
    } finally {
        _enriching = false;
        btn.innerHTML = origHTML;
        btn.disabled = false;
    }
}

function showEnrichmentResults(result) {
    const body = document.getElementById('detail-body');
    if (!body) return;

    const data = result.enrichedData || {};
    const statusColor = result.status === 'completed' ? 'text-secondary' : result.status === 'needs_review' ? 'text-amber-600' : 'text-red-500';
    const statusBg = result.status === 'completed' ? 'bg-secondary-light border-secondary/20' : result.status === 'needs_review' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
    const statusLabel = result.status === 'completed' ? 'Auto-saved' : result.status === 'needs_review' ? 'Needs Review' : 'Failed';

    let enrichHTML = `
        <div id="enrichment-results" class="mb-6 p-4 rounded-xl border ${statusBg}" style="animation: slideIn 0.3s ease-out;">
            <div class="flex items-center justify-between mb-3">
                <h4 class="text-xs font-bold uppercase tracking-wider ${statusColor} flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[16px]">auto_awesome</span>
                    AI Enrichment — ${escapeHtml(statusLabel)}
                </h4>
                <span class="text-xs font-bold ${statusColor}">${result.confidence}% confidence</span>
            </div>
            <div class="flex flex-col gap-2 text-sm">
    `;

    if (data.title) enrichHTML += `<div class="flex items-center gap-2"><span class="text-text-muted text-xs w-20 shrink-0">Title</span><span class="text-text-main font-medium">${escapeHtml(data.title)}</span></div>`;
    if (data.company) enrichHTML += `<div class="flex items-center gap-2"><span class="text-text-muted text-xs w-20 shrink-0">Company</span><span class="text-text-main font-medium">${escapeHtml(data.company)}</span></div>`;
    if (data.industry) enrichHTML += `<div class="flex items-center gap-2"><span class="text-text-muted text-xs w-20 shrink-0">Industry</span><span class="text-text-main font-medium">${escapeHtml(data.industry)}</span></div>`;
    if (data.location) enrichHTML += `<div class="flex items-center gap-2"><span class="text-text-muted text-xs w-20 shrink-0">Location</span><span class="text-text-main font-medium">${escapeHtml(data.location)}</span></div>`;
    if (data.dealRelevance) enrichHTML += `<div class="flex items-center gap-2"><span class="text-text-muted text-xs w-20 shrink-0">Relevance</span><span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${data.dealRelevance === 'high' ? 'bg-secondary-light text-secondary' : data.dealRelevance === 'medium' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-text-muted'}">${escapeHtml(data.dealRelevance)}</span></div>`;
    if (data.bio) enrichHTML += `<p class="text-xs text-text-secondary mt-1 leading-relaxed italic">${escapeHtml(data.bio)}</p>`;
    if (data.expertise && data.expertise.length > 0) {
        enrichHTML += `<div class="flex flex-wrap gap-1 mt-1">${data.expertise.map(e => `<span class="px-2 py-0.5 rounded-full bg-primary-light text-primary text-[10px] font-medium">${escapeHtml(e)}</span>`).join('')}</div>`;
    }
    if (result.sources && result.sources.length > 0) {
        enrichHTML += `<p class="text-[10px] text-text-muted mt-2">Sources: ${result.sources.map(s => escapeHtml(s)).join(', ')}</p>`;
    }

    enrichHTML += `</div></div>`;

    // Insert at the top of the body
    const existingResults = document.getElementById('enrichment-results');
    if (existingResults) existingResults.remove();
    body.insertAdjacentHTML('afterbegin', enrichHTML);
}

// ============================================================
// 2. MEETING PREP
// ============================================================

function openMeetingPrepModal(dealId, dealName) {
    // Remove existing modal if any
    const existing = document.getElementById('meeting-prep-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'meeting-prep-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onclick="closeMeetingPrepModal()"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden border border-border-subtle" style="animation: slideIn 0.2s ease-out;">
            <div class="px-6 py-4 border-b border-border-subtle flex items-center justify-between" style="background: linear-gradient(135deg, #003366, #004488);">
                <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-white/80 text-xl">event_note</span>
                    <div>
                        <h2 class="text-base font-bold text-white">AI Meeting Prep</h2>
                        <p class="text-xs text-white/60">${escapeHtml(dealName || 'Deal')}</p>
                    </div>
                </div>
                <button onclick="closeMeetingPrepModal()" class="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>
            <!-- Input Form -->
            <div id="meeting-prep-form" class="p-6">
                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label class="block text-xs font-medium text-text-secondary mb-1.5">Meeting Topic</label>
                        <input id="mp-topic" type="text" placeholder="e.g. Initial management meeting"
                            class="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors" />
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-text-secondary mb-1.5">Meeting Date</label>
                        <input id="mp-date" type="date" value="${new Date().toISOString().split('T')[0]}"
                            class="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors" />
                    </div>
                </div>
                <button onclick="generateMeetingPrep('${escapeHtml(dealId)}')" style="background-color: #003366;"
                    class="w-full py-2.5 text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                    <span class="material-symbols-outlined text-lg">auto_awesome</span>
                    Generate Meeting Brief
                </button>
            </div>
            <!-- Results (hidden initially) -->
            <div id="meeting-prep-results" class="hidden overflow-y-auto max-h-[60vh] custom-scrollbar"></div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeMeetingPrepModal() {
    const modal = document.getElementById('meeting-prep-modal');
    if (modal) modal.remove();
}

async function generateMeetingPrep(dealId) {
    const topic = document.getElementById('mp-topic')?.value || '';
    const date = document.getElementById('mp-date')?.value || '';
    const form = document.getElementById('meeting-prep-form');
    const results = document.getElementById('meeting-prep-results');

    form.innerHTML = `
        <div class="flex flex-col items-center justify-center py-10">
            <span class="material-symbols-outlined text-primary text-3xl animate-spin mb-3">sync</span>
            <p class="text-sm font-medium text-text-main">Generating meeting brief...</p>
            <p class="text-xs text-text-muted mt-1">Analyzing deal data, contacts, and documents</p>
        </div>
    `;

    try {
        const res = await AI_API.meetingPrep({ dealId, meetingTopic: topic, meetingDate: date });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Request failed (${res.status})`);
        }
        const brief = await res.json();
        form.classList.add('hidden');
        results.classList.remove('hidden');
        renderMeetingBrief(brief);
    } catch (err) {
        form.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10">
                <span class="material-symbols-outlined text-red-500 text-3xl mb-3">error</span>
                <p class="text-sm font-medium text-text-main mb-1">Failed to generate brief</p>
                <p class="text-xs text-text-muted">${escapeHtml(err.message)}</p>
                <button onclick="closeMeetingPrepModal()" class="mt-4 px-4 py-2 text-sm text-text-secondary hover:text-text-main transition-colors">Close</button>
            </div>
        `;
    }
}

function renderMeetingBrief(brief) {
    const container = document.getElementById('meeting-prep-results');
    if (!container) return;

    const sections = [
        { icon: 'summarize', title: 'Deal Summary', content: brief.dealSummary, type: 'text' },
        { icon: 'person', title: 'Contact Profile', content: brief.contactProfile, type: 'text' },
        { icon: 'campaign', title: 'Key Talking Points', content: brief.keyTalkingPoints, type: 'list' },
        { icon: 'help', title: 'Questions to Ask', content: brief.questionsToAsk, type: 'list' },
        { icon: 'warning', title: 'Risks to Address', content: brief.risksToAddress, type: 'list' },
        { icon: 'description', title: 'Document Highlights', content: brief.documentHighlights, type: 'list' },
        { icon: 'calendar_today', title: 'Suggested Agenda', content: brief.suggestedAgenda, type: 'numbered' },
    ];

    let html = `
        <div class="px-6 py-4 border-b border-border-subtle bg-primary-light/30">
            <h3 class="text-base font-bold text-primary">${escapeHtml(brief.headline || 'Meeting Brief')}</h3>
            <p class="text-[10px] text-text-muted mt-1">Generated ${new Date(brief.generatedAt).toLocaleString()}</p>
        </div>
        <div class="p-6 flex flex-col gap-5">
    `;

    for (const s of sections) {
        if (!s.content || (Array.isArray(s.content) && s.content.length === 0)) continue;
        html += `
            <div>
                <h4 class="text-xs font-bold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-primary text-[16px]">${s.icon}</span>
                    ${escapeHtml(s.title)}
                </h4>
        `;
        if (s.type === 'text') {
            html += `<p class="text-sm text-text-secondary leading-relaxed">${escapeHtml(s.content)}</p>`;
        } else if (s.type === 'list') {
            html += `<ul class="flex flex-col gap-1.5">${s.content.map(item => `<li class="text-sm text-text-secondary flex items-start gap-2"><span class="text-primary mt-1 text-[6px]">●</span><span>${escapeHtml(item)}</span></li>`).join('')}</ul>`;
        } else if (s.type === 'numbered') {
            html += `<ol class="flex flex-col gap-1.5">${s.content.map((item, i) => `<li class="text-sm text-text-secondary flex items-start gap-2"><span class="text-primary font-bold text-xs w-4 shrink-0">${i + 1}.</span><span>${escapeHtml(item)}</span></li>`).join('')}</ol>`;
        }
        html += `</div>`;
    }

    html += `
        </div>
        <div class="px-6 py-4 border-t border-border-subtle bg-gray-50 flex justify-end">
            <button onclick="closeMeetingPrepModal()" class="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-main transition-colors">Close</button>
        </div>
    `;
    container.innerHTML = html;
}

// ============================================================
// 3. DEAL SIGNAL MONITOR
// ============================================================

let _scanning = false;

async function scanDealSignals(btnElement) {
    if (_scanning) return;
    _scanning = true;

    const container = document.getElementById('signals-results');
    const btn = btnElement || document.getElementById('scan-signals-btn');
    if (btn) {
        btn.innerHTML = `<span class="material-symbols-outlined text-[16px] animate-spin">sync</span> Scanning...`;
        btn.disabled = true;
    }

    // Hide empty state, show loading
    const emptyState = document.getElementById('signals-empty');
    if (emptyState) emptyState.classList.add('hidden');

    if (container) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8">
                <span class="material-symbols-outlined text-primary text-2xl animate-spin mb-2">radar</span>
                <p class="text-sm text-text-muted">Scanning portfolio for signals...</p>
            </div>
        `;
        container.classList.remove('hidden');
    }

    try {
        const res = await AI_API.scanSignals();
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Request failed (${res.status})`);
        }
        const result = await res.json();
        if (container) renderSignalResults(result, container);

        const total = result.signals?.length || 0;
        const critical = result.signals?.filter(s => s.severity === 'critical').length || 0;
        if (total > 0) {
            showNotification('Signals Found', `${total} signal${total > 1 ? 's' : ''} detected (${critical} critical)`, critical > 0 ? 'warning' : 'info');
        } else {
            showNotification('No Signals', 'Portfolio looks clean — no actionable signals', 'success');
        }
    } catch (err) {
        console.error('Signal scan error:', err);
        if (container) container.innerHTML = `<div class="p-4 text-center"><p class="text-sm text-red-500">${escapeHtml(err.message)}</p></div>`;
        showNotification('Error', err.message, 'error');
    } finally {
        _scanning = false;
        if (btn) {
            btn.innerHTML = `<span class="material-symbols-outlined text-[16px]">radar</span> Scan Signals`;
            btn.disabled = false;
        }
    }
}

function renderSignalResults(result, container) {
    if (!result.signals || result.signals.length === 0) {
        container.innerHTML = `
            <div class="p-5 text-center">
                <span class="material-symbols-outlined text-secondary text-2xl mb-2">verified</span>
                <p class="text-sm font-medium text-text-main">All Clear</p>
                <p class="text-xs text-text-muted mt-1">No actionable signals detected across ${result.processedCount || 0} deals</p>
            </div>
        `;
        return;
    }

    const severityConfig = {
        critical: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-700', icon: 'error' },
        warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', icon: 'warning' },
        info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700', icon: 'info' },
    };

    const signalTypeIcons = {
        leadership_change: 'person_off', financial_event: 'account_balance', market_shift: 'trending_up',
        competitive_threat: 'swords', regulatory_change: 'gavel', growth_opportunity: 'rocket_launch',
        risk_escalation: 'trending_down', milestone_approaching: 'flag',
    };

    // Sort: critical first, then warning, then info
    const sorted = [...result.signals].sort((a, b) => {
        const order = { critical: 0, warning: 1, info: 2 };
        return (order[a.severity] || 3) - (order[b.severity] || 3);
    });

    let html = `<div class="p-4 flex flex-col gap-3">
        <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-bold text-text-muted uppercase tracking-wider">${sorted.length} Signal${sorted.length > 1 ? 's' : ''} from ${result.processedCount} Deals</span>
        </div>
    `;

    for (const signal of sorted) {
        const sc = severityConfig[signal.severity] || severityConfig.info;
        const typeIcon = signalTypeIcons[signal.signalType] || 'notifications';

        html += `
            <div class="p-3 rounded-lg border ${sc.border} ${sc.bg} transition-all hover:shadow-sm">
                <div class="flex items-start gap-3">
                    <span class="material-symbols-outlined ${sc.text} text-lg mt-0.5">${typeIcon}</span>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-sm font-semibold text-text-main">${escapeHtml(signal.title)}</span>
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${sc.badge}">${escapeHtml(signal.severity)}</span>
                        </div>
                        <p class="text-xs text-text-secondary mb-1.5">${escapeHtml(signal.dealName)}: ${escapeHtml(signal.description)}</p>
                        <p class="text-xs font-medium ${sc.text} flex items-center gap-1">
                            <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
                            ${escapeHtml(signal.suggestedAction)}
                        </p>
                    </div>
                </div>
            </div>
        `;
    }

    html += `</div>`;
    container.innerHTML = html;
}

// ============================================================
// 4. SMART EMAIL DRAFTER
// ============================================================

let _emailTemplates = null;

async function openEmailDraftModal(dealId, dealName, contactId, contactName) {
    // Remove existing modal if any
    const existing = document.getElementById('email-draft-modal');
    if (existing) existing.remove();

    // Load templates
    if (!_emailTemplates) {
        try {
            const res = await AI_API.emailTemplates();
            if (res.ok) {
                const data = await res.json();
                _emailTemplates = data.templates || [];
            }
        } catch (e) { _emailTemplates = []; }
    }

    const templateOptions = (_emailTemplates || []).map(t =>
        `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.id = 'email-draft-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onclick="closeEmailDraftModal()"></div>
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden border border-border-subtle" style="animation: slideIn 0.2s ease-out;">
            <div class="px-6 py-4 border-b border-border-subtle flex items-center justify-between" style="background: linear-gradient(135deg, #003366, #004488);">
                <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-white/80 text-xl">edit_note</span>
                    <div>
                        <h2 class="text-base font-bold text-white">AI Email Drafter</h2>
                        <p class="text-xs text-white/60">${escapeHtml(dealName || contactName || 'New Email')}</p>
                    </div>
                </div>
                <button onclick="closeEmailDraftModal()" class="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                    <span class="material-symbols-outlined text-[20px]">close</span>
                </button>
            </div>
            <!-- Compose Form -->
            <div id="email-draft-form" class="p-6 overflow-y-auto max-h-[65vh] custom-scrollbar">
                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label class="block text-xs font-medium text-text-secondary mb-1.5">Template</label>
                        <select id="ed-template" class="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors">
                            <option value="">No template (free-form)</option>
                            ${templateOptions}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-text-secondary mb-1.5">Tone</label>
                        <select id="ed-tone" class="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors">
                            <option value="professional">Professional</option>
                            <option value="friendly">Friendly</option>
                            <option value="formal">Formal</option>
                            <option value="direct">Direct</option>
                            <option value="warm">Warm</option>
                        </select>
                    </div>
                </div>
                <div class="mb-4">
                    <label class="block text-xs font-medium text-text-secondary mb-1.5">Purpose <span class="text-red-400">*</span></label>
                    <input id="ed-purpose" type="text" placeholder="e.g. Follow up on management meeting, request financials"
                        class="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors" />
                </div>
                <div class="mb-4">
                    <label class="block text-xs font-medium text-text-secondary mb-1.5">Additional Context</label>
                    <textarea id="ed-context" rows="3" placeholder="Any specific details, references, or instructions..."
                        class="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors resize-none"></textarea>
                </div>
                <button onclick="generateEmailDraft('${escapeHtml(dealId || '')}', '${escapeHtml(contactId || '')}')" style="background-color: #003366;"
                    class="w-full py-2.5 text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                    <span class="material-symbols-outlined text-lg">auto_awesome</span>
                    Generate Draft
                </button>
            </div>
            <!-- Results (hidden initially) -->
            <div id="email-draft-results" class="hidden overflow-y-auto max-h-[65vh] custom-scrollbar"></div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeEmailDraftModal() {
    const modal = document.getElementById('email-draft-modal');
    if (modal) modal.remove();
}

async function generateEmailDraft(dealId, contactId) {
    const purpose = document.getElementById('ed-purpose')?.value?.trim();
    if (!purpose || purpose.length < 5) {
        showNotification('Required', 'Please enter a purpose (at least 5 characters)', 'warning');
        return;
    }

    const template = document.getElementById('ed-template')?.value || '';
    const tone = document.getElementById('ed-tone')?.value || 'professional';
    const context = document.getElementById('ed-context')?.value || '';
    const form = document.getElementById('email-draft-form');
    const results = document.getElementById('email-draft-results');

    form.innerHTML = `
        <div class="flex flex-col items-center justify-center py-10">
            <span class="material-symbols-outlined text-primary text-3xl animate-spin mb-3">sync</span>
            <p class="text-sm font-medium text-text-main">Drafting email...</p>
            <p class="text-xs text-text-muted mt-1">Draft → Tone check → Compliance check → Review</p>
        </div>
    `;

    try {
        const body = { purpose, tone };
        if (dealId) body.dealId = dealId;
        if (contactId) body.contactId = contactId;
        if (template) body.templateId = template;
        if (context) body.context = context;

        const res = await AI_API.draftEmail(body);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Request failed (${res.status})`);
        }
        const result = await res.json();
        form.classList.add('hidden');
        results.classList.remove('hidden');
        renderEmailDraft(result);
    } catch (err) {
        form.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10">
                <span class="material-symbols-outlined text-red-500 text-3xl mb-3">error</span>
                <p class="text-sm font-medium text-text-main mb-1">Failed to generate draft</p>
                <p class="text-xs text-text-muted">${escapeHtml(err.message)}</p>
                <button onclick="closeEmailDraftModal()" class="mt-4 px-4 py-2 text-sm text-text-secondary hover:text-text-main transition-colors">Close</button>
            </div>
        `;
    }
}

function renderEmailDraft(result) {
    const container = document.getElementById('email-draft-results');
    if (!container) return;

    const isCompliant = result.isCompliant;
    const statusColor = result.status === 'ready_for_review' ? 'text-secondary' : 'text-amber-600';
    const statusBg = result.status === 'ready_for_review' ? 'bg-secondary-light' : 'bg-amber-50';
    const statusLabel = result.status === 'ready_for_review' ? 'Ready for Review' : 'Compliance Issues';

    let html = `
        <div class="px-6 py-3 border-b border-border-subtle flex items-center justify-between ${statusBg}">
            <span class="text-xs font-bold uppercase tracking-wider ${statusColor} flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[16px]">${isCompliant ? 'check_circle' : 'warning'}</span>
                ${statusLabel}
            </span>
            <span class="text-xs text-text-muted">Tone: ${result.toneScore}/100</span>
        </div>
        <div class="p-6">
            <!-- Subject -->
            <div class="mb-4">
                <label class="block text-xs font-medium text-text-muted mb-1">Subject</label>
                <div class="px-3 py-2 rounded-lg bg-gray-50 border border-border-subtle text-sm font-medium text-text-main">${escapeHtml(result.subject)}</div>
            </div>
            <!-- Body -->
            <div class="mb-4">
                <label class="block text-xs font-medium text-text-muted mb-1">Email Body</label>
                <div class="px-4 py-3 rounded-lg bg-white border border-border-subtle text-sm text-text-secondary leading-relaxed whitespace-pre-wrap" style="min-height: 120px;">${escapeHtml(result.draft)}</div>
            </div>
    `;

    // Tone notes
    if (result.toneNotes && result.toneNotes.length > 0) {
        html += `
            <div class="mb-4">
                <label class="block text-xs font-medium text-text-muted mb-1.5 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">record_voice_over</span> Tone Feedback
                </label>
                <ul class="flex flex-col gap-1">${result.toneNotes.map(n => `<li class="text-xs text-text-secondary flex items-start gap-1.5"><span class="text-primary mt-0.5">•</span>${escapeHtml(n)}</li>`).join('')}</ul>
            </div>
        `;
    }

    // Compliance issues
    if (result.complianceIssues && result.complianceIssues.length > 0) {
        html += `
            <div class="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
                <label class="block text-xs font-bold text-red-700 mb-1.5 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">gavel</span> Compliance Issues
                </label>
                <ul class="flex flex-col gap-1">${result.complianceIssues.map(n => `<li class="text-xs text-red-600 flex items-start gap-1.5"><span class="mt-0.5">⚠</span>${escapeHtml(n)}</li>`).join('')}</ul>
            </div>
        `;
    }

    // Suggestions
    if (result.suggestions && result.suggestions.length > 0) {
        html += `
            <div class="mb-4">
                <label class="block text-xs font-medium text-text-muted mb-1.5 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[14px]">lightbulb</span> Suggestions
                </label>
                <ul class="flex flex-col gap-1">${result.suggestions.map(n => `<li class="text-xs text-text-secondary flex items-start gap-1.5"><span class="text-amber-500 mt-0.5">•</span>${escapeHtml(n)}</li>`).join('')}</ul>
            </div>
        `;
    }

    // Actions
    html += `
        </div>
        <div class="px-6 py-4 border-t border-border-subtle bg-gray-50 flex items-center justify-between">
            <button onclick="copyEmailDraft()" class="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:border-primary/30 hover:text-primary hover:bg-primary-light/50 transition-all">
                <span class="material-symbols-outlined text-[16px]">content_copy</span>
                Copy to Clipboard
            </button>
            <button onclick="closeEmailDraftModal()" class="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-main transition-colors">Close</button>
        </div>
    `;

    container.innerHTML = html;
}

function copyEmailDraft() {
    const subjectEl = document.querySelector('#email-draft-results .bg-gray-50.border');
    const bodyEl = document.querySelector('#email-draft-results .whitespace-pre-wrap');
    if (subjectEl && bodyEl) {
        const text = `Subject: ${subjectEl.textContent}\n\n${bodyEl.textContent}`;
        navigator.clipboard.writeText(text).then(() => {
            showNotification('Copied', 'Email draft copied to clipboard', 'success');
        }).catch(() => {
            showNotification('Error', 'Failed to copy to clipboard', 'error');
        });
    }
}

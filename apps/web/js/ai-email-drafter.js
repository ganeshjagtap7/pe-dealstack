// ============================================================
// AI Email Drafter
// Depends on: AI_API (from ai-tools.js), PEAuth, showNotification, escapeHtml
// ============================================================

let _emailTemplates = null;

async function openEmailDraftModal(dealId, dealName, contactId, contactName) {
    const existing = document.getElementById('email-draft-modal');
    if (existing) existing.remove();

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
            <div class="mb-4">
                <label class="block text-xs font-medium text-text-muted mb-1">Subject</label>
                <div class="px-3 py-2 rounded-lg bg-gray-50 border border-border-subtle text-sm font-medium text-text-main">${escapeHtml(result.subject)}</div>
            </div>
            <div class="mb-4">
                <label class="block text-xs font-medium text-text-muted mb-1">Email Body</label>
                <div class="px-4 py-3 rounded-lg bg-white border border-border-subtle text-sm text-text-secondary leading-relaxed whitespace-pre-wrap" style="min-height: 120px;">${escapeHtml(result.draft)}</div>
            </div>
    `;

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

// Deal Edit — Edit deal modal, currency helpers, action buttons, AI settings, breadcrumbs
// PE OS - AI-Powered Deal Analysis
// Depends on: state (from deal.js), DEAL_STAGES/TERMINAL_STAGES (deal-stages.js),
//   showNotification (js/notifications.js), PEAuth (js/auth.js), API_BASE_URL (js/config.js),
//   formatCurrency (js/formatters.js), showShareModal (deal-team.js)

// Convert a value stored in millions to its most natural {value, unit} for editing
function millionsToNatural(valueInMillions) {
    if (valueInMillions == null) return { value: '', unit: '$' };
    const abs = Math.abs(valueInMillions);
    if (abs >= 1000) return { value: (valueInMillions / 1000), unit: 'B' };
    if (abs >= 1) return { value: valueInMillions, unit: 'M' };
    if (abs >= 0.001) return { value: (valueInMillions * 1000), unit: 'K' };
    return { value: (valueInMillions * 1000000), unit: '$' };
}

// Convert a user-entered value + unit back to millions for storage
function naturalToMillions(value, unit) {
    if (value === '' || value == null || isNaN(parseFloat(value))) return null;
    const num = parseFloat(value);
    switch (unit) {
        case 'B': return num * 1000;
        case 'M': return num;
        case 'K': return num / 1000;
        case '$': return num / 1000000;
        default: return num;
    }
}

// Build a currency input with value + unit selector
function buildCurrencyInput(id, label, valueInMillions, placeholder) {
    const natural = millionsToNatural(valueInMillions);
    const displayVal = natural.value !== '' ? (typeof natural.value === 'number' ? parseFloat(natural.value.toPrecision(10)) : natural.value) : '';
    return `
        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-2">${label}</label>
            <div class="flex gap-1.5">
                <select id="${id}-unit" class="px-2 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm bg-slate-50 font-medium text-slate-600 shrink-0" style="width: 60px">
                    <option value="$" ${natural.unit === '$' ? 'selected' : ''}>$</option>
                    <option value="K" ${natural.unit === 'K' ? 'selected' : ''}>$K</option>
                    <option value="M" ${natural.unit === 'M' ? 'selected' : ''}>$M</option>
                    <option value="B" ${natural.unit === 'B' ? 'selected' : ''}>$B</option>
                </select>
                <input type="number" id="${id}" value="${displayVal}" step="any" class="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm" placeholder="${placeholder}">
            </div>
            <p class="text-[10px] text-slate-400 mt-1">${displayVal !== '' ? 'Currently: ' + formatCurrency(valueInMillions) : 'No value set'}</p>
        </div>
    `;
}

function showEditDealModal() {
    const deal = state.dealData || {};

    // Build stage options
    const allStages = [...DEAL_STAGES, ...TERMINAL_STAGES];
    const stageOptions = allStages.map(s =>
        `<option value="${s.key}" ${deal.stage === s.key ? 'selected' : ''}>${s.label}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto';
    modal.id = 'edit-deal-modal';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-3xl w-full my-8 animate-fadeIn">
            <div class="p-6 border-b border-slate-200">
                <div class="flex items-center justify-between">
                    <h3 class="font-bold text-slate-900 text-lg">Edit Deal Details</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>
            <div class="p-6 max-h-[70vh] overflow-y-auto">
                <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2">
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Deal Name</label>
                        <input type="text" id="edit-deal-name" value="${deal.name || ''}" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Stage</label>
                        <select id="edit-deal-stage" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                            ${stageOptions}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Industry</label>
                        <input type="text" id="edit-deal-industry" value="${deal.industry || ''}" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                    </div>
                    ${buildCurrencyInput('edit-deal-revenue', 'Revenue', deal.revenue, 'e.g., 1800')}
                    ${buildCurrencyInput('edit-deal-ebitda', 'EBITDA', deal.ebitda, 'e.g., 500')}
                    ${buildCurrencyInput('edit-deal-size', 'Deal Size', deal.dealSize, 'e.g., 6000')}
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Projected IRR (%)</label>
                        <input type="number" id="edit-deal-irr" value="${deal.irrProjected || ''}" step="0.1" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm" placeholder="e.g., 24">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">MoM Multiple</label>
                        <input type="number" id="edit-deal-mom" value="${deal.mom || ''}" step="0.1" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm" placeholder="e.g., 3.5">
                    </div>
                    <div class="col-span-2">
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                        <textarea id="edit-deal-description" rows="2" class="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm" placeholder="Brief description of the deal...">${deal.description || ''}</textarea>
                    </div>
                </div>
            </div>
            <div class="p-6 border-t border-slate-200 flex gap-3">
                <button id="save-deal-btn" class="flex-1 bg-primary hover:bg-blue-600 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                    <span class="material-symbols-outlined text-lg">save</span>
                    Save Changes
                </button>
                <button onclick="this.closest('.fixed').remove()" class="px-6 py-2.5 border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 transition-colors">
                    Cancel
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Add save handler
    document.getElementById('save-deal-btn').addEventListener('click', async () => {
        await saveDealChangesFromModal();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

async function saveDealChangesFromModal() {
    if (!state.dealId) {
        showNotification('Error', 'No deal loaded', 'error');
        return;
    }

    const oldStage = state.dealData?.stage;
    const newStage = document.getElementById('edit-deal-stage').value;

    const irrVal = document.getElementById('edit-deal-irr').value;
    const momVal = document.getElementById('edit-deal-mom').value;

    const updateData = {
        name: document.getElementById('edit-deal-name').value,
        stage: newStage,
        industry: document.getElementById('edit-deal-industry').value || null,
        revenue: naturalToMillions(document.getElementById('edit-deal-revenue').value, document.getElementById('edit-deal-revenue-unit').value),
        ebitda: naturalToMillions(document.getElementById('edit-deal-ebitda').value, document.getElementById('edit-deal-ebitda-unit').value),
        dealSize: naturalToMillions(document.getElementById('edit-deal-size').value, document.getElementById('edit-deal-size-unit').value),
        irrProjected: irrVal !== '' ? parseFloat(irrVal) : null,
        mom: momVal !== '' ? parseFloat(momVal) : null,
        description: document.getElementById('edit-deal-description').value || null,
    };

    // Strip undefined/NaN values
    Object.keys(updateData).forEach(k => {
        if (updateData[k] !== null && typeof updateData[k] === 'number' && isNaN(updateData[k])) {
            updateData[k] = null;
        }
    });

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData),
        });

        // Read actual error from API
        if (!response.ok) {
            let errMsg = 'Failed to update deal';
            try {
                const errData = await response.json();
                errMsg = errData.error || errData.message || errMsg;
                if (errData.details) {
                    errMsg += ': ' + JSON.stringify(errData.details);
                }
            } catch { }
            throw new Error(errMsg);
        }

        const updatedDeal = await response.json();
        state.dealData = updatedDeal;

        // Update page with new data
        populateDealPage(updatedDeal);

        // Close modal
        document.getElementById('edit-deal-modal')?.remove();

        // Show success notification
        if (oldStage !== newStage) {
            showNotification(
                'Deal Updated',
                `Deal updated and stage changed to ${getStageLabel(newStage)}`,
                'success'
            );
        } else {
            showNotification('Deal Updated', 'Deal details have been saved', 'success');
        }

    } catch (error) {
        console.error('Error saving deal:', error);
        showNotification('Error', error.message || 'Failed to save deal changes', 'error');
    }
}

function saveDealChanges() {
    // Legacy function - now handled by saveDealChangesFromModal
    saveDealChangesFromModal();
}

// ============================================================
// Action Buttons
// ============================================================
function initActionButtons() {
    // Share button
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', showShareModal);
    }

    // Edit Deal button
    const editBtn = document.getElementById('edit-deal-btn');
    if (editBtn) {
        editBtn.addEventListener('click', showEditDealModal);
    }
}

// ============================================================
// AI Response Actions
// ============================================================
function initAIResponseActions() {
    document.querySelectorAll('.ai-helpful-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            this.innerHTML = '<span class="material-symbols-outlined text-sm">thumb_up</span> Marked helpful';
            this.classList.add('text-primary');
            showNotification('Feedback Received', 'Thank you for your feedback!', 'success');
        });
    });

    document.querySelectorAll('.ai-copy-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const bubble = this.closest('.flex.flex-col').querySelector('.ai-bubble-gradient');
            const text = bubble.innerText;
            navigator.clipboard.writeText(text);
            this.innerHTML = '<span class="material-symbols-outlined text-sm">check</span> Copied';
            this.classList.add('text-primary');
            setTimeout(() => {
                this.innerHTML = '<span class="material-symbols-outlined text-sm">content_copy</span> Copy';
                this.classList.remove('text-primary');
            }, 2000);
        });
    });
}

// ============================================================
// Context Settings
// ============================================================
function initContextSettings() {
    const settingsBtn = document.getElementById('ai-settings-btn');
    if (!settingsBtn) return;

    settingsBtn.addEventListener('click', showContextSettings);
}

function showContextSettings() {
    // Load saved preferences
    const saved = JSON.parse(localStorage.getItem('pe-ai-settings') || '{}');
    const responseStyle = saved.responseStyle || 'detailed';
    const includeCitations = saved.includeCitations !== false;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-md w-full animate-fadeIn">
            <div class="p-6 border-b border-slate-200">
                <div class="flex items-center justify-between">
                    <h3 class="font-bold text-slate-900 text-lg">AI Context Settings</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>
            <div class="p-6">
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">AI Model</label>
                        <div class="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                            <span class="material-symbols-outlined text-primary text-lg">smart_toy</span>
                            <span class="text-sm font-medium text-slate-700">AI Agent (ReAct)</span>
                            <span class="ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-green-50 text-green-600 border border-green-200">Active</span>
                        </div>
                        <p class="text-xs text-slate-400 mt-1.5">Model is configured by your admin. Contact your organization admin to change.</p>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Response Style</label>
                        <select id="ai-response-style" class="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none">
                            <option value="detailed" ${responseStyle === 'detailed' ? 'selected' : ''}>Detailed Analysis</option>
                            <option value="concise" ${responseStyle === 'concise' ? 'selected' : ''}>Concise Summaries</option>
                            <option value="executive" ${responseStyle === 'executive' ? 'selected' : ''}>Executive Briefing</option>
                        </select>
                    </div>
                    <div>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" id="ai-citations" ${includeCitations ? 'checked' : ''} class="rounded border-slate-300 text-primary">
                            <span class="text-sm text-slate-700">Include citations from documents</span>
                        </label>
                    </div>
                </div>
                <button id="ai-settings-save" class="w-full mt-6 text-white font-semibold py-2.5 rounded-lg transition-colors" style="background-color: #003366;">
                    Save Settings
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Save handler
    modal.querySelector('#ai-settings-save').addEventListener('click', () => {
        const settings = {
            responseStyle: modal.querySelector('#ai-response-style').value,
            includeCitations: modal.querySelector('#ai-citations').checked,
        };
        localStorage.setItem('pe-ai-settings', JSON.stringify(settings));
        modal.remove();
        showNotification('Settings Saved', 'AI preferences updated', 'success');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// ============================================================
// Breadcrumb Navigation
// ============================================================
function initBreadcrumbNavigation() {
    const breadcrumbs = document.querySelectorAll('nav a[href="#"]');
    breadcrumbs.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const text = link.textContent.trim();
            if (text === 'Portfolio') {
                window.location.href = 'dashboard.html';
            } else if (text === 'Technology') {
                showNotification('Navigation', `Navigating to ${text} category...`, 'info');
            }
        });
    });
}

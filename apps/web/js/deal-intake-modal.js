/**
 * PE OS - Deal Intake Modal: Mode Toggle, Deal Picker & UI Helpers
 * Handles intake mode switching, deal search/picker, loading/error states, and modal reset.
 * Depends on: deal-intake-template.js (globals, formatCurrencyValue, init/open/close)
 *             deal-intake-actions.js (switchIntakeTab, clearIntakeFile, setIntakeField)
 * Provides: setIntakeMode(), updateIntakeButtonLabels(), searchDealsForPicker(),
 *           selectDealForUpdate(), clearSelectedDeal(), intakeGoToDeal(),
 *           showIntakeLoading(), hideIntakeLoading(), showIntakeError(), hideIntakeError(),
 *           resetIntakeModal()
 */

// ─── Mode Toggle & Deal Picker ───

function setIntakeMode(mode) {
    modalIntakeMode = mode;
    modalSelectedDealId = null;

    const newBtn = document.getElementById('intake-mode-new');
    const existingBtn = document.getElementById('intake-mode-existing');
    const picker = document.getElementById('intake-deal-picker');
    const desc = document.getElementById('intake-header-desc');

    const directBtn = document.getElementById('intake-upload-direct-btn');

    if (mode === 'existing') {
        newBtn?.classList.remove('bg-primary', 'text-white');
        newBtn?.classList.add('border', 'border-border-subtle', 'text-text-secondary', 'hover:bg-gray-50');
        existingBtn?.classList.remove('border', 'border-border-subtle', 'text-text-secondary', 'hover:bg-gray-50');
        existingBtn?.classList.add('bg-primary', 'text-white');
        picker?.classList.remove('hidden');
        if (desc) desc.textContent = 'Add data to an existing deal — select the deal below, then upload or paste new information.';
        updateIntakeButtonLabels('Update Deal');
        directBtn?.classList.remove('hidden');
    } else {
        existingBtn?.classList.remove('bg-primary', 'text-white');
        existingBtn?.classList.add('border', 'border-border-subtle', 'text-text-secondary', 'hover:bg-gray-50');
        newBtn?.classList.remove('border', 'border-border-subtle', 'text-text-secondary', 'hover:bg-gray-50');
        newBtn?.classList.add('bg-primary', 'text-white');
        picker?.classList.add('hidden');
        if (desc) desc.textContent = 'Upload a document, paste text, or enter a company URL to create a new deal.';
        updateIntakeButtonLabels('Create Deal');
        clearSelectedDeal();
        directBtn?.classList.add('hidden');
    }
}

function updateIntakeButtonLabels(action) {
    const uploadBtn = document.getElementById('intake-upload-btn');
    const textBtn = document.getElementById('intake-text-btn');
    const urlBtn = document.getElementById('intake-url-btn');
    if (uploadBtn) uploadBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">auto_awesome</span> Extract & ${action}`;
    if (textBtn) textBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">auto_awesome</span> Extract & ${action}`;
    if (urlBtn) urlBtn.innerHTML = `<span class="material-symbols-outlined text-[18px]">auto_awesome</span> Scrape & ${action}`;
}

async function searchDealsForPicker(query) {
    const resultsEl = document.getElementById('intake-deal-results');
    if (!resultsEl) return;

    try {
        const response = await PEAuth.authFetch(`${window._intakeAPIBase}/deals?search=${encodeURIComponent(query)}&sortBy=updatedAt&sortOrder=desc`);
        if (!response.ok) throw new Error('Search failed');
        const deals = await response.json();

        if (!deals || deals.length === 0) {
            resultsEl.innerHTML = '<p class="p-3 text-sm text-text-muted text-center">No deals found</p>';
            resultsEl.classList.remove('hidden');
            return;
        }

        resultsEl.innerHTML = deals.slice(0, 8).map(d => `
            <button onclick="selectDealForUpdate('${d.id}', '${(d.name || '').replace(/'/g, "\\'")}', '${(d.industry || '').replace(/'/g, "\\'")}')" class="w-full text-left px-3 py-2.5 hover:bg-primary-light/50 transition-colors border-b border-border-subtle last:border-b-0 flex items-center gap-3">
                <span class="material-symbols-outlined text-text-muted text-[18px]">${d.icon || 'business_center'}</span>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-text-main truncate">${d.name || 'Unnamed Deal'}</p>
                    <p class="text-xs text-text-muted">${d.industry || 'No industry'} ${d.revenue != null ? '· ' + formatCurrencyValue(d.revenue) : ''}</p>
                </div>
            </button>
        `).join('');
        resultsEl.classList.remove('hidden');
    } catch (err) {
        resultsEl.innerHTML = '<p class="p-3 text-sm text-red-500 text-center">Search failed</p>';
        resultsEl.classList.remove('hidden');
    }
}

function selectDealForUpdate(dealId, dealName, industry) {
    modalSelectedDealId = dealId;
    document.getElementById('intake-deal-results')?.classList.add('hidden');
    document.getElementById('intake-deal-search').value = '';

    const selectedEl = document.getElementById('intake-selected-deal');
    const nameEl = document.getElementById('intake-selected-deal-name');
    const infoEl = document.getElementById('intake-selected-deal-info');

    if (nameEl) nameEl.textContent = dealName;
    if (infoEl) infoEl.textContent = industry || 'No industry';
    selectedEl?.classList.remove('hidden');
}

function clearSelectedDeal() {
    modalSelectedDealId = null;
    document.getElementById('intake-selected-deal')?.classList.add('hidden');
    document.getElementById('intake-deal-results')?.classList.add('hidden');
    const searchInput = document.getElementById('intake-deal-search');
    if (searchInput) searchInput.value = '';
}

function intakeGoToDeal() {
    if (modalCreatedDealId) {
        window.location.href = `/deal.html?id=${modalCreatedDealId}`;
    } else {
        closeDealIntakeModal();
    }
}

// ─── UI State Helpers ───

function showIntakeLoading() {
    document.querySelectorAll('.intake-tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('intake-loading-state')?.classList.remove('hidden');
    document.getElementById('intake-extraction-preview')?.classList.add('hidden');
    hideIntakeError();
}

function hideIntakeLoading() {
    document.getElementById('intake-loading-state')?.classList.add('hidden');
    const activeTab = document.querySelector('.intake-tab-btn.bg-white');
    if (activeTab) {
        const tabName = activeTab.id.replace('intake-tab-', '');
        document.getElementById(`intake-panel-${tabName}`)?.classList.remove('hidden');
    }
}

function showIntakeError(title, message) {
    hideIntakeLoading();
    const activeTab = document.querySelector('.intake-tab-btn.bg-white');
    if (activeTab) {
        const tabName = activeTab.id.replace('intake-tab-', '');
        document.getElementById(`intake-panel-${tabName}`)?.classList.remove('hidden');
    }
    const titleEl = document.getElementById('intake-error-title');
    const msgEl = document.getElementById('intake-error-message');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    document.getElementById('intake-error-state')?.classList.remove('hidden');
}

function hideIntakeError() {
    document.getElementById('intake-error-state')?.classList.add('hidden');
}

function resetIntakeModal() {
    clearIntakeFile();
    modalCreatedDealId = null;
    // Reset mode to "new" and clear deal picker
    setIntakeMode('new');

    // Reset text
    const textInput = document.getElementById('intake-text-input');
    const charCount = document.getElementById('intake-text-char-count');
    const textBtn = document.getElementById('intake-text-btn');
    if (textInput) textInput.value = '';
    if (charCount) charCount.textContent = '0';
    if (textBtn) textBtn.disabled = true;

    // Reset URL
    const urlInput = document.getElementById('intake-url-input');
    const urlBtn = document.getElementById('intake-url-btn');
    const urlCompany = document.getElementById('intake-url-company-name');
    if (urlInput) urlInput.value = '';
    if (urlBtn) urlBtn.disabled = true;
    if (urlCompany) urlCompany.value = '';

    // Reset view deal button
    const viewBtn = document.getElementById('intake-view-deal-btn');
    if (viewBtn) {
        viewBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">open_in_new</span> View Deal';
        viewBtn.onclick = intakeGoToDeal;
    }

    // Reset confidence bars and source quotes
    ['company', 'industry', 'revenue', 'ebitda', 'overall'].forEach(field => {
        const confEl = document.getElementById(`intake-conf-${field}`);
        const barEl = document.getElementById(`intake-bar-${field}`);
        const sourceEl = document.getElementById(`intake-source-${field}`);
        if (confEl) { confEl.textContent = ''; confEl.className = 'text-xs font-medium'; }
        if (barEl) { barEl.style.width = '0%'; barEl.className = 'h-1.5 rounded-full transition-all'; }
        if (sourceEl) { sourceEl.textContent = ''; sourceEl.classList.add('hidden'); }
    });

    // Clean up direct-upload message if it exists
    const directMsg = document.getElementById('intake-direct-upload-msg');
    if (directMsg) directMsg.remove();
    // Restore extraction grid that may have been hidden by direct upload
    document.querySelectorAll('#intake-extraction-preview .grid').forEach(el => el.classList.remove('hidden'));

    // Hide preview and error, show upload tab
    document.getElementById('intake-extraction-preview')?.classList.add('hidden');
    hideIntakeError();
    switchIntakeTab('upload');
}

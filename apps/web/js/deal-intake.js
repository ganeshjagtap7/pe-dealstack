/**
 * PE OS - Deal Intake Page
 * Handles file upload, text paste, and URL scraping for deal creation.
 */

const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : '/api';

let selectedFile = null;
let createdDealId = null;

// ─── Tab Switching ──────────────────────────────────────────

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('bg-white', 'text-primary', 'shadow-sm');
        btn.classList.add('text-text-secondary');
    });
    const activeBtn = document.getElementById(`tab-${tabName}`);
    activeBtn.classList.add('bg-white', 'text-primary', 'shadow-sm');
    activeBtn.classList.remove('text-text-secondary');

    // Update panels
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`panel-${tabName}`).classList.remove('hidden');

    // Hide states
    hideError();
    document.getElementById('extraction-preview').classList.add('hidden');
    document.getElementById('loading-state').classList.add('hidden');
}

// ─── File Upload ────────────────────────────────────────────

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-primary', 'bg-primary-light/50');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-primary', 'bg-primary-light/50');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-primary', 'bg-primary-light/50');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
}

function handleFileSelect(file) {
    selectedFile = file;
    const fileInfo = document.getElementById('file-info');
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-size').textContent = formatFileSize(file.size);
    fileInfo.classList.remove('hidden');
    document.getElementById('upload-btn').disabled = false;
}

function clearFile() {
    selectedFile = null;
    fileInput.value = '';
    document.getElementById('file-info').classList.add('hidden');
    document.getElementById('upload-btn').disabled = true;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function uploadFile() {
    if (!selectedFile) return;

    showLoading();

    try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        // Determine endpoint: Excel/CSV → /bulk, others → main ingest
        const isExcel = selectedFile.name.match(/\.(xlsx|xls|csv)$/i);
        const endpoint = isExcel ? `${API_BASE}/ingest/bulk` : `${API_BASE}/ingest`;

        const response = await PEAuth.authFetch(endpoint, {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Upload failed');
        }

        if (isExcel) {
            showBulkImportResult(data);
        } else {
            showExtractionPreview(data);
        }
    } catch (error) {
        showError('Upload failed', error.message);
    }
}

// ─── Text Extraction ────────────────────────────────────────

const textInput = document.getElementById('text-input');
const textBtn = document.getElementById('text-btn');
const charCount = document.getElementById('text-char-count');

if (textInput) {
    textInput.addEventListener('input', () => {
        const len = textInput.value.length;
        charCount.textContent = len;
        textBtn.disabled = len < 50;
    });
}

async function extractFromText() {
    const text = textInput.value.trim();
    if (text.length < 50) return;

    showLoading();

    try {
        const sourceType = document.getElementById('text-source-type').value;

        const response = await PEAuth.authFetch(`${API_BASE}/ingest/text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, sourceType }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Text extraction failed');
        }

        showExtractionPreview(data);
    } catch (error) {
        showError('Text extraction failed', error.message);
    }
}

// ─── URL Scraping ───────────────────────────────────────────

const urlInput = document.getElementById('url-input');
const urlBtn = document.getElementById('url-btn');

if (urlInput) {
    urlInput.addEventListener('input', () => {
        try {
            new URL(urlInput.value);
            urlBtn.disabled = false;
        } catch {
            urlBtn.disabled = true;
        }
    });
}

async function extractFromURL() {
    const url = urlInput.value.trim();
    if (!url) return;

    showLoading();

    try {
        const companyName = document.getElementById('url-company-name').value.trim() || undefined;

        const response = await PEAuth.authFetch(`${API_BASE}/ingest/url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, companyName }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'URL scraping failed');
        }

        showExtractionPreview(data);
    } catch (error) {
        showError('URL scraping failed', error.message);
    }
}

// ─── Extraction Preview ─────────────────────────────────────

function showExtractionPreview(data) {
    hideLoading();
    hideError();

    const extraction = data.extraction || {};
    createdDealId = data.deal?.id;

    setField('company', extraction.companyName?.value || data.deal?.name || 'Unknown', extraction.companyName?.confidence);
    setField('industry', extraction.industry?.value || '—', extraction.industry?.confidence);
    setField('revenue', extraction.revenue?.value != null ? `$${extraction.revenue.value}M` : '—', extraction.revenue?.confidence);
    setField('ebitda', extraction.ebitda?.value != null ? `$${extraction.ebitda.value}M` : '—', extraction.ebitda?.confidence);
    setField('overall', `${extraction.overallConfidence || 0}%`, extraction.overallConfidence);

    // Review badge
    const reviewBadge = document.getElementById('review-badge');
    const reviewReasons = document.getElementById('review-reasons');
    const reviewReasonsList = document.getElementById('review-reasons-list');

    if (extraction.needsReview) {
        reviewBadge.classList.remove('hidden');
        if (extraction.reviewReasons && extraction.reviewReasons.length > 0) {
            reviewReasons.classList.remove('hidden');
            reviewReasonsList.innerHTML = extraction.reviewReasons
                .map(r => `<li>${r}</li>`).join('');
        }
    } else {
        reviewBadge.classList.add('hidden');
        reviewReasons.classList.add('hidden');
    }

    document.getElementById('extraction-preview').classList.remove('hidden');
}

function showBulkImportResult(data) {
    hideLoading();
    hideError();

    const summary = data.summary || {};
    const preview = document.getElementById('extraction-preview');

    // Repurpose preview for bulk results
    setField('company', `${summary.imported || 0} deals imported`, null);
    setField('industry', `${summary.failed || 0} failed`, null);
    setField('revenue', `${summary.total || 0} total rows`, null);
    setField('ebitda', '—', null);
    setField('overall', summary.imported === summary.total ? '100%' : `${Math.round((summary.imported / summary.total) * 100)}%`, summary.imported === summary.total ? 100 : 60);

    document.getElementById('review-badge').classList.add('hidden');
    document.getElementById('review-reasons').classList.add('hidden');

    // For bulk, redirect to CRM page
    createdDealId = null;
    const viewBtn = document.getElementById('view-deal-btn');
    viewBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">list</span> View All Deals';
    viewBtn.onclick = () => { window.location.href = '/crm.html'; };

    preview.classList.remove('hidden');
}

function setField(field, value, confidence) {
    const valEl = document.getElementById(`val-${field}`);
    const confEl = document.getElementById(`conf-${field}`);
    const barEl = document.getElementById(`bar-${field}`);

    if (valEl) valEl.textContent = value;

    if (confidence != null && confEl && barEl) {
        confEl.textContent = `${confidence}%`;
        barEl.style.width = `${confidence}%`;

        // Color coding
        if (confidence >= 80) {
            confEl.classList.add('text-secondary');
            barEl.classList.add('bg-secondary');
        } else if (confidence >= 60) {
            confEl.classList.add('text-yellow-600');
            barEl.classList.add('bg-yellow-400');
        } else {
            confEl.classList.add('text-red-500');
            barEl.classList.add('bg-red-400');
        }
    } else if (confEl && barEl) {
        confEl.textContent = '';
        barEl.style.width = '0%';
    }
}

function goToDeal() {
    if (createdDealId) {
        window.location.href = `/deal.html?id=${createdDealId}`;
    } else {
        window.location.href = '/crm.html';
    }
}

// ─── UI State Helpers ───────────────────────────────────────

function showLoading() {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('loading-state').classList.remove('hidden');
    document.getElementById('extraction-preview').classList.add('hidden');
    hideError();
}

function hideLoading() {
    document.getElementById('loading-state').classList.add('hidden');
    // Re-show the active tab panel
    const activeTab = document.querySelector('.tab-btn.bg-white');
    if (activeTab) {
        const tabName = activeTab.id.replace('tab-', '');
        document.getElementById(`panel-${tabName}`).classList.remove('hidden');
    }
}

function showError(title, message) {
    hideLoading();
    // Re-show the active tab panel
    const activeTab = document.querySelector('.tab-btn.bg-white');
    if (activeTab) {
        const tabName = activeTab.id.replace('tab-', '');
        document.getElementById(`panel-${tabName}`).classList.remove('hidden');
    }
    document.getElementById('error-title').textContent = title;
    document.getElementById('error-message').textContent = message;
    document.getElementById('error-state').classList.remove('hidden');
}

function hideError() {
    document.getElementById('error-state').classList.add('hidden');
}

function resetForm() {
    // Reset all inputs
    clearFile();
    if (textInput) { textInput.value = ''; charCount.textContent = '0'; textBtn.disabled = true; }
    if (urlInput) { urlInput.value = ''; urlBtn.disabled = true; }
    document.getElementById('url-company-name').value = '';
    createdDealId = null;

    // Reset view deal button
    const viewBtn = document.getElementById('view-deal-btn');
    viewBtn.innerHTML = '<span class="material-symbols-outlined text-[18px]">open_in_new</span> View Deal';
    viewBtn.onclick = goToDeal;

    // Reset confidence bars
    ['company', 'industry', 'revenue', 'ebitda', 'overall'].forEach(field => {
        const confEl = document.getElementById(`conf-${field}`);
        const barEl = document.getElementById(`bar-${field}`);
        if (confEl) { confEl.textContent = ''; confEl.className = 'text-xs font-medium'; }
        if (barEl) { barEl.style.width = '0%'; barEl.className = 'h-1.5 rounded-full transition-all'; }
    });

    // Hide preview and error, show upload tab
    document.getElementById('extraction-preview').classList.add('hidden');
    hideError();
    switchTab('upload');
}

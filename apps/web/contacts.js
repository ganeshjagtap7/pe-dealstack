// ============================================================
// CRM Contacts Page — PE OS
// ============================================================

const API_BASE = API_BASE_URL; // loaded from js/config.js

// State
let contacts = [];
let totalContacts = 0;
let currentContact = null;
let currentFilter = { search: '', type: '', sortBy: 'createdAt', sortOrder: 'desc' };
let searchTimeout = null;
let selectedDealId = null;
let contactScores = {};
let selectedConnectionContactId = null;
const PAGE_SIZE = 30;
let currentOffset = 0;
let viewMode = 'grid'; // 'grid' or 'list'
let groupByCompany = false;

// ============================================================
// Utility Functions
// ============================================================

// escapeHtml() and timeAgo() loaded from js/formatters.js

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Contact type config
const TYPE_CONFIG = {
    BANKER:    { label: 'Banker',    bg: 'bg-blue-100',    text: 'text-blue-700',    avatarBg: '#DBEAFE', avatarText: '#1D4ED8' },
    ADVISOR:   { label: 'Advisor',   bg: 'bg-purple-100',  text: 'text-purple-700',  avatarBg: '#EDE9FE', avatarText: '#6D28D9' },
    EXECUTIVE: { label: 'Executive', bg: 'bg-emerald-100', text: 'text-emerald-700', avatarBg: '#D1FAE5', avatarText: '#047857' },
    LP:        { label: 'LP',        bg: 'bg-amber-100',   text: 'text-amber-700',   avatarBg: '#FEF3C7', avatarText: '#B45309' },
    LEGAL:     { label: 'Legal',     bg: 'bg-slate-100',   text: 'text-slate-700',   avatarBg: '#F1F5F9', avatarText: '#334155' },
    OTHER:     { label: 'Other',     bg: 'bg-gray-100',    text: 'text-gray-700',    avatarBg: '#F3F4F6', avatarText: '#374151' },
};

// Interaction type config
const INTERACTION_ICONS = {
    NOTE:    'edit_note',
    MEETING: 'groups',
    CALL:    'call',
    EMAIL:   'mail',
    OTHER:   'more_horiz',
};

// Deal stage styles (for linked deals)
const STAGE_STYLES = {
    'INITIAL_REVIEW': { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Initial Review' },
    'DUE_DILIGENCE':  { bg: 'bg-primary-light', text: 'text-primary', label: 'Due Diligence' },
    'IOI_SUBMITTED':  { bg: 'bg-amber-50', text: 'text-amber-700', label: 'IOI Submitted' },
    'LOI_SUBMITTED':  { bg: 'bg-purple-50', text: 'text-purple-700', label: 'LOI Submitted' },
    'NEGOTIATION':    { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Negotiation' },
    'CLOSING':        { bg: 'bg-teal-50', text: 'text-teal-700', label: 'Closing' },
    'PASSED':         { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Passed' },
    'CLOSED_WON':     { bg: 'bg-secondary-light', text: 'text-secondary', label: 'Closed Won' },
    'CLOSED_LOST':    { bg: 'bg-red-50', text: 'text-red-700', label: 'Closed Lost' },
};

// Relationship score config
const SCORE_CONFIG = {
    Cold:   { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500' },
    Warm:   { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-500' },
    Active: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    Strong: { bg: 'bg-green-100',   text: 'text-green-800',   dot: 'bg-green-600' },
};

const RELATIONSHIP_TYPE_CONFIG = {
    KNOWS:         { label: 'Knows',         icon: 'handshake',    bg: 'bg-blue-100',    text: 'text-blue-700' },
    REFERRED_BY:   { label: 'Referred by',   icon: 'share',        bg: 'bg-purple-100',  text: 'text-purple-700' },
    REPORTS_TO:    { label: 'Reports to',    icon: 'account_tree', bg: 'bg-amber-100',   text: 'text-amber-700' },
    COLLEAGUE:     { label: 'Colleague',     icon: 'group',        bg: 'bg-emerald-100', text: 'text-emerald-700' },
    INTRODUCED_BY: { label: 'Introduced by', icon: 'person_add',   bg: 'bg-pink-100',    text: 'text-pink-700' },
};

function getInitials(firstName, lastName) {
    const f = (firstName || '').trim();
    const l = (lastName || '').trim();
    return ((f[0] || '') + (l[0] || '')).toUpperCase() || '?';
}

// ============================================================
// API Calls
// ============================================================

async function fetchContacts(offset = 0) {
    const params = new URLSearchParams();
    if (currentFilter.search) params.set('search', currentFilter.search);
    if (currentFilter.type) params.set('type', currentFilter.type);
    params.set('sortBy', currentFilter.sortBy);
    params.set('sortOrder', currentFilter.sortOrder);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));

    const res = await PEAuth.authFetch(`${API_BASE}/contacts?${params.toString()}`);
    if (!res.ok) throw new Error(`Failed to load contacts (${res.status})`);
    const data = await res.json();
    return data;
}

// fetchContactDetail — moved to contacts-detail.js

async function createContact(body) {
    const res = await PEAuth.authFetch(`${API_BASE}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || err.error || `Failed to create contact (${res.status})`);
    }
    return await res.json();
}

async function updateContact(id, body) {
    const res = await PEAuth.authFetch(`${API_BASE}/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to update contact (${res.status})`);
    }
    return await res.json();
}

async function deleteContact(id) {
    const res = await PEAuth.authFetch(`${API_BASE}/contacts/${id}`, { method: 'DELETE' });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to delete contact (${res.status})`);
    }
    return true;
}

// addInteraction, linkDeal, unlinkDeal, searchDeals — moved to contacts-detail.js

// ============================================================
// API — Scores, Network
// ============================================================

async function fetchScores() {
    try {
        const res = await PEAuth.authFetch(`${API_BASE}/contacts/insights/scores`);
        if (!res.ok) return {};
        const data = await res.json();
        return data.scores || {};
    } catch { return {}; }
}

// fetchConnections, createConnection, deleteConnection — moved to contacts-detail.js

async function fetchNetworkInsights() {
    try {
        const res = await PEAuth.authFetch(`${API_BASE}/contacts/insights/network`);
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

// renderContactCard, renderEmptyState, renderContactRow, renderListView,
// setViewMode, renderContactsView, toggleGroupByCompany,
// renderGroupedByCompany, renderLoadingState, renderErrorState
// — moved to contacts-render.js

// ============================================================
// Load & Render Contacts
// ============================================================

async function loadContacts() {
    const grid = document.getElementById('contacts-grid');
    grid.innerHTML = renderLoadingState();
    currentOffset = 0;

    try {
        const [data, scores] = await Promise.all([fetchContacts(0), fetchScores()]);
        contacts = data.contacts || data || [];
        totalContacts = data.total || contacts.length;
        contactScores = scores;
        currentOffset = contacts.length;

        // Update header counts
        const badge = document.getElementById('contact-count-badge');
        const subtitle = document.getElementById('contact-subtitle');
        badge.textContent = totalContacts;
        badge.classList.remove('hidden');
        subtitle.innerHTML = `<span class="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(5,150,105,0.4)]"></span> ${totalContacts} contact${totalContacts !== 1 ? 's' : ''} in your network`;

        if (contacts.length === 0) {
            grid.innerHTML = currentFilter.search || currentFilter.type
                ? `<div class="col-span-full flex flex-col items-center justify-center py-20">
                    <span class="material-symbols-outlined text-text-muted text-4xl mb-4">search_off</span>
                    <p class="text-text-main font-medium mb-2">No contacts found</p>
                    <p class="text-text-muted text-sm">Try adjusting your search or filters</p>
                   </div>`
                : renderEmptyState();
            updatePaginationBar();
            return;
        }

        renderContactsView();
        updatePaginationBar();
    } catch (err) {
        console.error('Error loading contacts:', err);
        grid.innerHTML = renderErrorState(err.message);
    }
}

async function loadMore() {
    const btn = document.getElementById('load-more-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> Loading...';

    try {
        const data = await fetchContacts(currentOffset);
        const newContacts = data.contacts || [];
        contacts = [...contacts, ...newContacts];
        currentOffset += newContacts.length;

        // Re-render full view (handles both grid and list modes)
        renderContactsView();
        updatePaginationBar();
    } catch (err) {
        console.error('Error loading more contacts:', err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined text-[18px]">expand_more</span> Load More';
    }
}

function updatePaginationBar() {
    const bar = document.getElementById('pagination-bar');
    const info = document.getElementById('pagination-info');
    const btn = document.getElementById('load-more-btn');

    if (totalContacts === 0) {
        bar.classList.add('hidden');
        return;
    }

    bar.classList.remove('hidden');
    const showing = Math.min(currentOffset, totalContacts);
    info.textContent = `Showing ${showing} of ${totalContacts} contact${totalContacts !== 1 ? 's' : ''}`;

    if (showing < totalContacts) {
        btn.classList.remove('hidden');
        const remaining = totalContacts - showing;
        btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">expand_more</span> Load More (${remaining} remaining)`;
    } else {
        btn.classList.add('hidden');
    }
}

// loadInsights, loadNetworkStats, loadTimeline, loadStaleContacts,
// loadDuplicates — moved to contacts-render.js

// ============================================================
// Filter & Search Event Handlers
// ============================================================

function initializeFilters() {
    // Type filter dropdown toggle
    const typeBtn = document.getElementById('type-filter-btn');
    const typeDropdown = document.getElementById('type-dropdown');

    typeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        typeDropdown.classList.toggle('hidden');
        document.getElementById('sort-dropdown').classList.add('hidden');
        document.getElementById('more-actions-dropdown').classList.add('hidden');
    });

    // Type filter options
    typeDropdown.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter.type = btn.dataset.type;
            document.getElementById('type-filter-text').textContent = btn.dataset.type
                ? (TYPE_CONFIG[btn.dataset.type]?.label || btn.dataset.type)
                : 'All Types';
            typeDropdown.classList.add('hidden');
            loadContacts();
        });
    });

    // Sort dropdown
    const sortBtn = document.getElementById('sort-btn');
    const sortDropdown = document.getElementById('sort-dropdown');

    sortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sortDropdown.classList.toggle('hidden');
        typeDropdown.classList.add('hidden');
        document.getElementById('more-actions-dropdown').classList.add('hidden');
    });

    const SORT_LABELS = {
        'createdAt-desc': 'Newest First',
        'createdAt-asc': 'Oldest First',
        'name-asc': 'Name A-Z',
        'name-desc': 'Name Z-A',
        'company-asc': 'Company A-Z',
        'lastContactedAt-desc': 'Last Contacted',
    };

    sortDropdown.querySelectorAll('button[data-sort]').forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter.sortBy = btn.dataset.sort;
            currentFilter.sortOrder = btn.dataset.order;
            document.getElementById('sort-btn-text').textContent = SORT_LABELS[`${btn.dataset.sort}-${btn.dataset.order}`] || 'Sort';
            // Update check marks
            sortDropdown.querySelectorAll('.sort-check').forEach(c => c.classList.add('hidden'));
            btn.querySelector('.sort-check').classList.remove('hidden');
            sortDropdown.classList.add('hidden');
            loadContacts();
        });
    });

    // More actions dropdown
    const moreBtn = document.getElementById('more-actions-btn');
    const moreDropdown = document.getElementById('more-actions-dropdown');

    moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreDropdown.classList.toggle('hidden');
        typeDropdown.classList.add('hidden');
        sortDropdown.classList.add('hidden');
    });

    // Close import modal on backdrop click
    document.getElementById('import-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('import-modal')) closeImportModal();
    });

    // Close dropdowns on outside click
    document.addEventListener('click', () => {
        typeDropdown.classList.add('hidden');
        sortDropdown.classList.add('hidden');
        moreDropdown.classList.add('hidden');
    });

    // Search input with debounce
    const searchInput = document.getElementById('contact-search');
    const debouncedSearch = debounce(() => {
        currentFilter.search = searchInput.value.trim();
        loadContacts();
    }, 300);
    searchInput.addEventListener('input', debouncedSearch);

    // Add Contact button
    document.getElementById('add-contact-btn').addEventListener('click', () => openContactModal());

    // Close contact modal on backdrop click
    document.getElementById('contact-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('contact-modal')) closeContactModal();
    });

    // Close link deal modal on backdrop click
    document.getElementById('link-deal-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('link-deal-modal')) closeLinkDealModal();
    });

    // Deal search input with debounce
    const dealSearchInput = document.getElementById('deal-search-input');
    const debouncedDealSearch = debounce(() => {
        handleDealSearch(dealSearchInput.value.trim());
    }, 300);
    dealSearchInput.addEventListener('input', debouncedDealSearch);

    // Close connection modal on backdrop click
    document.getElementById('connection-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('connection-modal')) closeConnectionModal();
    });

    // Connection search input with debounce
    const connSearchInput = document.getElementById('connection-search-input');
    const debouncedConnSearch = debounce(() => {
        handleConnectionSearch(connSearchInput.value.trim());
    }, 300);
    connSearchInput.addEventListener('input', debouncedConnSearch);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!document.getElementById('connection-modal').classList.contains('hidden')) {
                closeConnectionModal();
            } else if (!document.getElementById('link-deal-modal').classList.contains('hidden')) {
                closeLinkDealModal();
            } else if (!document.getElementById('contact-modal').classList.contains('hidden')) {
                closeContactModal();
            } else if (!document.getElementById('detail-panel').classList.contains('hidden')) {
                closeDetail();
            }
        }
    });
}

// ============================================================
// Initialization
// ============================================================

document.addEventListener('DOMContentLoaded', async function() {
    try {
        await PEAuth.initSupabase();
        const auth = await PEAuth.checkAuth();
        if (!auth) return;

        PELayout.init('crm', { collapsible: true });
        initializeFilters();

        // Onboarding: feedback button + beta badge
        if (window.initOnboardingUI) initOnboardingUI();
    } catch (err) {
        console.error('Init error:', err);
    }

    // Always attempt to load contacts even if layout fails
    try {
        await loadContacts();
    } catch (err) {
        console.error('Load contacts error:', err);
        const grid = document.getElementById('contacts-grid');
        if (grid) grid.innerHTML = renderErrorState(err.message);
    }

    // Load insights panels (timeline, stale, duplicates) in parallel
    loadInsights();
});

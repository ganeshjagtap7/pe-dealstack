// API_BASE_URL loaded from js/config.js

// State
let currentUser = null;
let hasChanges = false;
let investmentFocus = [];
let sourcingSensitivity = 50;
let typography = 'modern';
let density = 'default';
let preferredCurrency = 'USD';
let autoExtract = true;
let autoUpdateDeal = false;
let notificationPrefs = {
    DEAL_UPDATE: true,
    DOCUMENT_UPLOADED: true,
    MENTION: true,
    AI_INSIGHT: true,
    TASK_ASSIGNED: true,
    COMMENT: true,
};

const NOTIFICATION_TYPES = [
    { key: 'DEAL_UPDATE', label: 'Deal Updates', description: 'When deal data or stage changes', icon: 'trending_up' },
    { key: 'DOCUMENT_UPLOADED', label: 'Document Uploads', description: 'When new files are added to a data room', icon: 'upload_file' },
    { key: 'MENTION', label: 'Mentions', description: 'When someone mentions you in a comment', icon: 'alternate_email' },
    { key: 'AI_INSIGHT', label: 'AI Insights', description: 'When the AI generates new analysis or flags', icon: 'auto_awesome' },
    { key: 'TASK_ASSIGNED', label: 'Task Assignments', description: 'When a task is assigned to you', icon: 'task_alt' },
    { key: 'COMMENT', label: 'Comments', description: 'When someone comments on your deals or memos', icon: 'comment' },
];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await PEAuth.initSupabase();
        const auth = await PEAuth.checkAuth();
        if (!auth) return;

        // Initialize shared layout
        PELayout.init('settings', { collapsible: true });

        await loadUserProfile();
        initializeEventListeners();
        initializeSlider();
    } catch (err) {
        console.error('Initialization error:', err);
    }
});

// Load user profile
async function loadUserProfile() {
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/users/me`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            // Handle various error response formats
            let errorMsg = 'Failed to load profile';
            if (typeof errorData.error === 'string') {
                errorMsg = errorData.error;
            } else if (errorData.error?.message) {
                errorMsg = errorData.error.message;
            } else if (errorData.message) {
                errorMsg = errorData.message;
            }
            throw new Error(errorMsg);
        }

        currentUser = await response.json();
        console.log('Loaded user:', currentUser);

        // Parse preferences if they exist (could be JSON string or object)
        if (currentUser.preferences) {
            const prefs = typeof currentUser.preferences === 'string'
                ? JSON.parse(currentUser.preferences)
                : currentUser.preferences;

            investmentFocus = Array.isArray(prefs.investmentFocus) ? prefs.investmentFocus : [];
            sourcingSensitivity = typeof prefs.sourcingSensitivity === 'number' ? prefs.sourcingSensitivity : 50;
            typography = prefs.typography || 'modern';
            density = prefs.density || 'default';
            preferredCurrency = prefs.preferredCurrency || 'USD';
            autoExtract = prefs.autoExtract !== undefined ? prefs.autoExtract : true;
            autoUpdateDeal = prefs.autoUpdateDeal !== undefined ? prefs.autoUpdateDeal : false;
            if (prefs.notifications && typeof prefs.notifications === 'object') {
                notificationPrefs = { ...notificationPrefs, ...prefs.notifications };
            }
        }

        renderProfile();
    } catch (error) {
        console.error('Error loading profile:', error);
        // Show error message as string
        const message = typeof error === 'string' ? error : (error?.message || 'Failed to load profile');
        showToast(message, 'error');

        // Still try to render with whatever data we have
        if (currentUser) renderProfile();
    }
}

// Render profile data
function renderProfile() {
    if (!currentUser) {
        console.warn('No user data to render');
        return;
    }

    try {
        // Profile header section
        const displayName = document.getElementById('profile-display-name');
        const subtitle = document.getElementById('profile-subtitle');
        const roleBadge = document.getElementById('role-badge');

        if (displayName) displayName.textContent = currentUser.name || 'User';
        if (subtitle) {
            const titlePart = currentUser.title || 'Team Member';
            const firmPart = currentUser.firmName ? ` • ${currentUser.firmName}` : '';
            subtitle.textContent = titlePart + firmPart;
        }

        setAvatar('profile-avatar', currentUser);

        if (roleBadge) roleBadge.textContent = getRoleLabel(currentUser.role);

        // Form fields
        const nameInput = document.getElementById('input-name');
        const emailInput = document.getElementById('input-email');
        const titleInput = document.getElementById('input-title');
        const firmDisplay = document.getElementById('input-firm');

        if (nameInput) nameInput.value = currentUser.name || '';
        if (emailInput) emailInput.value = currentUser.email || '';
        if (titleInput) titleInput.value = currentUser.title || '';
        if (firmDisplay) firmDisplay.textContent = currentUser.firmName || 'Not assigned';

        // Investment focus tags
        renderSectors();

        // Sensitivity slider
        updateSlider(sourcingSensitivity);

        // Typography
        updateTypography(typography);

        // Density
        updateDensity(density);

        // Currency
        const currencySelect = document.getElementById('input-currency');
        if (currencySelect) currencySelect.value = preferredCurrency;

        // Auto-extract & auto-update toggles
        const autoExtractToggle = document.getElementById('toggle-auto-extract');
        if (autoExtractToggle) autoExtractToggle.checked = autoExtract;
        const autoUpdateToggle = document.getElementById('toggle-auto-update');
        if (autoUpdateToggle) autoUpdateToggle.checked = autoUpdateDeal;

        // Notification toggles
        renderNotificationToggles();

        console.log('Profile rendered successfully');
    } catch (err) {
        console.error('Error in renderProfile:', err);
    }
}

function setAvatar(elementId, user) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (user.avatar) {
        el.style.backgroundImage = `url('${user.avatar}')`;
        el.textContent = '';
    } else {
        el.style.backgroundImage = '';
        const initials = (user.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        el.innerHTML = `<span class="text-2xl">${initials}</span>`;
    }
}

function getRoleLabel(role) {
    const labels = { ADMIN: 'Admin', MEMBER: 'Member', VIEWER: 'Analyst' };
    return labels[role] || role || 'Member';
}

// Render sectors
function renderSectors() {
    const container = document.getElementById('sectors-container');
    if (!container) return;

    // Ensure investmentFocus is an array
    const sectors = Array.isArray(investmentFocus) ? investmentFocus : [];

    const sectorTags = sectors.map(sector => `
        <div class="sector-tag">
            ${escapeHtml(sector)}
            <button onclick="removeSector('${escapeHtml(sector)}')">
                <span class="material-symbols-outlined text-[14px]">close</span>
            </button>
        </div>
    `).join('');

    const addButton = `
        <button onclick="openSectorModal()" class="inline-flex items-center bg-white hover:bg-primary-light border border-dashed border-gray-300 hover:border-primary rounded-lg px-3 py-1.5 text-sm font-semibold text-primary transition-colors">
            <span class="material-symbols-outlined text-[16px] mr-1">add</span> Add Sector
        </button>
    `;

    container.innerHTML = sectorTags + addButton;
}

function removeSector(sector) {
    investmentFocus = investmentFocus.filter(s => s !== sector);
    renderSectors();
    markChanged();
}

function addSector(sector) {
    if (sector && !investmentFocus.includes(sector)) {
        investmentFocus.push(sector);
        renderSectors();
        markChanged();
    }
    closeSectorModal();
}

function openSectorModal() {
    const modal = document.getElementById('add-sector-modal');
    const input = document.getElementById('sector-input');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    if (input) input.focus();
}

function closeSectorModal() {
    const modal = document.getElementById('add-sector-modal');
    const input = document.getElementById('sector-input');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    if (input) input.value = '';
}

// Functions below are provided by js/settingsProfile.js:
// initializeSlider, updateSlider, updateTypography, updateDensity

// Event listeners
function initializeEventListeners() {
    // Settings nav — smooth scroll to section
    document.querySelectorAll('.settings-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const section = e.currentTarget.dataset.section;
            const target = document.getElementById(`section-${section}`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                history.replaceState(null, '', `#${section}`);
            }
        });
    });

    // Handle direct hash links on page load
    const hash = window.location.hash.replace('#', '').replace('section-', '');
    if (hash) {
        const target = document.getElementById(`section-${hash}`);
        if (target) {
            setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
            document.querySelectorAll('.settings-nav-item').forEach(i => {
                i.classList.toggle('active', i.dataset.section === hash);
            });
        }
    }

    // Form inputs - with null checks
    const nameInput = document.getElementById('input-name');
    const titleInput = document.getElementById('input-title');
    if (nameInput) nameInput.addEventListener('input', markChanged);
    if (titleInput) titleInput.addEventListener('input', markChanged);

    // Typography selection
    const typoModern = document.getElementById('typo-modern');
    const typoSerif = document.getElementById('typo-serif');
    if (typoModern) typoModern.addEventListener('click', () => { updateTypography('modern'); markChanged(); });
    if (typoSerif) typoSerif.addEventListener('click', () => { updateTypography('serif'); markChanged(); });

    // Density selection
    document.querySelectorAll('.density-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            updateDensity(btn.dataset.density);
            markChanged();
        });
    });

    // Save button
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveProfile);

    // Cancel button
    const cancelBtn = document.getElementById('cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (hasChanges) {
                if (confirm('Discard unsaved changes?')) {
                    loadUserProfile();
                    hasChanges = false;
                }
            } else {
                window.location.href = 'dashboard.html';
            }
        });
    }

    // Sector modal
    const closeSectorBtn = document.getElementById('close-sector-modal');
    const addSectorBtn = document.getElementById('add-sector-btn');
    const sectorInput = document.getElementById('sector-input');
    const addSectorModal = document.getElementById('add-sector-modal');

    if (closeSectorBtn) closeSectorBtn.addEventListener('click', closeSectorModal);
    if (addSectorBtn) {
        addSectorBtn.addEventListener('click', () => {
            const input = document.getElementById('sector-input');
            if (input) addSector(input.value.trim());
        });
    }
    if (sectorInput) {
        sectorInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addSector(e.target.value.trim());
        });
    }
    document.querySelectorAll('.preset-sector').forEach(btn => {
        btn.addEventListener('click', () => addSector(btn.textContent.trim()));
    });

    // Close modal on backdrop click
    if (addSectorModal) {
        addSectorModal.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeSectorModal();
        });
    }

    // Avatar upload
    const avatarUploadBtn = document.getElementById('avatar-upload-btn');
    const avatarInput = document.getElementById('avatar-input');
    if (avatarUploadBtn && avatarInput) {
        avatarUploadBtn.addEventListener('click', () => avatarInput.click());
        avatarInput.addEventListener('change', handleAvatarUpload);
    }

    // Currency
    const currencySelect = document.getElementById('input-currency');
    if (currencySelect) {
        currencySelect.addEventListener('change', () => {
            preferredCurrency = currencySelect.value;
            markChanged();
        });
    }

    // Auto-extract toggle
    const autoExtractToggle = document.getElementById('toggle-auto-extract');
    if (autoExtractToggle) {
        autoExtractToggle.addEventListener('change', () => {
            autoExtract = autoExtractToggle.checked;
            markChanged();
        });
    }

    // Auto-update toggle
    const autoUpdateToggle = document.getElementById('toggle-auto-update');
    if (autoUpdateToggle) {
        autoUpdateToggle.addEventListener('change', () => {
            autoUpdateDeal = autoUpdateToggle.checked;
            markChanged();
        });
    }

    // Password form
    initPasswordForm();

    // Deactivate
    const deactivateBtn = document.getElementById('deactivate-btn');
    if (deactivateBtn) {
        deactivateBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to deactivate your account?')) {
                showToast('Account deactivation is not available in this version', 'info');
            }
        });
    }
}

function markChanged() {
    hasChanges = true;
}

// Functions below are provided by js/settingsProfile.js:
// renderNotificationToggles, initPasswordForm, handleAvatarUpload,
// saveProfile, showToast

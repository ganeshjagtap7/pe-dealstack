/**
 * PE OS - Shared Layout Component
 * Provides consistent sidebar and header across all pages
 */

// Navigation items configuration
// adminOnly: true = only visible to ADMIN role
// memberOnly: true = visible to ADMIN and MEMBER (hidden from VIEWER)
const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/dashboard.html' },
    { id: 'deals', label: 'Deals', icon: 'work', href: '/crm.html' },
    { id: 'data-room', label: 'Data Room', icon: 'folder_open', href: '/vdr.html' },
    { id: 'crm', label: 'CRM', icon: 'groups', href: '/contacts.html', memberOnly: true },
    { id: 'admin', label: 'Admin', icon: 'admin_panel_settings', href: '/admin-dashboard.html', adminOnly: true },
    { divider: true },
    { id: 'ai-reports', label: 'AI Reports', icon: 'auto_awesome', href: '/memo-builder.html', isAI: true, memberOnly: true },
];

// Cache key for sessionStorage
const USER_CACHE_KEY = 'pe-user-cache';

// Try to load cached user data immediately (before any async work)
function getCachedUser() {
    try {
        const cached = sessionStorage.getItem(USER_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            // Validate cache has required fields
            if (parsed && parsed.name && parsed.name !== 'Loading...') {
                return parsed;
            }
        }
    } catch (e) {
        // sessionStorage not available or corrupted — ignore
    }
    return null;
}

function cacheUserData(userData) {
    try {
        sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData));
    } catch (e) {
        // Storage full or unavailable — not critical
    }
}

// User data — immediately use cache if available, otherwise show Loading...
const cachedUser = getCachedUser();
let USER = cachedUser || {
    id: '',
    name: 'Loading...',
    role: '',           // Display role/title
    systemRole: '',     // System role for permissions (ADMIN, MEMBER, VIEWER)
    avatar: '',
    preferences: {}
};

// Load user data from API (and refresh cache)
async function loadUserData() {
    try {
        if (typeof PEAuth !== 'undefined' && PEAuth.authFetch) {
            const response = await PEAuth.authFetch(`${API_BASE_URL}/users/me`);
            if (response.ok) {
                const userData = await response.json();
                USER = {
                    id: userData.id || '',
                    name: userData.name || userData.email?.split('@')[0] || 'User',
                    role: userData.title || getRoleLabel(userData.role) || 'Team Member',
                    systemRole: userData.role || 'MEMBER',  // ADMIN, MEMBER, or VIEWER
                    avatar: userData.avatar || '',
                    preferences: userData.preferences || {}
                };
                // Cache for instant display on next page navigation
                cacheUserData(USER);
                updateUserDisplay();
                updateSidebarForRole();  // Filter sidebar based on role
                // Dispatch event so other components can update when user data is loaded
                window.dispatchEvent(new CustomEvent('pe-user-loaded', { detail: { user: USER } }));
            }
        }
    } catch (error) {
        console.warn('Could not load user data for layout:', error);
    }
}

function getRoleLabel(role) {
    const labels = { ADMIN: 'Admin', MEMBER: 'Team Member', VIEWER: 'Analyst', OPS: 'Operations' };
    return labels[role] || role || 'Team Member';
}

// Update user display in header and sidebar after data loads
function updateUserDisplay() {
    // Update header user name (in the button)
    const headerUserName = document.querySelector('#user-menu-btn span.hidden');
    if (headerUserName) {
        headerUserName.textContent = USER.name;
    }

    // Update header avatar
    const headerAvatar = document.querySelector('#user-menu-btn > div');
    if (headerAvatar) {
        const initials = USER.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        const showInitials = () => {
            headerAvatar.style.backgroundImage = '';
            headerAvatar.style.backgroundColor = PE_COLORS.primary;
            headerAvatar.style.display = 'flex';
            headerAvatar.style.alignItems = 'center';
            headerAvatar.style.justifyContent = 'center';
            headerAvatar.style.color = 'white';
            headerAvatar.style.fontSize = '12px';
            headerAvatar.style.fontWeight = 'bold';
            headerAvatar.innerHTML = initials;
        };

        if (USER.avatar) {
            // Test if avatar URL loads, fallback to initials if broken
            const testImg = new Image();
            testImg.onload = () => {
                headerAvatar.style.backgroundImage = `url('${USER.avatar}')`;
                headerAvatar.innerHTML = '';
            };
            testImg.onerror = showInitials;
            testImg.src = USER.avatar;
        } else {
            showInitials();
        }
    }

    // Update user dropdown info
    const dropdownName = document.querySelector('#user-dropdown > div:first-child > p:first-child');
    const dropdownRole = document.querySelector('#user-dropdown > div:first-child > p:last-child');
    if (dropdownName) dropdownName.textContent = USER.name;
    if (dropdownRole) dropdownRole.textContent = USER.role;

    // Update sidebar user info
    const sidebarUserName = document.querySelector('.user-profile .user-info h1');
    const sidebarUserRole = document.querySelector('.user-profile .user-info p');
    const sidebarAvatar = document.querySelector('.user-profile > a > div:first-child');

    if (sidebarUserName) sidebarUserName.textContent = USER.name;
    if (sidebarUserRole) sidebarUserRole.textContent = USER.role;
    if (sidebarAvatar) {
        if (USER.avatar) {
            sidebarAvatar.style.backgroundImage = `url('${USER.avatar}')`;
        } else {
            const initials = USER.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            sidebarAvatar.style.backgroundImage = '';
            sidebarAvatar.style.backgroundColor = PE_COLORS.primary;
            sidebarAvatar.style.display = 'flex';
            sidebarAvatar.style.alignItems = 'center';
            sidebarAvatar.style.justifyContent = 'center';
            sidebarAvatar.style.color = 'white';
            sidebarAvatar.style.fontSize = '12px';
            sidebarAvatar.style.fontWeight = 'bold';
            sidebarAvatar.innerHTML = initials;
        }
    }
}

// Update sidebar visibility based on user role
function updateSidebarForRole() {
    const role = USER.systemRole;
    const isAdmin = role === 'ADMIN';
    const isMember = role === 'ADMIN' || role === 'MEMBER';

    // Hide admin-only items for non-admins
    document.querySelectorAll('[data-admin-only="true"]').forEach(el => {
        el.style.display = isAdmin ? '' : 'none';
    });

    // Hide member-only items for viewers
    document.querySelectorAll('[data-member-only="true"]').forEach(el => {
        el.style.display = isMember ? '' : 'none';
    });
}

// PE OS Logo SVG
const LOGO_SVG = `<svg fill="currentColor" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path clip-rule="evenodd" d="M39.475 21.6262C40.358 21.4363 40.6863 21.5589 40.7581 21.5934C40.7876 21.655 40.8547 21.857 40.8082 22.3336C40.7408 23.0255 40.4502 24.0046 39.8572 25.2301C38.6799 27.6631 36.5085 30.6631 33.5858 33.5858C30.6631 36.5085 27.6632 38.6799 25.2301 39.8572C24.0046 40.4502 23.0255 40.7407 22.3336 40.8082C21.8571 40.8547 21.6551 40.7875 21.5934 40.7581C21.5589 40.6863 21.4363 40.358 21.6262 39.475C21.8562 38.4054 22.4689 36.9657 23.5038 35.2817C24.7575 33.2417 26.5497 30.9744 28.7621 28.762C30.9744 26.5497 33.2417 24.7574 35.2817 23.5037C36.9657 22.4689 38.4054 21.8562 39.475 21.6262ZM4.41189 29.2403L18.7597 43.5881C19.8813 44.7097 21.4027 44.9179 22.7217 44.7893C24.0585 44.659 25.5148 44.1631 26.9723 43.4579C29.9052 42.0387 33.2618 39.5667 36.4142 36.4142C39.5667 33.2618 42.0387 29.9052 43.4579 26.9723C44.1631 25.5148 44.659 24.0585 44.7893 22.7217C44.9179 21.4027 44.7097 19.8813 43.5881 18.7597L29.2403 4.41187C27.8527 3.02428 25.8765 3.02573 24.2861 3.36776C22.6081 3.72863 20.7334 4.58419 18.8396 5.74801C16.4978 7.18716 13.9881 9.18353 11.5858 11.5858C9.18354 13.988 7.18717 16.4978 5.74802 18.8396C4.58421 20.7334 3.72865 22.6081 3.36778 24.2861C3.02574 25.8765 3.02429 27.8527 4.41189 29.2403Z" fill="currentColor" fill-rule="evenodd"></path>
</svg>`;

/**
 * Tailwind config for PE OS design system
 */
const TAILWIND_CONFIG = `
tailwind.config = {
    theme: {
        extend: {
            colors: {
                "primary": "#003366",
                "primary-hover": "#002855",
                "primary-light": "#E6EEF5",
                "secondary": "#059669",
                "secondary-light": "#D1FAE5",
                "background-body": "#F8F9FA",
                "surface-card": "#FFFFFF",
                "border-subtle": "#E5E7EB",
                "border-focus": "#CBD5E1",
                "text-main": "#111827",
                "text-secondary": "#4B5563",
                "text-muted": "#9CA3AF",
            },
            fontFamily: {
                "sans": ["Inter", "sans-serif"],
                "display": ["Inter", "sans-serif"],
            },
            boxShadow: {
                "card": "0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)",
                "card-hover": "0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05)",
                "glow": "0 0 15px rgba(0, 51, 102, 0.1)",
            },
            borderRadius: {
                "DEFAULT": "0.5rem",
                "md": "0.375rem",
                "lg": "0.5rem",
                "xl": "0.75rem",
            }
        },
    },
}`;

// PE OS Design System Colors - Hardcoded for consistency
const PE_COLORS = {
    primary: '#003366',
    primaryHover: '#002855',
    primaryLight: '#E6EEF5',
    secondary: '#059669',
    secondaryLight: '#D1FAE5',
    backgroundBody: '#F8F9FA',
    surfaceCard: '#FFFFFF',
    borderSubtle: '#E5E7EB',
    textMain: '#111827',
    textSecondary: '#4B5563',
    textMuted: '#9CA3AF',
};

// Functions below are provided by js/layoutComponents.js:
// generateSidebar, generateHeader, generateStyles

/**
 * Initialize the PE OS layout
 * @param {string} activePage - The ID of the active page (e.g., 'deals', 'dashboard')
 * @param {object} options - Configuration options
 */
function initPELayout(activePage, options = {}) {
    const { collapsible = false } = options;

    // Add styles to head if not already present
    if (!document.getElementById('pe-layout-styles')) {
        document.head.insertAdjacentHTML('beforeend', generateStyles());
    }

    // Find or create the layout containers
    const sidebarRoot = document.getElementById('sidebar-root');
    const headerRoot = document.getElementById('header-root');

    if (sidebarRoot) {
        sidebarRoot.outerHTML = generateSidebar(activePage, { collapsible });
    }

    if (headerRoot) {
        headerRoot.outerHTML = generateHeader(options);
    }

    // Setup sidebar collapse toggle
    if (collapsible) {
        const collapseBtn = document.getElementById('sidebar-collapse-btn');
        const sidebar = document.getElementById('pe-sidebar');

        if (collapseBtn && sidebar) {
            // Load saved state from localStorage
            const isCollapsed = localStorage.getItem('pe-sidebar-collapsed') === 'true';
            if (isCollapsed) {
                sidebar.classList.add('collapsed');
            }

            collapseBtn.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
                const nowCollapsed = sidebar.classList.contains('collapsed');
                localStorage.setItem('pe-sidebar-collapsed', nowCollapsed.toString());
            });
        }
    }

    // Setup invite team button
    const inviteTeamBtn = document.getElementById('invite-team-btn');
    if (inviteTeamBtn) {
        inviteTeamBtn.addEventListener('click', () => {
            if (typeof window.InviteModal !== 'undefined') {
                window.InviteModal.open();
            } else {
                console.warn('InviteModal not loaded. Include inviteModal.js in your page.');
            }
        });
    }

    // Setup keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // CMD+K to focus search
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('global-search');
            if (searchInput) searchInput.focus();
        }
        // Escape to close dropdown
        if (e.key === 'Escape') {
            const dropdown = document.getElementById('user-dropdown');
            const chevron = document.querySelector('.user-menu-chevron');
            if (dropdown && !dropdown.classList.contains('hidden')) {
                dropdown.classList.add('hidden');
                if (chevron) chevron.classList.remove('open');
            }
        }
    });

    // Setup user menu dropdown
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-dropdown');
    const userMenuChevron = document.querySelector('.user-menu-chevron');

    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = userDropdown.classList.toggle('hidden');
            if (userMenuChevron) {
                userMenuChevron.classList.toggle('open', !isHidden);
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!userDropdown.classList.contains('hidden') && !e.target.closest('#user-menu-container')) {
                userDropdown.classList.add('hidden');
                if (userMenuChevron) userMenuChevron.classList.remove('open');
            }
        });
    }

    // Setup logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            // Clear cached user data on logout
            try { sessionStorage.removeItem(USER_CACHE_KEY); } catch (e) { }
            if (typeof PEAuth !== 'undefined' && PEAuth.signOut) {
                await PEAuth.signOut();
            } else {
                // Fallback if PEAuth not available
                localStorage.clear();
                window.location.href = '/login.html';
            }
        });
    }

    console.log('PE OS Layout initialized for:', activePage);

    // Load user data from API and update display
    // If we have cached data, immediately paint it (0ms, no flash)
    if (cachedUser) {
        updateUserDisplay();
        updateSidebarForRole();
        // Also dispatch immediate event with cached data so other components can use it
        window.dispatchEvent(new CustomEvent('pe-user-loaded', { detail: { user: USER } }));
    }
    // Then refresh from API in background (updates cache for next navigation)
    loadUserData();

    // Dispatch custom event to signal layout is ready
    window.dispatchEvent(new CustomEvent('pe-layout-ready', { detail: { activePage } }));
}

/**
 * Get the Tailwind config script content
 */
function getTailwindConfig() {
    return TAILWIND_CONFIG;
}

/**
 * Generate breadcrumb HTML from an array of crumbs
 * @param {Array<{label: string, href?: string, icon?: string}>} crumbs
 * @param {Object} options - { showBack: boolean, backHref?: string }
 * @returns {string} HTML string
 */
function generateBreadcrumbHTML(crumbs, options = {}) {
    const { showBack = false, backHref } = options;

    const backBtn = showBack ? `
        <button onclick="${backHref ? `window.location.href='${backHref}'` : 'history.back()'}"
                class="flex items-center justify-center size-7 rounded-md hover:bg-primary-light text-text-muted hover:text-primary transition-colors mr-1"
                title="Go back">
            <span class="material-symbols-outlined text-[18px]">arrow_back</span>
        </button>
    ` : '';

    const crumbItems = crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        const separator = i > 0 ? `<span class="material-symbols-outlined text-[14px] text-text-muted">chevron_right</span>` : '';

        if (isLast) {
            return `${separator}<span class="text-text-main font-medium truncate max-w-[200px]">${crumb.label}</span>`;
        }
        return `${separator}<a href="${crumb.href || '#'}" class="text-text-muted hover:text-primary transition-colors whitespace-nowrap">${crumb.label}</a>`;
    }).join('');

    return `
        <nav class="flex items-center gap-1.5 text-sm pe-breadcrumbs">
            ${backBtn}
            ${crumbItems}
        </nav>
    `;
}

/**
 * Render breadcrumbs into a container element
 * @param {string} containerId - The DOM element ID to render into
 * @param {Array<{label: string, href?: string}>} crumbs
 * @param {Object} options - { showBack: boolean, backHref?: string }
 */
function renderBreadcrumbs(containerId, crumbs, options = {}) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = generateBreadcrumbHTML(crumbs, options);
    }
}

// Export for use
window.PELayout = {
    init: initPELayout,
    generateSidebar,
    generateHeader,
    generateBreadcrumbHTML,
    renderBreadcrumbs,
    getTailwindConfig,
    NAV_ITEMS,
    USER
};

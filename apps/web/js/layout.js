/**
 * PE OS - Shared Layout Component
 * Provides consistent sidebar and header across all pages
 */

// Navigation items configuration
const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/dashboard.html' },
    { id: 'deals', label: 'Deals', icon: 'work', href: '/crm.html' },
    { id: 'data-room', label: 'Data Room', icon: 'folder_open', href: '/vdr.html' },
    { id: 'crm', label: 'CRM', icon: 'groups', href: '#' },
    { id: 'portfolio', label: 'Portfolio', icon: 'pie_chart', href: '#' },
    { id: 'admin', label: 'Admin', icon: 'admin_panel_settings', href: '/admin-dashboard.html' },
    { id: 'templates', label: 'Templates', icon: 'description', href: '/templates.html' },
    { divider: true },
    { id: 'memo-builder', label: 'Memo Builder', icon: 'edit_document', href: '/memo-builder.html', isAI: true },
    { id: 'ai-reports', label: 'AI Reports', icon: 'auto_awesome', href: '#', isAI: true },
];

// User data - will be loaded from API
let USER = {
    name: 'Loading...',
    role: '',
    avatar: ''
};

// Load user data from API
async function loadUserData() {
    try {
        if (typeof PEAuth !== 'undefined' && PEAuth.authFetch) {
            const API_BASE = window.location.hostname === 'localhost'
                ? 'http://localhost:3001/api'
                : '/api';
            const response = await PEAuth.authFetch(`${API_BASE}/users/me`);
            if (response.ok) {
                const userData = await response.json();
                USER = {
                    name: userData.name || userData.email?.split('@')[0] || 'User',
                    role: userData.title || getRoleLabel(userData.role) || 'Team Member',
                    avatar: userData.avatar || ''
                };
                updateUserDisplay();
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
    // Update header user name
    const headerUserName = document.querySelector('#user-menu-btn span.hidden');
    if (headerUserName) {
        headerUserName.textContent = USER.name;
    }

    // Update header avatar
    const headerAvatar = document.querySelector('#user-menu-btn > div');
    if (headerAvatar) {
        if (USER.avatar) {
            headerAvatar.style.backgroundImage = `url('${USER.avatar}')`;
        } else {
            const initials = USER.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            headerAvatar.style.backgroundImage = '';
            headerAvatar.style.backgroundColor = PE_COLORS.primary;
            headerAvatar.style.display = 'flex';
            headerAvatar.style.alignItems = 'center';
            headerAvatar.style.justifyContent = 'center';
            headerAvatar.style.color = 'white';
            headerAvatar.style.fontSize = '12px';
            headerAvatar.style.fontWeight = 'bold';
            headerAvatar.innerHTML = initials;
        }
    }

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

/**
 * Generate sidebar HTML
 */
function generateSidebar(activePage, options = {}) {
    const { collapsible = false } = options;

    const navItems = NAV_ITEMS.map(item => {
        if (item.divider) {
            return `<div class="sidebar-divider my-2 mx-2" style="border-top: 1px solid ${PE_COLORS.borderSubtle};"></div>`;
        }

        const isActive = item.id === activePage;
        const baseClasses = 'nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors';

        // Use inline styles for colors to ensure consistency across all pages
        const activeStyle = `background-color: ${PE_COLORS.primary}; color: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05);`;
        const inactiveStyle = `color: ${PE_COLORS.textSecondary};`;
        const aiIconStyle = item.isAI && !isActive ? `color: ${PE_COLORS.secondary};` : '';

        if (isActive) {
            return `
                <a class="${baseClasses}" href="${item.href}" title="${item.label}" style="${activeStyle}" data-active="true">
                    <span class="material-symbols-outlined text-[20px]">${item.icon}</span>
                    <span class="nav-label text-sm font-medium">${item.label}</span>
                </a>
            `;
        } else {
            return `
                <a class="${baseClasses}" href="${item.href}" title="${item.label}" style="${inactiveStyle}"
                   onmouseover="this.style.backgroundColor='${item.isAI ? PE_COLORS.secondaryLight : PE_COLORS.primaryLight}';this.style.color='${item.isAI ? PE_COLORS.secondary : PE_COLORS.primary}';"
                   onmouseout="this.style.backgroundColor='';this.style.color='${PE_COLORS.textSecondary}';">
                    <span class="material-symbols-outlined text-[20px]" style="${aiIconStyle}">${item.icon}</span>
                    <span class="nav-label text-sm font-medium">${item.label}</span>
                </a>
            `;
        }
    }).join('');

    const collapseButton = collapsible ? `
        <button id="sidebar-collapse-btn" class="absolute -right-3 top-20 z-30 flex h-6 w-6 items-center justify-center rounded-full shadow-sm transition-colors"
                style="border: 1px solid ${PE_COLORS.borderSubtle}; background-color: ${PE_COLORS.surfaceCard};"
                onmouseover="this.style.backgroundColor='${PE_COLORS.primaryLight}';this.style.color='${PE_COLORS.primary}';"
                onmouseout="this.style.backgroundColor='${PE_COLORS.surfaceCard}';this.style.color='inherit';">
            <span class="material-symbols-outlined text-[16px] collapse-icon">chevron_left</span>
        </button>
    ` : '';

    return `
        <aside id="pe-sidebar" class="hidden w-64 flex-col md:flex shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-20 transition-all duration-300 relative"
               style="border-right: 1px solid ${PE_COLORS.borderSubtle}; background-color: ${PE_COLORS.surfaceCard};">
            ${collapseButton}
            <div class="flex h-16 items-center px-6" style="border-bottom: 1px solid ${PE_COLORS.borderSubtle};">
                <a href="/dashboard.html" class="flex items-center gap-2" style="color: ${PE_COLORS.primary};">
                    <div class="size-7 shrink-0">${LOGO_SVG}</div>
                    <h2 class="logo-text text-xl font-bold tracking-tight" style="color: ${PE_COLORS.primary};">PE OS</h2>
                </a>
            </div>
            <div class="flex flex-1 flex-col justify-between overflow-y-auto p-4 custom-scrollbar">
                <nav class="flex flex-col gap-1">
                    ${navItems}
                </nav>
                <div class="sidebar-actions flex flex-col gap-2 mt-4 pt-4" style="border-top: 1px solid ${PE_COLORS.borderSubtle};">
                    <button id="invite-team-btn" class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm"
                            style="color: ${PE_COLORS.textSecondary};"
                            onmouseover="this.style.backgroundColor='${PE_COLORS.secondaryLight}';this.style.color='${PE_COLORS.secondary}';"
                            onmouseout="this.style.backgroundColor='';this.style.color='${PE_COLORS.textSecondary}';"
                            title="Invite Team Members">
                        <span class="material-symbols-outlined text-[20px]" style="color: ${PE_COLORS.secondary};">person_add</span>
                        <span class="nav-label font-medium">Invite Team</span>
                    </button>
                    <a href="/settings.html" class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm"
                       style="color: ${PE_COLORS.textSecondary};"
                       onmouseover="this.style.backgroundColor='${PE_COLORS.primaryLight}';this.style.color='${PE_COLORS.primary}';"
                       onmouseout="this.style.backgroundColor='';this.style.color='${PE_COLORS.textSecondary}';"
                       title="Settings & Profile">
                        <span class="material-symbols-outlined text-[20px]">settings</span>
                        <span class="nav-label font-medium">Settings</span>
                    </a>
                </div>
                <div class="user-profile flex flex-col gap-3 mt-4">
                    <a href="/settings.html" class="flex items-center gap-3 p-2.5 rounded-lg transition-all hover:shadow-sm"
                       style="border: 1px solid ${PE_COLORS.borderSubtle}; background-color: rgba(248, 249, 250, 0.5);"
                       onmouseover="this.style.borderColor='${PE_COLORS.primary}';this.style.backgroundColor='${PE_COLORS.primaryLight}';"
                       onmouseout="this.style.borderColor='${PE_COLORS.borderSubtle}';this.style.backgroundColor='rgba(248, 249, 250, 0.5)';"
                       title="View Profile & Settings">
                        <div class="bg-center bg-no-repeat bg-cover rounded-full size-8 shrink-0 border border-gray-200 shadow-sm" style="background-image: url('${USER.avatar}');"></div>
                        <div class="user-info flex flex-col overflow-hidden">
                            <h1 class="text-xs font-bold truncate" style="color: ${PE_COLORS.textMain};">${USER.name}</h1>
                            <p class="text-[10px] font-normal truncate" style="color: ${PE_COLORS.textSecondary};">${USER.role}</p>
                        </div>
                    </a>
                </div>
            </div>
        </aside>
    `;
}

/**
 * Generate header HTML
 */
function generateHeader(options = {}) {
    const { showNewDealButton = false, searchPlaceholder = 'Ask AI anything about your portfolio...' } = options;

    const newDealButton = showNewDealButton ? `
        <button id="new-deal-btn" class="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg shadow-sm hover:bg-primary-hover transition-colors text-sm font-medium">
            <span class="material-symbols-outlined text-[18px]">add</span>
            New Deal
        </button>
    ` : '';

    return `
        <header id="pe-header" class="flex h-16 shrink-0 items-center justify-between border-b border-border-subtle px-6 bg-surface-card z-40 sticky top-0">
            <div class="flex items-center gap-4 flex-1">
                <button class="md:hidden text-text-main" id="mobile-menu-btn">
                    <span class="material-symbols-outlined">menu</span>
                </button>
                <div class="relative hidden w-full max-w-lg md:block group">
                    <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <span class="material-symbols-outlined text-text-muted group-focus-within:text-primary transition-colors text-[20px]">search</span>
                    </div>
                    <input
                        id="global-search"
                        class="block w-full rounded-md border border-border-subtle bg-background-body py-2 pl-10 pr-10 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary transition-all shadow-sm"
                        placeholder="${searchPlaceholder}"
                        type="text"
                    />
                    <div class="absolute inset-y-0 right-0 flex items-center pr-2">
                        <button class="p-1 hover:bg-gray-200 rounded transition-colors text-primary">
                            <span class="material-symbols-outlined text-[18px]">auto_awesome</span>
                        </button>
                    </div>
                </div>
            </div>
            <div class="flex items-center gap-4">
                ${newDealButton}
                <button class="flex items-center justify-center rounded-lg p-2 text-text-secondary hover:text-primary hover:bg-primary-light transition-colors relative" id="notifications-btn">
                    <span class="material-symbols-outlined text-[20px]">notifications</span>
                    <span class="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 border border-white"></span>
                </button>
                <div class="h-6 w-px bg-border-subtle"></div>
                <div class="relative" id="user-menu-container">
                    <button class="flex items-center gap-2 text-sm font-medium text-text-main hover:text-primary transition-colors" id="user-menu-btn" title="Profile & Settings">
                        <div class="bg-center bg-no-repeat bg-cover rounded-full size-8 border border-gray-200 shadow-sm" style="background-image: url('${USER.avatar}');"></div>
                        <span class="hidden md:inline">${USER.name}</span>
                        <span class="material-symbols-outlined text-[18px] text-text-muted user-menu-chevron transition-transform duration-200">expand_more</span>
                    </button>
                    <div id="user-dropdown" class="user-dropdown hidden absolute right-0 top-full mt-2 w-56 rounded-lg shadow-lg py-1 z-50" style="background-color: ${PE_COLORS.surfaceCard}; border: 1px solid ${PE_COLORS.borderSubtle};">
                        <div class="px-4 py-3 border-b" style="border-color: ${PE_COLORS.borderSubtle};">
                            <p class="text-sm font-medium" style="color: ${PE_COLORS.textMain};">${USER.name}</p>
                            <p class="text-xs truncate" style="color: ${PE_COLORS.textMuted};">${USER.role}</p>
                        </div>
                        <div class="py-1">
                            <a href="/settings.html" class="user-dropdown-item flex items-center gap-3 px-4 py-2 text-sm transition-colors" style="color: ${PE_COLORS.textSecondary};">
                                <span class="material-symbols-outlined text-[18px]">person</span>
                                Profile
                            </a>
                            <a href="/settings.html" class="user-dropdown-item flex items-center gap-3 px-4 py-2 text-sm transition-colors" style="color: ${PE_COLORS.textSecondary};">
                                <span class="material-symbols-outlined text-[18px]">settings</span>
                                Settings
                            </a>
                        </div>
                        <div class="border-t py-1" style="border-color: ${PE_COLORS.borderSubtle};">
                            <button id="logout-btn" class="user-dropdown-item flex items-center gap-3 px-4 py-2 text-sm w-full text-left transition-colors" style="color: #DC2626;">
                                <span class="material-symbols-outlined text-[18px]">logout</span>
                                Log out
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    `;
}

/**
 * Generate required CSS styles
 */
function generateStyles() {
    return `
        <style id="pe-layout-styles">
            .custom-scrollbar::-webkit-scrollbar {
                width: 6px;
                height: 6px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
                background: transparent;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
                background: #D1D5DB;
                border-radius: 3px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                background: #9CA3AF;
            }
            body {
                font-feature-settings: "cv11", "ss01";
                -webkit-font-smoothing: antialiased;
            }
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(-10px) scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
            /* Collapsible Sidebar Styles */
            #pe-sidebar.collapsed {
                width: 72px;
            }
            #pe-sidebar.collapsed .nav-label,
            #pe-sidebar.collapsed .logo-text,
            #pe-sidebar.collapsed .user-info,
            #pe-sidebar.collapsed .sidebar-divider,
            #pe-sidebar.collapsed .sidebar-actions {
                display: none;
            }
            #pe-sidebar.collapsed .nav-item {
                justify-content: center;
                padding-left: 0;
                padding-right: 0;
            }
            #pe-sidebar.collapsed .user-profile {
                padding: 0;
                display: flex;
                justify-content: center;
            }
            #pe-sidebar.collapsed .user-profile > a {
                justify-content: center;
                padding: 0.625rem;
                border: none !important;
                background: transparent !important;
                width: auto;
            }
            #pe-sidebar.collapsed .user-profile > a:hover {
                background: rgba(0, 51, 102, 0.05) !important;
                border-radius: 0.5rem;
            }
            #pe-sidebar.collapsed .user-profile .user-info {
                display: none;
            }
            #pe-sidebar.collapsed .user-profile > a > div:first-child {
                width: 2.25rem;
                height: 2.25rem;
                margin: 0;
            }
            #pe-sidebar.collapsed .collapse-icon {
                transform: rotate(180deg);
            }
            #pe-sidebar .collapse-icon {
                transition: transform 0.3s ease;
            }
            /* User Dropdown Styles */
            .user-dropdown {
                animation: dropdownSlideIn 0.15s ease-out;
            }
            @keyframes dropdownSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-8px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            .user-dropdown-item:hover {
                background-color: ${PE_COLORS.primaryLight};
                color: ${PE_COLORS.primary} !important;
            }
            #logout-btn:hover {
                background-color: #FEF2F2 !important;
                color: #DC2626 !important;
            }
            .user-menu-chevron.open {
                transform: rotate(180deg);
            }
        </style>
    `;
}

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
    });

    console.log('PE OS Layout initialized for:', activePage);

    // Load user data from API and update display
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

// Export for use
window.PELayout = {
    init: initPELayout,
    generateSidebar,
    generateHeader,
    getTailwindConfig,
    NAV_ITEMS,
    USER
};

/**
 * PE OS - Layout Components
 * Extracted from layout.js: generateSidebar, generateHeader, generateStyles.
 *
 * Globals provided:
 *   generateSidebar, generateHeader, generateStyles
 *
 * Depends on globals from layout.js:
 *   NAV_ITEMS, PE_COLORS, LOGO_SVG, TAILWIND_CONFIG, USER
 */

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

        // Role-based visibility attributes
        const roleAttr = item.adminOnly ? 'data-admin-only="true"' : (item.memberOnly ? 'data-member-only="true"' : '');

        if (isActive) {
            return `
                <a class="${baseClasses}" href="${item.href}" title="${item.label}" style="${activeStyle}" data-active="true" data-nav-id="${item.id}" ${roleAttr}>
                    <span class="material-symbols-outlined text-[20px]">${item.icon}</span>
                    <span class="nav-label text-sm font-medium">${item.label}</span>
                </a>
            `;
        } else {
            return `
                <a class="${baseClasses}" href="${item.href}" title="${item.label}" style="${inactiveStyle};position:relative;" data-nav-id="${item.id}" ${roleAttr}
                   onmouseover="this.style.backgroundColor='${item.isAI ? PE_COLORS.secondaryLight : PE_COLORS.primaryLight}';this.style.color='${item.isAI ? PE_COLORS.secondary : PE_COLORS.primary}';"
                   onmouseout="this.style.backgroundColor='';this.style.color='${PE_COLORS.textSecondary}';">
                    <span class="material-symbols-outlined text-[20px]" style="${aiIconStyle}">${item.icon}</span>
                    <span class="nav-label text-sm font-medium">${item.label}</span>
                    <span class="nav-activity-dot hidden" style="position:absolute;top:8px;right:8px;width:6px;height:6px;border-radius:50%;background:#059669;box-shadow:0 0 6px rgba(5,150,105,0.5);"></span>
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
                    <span class="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 border border-white hidden" id="notification-dot"></span>
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
                            <button id="help-support-btn" class="user-dropdown-item flex items-center gap-3 px-4 py-2 text-sm w-full text-left transition-colors" style="color: ${PE_COLORS.textSecondary};">
                                <span class="material-symbols-outlined text-[18px]">help</span>
                                Help & Support
                            </button>
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
 * Generate the Help & Support modal HTML.
 * Injected once per page; opened by the user-dropdown "Help & Support" button.
 */
function generateHelpSupportModal() {
    return `
        <div id="help-support-modal" class="fixed inset-0 z-50 hidden items-center justify-center" style="background-color: rgba(0,0,0,0.5);">
            <div class="rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" style="background-color: ${PE_COLORS.surfaceCard}; border: 1px solid ${PE_COLORS.borderSubtle};">
                <!-- Header -->
                <div class="px-6 py-4 flex items-center justify-between" style="border-bottom: 1px solid ${PE_COLORS.borderSubtle}; background-color: ${PE_COLORS.backgroundBody};">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-lg flex items-center justify-center" style="background-color: ${PE_COLORS.primary};">
                            <span class="material-symbols-outlined text-white text-[20px]">help</span>
                        </div>
                        <div>
                            <h3 class="text-base font-bold" style="color: ${PE_COLORS.textMain};">Help & Support</h3>
                            <p class="text-xs" style="color: ${PE_COLORS.textMuted};">Choose how you'd like to reach our team.</p>
                        </div>
                    </div>
                    <button id="help-support-close" class="p-1.5 rounded-md transition-colors" style="color: ${PE_COLORS.textMuted};" onmouseover="this.style.backgroundColor='${PE_COLORS.backgroundBody}'" onmouseout="this.style.backgroundColor='transparent'" title="Close">
                        <span class="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <!-- Options -->
                <div class="p-6 space-y-3">
                    <!-- Book a Call -->
                    <button id="help-support-book" type="button"
                            class="w-full text-left p-4 rounded-lg flex items-start gap-4 transition-all hover:shadow-md"
                            style="background-color: ${PE_COLORS.surfaceCard}; border: 1.5px solid ${PE_COLORS.borderSubtle};"
                            onmouseover="this.style.borderColor='${PE_COLORS.primary}'; this.style.backgroundColor='#F8FAFC';"
                            onmouseout="this.style.borderColor='${PE_COLORS.borderSubtle}'; this.style.backgroundColor='${PE_COLORS.surfaceCard}';">
                        <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style="background-color: #E6EEF5; color: ${PE_COLORS.primary};">
                            <span class="material-symbols-outlined text-[22px]">event</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-bold" style="color: ${PE_COLORS.textMain};">Book a Support Call</p>
                            <p class="text-xs mt-0.5" style="color: ${PE_COLORS.textMuted};">30-min video call with our team. Pick a time that works for you.</p>
                        </div>
                        <span class="material-symbols-outlined text-[20px] shrink-0" style="color: ${PE_COLORS.textMuted};">chevron_right</span>
                    </button>

                    <!-- Written Feedback -->
                    <button id="help-support-form" type="button"
                            class="w-full text-left p-4 rounded-lg flex items-start gap-4 transition-all hover:shadow-md"
                            style="background-color: ${PE_COLORS.surfaceCard}; border: 1.5px solid ${PE_COLORS.borderSubtle};"
                            onmouseover="this.style.borderColor='${PE_COLORS.primary}'; this.style.backgroundColor='#F8FAFC';"
                            onmouseout="this.style.borderColor='${PE_COLORS.borderSubtle}'; this.style.backgroundColor='${PE_COLORS.surfaceCard}';">
                        <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style="background-color: #E6EEF5; color: ${PE_COLORS.primary};">
                            <span class="material-symbols-outlined text-[22px]">edit_note</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-bold" style="color: ${PE_COLORS.textMain};">Send Written Feedback</p>
                            <p class="text-xs mt-0.5" style="color: ${PE_COLORS.textMuted};">Quick form for bug reports, feature requests, or general feedback.</p>
                        </div>
                        <span class="material-symbols-outlined text-[20px] shrink-0" style="color: ${PE_COLORS.textMuted};">chevron_right</span>
                    </button>
                </div>

                <!-- Footer -->
                <div class="px-6 py-3 text-center" style="border-top: 1px solid ${PE_COLORS.borderSubtle}; background-color: ${PE_COLORS.backgroundBody};">
                    <p class="text-xs" style="color: ${PE_COLORS.textMuted};">
                        Need urgent help? Email
                        <span id="help-support-emails"></span>
                    </p>
                </div>
            </div>
        </div>
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

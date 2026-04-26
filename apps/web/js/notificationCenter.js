/**
 * PE OS — Notification Center (Slide-Out Panel)
 * Full-height right panel with time-grouped notifications,
 * filter tabs, mark-read, and deep links.
 */

window.PENotifications = (function() {
    let unreadCount = 0;
    let notifications = [];
    let isOpen = false;
    let currentUserId = null;
    let activeFilter = 'all'; // 'all' | 'unread' | 'ai' | 'team'
    let pollInterval = null;

    // ── Notification type config ────────────────────────
    const TYPE_CONFIG = {
        'DEAL_UPDATE':        { icon: 'trending_up',     color: '#003366', bg: '#E6EEF5', label: 'Deal' },
        'DOCUMENT_UPLOADED':  { icon: 'upload_file',     color: '#2563EB', bg: '#EFF6FF', label: 'Document' },
        'MENTION':            { icon: 'alternate_email', color: '#7C3AED', bg: '#F5F3FF', label: 'Mention' },
        'AI_INSIGHT':         { icon: 'auto_awesome',    color: '#D97706', bg: '#FFFBEB', label: 'AI' },
        'TASK_ASSIGNED':      { icon: 'task_alt',        color: '#059669', bg: '#ECFDF5', label: 'Task' },
        'COMMENT':            { icon: 'comment',         color: '#0891B2', bg: '#ECFEFF', label: 'Comment' },
        'SYSTEM':             { icon: 'info',            color: '#6B7280', bg: '#F3F4F6', label: 'System' },
        'STAGE_CHANGE':       { icon: 'swap_horiz',      color: '#003366', bg: '#E6EEF5', label: 'Stage' },
        'FINANCIAL_READY':    { icon: 'table_chart',     color: '#059669', bg: '#ECFDF5', label: 'Financial' },
        'INVITATION':         { icon: 'mail',            color: '#7C3AED', bg: '#F5F3FF', label: 'Invite' },
    };

    function getTypeConfig(type) {
        return TYPE_CONFIG[type] || TYPE_CONFIG['SYSTEM'];
    }

    // ── Time grouping ───────────────────────────────────
    function getTimeGroup(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            // Check if actually today
            if (date.toDateString() === now.toDateString()) return 'Today';
            return 'Yesterday';
        }
        if (diffDays === 1 || (diffDays === 0 && date.toDateString() !== now.toDateString())) return 'Yesterday';
        if (diffDays < 7) return 'This Week';
        if (diffDays < 30) return 'This Month';
        return 'Older';
    }

    function groupNotifications(list) {
        const groups = {};
        list.forEach(n => {
            const group = getTimeGroup(n.createdAt);
            if (!groups[group]) groups[group] = [];
            groups[group].push(n);
        });
        return groups;
    }

    // ── Filter logic ────────────────────────────────────
    function getFilteredNotifications() {
        switch (activeFilter) {
            case 'unread': return notifications.filter(n => !n.isRead);
            case 'ai': return notifications.filter(n => ['AI_INSIGHT', 'FINANCIAL_READY'].includes(n.type));
            case 'team': return notifications.filter(n => ['MENTION', 'COMMENT', 'TASK_ASSIGNED', 'INVITATION'].includes(n.type));
            default: return notifications;
        }
    }

    // ── Styles (injected once) ──────────────────────────
    function injectStyles() {
        if (document.getElementById('nc-styles')) return;
        const style = document.createElement('style');
        style.id = 'nc-styles';
        style.textContent = `
            #nc-overlay {
                position: fixed; inset: 0; z-index: 9980;
                background: rgba(0,0,0,0.3); backdrop-filter: blur(2px);
                animation: ncFadeIn 0.2s ease-out;
            }
            @keyframes ncFadeIn { from { opacity: 0; } to { opacity: 1; } }
            #nc-panel {
                position: fixed; top: 0; right: 0; bottom: 0; z-index: 9981;
                width: 420px; max-width: 100vw;
                background: #fff; border-left: 1px solid #E5E7EB;
                box-shadow: -8px 0 24px rgba(0,0,0,0.1);
                display: flex; flex-direction: column;
                animation: ncSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes ncSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
            #nc-panel.closing { animation: ncSlideOut 0.2s ease-in forwards; }
            @keyframes ncSlideOut { from { transform: translateX(0); } to { transform: translateX(100%); } }

            .nc-header {
                padding: 20px 20px 0; border-bottom: 1px solid #E5E7EB;
                flex-shrink: 0;
            }
            .nc-header-top {
                display: flex; align-items: center; justify-content: space-between;
                margin-bottom: 16px;
            }
            .nc-title {
                font-size: 18px; font-weight: 700; color: #111827;
                display: flex; align-items: center; gap: 8px;
            }
            .nc-unread-pill {
                font-size: 11px; font-weight: 700; color: #fff;
                background: #003366; border-radius: 9999px;
                padding: 2px 8px; min-width: 20px; text-align: center;
            }
            .nc-close {
                background: none; border: none; cursor: pointer;
                color: #9CA3AF; padding: 4px; border-radius: 6px;
                transition: all 0.15s; display: flex; align-items: center;
            }
            .nc-close:hover { background: #F3F4F6; color: #374151; }
            .nc-actions { display: flex; gap: 8px; align-items: center; }
            .nc-mark-read {
                font-size: 12px; font-weight: 600; color: #003366;
                background: none; border: none; cursor: pointer;
                padding: 4px 8px; border-radius: 6px; transition: all 0.15s;
            }
            .nc-mark-read:hover { background: #E6EEF5; }

            /* Filter tabs */
            .nc-tabs {
                display: flex; gap: 0; margin: 0 -20px;
                border-top: none;
            }
            .nc-tab {
                flex: 1; padding: 10px 0; font-size: 12px; font-weight: 600;
                color: #9CA3AF; background: none; border: none;
                border-bottom: 2px solid transparent;
                cursor: pointer; transition: all 0.15s;
                text-align: center;
            }
            .nc-tab:hover { color: #4B5563; }
            .nc-tab.active { color: #003366; border-bottom-color: #003366; }

            /* Notification list */
            .nc-list {
                flex: 1; overflow-y: auto; padding: 0;
            }
            .nc-list::-webkit-scrollbar { width: 4px; }
            .nc-list::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 2px; }
            .nc-group-label {
                font-size: 11px; font-weight: 700; text-transform: uppercase;
                letter-spacing: 0.05em; color: #9CA3AF;
                padding: 12px 20px 6px; background: #FAFAFA;
                border-bottom: 1px solid #F3F4F6;
                position: sticky; top: 0; z-index: 1;
            }
            .nc-item {
                display: flex; align-items: flex-start; gap: 12px;
                padding: 14px 20px; border-bottom: 1px solid #F3F4F6;
                cursor: pointer; transition: background 0.15s;
                position: relative;
            }
            .nc-item:hover { background: #F9FAFB; }
            .nc-item.unread { background: #F0F5FA; }
            .nc-item.unread:hover { background: #E6EEF5; }
            .nc-item-icon {
                width: 36px; height: 36px; border-radius: 10px;
                display: flex; align-items: center; justify-content: center;
                flex-shrink: 0;
            }
            .nc-item-icon .material-symbols-outlined { font-size: 18px; }
            .nc-item-content { flex: 1; min-width: 0; }
            .nc-item-title {
                font-size: 13px; font-weight: 500; color: #111827;
                line-height: 1.4; display: -webkit-box;
                -webkit-line-clamp: 2; -webkit-box-orient: vertical;
                overflow: hidden;
            }
            .nc-item.unread .nc-item-title { font-weight: 700; }
            .nc-item-message {
                font-size: 12px; color: #6B7280; margin-top: 2px;
                display: -webkit-box; -webkit-line-clamp: 1;
                -webkit-box-orient: vertical; overflow: hidden;
            }
            .nc-item-meta {
                display: flex; align-items: center; gap: 6px;
                margin-top: 4px; font-size: 11px; color: #9CA3AF;
            }
            .nc-item-deal {
                color: #003366; font-weight: 600; cursor: pointer;
            }
            .nc-item-deal:hover { text-decoration: underline; }
            .nc-unread-dot {
                position: absolute; top: 18px; right: 20px;
                width: 8px; height: 8px; border-radius: 9999px;
                background: #003366;
            }
            .nc-item-type {
                font-size: 10px; font-weight: 600; color: #6B7280;
                background: #F3F4F6; border-radius: 4px;
                padding: 1px 6px;
            }

            /* Empty state */
            .nc-empty {
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                padding: 60px 20px; color: #9CA3AF;
            }
            .nc-empty .material-symbols-outlined { font-size: 40px; margin-bottom: 8px; opacity: 0.4; }
            .nc-empty p { font-size: 13px; }
            .nc-empty p.sub { font-size: 11px; margin-top: 4px; }
        `;
        document.head.appendChild(style);
    }

    // ── Initialize ──────────────────────────────────────
    async function init() {
        const result = await window.PEAuth?.getSession?.();
        currentUserId = result?.session?.user?.id;
        if (!currentUserId) { console.warn('No user ID for notifications'); return; }

        injectStyles();
        await loadNotifications();
        setupNotificationButton();

        // Poll every 30s
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(loadNotifications, 30000);
    }

    // ── Load from API ───────────────────────────────────
    async function loadNotifications() {
        if (!currentUserId) return;
        try {
            const response = await window.PEAuth.authFetch(`${API_BASE_URL}/notifications?userId=${currentUserId}&limit=50`);
            if (!response.ok) throw new Error('Failed to load notifications');
            const data = await response.json();
            notifications = data.notifications || [];
            unreadCount = data.unreadCount || 0;
            updateBadge();
            // If panel is open, refresh the list
            if (isOpen) refreshList();
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    // ── Badge ───────────────────────────────────────────
    function updateBadge() {
        // Bell icon dot
        const dots = document.querySelectorAll('#notification-dot, .notification-dot');
        dots.forEach(dot => {
            if (unreadCount > 0) dot.classList.remove('hidden');
            else dot.classList.add('hidden');
        });

        // Numeric badges
        const badges = document.querySelectorAll('.notification-badge');
        badges.forEach(badge => {
            if (unreadCount > 0) {
                badge.classList.remove('hidden');
                badge.textContent = unreadCount > 99 ? '99+' : unreadCount.toString();
            } else {
                badge.classList.add('hidden');
            }
        });
    }

    // ── Button setup ────────────────────────────────────
    function setupNotificationButton() {
        const btn = document.getElementById('notifications-btn');
        if (!btn) return;

        // Remove old listeners by cloning
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePanel();
        });

        // Ensure dot has our class
        const dot = newBtn.querySelector('.rounded-full.bg-red-500');
        if (dot) {
            dot.classList.add('notification-dot');
            if (unreadCount === 0) dot.classList.add('hidden');
        }
    }

    // ── Panel open/close ────────────────────────────────
    function togglePanel() { isOpen ? closePanel() : openPanel(); }

    function openPanel() {
        closePanel(); // clean up any existing
        isOpen = true;

        // Overlay
        const overlay = document.createElement('div');
        overlay.id = 'nc-overlay';
        overlay.addEventListener('click', closePanel);
        document.body.appendChild(overlay);

        // Panel
        const panel = document.createElement('div');
        panel.id = 'nc-panel';
        panel.innerHTML = renderPanel();
        document.body.appendChild(panel);

        // Wire events
        panel.querySelector('.nc-close')?.addEventListener('click', closePanel);
        panel.querySelector('.nc-mark-read')?.addEventListener('click', markAllAsRead);

        // Tab clicks
        panel.querySelectorAll('.nc-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                activeFilter = tab.dataset.filter;
                panel.querySelectorAll('.nc-tab').forEach(t => t.classList.toggle('active', t === tab));
                refreshList();
            });
        });

        // Item clicks
        wireItemClicks(panel);

        // Escape key
        document.addEventListener('keydown', handleEscape);

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    function closePanel() {
        const panel = document.getElementById('nc-panel');
        const overlay = document.getElementById('nc-overlay');
        if (panel) {
            panel.classList.add('closing');
            setTimeout(() => panel.remove(), 200);
        }
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 200);
        }
        isOpen = false;
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
    }

    function handleEscape(e) { if (e.key === 'Escape') closePanel(); }

    // ── Render ──────────────────────────────────────────
    function renderPanel() {
        return `
            <div class="nc-header">
                <div class="nc-header-top">
                    <div class="nc-title">
                        Notifications
                        ${unreadCount > 0 ? `<span class="nc-unread-pill">${unreadCount}</span>` : ''}
                    </div>
                    <div class="nc-actions">
                        ${unreadCount > 0 ? `<button class="nc-mark-read">Mark all read</button>` : ''}
                        <button class="nc-close"><span class="material-symbols-outlined" style="font-size:20px">close</span></button>
                    </div>
                </div>
                <div class="nc-tabs">
                    <button class="nc-tab ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
                    <button class="nc-tab ${activeFilter === 'unread' ? 'active' : ''}" data-filter="unread">Unread</button>
                    <button class="nc-tab ${activeFilter === 'ai' ? 'active' : ''}" data-filter="ai">AI</button>
                    <button class="nc-tab ${activeFilter === 'team' ? 'active' : ''}" data-filter="team">Team</button>
                </div>
            </div>
            <div class="nc-list" id="nc-list">
                ${renderList()}
            </div>
        `;
    }

    function renderList() {
        const filtered = getFilteredNotifications();

        if (filtered.length === 0) {
            const emptyMsg = activeFilter === 'unread' ? "You're all caught up!" :
                             activeFilter === 'ai' ? 'No AI notifications yet' :
                             activeFilter === 'team' ? 'No team notifications yet' :
                             'No notifications yet';
            return `
                <div class="nc-empty">
                    <span class="material-symbols-outlined">notifications_off</span>
                    <p>${emptyMsg}</p>
                    <p class="sub">Notifications will appear here as your deals progress</p>
                </div>
            `;
        }

        const groups = groupNotifications(filtered);
        let html = '';

        for (const [groupLabel, items] of Object.entries(groups)) {
            html += `<div class="nc-group-label">${groupLabel}</div>`;
            items.forEach(n => {
                const cfg = getTypeConfig(n.type);
                const timeAgo = typeof formatTimeAgo === 'function' ? formatTimeAgo(n.createdAt) : '';
                const dealName = n.Deal?.name || '';

                html += `
                    <div class="nc-item ${n.isRead ? '' : 'unread'}" data-id="${esc(n.id)}" data-deal-id="${esc(n.dealId || '')}">
                        <div class="nc-item-icon" style="background:${cfg.bg};color:${cfg.color}">
                            <span class="material-symbols-outlined">${cfg.icon}</span>
                        </div>
                        <div class="nc-item-content">
                            <div class="nc-item-title">${esc(n.title)}</div>
                            ${n.message ? `<div class="nc-item-message">${esc(n.message)}</div>` : ''}
                            <div class="nc-item-meta">
                                <span>${timeAgo}</span>
                                ${dealName ? `<span>\u00B7</span><span class="nc-item-deal" data-deal-id="${esc(n.dealId)}">${esc(dealName)}</span>` : ''}
                                <span>\u00B7</span>
                                <span class="nc-item-type">${cfg.label}</span>
                            </div>
                        </div>
                        ${!n.isRead ? '<div class="nc-unread-dot"></div>' : ''}
                    </div>
                `;
            });
        }

        return html;
    }

    function refreshList() {
        const list = document.getElementById('nc-list');
        if (list) {
            list.innerHTML = renderList();
            wireItemClicks(list);
        }
    }

    function wireItemClicks(container) {
        container.querySelectorAll('.nc-item').forEach(item => {
            item.addEventListener('click', () => {
                const dealId = item.dataset.dealId;
                if (dealId) {
                    closePanel();
                    window.location.href = `/deal.html?id=${dealId}`;
                }
            });
        });

        container.querySelectorAll('.nc-item-deal').forEach(link => {
            link.addEventListener('click', (e) => {
                e.stopPropagation();
                const dealId = link.dataset.dealId;
                if (dealId) {
                    closePanel();
                    window.location.href = `/deal.html?id=${dealId}`;
                }
            });
        });
    }

    // ── Actions ─────────────────────────────────────────
    async function markAllAsRead() {
        if (!currentUserId) return;
        try {
            await window.PEAuth.authFetch(`${API_BASE_URL}/notifications/mark-all-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUserId }),
            });
            notifications = notifications.map(n => ({ ...n, isRead: true }));
            unreadCount = 0;
            updateBadge();

            // Refresh panel header + list
            const panel = document.getElementById('nc-panel');
            if (panel) {
                panel.innerHTML = renderPanel();
                panel.querySelector('.nc-close')?.addEventListener('click', closePanel);
                panel.querySelectorAll('.nc-tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        activeFilter = tab.dataset.filter;
                        panel.querySelectorAll('.nc-tab').forEach(t => t.classList.toggle('active', t === tab));
                        refreshList();
                    });
                });
                wireItemClicks(panel);
            }
        } catch (error) {
            console.error('Error marking all as read:', error);
        }
    }

    // ── Helpers ──────────────────────────────────────────
    function esc(str) {
        if (!str) return '';
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Public API ──────────────────────────────────────
    return {
        init,
        setupButton: setupNotificationButton,
        loadNotifications,
        togglePanel,
        closePanel,
        getUnreadCount: () => unreadCount,
    };
})();

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.PEAuth && window.PEAuth.getSession) {
            window.PENotifications.init();
        }
    }, 500);

    setTimeout(() => {
        if (window.PENotifications) {
            window.PENotifications.setupButton();
        }
    }, 1500);
});

window.addEventListener('pe-layout-ready', () => {
    setTimeout(() => {
        if (window.PENotifications) {
            window.PENotifications.init();
            window.PENotifications.setupButton();
        }
    }, 100);
});

console.log('PENotifications loaded successfully');

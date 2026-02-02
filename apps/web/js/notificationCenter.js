/**
 * PE OS Notification Center
 * Provides in-app notification management and UI
 */

window.PENotifications = (function() {
    const API_BASE_URL = 'http://localhost:3001/api';
    let unreadCount = 0;
    let notifications = [];
    let isOpen = false;
    let currentUserId = null;

    // Get notification icon by type
    function getNotificationIcon(type) {
        const icons = {
            'DEAL_UPDATE': { icon: 'trending_up', color: 'text-primary', bg: 'bg-primary-light' },
            'DOCUMENT_UPLOADED': { icon: 'upload_file', color: 'text-blue-600', bg: 'bg-blue-100' },
            'MENTION': { icon: 'alternate_email', color: 'text-purple-600', bg: 'bg-purple-100' },
            'AI_INSIGHT': { icon: 'auto_awesome', color: 'text-amber-600', bg: 'bg-amber-100' },
            'TASK_ASSIGNED': { icon: 'task_alt', color: 'text-green-600', bg: 'bg-green-100' },
            'COMMENT': { icon: 'comment', color: 'text-cyan-600', bg: 'bg-cyan-100' },
            'SYSTEM': { icon: 'info', color: 'text-gray-600', bg: 'bg-gray-100' },
        };
        return icons[type] || icons['SYSTEM'];
    }

    // Format relative time
    function formatTimeAgo(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    }

    // Initialize notification center
    async function init() {
        // Get current user
        const session = await window.PEAuth?.getSession?.();
        currentUserId = session?.user?.id;

        if (!currentUserId) {
            console.warn('No user ID for notifications');
            return;
        }

        // Initial load
        await loadNotifications();

        // Setup notification button
        setupNotificationButton();

        // Poll for new notifications every 30 seconds
        setInterval(loadNotifications, 30000);
    }

    // Load notifications from API
    async function loadNotifications() {
        if (!currentUserId) return;

        try {
            const response = await window.PEAuth.authFetch(`${API_BASE_URL}/notifications?userId=${currentUserId}&limit=20`);
            if (!response.ok) throw new Error('Failed to load notifications');

            const data = await response.json();
            notifications = data.notifications || [];
            unreadCount = data.unreadCount || 0;

            updateBadge();
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    // Update notification badge
    function updateBadge() {
        const badges = document.querySelectorAll('.notification-badge');
        badges.forEach(badge => {
            if (unreadCount > 0) {
                badge.classList.remove('hidden');
                badge.textContent = unreadCount > 9 ? '9+' : unreadCount.toString();
            } else {
                badge.classList.add('hidden');
            }
        });

        // Update dot indicator
        const dots = document.querySelectorAll('.notification-dot');
        dots.forEach(dot => {
            if (unreadCount > 0) {
                dot.classList.remove('hidden');
            } else {
                dot.classList.add('hidden');
            }
        });
    }

    // Setup notification button click handler
    function setupNotificationButton() {
        const btn = document.getElementById('notifications-btn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePanel();
            });

            // Update the existing dot to have our class
            const dot = btn.querySelector('.rounded-full.bg-red-500');
            if (dot) {
                dot.classList.add('notification-dot');
                if (unreadCount === 0) dot.classList.add('hidden');
            }
        }
    }

    // Toggle notification panel
    function togglePanel() {
        if (isOpen) {
            closePanel();
        } else {
            openPanel();
        }
    }

    // Open notification panel
    function openPanel() {
        // Remove existing panel if any
        closePanel();

        isOpen = true;

        const panel = document.createElement('div');
        panel.id = 'notification-panel';
        panel.className = 'fixed top-16 right-4 w-96 max-h-[calc(100vh-5rem)] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 flex flex-col animate-fadeIn';
        panel.innerHTML = `
            <div class="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 rounded-t-xl">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary">notifications</span>
                    <h3 class="font-bold text-gray-900">Notifications</h3>
                    ${unreadCount > 0 ? `<span class="px-2 py-0.5 rounded-full bg-primary text-white text-xs font-bold">${unreadCount}</span>` : ''}
                </div>
                <div class="flex items-center gap-2">
                    ${unreadCount > 0 ? `
                        <button id="mark-all-read-btn" class="text-xs text-primary hover:text-primary-hover font-medium">
                            Mark all read
                        </button>
                    ` : ''}
                    <button id="close-notifications-btn" class="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                        <span class="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            </div>
            <div id="notification-list" class="flex-1 overflow-y-auto">
                ${renderNotificationList()}
            </div>
        `;

        document.body.appendChild(panel);

        // Event handlers
        document.getElementById('close-notifications-btn')?.addEventListener('click', closePanel);
        document.getElementById('mark-all-read-btn')?.addEventListener('click', markAllAsRead);

        // Click outside to close
        setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
        }, 0);

        // Mark visible notifications as read
        setTimeout(markVisibleAsRead, 1000);
    }

    // Render notification list
    function renderNotificationList() {
        if (notifications.length === 0) {
            return `
                <div class="flex flex-col items-center justify-center py-12 text-gray-400">
                    <span class="material-symbols-outlined text-4xl mb-2">notifications_off</span>
                    <p class="text-sm font-medium">No notifications</p>
                    <p class="text-xs mt-1">You're all caught up!</p>
                </div>
            `;
        }

        return notifications.map(notification => {
            const { icon, color, bg } = getNotificationIcon(notification.type);
            const timeAgo = formatTimeAgo(notification.createdAt);
            const isUnread = !notification.isRead;

            return `
                <div class="notification-item flex items-start gap-3 p-4 hover:bg-gray-50 border-b border-gray-100 cursor-pointer transition-colors ${isUnread ? 'bg-primary-light/30' : ''}" data-id="${notification.id}" data-deal-id="${notification.dealId || ''}">
                    <div class="size-10 rounded-full ${bg} flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined ${color}">${icon}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-start justify-between gap-2">
                            <p class="text-sm ${isUnread ? 'font-bold' : 'font-medium'} text-gray-900 leading-tight">${notification.title}</p>
                            ${isUnread ? '<div class="size-2 rounded-full bg-primary shrink-0 mt-1.5"></div>' : ''}
                        </div>
                        ${notification.message ? `<p class="text-xs text-gray-500 mt-0.5 line-clamp-2">${notification.message}</p>` : ''}
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-[10px] text-gray-400">${timeAgo}</span>
                            ${notification.Deal?.name ? `
                                <span class="text-[10px] text-gray-400">•</span>
                                <span class="text-[10px] text-primary font-medium">${notification.Deal.name}</span>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Close notification panel
    function closePanel() {
        const panel = document.getElementById('notification-panel');
        if (panel) {
            panel.remove();
        }
        isOpen = false;
        document.removeEventListener('click', handleClickOutside);
    }

    // Handle click outside
    function handleClickOutside(e) {
        const panel = document.getElementById('notification-panel');
        const btn = document.getElementById('notifications-btn');
        if (panel && !panel.contains(e.target) && !btn?.contains(e.target)) {
            closePanel();
        }
    }

    // Mark all notifications as read
    async function markAllAsRead() {
        if (!currentUserId) return;

        try {
            await window.PEAuth.authFetch(`${API_BASE_URL}/notifications/mark-all-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUserId }),
            });

            // Update local state
            notifications = notifications.map(n => ({ ...n, isRead: true }));
            unreadCount = 0;

            // Update UI
            updateBadge();
            const list = document.getElementById('notification-list');
            if (list) {
                list.innerHTML = renderNotificationList();
            }

            // Update header
            const panel = document.getElementById('notification-panel');
            if (panel) {
                const header = panel.querySelector('.p-4.border-b');
                if (header) {
                    const badge = header.querySelector('.rounded-full.bg-primary');
                    if (badge) badge.remove();
                    const markAllBtn = document.getElementById('mark-all-read-btn');
                    if (markAllBtn) markAllBtn.remove();
                }
            }
        } catch (error) {
            console.error('Error marking all as read:', error);
        }
    }

    // Mark visible notifications as read
    async function markVisibleAsRead() {
        const unreadNotifications = notifications.filter(n => !n.isRead);
        if (unreadNotifications.length === 0) return;

        // Mark first 5 as read
        for (const notification of unreadNotifications.slice(0, 5)) {
            try {
                await window.PEAuth.authFetch(`${API_BASE_URL}/notifications/${notification.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isRead: true }),
                });

                notification.isRead = true;
                unreadCount = Math.max(0, unreadCount - 1);
            } catch (error) {
                console.error('Error marking notification as read:', error);
            }
        }

        updateBadge();
    }

    // Show toast notification
    function showToast(title, message, type = 'info') {
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-secondary' : type === 'error' ? 'bg-red-500' : 'bg-primary';
        toast.className = `fixed bottom-4 right-4 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg z-[100] flex items-center gap-3 animate-fadeIn max-w-sm`;
        toast.innerHTML = `
            <span class="material-symbols-outlined text-white">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>
            <div class="flex-1">
                <p class="font-bold text-sm">${title}</p>
                <p class="text-sm opacity-90">${message}</p>
            </div>
            <button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white">
                <span class="material-symbols-outlined text-sm">close</span>
            </button>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }

    // Public API
    return {
        init,
        loadNotifications,
        togglePanel,
        closePanel,
        showToast,
        getUnreadCount: () => unreadCount,
    };
})();

// Auto-init when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for auth to be ready, then init
    setTimeout(() => {
        if (window.PEAuth && window.PEAuth.getSession) {
            window.PENotifications.init();
        }
    }, 500);
});

console.log('PENotifications loaded successfully');

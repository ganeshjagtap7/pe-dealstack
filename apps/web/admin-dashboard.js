/**
 * PE OS - Admin Dashboard (Command Center)
 * Team Lead view for managing analysts, tasks, and deal assignments
 */

// Wait for layout to be ready before initializing dashboard features
window.addEventListener('pe-layout-ready', function() {
    initAdminDashboard();
});

function initAdminDashboard() {
    updateLastUpdated();
    initModals();
    initQuickActions();

    // Refresh timestamp every minute
    setInterval(updateLastUpdated, 60000);
}

// Update the "Last updated" timestamp
function updateLastUpdated() {
    const el = document.getElementById('last-updated');
    if (el) {
        el.textContent = 'Just now';
    }
}

// Initialize modal functionality
function initModals() {
    // Assign Deal Modal
    const assignDealBtn = document.getElementById('assign-deal-btn');
    const assignDealModal = document.getElementById('assign-deal-modal');
    const closeAssignModal = document.getElementById('close-assign-modal');
    const cancelAssign = document.getElementById('cancel-assign');
    const assignModalBackdrop = document.getElementById('assign-modal-backdrop');

    if (assignDealBtn && assignDealModal) {
        assignDealBtn.addEventListener('click', () => openModal(assignDealModal));
        closeAssignModal?.addEventListener('click', () => closeModal(assignDealModal));
        cancelAssign?.addEventListener('click', () => closeModal(assignDealModal));
        assignModalBackdrop?.addEventListener('click', () => closeModal(assignDealModal));
    }

    // Create Task Modal
    const createTaskBtn = document.getElementById('create-task-btn');
    const createTaskModal = document.getElementById('create-task-modal');
    const closeTaskModal = document.getElementById('close-task-modal');
    const cancelTask = document.getElementById('cancel-task');
    const taskModalBackdrop = document.getElementById('task-modal-backdrop');

    if (createTaskBtn && createTaskModal) {
        createTaskBtn.addEventListener('click', () => openModal(createTaskModal));
        closeTaskModal?.addEventListener('click', () => closeModal(createTaskModal));
        cancelTask?.addEventListener('click', () => closeModal(createTaskModal));
        taskModalBackdrop?.addEventListener('click', () => closeModal(createTaskModal));
    }

    // Close modals on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (assignDealModal && !assignDealModal.classList.contains('hidden')) {
                closeModal(assignDealModal);
            }
            if (createTaskModal && !createTaskModal.classList.contains('hidden')) {
                closeModal(createTaskModal);
            }
        }
    });
}

function openModal(modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

// Initialize quick action buttons
function initQuickActions() {
    // Schedule Review button
    const scheduleBtn = document.querySelector('button:has(.material-symbols-outlined:contains("calendar_month"))');

    // Send Reminder button
    const reminderBtn = document.querySelector('button:has(.material-symbols-outlined:contains("notifications_active"))');
}

// API Functions (to be connected to backend)

async function fetchTeamData() {
    try {
        const API_BASE = window.location.hostname === 'localhost'
            ? 'http://localhost:3001/api'
            : '/api';

        // Fetch team members
        const response = await fetch(`${API_BASE}/users`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('pe_auth_token')}`
            }
        });

        if (response.ok) {
            const users = await response.json();
            updateAnalystCount(users.length);
            return users;
        }
    } catch (error) {
        console.warn('Could not fetch team data:', error);
    }
    return [];
}

async function fetchTasks() {
    // TODO: Implement when backend endpoint is ready
    // GET /api/tasks?status=pending
}

async function fetchDeals() {
    try {
        const API_BASE = window.location.hostname === 'localhost'
            ? 'http://localhost:3001/api'
            : '/api';

        const response = await fetch(`${API_BASE}/deals`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('pe_auth_token')}`
            }
        });

        if (response.ok) {
            const deals = await response.json();
            return deals;
        }
    } catch (error) {
        console.warn('Could not fetch deals:', error);
    }
    return [];
}

async function assignDealToAnalyst(dealId, userId, role) {
    try {
        const API_BASE = window.location.hostname === 'localhost'
            ? 'http://localhost:3001/api'
            : '/api';

        const response = await fetch(`${API_BASE}/deals/${dealId}/team`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('pe_auth_token')}`
            },
            body: JSON.stringify({ userId, role })
        });

        if (response.ok) {
            showNotification('Deal assigned successfully', 'success');
            return true;
        }
    } catch (error) {
        console.error('Error assigning deal:', error);
        showNotification('Failed to assign deal', 'error');
    }
    return false;
}

async function createTask(taskData) {
    // TODO: Implement when backend endpoint is ready
    // POST /api/tasks
    console.log('Creating task:', taskData);
    showNotification('Task created successfully', 'success');
}

// UI Update Functions

function updateAnalystCount(count) {
    const el = document.getElementById('analyst-count');
    if (el) {
        el.textContent = count;
    }
}

function updateDealVolume(volume) {
    const el = document.getElementById('deal-volume');
    if (el) {
        el.textContent = formatCurrency(volume);
    }
}

function updateOverdueTasks(count) {
    const el = document.getElementById('overdue-tasks');
    if (el) {
        el.textContent = count;
    }
}

function updateUtilization(percent) {
    const el = document.getElementById('utilization');
    if (el) {
        el.textContent = `${percent}%`;
    }
    const bar = document.querySelector('#utilization')?.closest('.rounded-xl')?.querySelector('.bg-accent-warning');
    if (bar) {
        bar.style.width = `${percent}%`;
    }
}

function updatePendingCount(count) {
    const el = document.getElementById('pending-count');
    if (el) {
        el.textContent = `${count} Pending`;
    }
}

// Utility Functions

function formatCurrency(amount) {
    if (amount >= 1000000000) {
        return `$${(amount / 1000000000).toFixed(1)}B`;
    } else if (amount >= 1000000) {
        return `$${(amount / 1000000).toFixed(0)}M`;
    } else if (amount >= 1000) {
        return `$${(amount / 1000).toFixed(0)}K`;
    }
    return `$${amount}`;
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transform transition-all duration-300 translate-y-full opacity-0`;

    // Set colors based on type
    if (type === 'success') {
        notification.classList.add('bg-secondary', 'text-white');
    } else if (type === 'error') {
        notification.classList.add('bg-accent-danger', 'text-white');
    } else {
        notification.classList.add('bg-primary', 'text-white');
    }

    // Set icon
    let icon = 'info';
    if (type === 'success') icon = 'check_circle';
    if (type === 'error') icon = 'error';

    notification.innerHTML = `
        <span class="material-symbols-outlined text-[20px]">${icon}</span>
        <span class="text-sm font-medium">${message}</span>
    `;

    document.body.appendChild(notification);

    // Animate in
    requestAnimationFrame(() => {
        notification.classList.remove('translate-y-full', 'opacity-0');
    });

    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.add('translate-y-full', 'opacity-0');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Resource Allocation Chart (Future Enhancement)
function renderResourceChart() {
    // Could integrate Chart.js or similar for visualizations
}

// Export functions for potential use by other modules
window.AdminDashboard = {
    fetchTeamData,
    fetchTasks,
    fetchDeals,
    assignDealToAnalyst,
    createTask,
    showNotification
};

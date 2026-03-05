// Dashboard Tasks Module
// PE OS - Private Equity Operating System
// Extracted from dashboard.js — task management functions

// ============================================================
// Tasks Management — Connected to real API
// ============================================================
const API_TASKS_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api';

async function initTasks() {
    await loadRealTasks();

    const viewAllButton = document.getElementById('view-all-tasks');
    if (viewAllButton) {
        viewAllButton.addEventListener('click', () => showTasksModal());
    }
}

async function loadRealTasks() {
    const tasksList = document.getElementById('tasks-list');
    if (!tasksList) return;

    // Show loading state
    tasksList.innerHTML = `
        <div class="flex items-center justify-center py-8 text-text-muted">
            <span class="material-symbols-outlined animate-spin mr-2 text-lg">sync</span>
            <span class="text-sm">Loading tasks...</span>
        </div>
    `;

    try {
        // Wait for user data if not loaded yet
        let userId = USER?.id;
        if (!userId) {
            await new Promise(resolve => {
                const handler = () => { resolve(); window.removeEventListener('pe-user-loaded', handler); };
                window.addEventListener('pe-user-loaded', handler);
                setTimeout(resolve, 3000); // fallback timeout
            });
            userId = USER?.id;
        }

        // Fetch tasks assigned to current user (pending + in_progress)
        const url = userId
            ? `${API_TASKS_URL}/tasks?assignedTo=${userId}&limit=20`
            : `${API_TASKS_URL}/tasks?limit=20`;

        const response = await PEAuth.authFetch(url);
        if (!response.ok) throw new Error('Failed to fetch tasks');

        const data = await response.json();
        state.tasks = (data.tasks || []).map(t => ({
            id: t.id,
            title: t.title,
            due: formatTaskDue(t.dueDate),
            priority: t.priority,
            status: t.status,
            completed: t.status === 'COMPLETED',
            dealName: t.deal?.name || null,
            dealId: t.dealId,
        }));

        renderTasks();
    } catch (error) {
        console.error('Error loading tasks:', error);
        tasksList.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-text-muted">
                <span class="material-symbols-outlined text-2xl mb-1">cloud_off</span>
                <span class="text-sm">Could not load tasks</span>
            </div>
        `;
        updateTaskCount();
    }
}

function formatTaskDue(dueDate) {
    if (!dueDate) return 'No due date';
    const due = new Date(dueDate);
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `Overdue (${Math.abs(diffDays)}d)`;
    if (diffDays === 0) return 'Due Today';
    if (diffDays === 1) return 'Due Tomorrow';
    if (diffDays <= 7) return `Due in ${diffDays} days`;
    return `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function renderTasks() {
    const tasksList = document.getElementById('tasks-list');
    if (!tasksList) return;

    if (state.tasks.length === 0) {
        tasksList.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-text-muted">
                <span class="material-symbols-outlined text-3xl mb-2 text-secondary">task_alt</span>
                <span class="text-sm font-medium">All caught up!</span>
                <span class="text-xs mt-0.5">No tasks assigned to you</span>
            </div>
        `;
        updateTaskCount();
        return;
    }

    // Sort: incomplete first, then by priority, then by due date
    const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const sorted = [...state.tasks].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const pa = priorityOrder[a.priority] ?? 1;
        const pb = priorityOrder[b.priority] ?? 1;
        return pa - pb;
    });

    // Show max 5 in widget, rest in modal
    const visible = sorted.slice(0, 5);

    tasksList.innerHTML = visible.map(task => {
        const isOverdue = task.due.startsWith('Overdue');
        const dueColor = task.completed ? 'text-text-secondary' : isOverdue ? 'text-red-500' : task.due === 'Due Today' ? 'text-orange-500' : 'text-text-muted';
        const priorityBadge = task.priority === 'HIGH' ? '<span class="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded font-bold">HIGH</span>' :
                              task.priority === 'LOW' ? '<span class="text-[10px] bg-gray-100 text-text-muted px-1.5 py-0.5 rounded font-bold">LOW</span>' : '';

        return `
            <label class="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors border-b border-border-subtle/50 cursor-pointer group" data-task-id="${task.id}">
                <input class="task-checkbox mt-1 size-4 rounded border-gray-300 text-primary focus:ring-primary focus:ring-offset-0" type="checkbox" ${task.completed ? 'checked' : ''}>
                <div class="flex flex-col gap-0.5 flex-1 ${task.completed ? 'opacity-50' : ''}">
                    <div class="flex items-center gap-2">
                        <span class="text-sm ${task.completed ? 'font-medium line-through' : 'font-semibold'} text-text-main group-hover:text-primary transition-colors">${task.title}</span>
                        ${priorityBadge}
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs ${dueColor} font-medium">${task.due}</span>
                        ${task.dealName ? `<span class="text-xs text-text-muted">· ${task.dealName}</span>` : ''}
                    </div>
                </div>
            </label>
        `;
    }).join('');

    // Attach checkbox handlers
    tasksList.querySelectorAll('.task-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const label = e.target.closest('[data-task-id]');
            const taskId = label?.dataset.taskId;
            if (!taskId) return;

            const newStatus = e.target.checked ? 'COMPLETED' : 'PENDING';
            const textDiv = label.querySelector('.flex.flex-col');

            // Optimistic UI update
            if (e.target.checked) {
                textDiv.classList.add('opacity-50');
                textDiv.querySelector('span:first-child').classList.add('line-through');
            } else {
                textDiv.classList.remove('opacity-50');
                textDiv.querySelector('span:first-child').classList.remove('line-through');
            }

            // Update state
            const task = state.tasks.find(t => t.id === taskId);
            if (task) task.completed = e.target.checked;
            updateTaskCount();

            // Persist to API
            try {
                await PEAuth.authFetch(`${API_TASKS_URL}/tasks/${taskId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStatus }),
                });
                if (e.target.checked) {
                    showNotification('Task Completed', `"${task?.title}" marked as done`, 'success');
                }
            } catch (err) {
                console.error('Failed to update task:', err);
                // Revert on failure
                e.target.checked = !e.target.checked;
                if (task) task.completed = e.target.checked;
                renderTasks();
            }
        });
    });

    updateTaskCount();
}

function updateTaskCount() {
    const pendingCount = state.tasks.filter(t => !t.completed).length;
    const badge = document.getElementById('task-count');
    if (badge) {
        badge.textContent = `${pendingCount} Pending`;
    }
}

function showTasksModal() {
    const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    const sorted = [...state.tasks].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1);
    });

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-card-hover max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div class="p-6 border-b border-border-subtle flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-primary">check_circle</span>
                    <h3 class="font-bold text-text-main text-lg">All Tasks</h3>
                    <span class="text-xs bg-gray-100 text-text-muted px-2 py-0.5 rounded-full">${state.tasks.length}</span>
                </div>
                <button onclick="this.closest('.fixed').remove()" class="text-text-muted hover:text-text-main">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="p-6">
                ${sorted.length === 0 ? `
                    <div class="text-center py-8 text-text-muted">
                        <span class="material-symbols-outlined text-3xl mb-2 text-secondary">task_alt</span>
                        <p class="text-sm">No tasks assigned to you</p>
                    </div>
                ` : `
                    <div class="space-y-2">
                        ${sorted.map(task => {
                            const isOverdue = task.due.startsWith('Overdue');
                            const dueColor = task.completed ? 'text-text-secondary' : isOverdue ? 'text-red-500' : task.due === 'Due Today' ? 'text-orange-500' : 'text-text-muted';
                            return `
                                <div class="p-4 border border-border-subtle rounded-lg hover:border-primary/30 transition-colors">
                                    <div class="flex items-start gap-3">
                                        <input type="checkbox" ${task.completed ? 'checked' : ''} class="mt-1 size-4 rounded border-gray-300 text-primary" disabled>
                                        <div class="flex-1">
                                            <div class="flex items-center gap-2">
                                                <span class="font-semibold text-text-main ${task.completed ? 'line-through opacity-50' : ''}">${task.title}</span>
                                                ${task.priority === 'HIGH' ? '<span class="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded font-bold">HIGH</span>' : ''}
                                            </div>
                                            <div class="text-xs mt-1 flex items-center gap-2">
                                                <span class="${dueColor}">${task.due}</span>
                                                ${task.dealName ? `<span class="text-text-muted">· <a href="deal.html?id=${task.dealId}" class="hover:text-primary">${task.dealName}</a></span>` : ''}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

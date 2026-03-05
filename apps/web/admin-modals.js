/**
 * PE OS - Admin Dashboard: Modal Handlers (Assign, Task, Review, Reminder)
 * Extracted from admin-dashboard.js — all functions are globals.
 * Depends on: admin-dashboard.js (allDeals, teamMembers, allTasks, loadDeals, loadTasks),
 *             admin-tasks.js (renderTaskTable, renderUpcomingReviews),
 *             js/formatters.js (escapeHtml, formatCurrency),
 *             js/notifications.js (showNotification)
 */

// ─── Modal Init ──────────────────────────────────────────────

function initModals() {
    // Assign Deal Modal
    const assignDealBtn = document.getElementById('assign-deal-btn');
    const assignDealModal = document.getElementById('assign-deal-modal');
    const closeAssignModal = document.getElementById('close-assign-modal');
    const cancelAssign = document.getElementById('cancel-assign');
    const assignModalBackdrop = document.getElementById('assign-modal-backdrop');
    const submitAssign = document.getElementById('submit-assign');

    if (assignDealBtn && assignDealModal) {
        assignDealBtn.addEventListener('click', () => {
            populateModalDropdowns();
            openModal(assignDealModal);
        });
        closeAssignModal?.addEventListener('click', () => closeModal(assignDealModal));
        cancelAssign?.addEventListener('click', () => closeModal(assignDealModal));
        assignModalBackdrop?.addEventListener('click', () => closeModal(assignDealModal));
    }

    if (submitAssign) {
        submitAssign.addEventListener('click', handleAssignDeal);
    }

    // Create Task Modal
    const createTaskBtn = document.getElementById('create-task-btn');
    const createTaskModal = document.getElementById('create-task-modal');
    const closeTaskModal = document.getElementById('close-task-modal');
    const cancelTask = document.getElementById('cancel-task');
    const taskModalBackdrop = document.getElementById('task-modal-backdrop');
    const submitTask = document.getElementById('submit-task');

    if (createTaskBtn && createTaskModal) {
        createTaskBtn.addEventListener('click', () => {
            populateModalDropdowns();
            openModal(createTaskModal);
        });
        closeTaskModal?.addEventListener('click', () => closeModal(createTaskModal));
        cancelTask?.addEventListener('click', () => closeModal(createTaskModal));
        taskModalBackdrop?.addEventListener('click', () => closeModal(createTaskModal));
    }

    if (submitTask) {
        submitTask.addEventListener('click', handleCreateTask);
    }

    // Schedule Review Modal
    const scheduleReviewBtn = document.getElementById('schedule-review-btn');
    const scheduleReviewModal = document.getElementById('schedule-review-modal');
    const closeReviewModal = document.getElementById('close-review-modal');
    const cancelReview = document.getElementById('cancel-review');
    const reviewModalBackdrop = document.getElementById('review-modal-backdrop');
    const submitReview = document.getElementById('submit-review');

    if (scheduleReviewBtn && scheduleReviewModal) {
        scheduleReviewBtn.addEventListener('click', () => {
            populateModalDropdowns();
            // Set default date to tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateInput = document.getElementById('review-date-input');
            if (dateInput) dateInput.value = tomorrow.toISOString().split('T')[0];
            openModal(scheduleReviewModal);
        });
        closeReviewModal?.addEventListener('click', () => closeModal(scheduleReviewModal));
        cancelReview?.addEventListener('click', () => closeModal(scheduleReviewModal));
        reviewModalBackdrop?.addEventListener('click', () => closeModal(scheduleReviewModal));
    }

    if (submitReview) {
        submitReview.addEventListener('click', handleScheduleReview);
    }

    // Send Reminder Modal
    const sendReminderBtn = document.getElementById('send-reminder-btn');
    const sendReminderModal = document.getElementById('send-reminder-modal');
    const closeReminderModal = document.getElementById('close-reminder-modal');
    const cancelReminder = document.getElementById('cancel-reminder');
    const reminderModalBackdrop = document.getElementById('reminder-modal-backdrop');
    const submitReminder = document.getElementById('submit-reminder');

    if (sendReminderBtn && sendReminderModal) {
        sendReminderBtn.addEventListener('click', () => {
            populateModalDropdowns();
            openModal(sendReminderModal);
        });
        closeReminderModal?.addEventListener('click', () => closeModal(sendReminderModal));
        cancelReminder?.addEventListener('click', () => closeModal(sendReminderModal));
        reminderModalBackdrop?.addEventListener('click', () => closeModal(sendReminderModal));
    }

    if (submitReminder) {
        submitReminder.addEventListener('click', handleSendReminder);
    }

    // Task filter/sort buttons (defined in admin-tasks.js)
    initTaskFilterSort();

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            [assignDealModal, createTaskModal, scheduleReviewModal, sendReminderModal].forEach(modal => {
                if (modal && !modal.classList.contains('hidden')) closeModal(modal);
            });
        }
    });
}

// ─── Populate Dropdowns ──────────────────────────────────────

function populateModalDropdowns() {
    // Deal dropdowns
    document.querySelectorAll('#assign-deal-select, #task-deal-select, #review-deal-select, #reminder-deal-select').forEach(select => {
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">Choose a deal...</option>';
        allDeals.forEach(deal => {
            const size = deal.dealSize ? ` - ${formatCurrency(deal.dealSize)}` : '';
            select.innerHTML += `<option value="${deal.id}">${escapeHtml(deal.name)}${size}</option>`;
        });
        if (current) select.value = current;
    });

    // User dropdowns
    document.querySelectorAll('#assign-user-select, #task-user-select, #review-user-select, #reminder-user-select').forEach(select => {
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">Choose a team member...</option>';
        teamMembers.forEach(user => {
            const label = user.name || user.email.split('@')[0];
            const role = user.title || user.role || '';
            select.innerHTML += `<option value="${user.id}">${escapeHtml(label)}${role ? ' - ' + escapeHtml(role) : ''}</option>`;
        });
        if (current) select.value = current;
    });
}

// ─── Modal Helpers ───────────────────────────────────────────

function openModal(modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

// ─── Assign Deal Handler ─────────────────────────────────────

async function handleAssignDeal() {
    const dealId = document.getElementById('assign-deal-select')?.value;
    const userId = document.getElementById('assign-user-select')?.value;
    const role = document.querySelector('input[name="role"]:checked')?.value || 'analyst';

    if (!dealId || !userId) {
        showNotification('Please select both a deal and a team member', 'error');
        return;
    }

    const btn = document.getElementById('submit-assign');
    if (btn) { btn.disabled = true; btn.textContent = 'Assigning...'; }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/team`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, role }),
        });

        if (response.ok) {
            showNotification('Deal assigned successfully', 'success');
            closeModal(document.getElementById('assign-deal-modal'));
            await loadDeals();
            renderResourceAllocation();
        } else {
            const err = await response.json().catch(() => ({}));
            showNotification(err.error || 'Failed to assign deal', 'error');
        }
    } catch (e) {
        showNotification('Failed to assign deal', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Assign Deal'; }
    }
}

// ─── Create Task Handler ─────────────────────────────────────

async function handleCreateTask() {
    const title = document.getElementById('task-title-input')?.value?.trim();
    const assignedTo = document.getElementById('task-user-select')?.value || undefined;
    const dealId = document.getElementById('task-deal-select')?.value || undefined;
    const dueDate = document.getElementById('task-due-date')?.value || undefined;
    const priority = document.getElementById('task-priority-select')?.value || 'MEDIUM';
    const description = document.getElementById('task-description')?.value?.trim() || undefined;

    if (!title) {
        showNotification('Please enter a task title', 'error');
        return;
    }

    const btn = document.getElementById('submit-task');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, assignedTo, dealId, dueDate, priority: priority.toUpperCase(), description }),
        });

        if (response.ok) {
            showNotification('Task created successfully', 'success');
            closeModal(document.getElementById('create-task-modal'));
            // Clear form
            ['task-title-input', 'task-user-select', 'task-deal-select', 'task-due-date', 'task-description'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            await loadTasks();
            renderStatsCards();
            renderTaskTable();
        } else {
            const err = await response.json().catch(() => ({}));
            showNotification(err.error || 'Failed to create task', 'error');
        }
    } catch (e) {
        showNotification('Failed to create task', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Create Task'; }
    }
}

// ─── Schedule Review Handler ─────────────────────────────────

async function handleScheduleReview() {
    const title = document.getElementById('review-title-input')?.value?.trim();
    const dealId = document.getElementById('review-deal-select')?.value || undefined;
    const assignedTo = document.getElementById('review-user-select')?.value || undefined;
    const dueDate = document.getElementById('review-date-input')?.value || undefined;
    const priority = document.getElementById('review-priority-select')?.value || 'MEDIUM';
    const notes = document.getElementById('review-notes')?.value?.trim() || undefined;

    if (!title) {
        showNotification('Please enter a review title', 'error');
        return;
    }
    if (!dueDate) {
        showNotification('Please select a review date', 'error');
        return;
    }

    const btn = document.getElementById('submit-review');
    if (btn) { btn.disabled = true; btn.textContent = 'Scheduling...'; }

    try {
        // Create as a task with "[Review]" prefix
        const response = await PEAuth.authFetch(`${API_BASE_URL}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: `[Review] ${title}`,
                assignedTo,
                dealId,
                dueDate,
                priority: priority.toUpperCase(),
                description: notes ? `Review Notes: ${notes}` : undefined,
            }),
        });

        if (response.ok) {
            showNotification('Review scheduled successfully', 'success');
            closeModal(document.getElementById('schedule-review-modal'));
            // Clear form
            ['review-title-input', 'review-deal-select', 'review-user-select', 'review-date-input', 'review-notes'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            await loadTasks();
            renderStatsCards();
            renderTaskTable();
            renderUpcomingReviews();
        } else {
            const err = await response.json().catch(() => ({}));
            showNotification(err.error || 'Failed to schedule review', 'error');
        }
    } catch (e) {
        showNotification('Failed to schedule review', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Schedule Review'; }
    }
}

// ─── Send Reminder Handler ───────────────────────────────────

async function handleSendReminder() {
    const userId = document.getElementById('reminder-user-select')?.value;
    const message = document.getElementById('reminder-message')?.value?.trim();
    const dealId = document.getElementById('reminder-deal-select')?.value || undefined;

    if (!userId) {
        showNotification('Please select a team member', 'error');
        return;
    }
    if (!message) {
        showNotification('Please enter a reminder message', 'error');
        return;
    }

    const btn = document.getElementById('submit-reminder');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                type: 'SYSTEM',
                title: 'Reminder from Admin',
                message,
                dealId: dealId || undefined,
            }),
        });

        if (response.ok) {
            showNotification('Reminder sent successfully', 'success');
            closeModal(document.getElementById('send-reminder-modal'));
            document.getElementById('reminder-message').value = '';
        } else {
            const err = await response.json().catch(() => ({}));
            showNotification(err.error || 'Failed to send reminder', 'error');
        }
    } catch (e) {
        showNotification('Failed to send reminder', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Send Reminder'; }
    }
}

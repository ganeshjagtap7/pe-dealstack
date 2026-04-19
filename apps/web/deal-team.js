// Deal Team — Team avatars, share modal, add/remove team members
// PE OS - AI-Powered Deal Analysis
// Depends on: state (from deal.js), showNotification (js/notifications.js), PEAuth (js/auth.js), API_BASE_URL (js/config.js)

// Render team avatars in the header
function renderTeamAvatars(teamMembers) {
    const avatarStack = document.getElementById('team-avatar-stack');
    const moreCount = document.getElementById('team-more-count');
    const avatarContainer = document.getElementById('deal-team-avatars');

    if (!avatarStack) return;

    // Show up to 3 avatars, then show "+X" for the rest
    const maxVisible = 3;
    const visibleMembers = teamMembers.slice(0, maxVisible);
    const remainingCount = Math.max(0, teamMembers.length - maxVisible);

    if (teamMembers.length === 0) {
        // Show empty state - just the add button
        avatarStack.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-gray-400 hover:bg-gray-200 transition-colors" title="Add team members">
                <span class="material-symbols-outlined text-[16px]">group_add</span>
            </div>
        `;
        moreCount.classList.add('hidden');
        return;
    }

    // Render visible avatars
    avatarStack.innerHTML = visibleMembers.map((member, index) => {
        const user = member.user;
        const zIndex = maxVisible - index;
        if (user?.avatar && user.avatar.startsWith('http')) {
            return `
                <img
                    src="${user.avatar}"
                    alt="${user.name}"
                    title="${user.name} (${member.role})"
                    class="w-8 h-8 rounded-full border-2 border-white object-cover shadow-sm"
                    style="z-index: ${zIndex};"
                    onerror="this.style.display='none'"
                />
            `;
        } else {
            const initials = user?.name ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '?';
            return `
                <div
                    class="w-8 h-8 rounded-full bg-primary/10 border-2 border-white flex items-center justify-center text-primary font-semibold text-xs shadow-sm"
                    style="z-index: ${zIndex};"
                    title="${user?.name || 'Unknown'} (${member.role})"
                >${initials}</div>
            `;
        }
    }).join('');

    // Show "+X" count if there are more
    if (remainingCount > 0) {
        moreCount.textContent = `+${remainingCount}`;
        moreCount.classList.remove('hidden');
    } else {
        moreCount.classList.add('hidden');
    }
}

// Open share modal
function openShareModal() {
    const dealId = getDealIdFromUrl();
    if (!dealId) {
        showNotification('Error', 'No deal ID available', 'error');
        return;
    }

    // Set callback to refresh avatars when modal closes
    window.onShareModalClose = () => {
        // Reload deal data to refresh team list
        loadDealData();
    };

    ShareModal.open(dealId);
}

async function showShareModal() {
    const deal = state.dealData;
    const teamMembers = deal?.teamMembers || [];

    // Fetch available users for invite
    let availableUsers = [];
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/users`);
        if (response.ok) {
            availableUsers = await response.json();
            // Filter out users already on the team
            const teamUserIds = new Set(teamMembers.map(m => m.user?.id));
            availableUsers = availableUsers.filter(u => !teamUserIds.has(u.id));
        }
    } catch (error) {
        console.error('Error fetching users:', error);
    }

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.id = 'team-modal';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full animate-fadeIn max-h-[90vh] overflow-hidden flex flex-col">
            <div class="p-6 border-b border-slate-200">
                <div class="flex items-center justify-between">
                    <h3 class="font-bold text-slate-900 text-lg flex items-center gap-2">
                        <span class="material-symbols-outlined text-primary">group</span>
                        Deal Team
                    </h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>
            <div class="p-6 overflow-y-auto flex-1">
                <!-- Current Team Members -->
                <div class="mb-6">
                    <h4 class="text-sm font-semibold text-slate-700 mb-3">Current Team (${teamMembers.length})</h4>
                    <div id="team-list" class="space-y-2">
                        ${teamMembers.length === 0 ? `
                            <p class="text-sm text-slate-500 italic">No team members yet</p>
                        ` : teamMembers.map(member => `
                            <div class="flex items-center justify-between p-3 bg-slate-50 rounded-lg group">
                                <div class="flex items-center gap-3">
                                    <div class="size-9 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
                                        ${(member.user?.name || 'U').charAt(0)}
                                    </div>
                                    <div>
                                        <p class="text-sm font-medium text-slate-900">${member.user?.name || 'Unknown'}</p>
                                        <p class="text-xs text-slate-500">${member.user?.email || ''}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="px-2 py-0.5 rounded text-xs font-medium ${member.role === 'LEAD' ? 'bg-primary-light text-primary' : 'bg-slate-200 text-slate-600'}">${member.role}</span>
                                    <button onclick="removeTeamMember('${member.id}')" class="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                        <span class="material-symbols-outlined text-sm">close</span>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Add New Member -->
                <div class="mb-4">
                    <h4 class="text-sm font-semibold text-slate-700 mb-3">Add Team Member</h4>
                    <div class="flex gap-2">
                        <div class="flex-1 relative">
                            <select id="user-select" class="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                                <option value="">Select a user...</option>
                                ${availableUsers.map(u => `<option value="${u.id}">${u.name} (${u.email})</option>`).join('')}
                            </select>
                        </div>
                        <select id="role-select" class="px-3 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm">
                            <option value="MEMBER">Member</option>
                            <option value="LEAD">Lead</option>
                            <option value="VIEWER">Viewer</option>
                        </select>
                    </div>
                    <button id="add-member-btn" class="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors">
                        <span class="material-symbols-outlined text-lg">person_add</span>
                        Add to Team
                    </button>
                </div>

                <!-- Share Link -->
                <div class="pt-4 border-t border-slate-200">
                    <h4 class="text-sm font-semibold text-slate-700 mb-3">Share Link</h4>
                    <div class="flex gap-2">
                        <input type="text" id="share-link" value="${window.location.href}" class="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 bg-slate-50" readonly>
                        <button onclick="copyShareLink()" class="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-1">
                            <span class="material-symbols-outlined text-sm">content_copy</span>
                            Copy
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Add member button handler
    document.getElementById('add-member-btn')?.addEventListener('click', async () => {
        await addTeamMember();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

async function addTeamMember() {
    if (!state.dealId) return;

    const userSelect = document.getElementById('user-select');
    const roleSelect = document.getElementById('role-select');
    const userId = userSelect.value;
    const role = roleSelect.value;

    if (!userId) {
        showNotification('Error', 'Please select a user to add', 'error');
        return;
    }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}/team`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, role }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add team member');
        }

        const newMember = await response.json();

        // Update local state
        if (state.dealData) {
            state.dealData.teamMembers = [...(state.dealData.teamMembers || []), newMember];
        }

        // Close and reopen modal to refresh
        document.getElementById('team-modal')?.remove();
        showShareModal();

        showNotification('Team Updated', `${newMember.user?.name || 'User'} added to the team`, 'success');

    } catch (error) {
        console.error('Error adding team member:', error);
        showNotification('Error', error.message, 'error');
    }
}

async function removeTeamMember(memberId) {
    if (!state.dealId || !memberId) return;

    if (!confirm('Are you sure you want to remove this team member?')) {
        return;
    }

    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}/team/${memberId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Failed to remove team member');
        }

        // Update local state
        if (state.dealData) {
            state.dealData.teamMembers = (state.dealData.teamMembers || []).filter(m => m.id !== memberId);
        }

        // Close and reopen modal to refresh
        document.getElementById('team-modal')?.remove();
        showShareModal();

        showNotification('Team Updated', 'Team member removed', 'success');

    } catch (error) {
        console.error('Error removing team member:', error);
        showNotification('Error', 'Failed to remove team member', 'error');
    }
}

function copyShareLink() {
    navigator.clipboard.writeText('https://dealos.app/deals/apex-logistics-2023');
    showNotification('Link Copied', 'Share link copied to clipboard', 'success');
}

function shareWithTeam() {
    showNotification('Deal Shared', 'Team members have been notified', 'success');
}

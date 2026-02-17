/**
 * Share Modal Component
 * Allows sharing deals with team members from the same firm
 */

const ShareModal = (function() {
  const API_BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api';

  // XSS prevention - escape HTML entities
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  // State
  let isOpen = false;
  let currentDealId = null;
  let currentTeam = [];
  let availableUsers = [];
  let searchQuery = '';
  let modalElement = null;

  // Create modal HTML
  function createModalHTML() {
    const modal = document.createElement('div');
    modal.id = 'share-modal';
    modal.className = 'fixed inset-0 z-50 hidden';
    modal.innerHTML = `
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" id="share-modal-backdrop"></div>

      <!-- Modal -->
      <div class="absolute inset-0 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" style="animation: slideIn 0.2s ease-out;">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2 class="text-lg font-semibold text-gray-900">Share Deal</h2>
              <p class="text-sm text-gray-500 mt-0.5">Add team members to collaborate on this deal</p>
            </div>
            <button id="share-modal-close" class="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <span class="material-symbols-outlined text-gray-500">close</span>
            </button>
          </div>

          <!-- Search -->
          <div class="px-6 py-4 border-b border-gray-100">
            <div class="relative">
              <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
              <input
                type="text"
                id="share-search-input"
                placeholder="Search team members by name or email..."
                class="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto">
            <!-- Current Team Section -->
            <div class="px-6 py-4 border-b border-gray-100" id="current-team-section">
              <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Current Team (<span id="team-count">0</span>)</h3>
              <div id="current-team-list" class="space-y-2">
                <!-- Team members will be rendered here -->
              </div>
              <div id="current-team-empty" class="hidden text-sm text-gray-500 py-3">
                No team members yet. Add someone below.
              </div>
            </div>

            <!-- Add Members Section -->
            <div class="px-6 py-4">
              <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Add Team Members</h3>
              <div id="available-users-list" class="space-y-2">
                <!-- Available users will be rendered here -->
              </div>
              <div id="available-users-loading" class="hidden text-sm text-gray-500 py-3 flex items-center gap-2">
                <div class="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                Loading team members...
              </div>
              <div id="available-users-empty" class="hidden text-sm text-gray-500 py-3">
                No team members found matching your search.
              </div>
              <div id="all-added" class="hidden text-sm text-gray-500 py-3">
                All team members have been added to this deal.
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div class="flex items-center justify-between">
              <p class="text-xs text-gray-500">
                <span class="material-symbols-outlined text-[14px] align-text-bottom">info</span>
                Team members will have access to deal details and documents
              </p>
              <button id="share-modal-done" class="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    return modal;
  }

  // Initialize modal
  function init() {
    if (modalElement) return;

    modalElement = createModalHTML();
    document.body.appendChild(modalElement);

    // Event listeners
    document.getElementById('share-modal-backdrop').addEventListener('click', close);
    document.getElementById('share-modal-close').addEventListener('click', close);
    document.getElementById('share-modal-done').addEventListener('click', close);

    const searchInput = document.getElementById('share-search-input');
    searchInput.addEventListener('input', debounce((e) => {
      searchQuery = e.target.value;
      renderAvailableUsers();
    }, 300));

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    });
  }

  // Open modal
  async function open(dealId) {
    init();
    currentDealId = dealId;
    isOpen = true;
    searchQuery = '';

    modalElement.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Reset search
    document.getElementById('share-search-input').value = '';

    // Load data
    await Promise.all([
      loadCurrentTeam(),
      loadAvailableUsers()
    ]);

    // Focus search input
    document.getElementById('share-search-input').focus();
  }

  // Close modal
  function close() {
    if (!modalElement) return;

    isOpen = false;
    modalElement.classList.add('hidden');
    document.body.style.overflow = '';

    // Trigger refresh callback if set
    if (typeof window.onShareModalClose === 'function') {
      window.onShareModalClose();
    }
  }

  // Load current deal team
  async function loadCurrentTeam() {
    try {
      const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${currentDealId}/team`);
      if (!response.ok) throw new Error('Failed to load team');

      currentTeam = await response.json();
      renderCurrentTeam();
    } catch (error) {
      console.error('Error loading team:', error);
      currentTeam = [];
      renderCurrentTeam();
    }
  }

  // Load available users from same firm
  async function loadAvailableUsers() {
    const loadingEl = document.getElementById('available-users-loading');
    loadingEl.classList.remove('hidden');

    try {
      const response = await PEAuth.authFetch(`${API_BASE_URL}/users/me/team?excludeSelf=true`);
      if (!response.ok) throw new Error('Failed to load users');

      availableUsers = await response.json();
      renderAvailableUsers();
    } catch (error) {
      console.error('Error loading users:', error);
      availableUsers = [];
      renderAvailableUsers();
    } finally {
      loadingEl.classList.add('hidden');
    }
  }

  // Render current team
  function renderCurrentTeam() {
    const listEl = document.getElementById('current-team-list');
    const emptyEl = document.getElementById('current-team-empty');
    const countEl = document.getElementById('team-count');

    countEl.textContent = currentTeam.length;

    if (currentTeam.length === 0) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    listEl.innerHTML = currentTeam.map(member => {
      const user = member.user;
      return `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg group hover:bg-gray-100 transition-colors">
          <div class="flex items-center gap-3">
            ${user.avatar
              ? `<img src="${escapeHtml(user.avatar)}" class="w-9 h-9 rounded-full object-cover border border-gray-200" alt="${escapeHtml(user.name)}" />`
              : `<div class="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">${escapeHtml(getInitials(user.name))}</div>`
            }
            <div>
              <div class="font-medium text-gray-900 text-sm">${escapeHtml(user.name)}</div>
              <div class="text-xs text-gray-500">${escapeHtml(user.title || user.email)}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs px-2 py-1 rounded-full ${getRoleBadgeClass(member.role)}">${escapeHtml(member.role)}</span>
            <button
              onclick="ShareModal.removeMember('${escapeHtml(member.id)}')"
              class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
              title="Remove from team"
            >
              <span class="material-symbols-outlined text-[18px]">person_remove</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Render available users
  function renderAvailableUsers() {
    const listEl = document.getElementById('available-users-list');
    const emptyEl = document.getElementById('available-users-empty');
    const allAddedEl = document.getElementById('all-added');

    // Filter out users already in team
    const teamUserIds = new Set(currentTeam.map(m => m.user.id));
    let filtered = availableUsers.filter(u => !teamUserIds.has(u.id));

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(u =>
        u.name.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query)
      );
    }

    // Show appropriate empty state
    if (filtered.length === 0) {
      listEl.innerHTML = '';
      if (availableUsers.length === teamUserIds.size) {
        emptyEl.classList.add('hidden');
        allAddedEl.classList.remove('hidden');
      } else {
        emptyEl.classList.remove('hidden');
        allAddedEl.classList.add('hidden');
      }
      return;
    }

    emptyEl.classList.add('hidden');
    allAddedEl.classList.add('hidden');

    listEl.innerHTML = filtered.map(user => `
      <div class="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer" onclick="ShareModal.addMember('${escapeHtml(user.id)}')">
        <div class="flex items-center gap-3">
          ${user.avatar
            ? `<img src="${escapeHtml(user.avatar)}" class="w-9 h-9 rounded-full object-cover border border-gray-200" alt="${escapeHtml(user.name)}" />`
            : `<div class="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-sm">${escapeHtml(getInitials(user.name))}</div>`
          }
          <div>
            <div class="font-medium text-gray-900 text-sm">${escapeHtml(user.name)}</div>
            <div class="text-xs text-gray-500">${escapeHtml(user.title || user.email)}</div>
          </div>
        </div>
        <button class="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors">
          <span class="material-symbols-outlined text-[18px]">person_add</span>
        </button>
      </div>
    `).join('');
  }

  // Add member to deal
  async function addMember(userId) {
    try {
      const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${currentDealId}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: 'MEMBER' })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add member');
      }

      const newMember = await response.json();
      currentTeam.push(newMember);

      renderCurrentTeam();
      renderAvailableUsers();

      showNotification('Success', 'Team member added', 'success');
    } catch (error) {
      console.error('Error adding member:', error);
      showNotification('Error', error.message, 'error');
    }
  }

  // Remove member from deal
  async function removeMember(memberId) {
    try {
      const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${currentDealId}/team/${memberId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to remove member');

      currentTeam = currentTeam.filter(m => m.id !== memberId);

      renderCurrentTeam();
      renderAvailableUsers();

      showNotification('Success', 'Team member removed', 'success');
    } catch (error) {
      console.error('Error removing member:', error);
      showNotification('Error', 'Failed to remove team member', 'error');
    }
  }

  // Helper: Get initials from name
  function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  // Helper: Get role badge class
  function getRoleBadgeClass(role) {
    switch (role) {
      case 'LEAD':
        return 'bg-primary/10 text-primary font-medium';
      case 'MEMBER':
        return 'bg-gray-100 text-gray-600';
      case 'VIEWER':
        return 'bg-gray-100 text-gray-500';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  }

  // Helper: Debounce function
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Helper: Show notification (assumes global function exists)
  function showNotification(title, message, type) {
    if (typeof window.showNotification === 'function') {
      window.showNotification(title, message, type);
    } else {
      console.log(`[${type}] ${title}: ${message}`);
    }
  }

  // Public API
  return {
    open,
    close,
    addMember,
    removeMember,
    getCurrentTeam: () => currentTeam
  };
})();

// Export for use in other files
window.ShareModal = ShareModal;

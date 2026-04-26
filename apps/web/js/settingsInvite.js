/**
 * PE OS — Settings: Team Invitations
 * Handles invite modal + invitation list on settings.html
 */

(function() {
    'use strict';

    function $(id) { return document.getElementById(id); }

    function openModal() {
        const modal = $('invite-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        $('invite-error')?.classList.add('hidden');
        $('invite-success')?.classList.add('hidden');
        $('invite-email')?.focus();
    }

    function closeModal() {
        const modal = $('invite-modal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        const email = $('invite-email');
        if (email) email.value = '';
        // Reset copy-link panel
        const linkPanel = $('invite-link-panel');
        if (linkPanel) linkPanel.classList.add('hidden');
        const formPanel = $('invite-form-panel');
        if (formPanel) formPanel.classList.remove('hidden');
    }

    function showInviteLinkPanel({ email, inviteUrl, emailSent }) {
        const linkPanel = $('invite-link-panel');
        const formPanel = $('invite-form-panel');
        const linkInput = $('invite-link-input');
        const linkMsg = $('invite-link-message');
        if (!linkPanel || !linkInput) return;

        formPanel?.classList.add('hidden');
        linkPanel.classList.remove('hidden');
        linkInput.value = inviteUrl || '';
        if (linkMsg) {
            linkMsg.textContent = emailSent
                ? `Email sent to ${email}. You can also copy this link to share manually.`
                : `Email could not be sent. Copy this link and share it with ${email} directly.`;
            linkMsg.className = emailSent
                ? 'text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-3'
                : 'text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3';
        }
    }

    async function copyToClipboard(text, btn) {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // Fallback for non-secure contexts
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch {}
            document.body.removeChild(ta);
        }
        if (btn) {
            const original = btn.innerHTML;
            btn.innerHTML = '<span class="material-symbols-outlined text-[16px]">check</span> Copied';
            btn.classList.add('bg-green-50', 'text-green-700', 'border-green-200');
            setTimeout(() => {
                btn.innerHTML = original;
                btn.classList.remove('bg-green-50', 'text-green-700', 'border-green-200');
            }, 1500);
        }
        if (window.showNotification) {
            showNotification('Copied', 'Invite link copied to clipboard.', 'success');
        }
    }

    async function sendInvite() {
        const emailEl = $('invite-email');
        const roleEl = $('invite-role');
        const btn = $('send-invite-btn');
        const spinner = $('send-invite-spinner');
        const errorEl = $('invite-error');
        const successEl = $('invite-success');

        if (!emailEl || !roleEl || !btn) return;

        const email = emailEl.value.trim();
        const role = roleEl.value;

        errorEl?.classList.add('hidden');
        successEl?.classList.add('hidden');

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            if (errorEl) {
                errorEl.textContent = 'Please enter a valid email address.';
                errorEl.classList.remove('hidden');
            }
            return;
        }

        btn.disabled = true;
        spinner?.classList.remove('hidden');

        try {
            const res = await PEAuth.authFetch(`${API_BASE_URL}/invitations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role }),
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || `Request failed (${res.status})`);
            }

            // Show the copy-link panel with the freshly minted URL
            showInviteLinkPanel({
                email,
                inviteUrl: data.inviteUrl || '',
                emailSent: !!data.emailSent,
            });
            emailEl.value = '';

            // Refresh invitation list in the background
            loadInvitations();
        } catch (e) {
            if (errorEl) {
                errorEl.textContent = e.message || 'Failed to send invitation.';
                errorEl.classList.remove('hidden');
            }
        } finally {
            btn.disabled = false;
            spinner?.classList.add('hidden');
        }
    }

    async function loadInvitations() {
        const listEl = $('invitations-list');
        if (!listEl) return;

        try {
            const res = await PEAuth.authFetch(`${API_BASE_URL}/invitations`);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const invites = await res.json();

            if (!Array.isArray(invites) || invites.length === 0) {
                listEl.innerHTML = `
                    <div class="text-center py-6">
                        <span class="material-symbols-outlined text-text-muted text-[40px]">group_add</span>
                        <p class="text-sm text-text-muted mt-2">No invitations sent yet.</p>
                        <p class="text-xs text-text-muted">Click "Invite Team Member" to add your first analyst.</p>
                    </div>
                `;
                return;
            }

            listEl.innerHTML = invites.map(inv => {
                const statusColor = {
                    PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
                    ACCEPTED: 'bg-green-50 text-green-700 border-green-200',
                    EXPIRED: 'bg-gray-50 text-gray-600 border-gray-200',
                }[inv.status] || 'bg-gray-50 text-gray-600 border-gray-200';

                const copyBtn = (inv.status === 'PENDING' && inv.inviteUrl) ? `
                    <button type="button"
                            class="invite-copy-btn inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-border-subtle bg-white text-text-main hover:bg-gray-50 transition-colors"
                            data-invite-url="${escapeHtml(inv.inviteUrl)}"
                            title="Copy invite link">
                        <span class="material-symbols-outlined text-[16px]">link</span>
                        Copy Link
                    </button>
                ` : '';

                return `
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-border-subtle gap-3">
                        <div class="min-w-0 flex-1">
                            <p class="text-sm font-semibold text-text-main truncate">${escapeHtml(inv.email)}</p>
                            <p class="text-xs text-text-muted">Role: ${escapeHtml(inv.role)} · Sent ${new Date(inv.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            ${copyBtn}
                            <span class="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border ${statusColor}">
                                ${escapeHtml(inv.status)}
                            </span>
                        </div>
                    </div>
                `;
            }).join('');

            // Wire copy buttons
            listEl.querySelectorAll('.invite-copy-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    copyToClipboard(btn.getAttribute('data-invite-url') || '', btn);
                });
            });
        } catch (e) {
            listEl.innerHTML = `
                <p class="text-sm text-text-muted text-center py-4">Could not load invitations.</p>
            `;
        }
    }

    function escapeHtml(s) {
        if (window.escapeHtml) return window.escapeHtml(s);
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // Init on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        $('open-invite-modal')?.addEventListener('click', openModal);
        $('close-invite-modal')?.addEventListener('click', closeModal);
        $('send-invite-btn')?.addEventListener('click', sendInvite);

        $('invite-link-copy-btn')?.addEventListener('click', () => {
            const url = $('invite-link-input')?.value || '';
            copyToClipboard(url, $('invite-link-copy-btn'));
        });
        $('invite-link-done-btn')?.addEventListener('click', closeModal);
        $('invite-link-another-btn')?.addEventListener('click', () => {
            $('invite-link-panel')?.classList.add('hidden');
            $('invite-form-panel')?.classList.remove('hidden');
            $('invite-email')?.focus();
        });

        // Close on backdrop click
        $('invite-modal')?.addEventListener('click', (e) => {
            if (e.target === $('invite-modal')) closeModal();
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !$('invite-modal')?.classList.contains('hidden')) {
                closeModal();
            }
        });

        loadInvitations();

        // Auto-open modal if hash is #invite
        if (window.location.hash === '#invite') {
            setTimeout(openModal, 200);
        }
    });
})();

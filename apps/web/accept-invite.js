        // API_BASE_URL loaded from js/config.js
        let invitationToken = null;

        // Get token from URL
        function getTokenFromUrl() {
            const params = new URLSearchParams(window.location.search);
            return params.get('token');
        }

        // Toggle password visibility
        function togglePasswordVisibility() {
            const passwordInput = document.getElementById('password');
            const icon = document.getElementById('password-toggle-icon');

            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                icon.textContent = 'visibility_off';
            } else {
                passwordInput.type = 'password';
                icon.textContent = 'visibility';
            }
        }

        // Show error state
        function showError(message) {
            document.getElementById('loading-state').classList.add('hidden');
            document.getElementById('accept-form-container').classList.add('hidden');
            document.getElementById('success-state').classList.add('hidden');
            document.getElementById('error-state').classList.remove('hidden');
            document.getElementById('error-message').textContent = message;
        }

        // Show form
        function showForm(data) {
            document.getElementById('loading-state').classList.add('hidden');
            document.getElementById('error-state').classList.add('hidden');
            document.getElementById('success-state').classList.add('hidden');
            document.getElementById('accept-form-container').classList.remove('hidden');

            // Populate data
            document.getElementById('email').value = data.email;
            document.getElementById('firm-name').textContent = data.firmName;
            document.getElementById('invite-role').textContent = data.role;

            // Show org logo if available
            if (data.organizationLogo) {
                const logoEl = document.getElementById('org-logo');
                if (logoEl) {
                    logoEl.src = data.organizationLogo;
                    logoEl.alt = data.firmName;
                    logoEl.classList.remove('hidden');
                }
            }

            if (data.inviter) {
                document.getElementById('inviter-name').textContent = data.inviter.name || 'A team member';

                if (data.inviter.avatar) {
                    document.getElementById('inviter-avatar').innerHTML = `
                        <img src="${data.inviter.avatar}" class="w-12 h-12 rounded-full object-cover" alt="${data.inviter.name}" />
                    `;
                }
            } else {
                document.getElementById('inviter-name').textContent = 'A team member';
            }

            // Focus on name input
            document.getElementById('fullname').focus();
        }

        // Show success
        function showSuccess() {
            document.getElementById('loading-state').classList.add('hidden');
            document.getElementById('error-state').classList.add('hidden');
            document.getElementById('accept-form-container').classList.add('hidden');
            document.getElementById('success-state').classList.remove('hidden');
        }

        // Show form error
        function showFormError(message) {
            const errorEl = document.getElementById('form-error');
            const errorText = document.getElementById('form-error-text');
            errorEl.classList.remove('hidden');
            errorText.textContent = message;
        }

        // Hide form error
        function hideFormError() {
            document.getElementById('form-error').classList.add('hidden');
        }

        // Verify invitation
        async function verifyInvitation(token) {
            try {
                const response = await fetch(`${API_BASE_URL}/invitations/verify/${token}`);
                const data = await response.json();

                if (!response.ok) {
                    showError(data.error || 'Invalid invitation');
                    return;
                }

                showForm(data);
            } catch (error) {
                console.error('Verification error:', error);
                showError('Unable to verify invitation. Please try again later.');
            }
        }

        // Accept invitation
        async function acceptInvitation(e) {
            e.preventDefault();
            hideFormError();

            const fullName = document.getElementById('fullname').value.trim();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const submitBtn = document.getElementById('submit-btn');

            // Validation
            if (!fullName) {
                showFormError('Please enter your full name');
                return;
            }

            if (password.length < 8) {
                showFormError('Password must be at least 8 characters');
                return;
            }

            if (password !== confirmPassword) {
                showFormError('Passwords do not match');
                return;
            }

            // Disable button
            submitBtn.disabled = true;
            submitBtn.innerHTML = `
                <div class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                Creating account...
            `;

            try {
                const response = await fetch(`${API_BASE_URL}/invitations/accept/${invitationToken}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password, fullName }),
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to create account');
                }

                // Success!
                showSuccess();

                // If session is returned (auto-confirmed), redirect to CRM
                if (data.session) {
                    setTimeout(() => {
                        window.location.href = '/crm.html';
                    }, 2000);
                }
            } catch (error) {
                console.error('Accept error:', error);
                showFormError(error.message);

                // Re-enable button
                submitBtn.disabled = false;
                submitBtn.innerHTML = `
                    <span class="material-symbols-outlined text-[20px]">how_to_reg</span>
                    Create Account & Join
                `;
            }
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            invitationToken = getTokenFromUrl();

            if (!invitationToken) {
                showError('No invitation token provided. Please use the link from your invitation email.');
                return;
            }

            // Set up form handler
            document.getElementById('accept-form').addEventListener('submit', acceptInvitation);

            // Verify the invitation
            verifyInvitation(invitationToken);
        });

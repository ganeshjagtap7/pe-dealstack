/**
 * PE OS - Settings Profile Module
 * Extracted from settings.js: notification toggles, password form,
 * avatar upload, save profile, and toast notification.
 *
 * Globals provided:
 *   initializeSlider, updateSlider, updateTypography, updateDensity,
 *   renderNotificationToggles, initPasswordForm, handleAvatarUpload,
 *   saveProfile, showToast
 *
 * Depends on globals from settings.js:
 *   NOTIFICATION_TYPES, notificationPrefs, currentUser, hasChanges,
 *   investmentFocus, sourcingSensitivity, typography, density,
 *   preferredCurrency, autoExtract, autoUpdateDeal, markChanged,
 *   renderProfile
 */

// Slider
function initializeSlider() {
    const thumb = document.getElementById('slider-thumb');
    if (!thumb) return;

    const container = thumb.parentElement;
    if (!container) return;

    let isDragging = false;

    const updateValue = (clientX) => {
        const rect = container.getBoundingClientRect();
        let percent = ((clientX - rect.left) / rect.width) * 100;
        percent = Math.max(0, Math.min(100, percent));

        sourcingSensitivity = Math.round(percent);
        updateSlider(sourcingSensitivity);
        markChanged();
    };

    thumb.addEventListener('mousedown', (e) => {
        isDragging = true;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) updateValue(e.clientX);
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    container.addEventListener('click', (e) => {
        if (e.target !== thumb) updateValue(e.clientX);
    });
}

function updateSlider(value) {
    const fill = document.getElementById('slider-fill');
    const thumb = document.getElementById('slider-thumb');
    const label = document.getElementById('sensitivity-label');

    if (fill) fill.style.width = `${value}%`;
    if (thumb) thumb.style.left = `${value}%`;

    if (label) {
        if (value < 33) {
            label.textContent = 'Broad Market';
        } else if (value < 66) {
            label.textContent = 'Balanced';
        } else {
            label.textContent = 'Thesis Specific';
        }
    }
}

// Typography
function updateTypography(type) {
    typography = type;
    const modern = document.getElementById('typo-modern');
    const serif = document.getElementById('typo-serif');

    if (!modern || !serif) return;

    const modernIcon = modern.querySelector('.material-symbols-outlined');
    const serifIcon = serif.querySelector('.material-symbols-outlined');

    if (type === 'modern') {
        modern.classList.add('border-primary', 'bg-primary-light/30', 'border-2');
        modern.classList.remove('border-border-subtle', 'border', 'bg-white');
        if (modernIcon) {
            modernIcon.style.fontVariationSettings = "'FILL' 1";
            modernIcon.textContent = 'check_circle';
            modernIcon.classList.add('text-primary');
            modernIcon.classList.remove('text-gray-300');
        }

        serif.classList.remove('border-primary', 'bg-primary-light/30', 'border-2');
        serif.classList.add('border-border-subtle', 'border', 'bg-white');
        if (serifIcon) {
            serifIcon.style.fontVariationSettings = "'FILL' 0";
            serifIcon.textContent = 'circle';
            serifIcon.classList.remove('text-primary');
            serifIcon.classList.add('text-gray-300');
        }
    } else {
        serif.classList.add('border-primary', 'bg-primary-light/30', 'border-2');
        serif.classList.remove('border-border-subtle', 'border', 'bg-white');
        if (serifIcon) {
            serifIcon.style.fontVariationSettings = "'FILL' 1";
            serifIcon.textContent = 'check_circle';
            serifIcon.classList.add('text-primary');
            serifIcon.classList.remove('text-gray-300');
        }

        modern.classList.remove('border-primary', 'bg-primary-light/30', 'border-2');
        modern.classList.add('border-border-subtle', 'border', 'bg-white');
        if (modernIcon) {
            modernIcon.style.fontVariationSettings = "'FILL' 0";
            modernIcon.textContent = 'circle';
            modernIcon.classList.remove('text-primary');
            modernIcon.classList.add('text-gray-300');
        }
    }
}

// Density
function updateDensity(type) {
    density = type;
    document.querySelectorAll('.density-btn').forEach(btn => {
        if (btn.dataset.density === type) {
            btn.classList.add('active', 'bg-white', 'text-primary', 'shadow-sm', 'border', 'border-border-subtle');
            btn.classList.remove('text-text-muted');
        } else {
            btn.classList.remove('active', 'bg-white', 'text-primary', 'shadow-sm', 'border', 'border-border-subtle');
            btn.classList.add('text-text-muted');
        }
    });
}

// Notification toggles
function renderNotificationToggles() {
    const container = document.getElementById('notification-toggles');
    if (!container) return;

    container.innerHTML = NOTIFICATION_TYPES.map(nt => `
        <div class="flex items-center justify-between p-4 rounded-lg hover:bg-gray-50 transition-colors">
            <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-[20px] text-text-muted">${nt.icon}</span>
                <div>
                    <p class="text-sm font-semibold text-text-main">${nt.label}</p>
                    <p class="text-xs text-text-muted">${nt.description}</p>
                </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" class="sr-only peer notification-toggle" data-type="${nt.key}" ${notificationPrefs[nt.key] !== false ? 'checked' : ''}>
                <div class="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
        </div>
    `).join('');

    // Attach change listeners
    container.querySelectorAll('.notification-toggle').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            notificationPrefs[e.target.dataset.type] = e.target.checked;
            markChanged();
        });
    });
}

// Password change
function initPasswordForm() {
    const toggleBtn = document.getElementById('toggle-password-form');
    const form = document.getElementById('password-form');
    const display = document.getElementById('password-display');
    const submitBtn = document.getElementById('submit-password');
    const cancelBtn = document.getElementById('cancel-password');
    const newPwInput = document.getElementById('input-new-password');
    const confirmPwInput = document.getElementById('input-confirm-password');

    if (!toggleBtn || !form) return;

    toggleBtn.addEventListener('click', () => {
        form.classList.remove('hidden');
        display.classList.add('hidden');
        if (newPwInput) newPwInput.focus();
    });

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            form.classList.add('hidden');
            display.classList.remove('hidden');
            if (newPwInput) newPwInput.value = '';
            if (confirmPwInput) confirmPwInput.value = '';
        });
    }

    const validatePassword = () => {
        const pw = newPwInput?.value || '';
        const confirm = confirmPwInput?.value || '';
        const rules = {
            length: pw.length >= 8,
            upper: /[A-Z]/.test(pw),
            number: /[0-9]/.test(pw),
            match: pw.length > 0 && pw === confirm,
        };

        ['length', 'upper', 'number', 'match'].forEach(rule => {
            const el = document.getElementById(`pw-rule-${rule}`);
            if (!el) return;
            const icon = el.querySelector('.material-symbols-outlined');
            if (rules[rule]) {
                el.classList.add('text-secondary');
                el.classList.remove('text-text-muted');
                if (icon) { icon.textContent = 'check_circle'; icon.style.fontVariationSettings = "'FILL' 1"; }
            } else {
                el.classList.remove('text-secondary');
                el.classList.add('text-text-muted');
                if (icon) { icon.textContent = 'circle'; icon.style.fontVariationSettings = ''; }
            }
        });

        const allValid = Object.values(rules).every(Boolean);
        if (submitBtn) submitBtn.disabled = !allValid;
        return allValid;
    };

    if (newPwInput) newPwInput.addEventListener('input', validatePassword);
    if (confirmPwInput) confirmPwInput.addEventListener('input', validatePassword);

    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            if (!validatePassword()) return;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Updating...';

            try {
                const result = await PEAuth.updatePassword(newPwInput.value);
                if (result.error) throw new Error(result.error.message || 'Failed to update password');

                showToast('Password updated successfully', 'success');
                form.classList.add('hidden');
                display.classList.remove('hidden');
                newPwInput.value = '';
                confirmPwInput.value = '';
            } catch (error) {
                showToast(error.message || 'Failed to update password', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Update Password';
            }
        });
    }
}

// Avatar upload handler
async function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
        showToast('Image must be less than 5MB', 'error');
        return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Only JPEG, PNG, GIF, and WebP images are allowed', 'error');
        return;
    }

    // Show loading state on avatar
    const avatarEl = document.getElementById('profile-avatar');
    const originalContent = avatarEl.innerHTML;
    avatarEl.innerHTML = '<span class="material-symbols-outlined animate-spin">progress_activity</span>';

    try {
        const formData = new FormData();
        formData.append('avatar', file);

        const response = await PEAuth.authFetch(`${API_BASE_URL}/users/me/avatar`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to upload avatar');
        }

        const updatedUser = await response.json();
        currentUser = updatedUser;

        // Update avatar display
        if (updatedUser.avatar) {
            avatarEl.style.backgroundImage = `url(${updatedUser.avatar})`;
            avatarEl.innerHTML = '';
        }

        showToast('Avatar updated successfully', 'success');
    } catch (error) {
        console.error('Avatar upload error:', error);
        avatarEl.innerHTML = originalContent;
        showToast(error.message || 'Failed to upload avatar', 'error');
    }
}

// Save profile
async function saveProfile() {
    const saveBtn = document.getElementById('save-btn');
    const spinner = document.getElementById('save-spinner');

    if (saveBtn) saveBtn.disabled = true;
    if (spinner) spinner.classList.remove('hidden');

    try {
        const payload = {
            name: document.getElementById('input-name')?.value?.trim() || '',
            title: document.getElementById('input-title')?.value?.trim() || '',
            investmentFocus,
            sourcingSensitivity,
            typography,
            density,
            preferredCurrency,
            autoExtract,
            autoUpdateDeal,
            notifications: notificationPrefs,
        };

        console.log('Saving profile:', payload);

        const response = await PEAuth.authFetch(`${API_BASE_URL}/users/me`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            let errorMsg = 'Failed to save profile';
            if (typeof errorData.error === 'string') {
                errorMsg = errorData.error;
            } else if (errorData.error?.message) {
                errorMsg = errorData.error.message;
            } else if (errorData.message) {
                errorMsg = errorData.message;
            }
            throw new Error(errorMsg);
        }

        currentUser = await response.json();
        hasChanges = false;
        showToast('Changes saved successfully', 'success');
        renderProfile();
    } catch (error) {
        console.error('Error saving profile:', error);
        const message = typeof error === 'string' ? error : (error?.message || 'Failed to save changes');
        showToast(message, 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
        if (spinner) spinner.classList.add('hidden');
    }
}

// Toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    const msg = document.getElementById('toast-message');

    if (!toast || !icon || !msg) {
        console.log('Toast:', type, message);
        return;
    }

    // Ensure message is a string
    const displayMessage = typeof message === 'object' ? JSON.stringify(message) : String(message || 'Notification');
    msg.textContent = displayMessage;

    if (type === 'success') {
        icon.textContent = 'check_circle';
        icon.className = 'material-symbols-outlined text-secondary';
    } else if (type === 'error') {
        icon.textContent = 'error';
        icon.className = 'material-symbols-outlined text-red-500';
    } else {
        icon.textContent = 'info';
        icon.className = 'material-symbols-outlined text-primary';
    }

    toast.classList.remove('translate-y-20', 'opacity-0');

    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

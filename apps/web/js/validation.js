/**
 * PE OS Form Validation Utilities
 * Provides client-side validation for all forms
 */

window.PEValidation = (function() {
    // Validation rules
    const rules = {
        email: {
            pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            message: 'Please enter a valid email address',
        },
        password: {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumber: true,
            requireSpecial: false,
            message: 'Password must be at least 8 characters with uppercase, lowercase, and number',
        },
        name: {
            minLength: 2,
            maxLength: 100,
            pattern: /^[a-zA-Z\s\-']+$/,
            message: 'Name must contain only letters, spaces, hyphens, or apostrophes',
        },
        phone: {
            pattern: /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\./0-9]*$/,
            message: 'Please enter a valid phone number',
        },
        url: {
            pattern: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
            message: 'Please enter a valid URL',
        },
        number: {
            message: 'Please enter a valid number',
        },
        required: {
            message: 'This field is required',
        },
    };

    /**
     * Validate email address
     */
    function validateEmail(email) {
        if (!email || email.trim() === '') {
            return { valid: false, message: 'Email is required' };
        }
        if (!rules.email.pattern.test(email.trim())) {
            return { valid: false, message: rules.email.message };
        }
        return { valid: true };
    }

    /**
     * Validate password strength
     */
    function validatePassword(password, options = {}) {
        const config = { ...rules.password, ...options };

        if (!password) {
            return { valid: false, message: 'Password is required' };
        }

        if (password.length < config.minLength) {
            return { valid: false, message: `Password must be at least ${config.minLength} characters` };
        }

        if (config.requireUppercase && !/[A-Z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one uppercase letter' };
        }

        if (config.requireLowercase && !/[a-z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one lowercase letter' };
        }

        if (config.requireNumber && !/[0-9]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one number' };
        }

        if (config.requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one special character' };
        }

        return { valid: true };
    }

    /**
     * Calculate password strength (0-4)
     */
    function getPasswordStrength(password) {
        if (!password) return 0;

        let strength = 0;
        if (password.length >= 8) strength++;
        if (/[A-Z]/.test(password)) strength++;
        if (/[0-9]/.test(password)) strength++;
        if (/[^A-Za-z0-9]/.test(password)) strength++;

        return strength;
    }

    /**
     * Get password strength label
     */
    function getPasswordStrengthLabel(strength) {
        const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
        return labels[strength] || '';
    }

    /**
     * Validate required field
     */
    function validateRequired(value, fieldName = 'This field') {
        if (value === null || value === undefined || String(value).trim() === '') {
            return { valid: false, message: `${fieldName} is required` };
        }
        return { valid: true };
    }

    /**
     * Validate field with pattern
     */
    function validatePattern(value, pattern, message) {
        if (!pattern.test(value)) {
            return { valid: false, message };
        }
        return { valid: true };
    }

    /**
     * Validate minimum length
     */
    function validateMinLength(value, minLength, fieldName = 'This field') {
        if (String(value).length < minLength) {
            return { valid: false, message: `${fieldName} must be at least ${minLength} characters` };
        }
        return { valid: true };
    }

    /**
     * Validate maximum length
     */
    function validateMaxLength(value, maxLength, fieldName = 'This field') {
        if (String(value).length > maxLength) {
            return { valid: false, message: `${fieldName} must be no more than ${maxLength} characters` };
        }
        return { valid: true };
    }

    /**
     * Validate number range
     */
    function validateNumberRange(value, min, max, fieldName = 'This field') {
        const num = parseFloat(value);
        if (isNaN(num)) {
            return { valid: false, message: `${fieldName} must be a valid number` };
        }
        if (min !== undefined && num < min) {
            return { valid: false, message: `${fieldName} must be at least ${min}` };
        }
        if (max !== undefined && num > max) {
            return { valid: false, message: `${fieldName} must be no more than ${max}` };
        }
        return { valid: true };
    }

    /**
     * Validate passwords match
     */
    function validatePasswordMatch(password, confirmPassword) {
        if (password !== confirmPassword) {
            return { valid: false, message: 'Passwords do not match' };
        }
        return { valid: true };
    }

    /**
     * Sanitize input - remove potentially dangerous characters
     */
    function sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        return input
            .replace(/[<>]/g, '') // Remove angle brackets
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+=/gi, '') // Remove event handlers
            .trim();
    }

    /**
     * Show field error
     */
    function showFieldError(inputElement, message) {
        const wrapper = inputElement.closest('.field-wrapper') || inputElement.parentElement;

        // Add error styling to input
        inputElement.classList.add('border-red-500', 'focus:border-red-500', 'focus:ring-red-500/20');
        inputElement.classList.remove('border-gray-200', 'focus:border-primary', 'focus:ring-primary/20');

        // Remove existing error message
        const existingError = wrapper.querySelector('.field-error');
        if (existingError) existingError.remove();

        // Add error message
        const errorElement = document.createElement('p');
        errorElement.className = 'field-error text-red-500 text-xs mt-1';
        errorElement.textContent = message;
        wrapper.appendChild(errorElement);
    }

    /**
     * Clear field error
     */
    function clearFieldError(inputElement) {
        const wrapper = inputElement.closest('.field-wrapper') || inputElement.parentElement;

        // Remove error styling
        inputElement.classList.remove('border-red-500', 'focus:border-red-500', 'focus:ring-red-500/20');
        inputElement.classList.add('border-gray-200', 'focus:border-primary', 'focus:ring-primary/20');

        // Remove error message
        const existingError = wrapper.querySelector('.field-error');
        if (existingError) existingError.remove();
    }

    /**
     * Validate a form element with specified rules
     */
    function validateField(inputElement, validationRules) {
        const value = inputElement.value;
        let result = { valid: true };

        for (const rule of validationRules) {
            switch (rule.type) {
                case 'required':
                    result = validateRequired(value, rule.fieldName);
                    break;
                case 'email':
                    result = validateEmail(value);
                    break;
                case 'password':
                    result = validatePassword(value, rule.options);
                    break;
                case 'minLength':
                    result = validateMinLength(value, rule.min, rule.fieldName);
                    break;
                case 'maxLength':
                    result = validateMaxLength(value, rule.max, rule.fieldName);
                    break;
                case 'pattern':
                    result = validatePattern(value, rule.pattern, rule.message);
                    break;
                case 'match':
                    const otherValue = document.getElementById(rule.matchField)?.value;
                    result = validatePasswordMatch(value, otherValue);
                    break;
                case 'number':
                    result = validateNumberRange(value, rule.min, rule.max, rule.fieldName);
                    break;
                case 'custom':
                    result = rule.validator(value);
                    break;
            }

            if (!result.valid) {
                break;
            }
        }

        if (!result.valid) {
            showFieldError(inputElement, result.message);
        } else {
            clearFieldError(inputElement);
        }

        return result.valid;
    }

    /**
     * Setup real-time validation for a form
     */
    function setupFormValidation(formElement, fieldConfigs) {
        fieldConfigs.forEach(config => {
            const input = formElement.querySelector(config.selector);
            if (!input) return;

            // Validate on blur
            input.addEventListener('blur', () => {
                validateField(input, config.rules);
            });

            // Clear error on input
            input.addEventListener('input', () => {
                clearFieldError(input);
            });
        });

        // Validate all on submit
        formElement.addEventListener('submit', (e) => {
            let isValid = true;

            fieldConfigs.forEach(config => {
                const input = formElement.querySelector(config.selector);
                if (input && !validateField(input, config.rules)) {
                    isValid = false;
                }
            });

            if (!isValid) {
                e.preventDefault();
                // Focus first invalid field
                const firstError = formElement.querySelector('.border-red-500');
                if (firstError) firstError.focus();
            }
        });
    }

    // Public API
    return {
        validateEmail,
        validatePassword,
        validateRequired,
        validateMinLength,
        validateMaxLength,
        validatePattern,
        validateNumberRange,
        validatePasswordMatch,
        getPasswordStrength,
        getPasswordStrengthLabel,
        sanitizeInput,
        showFieldError,
        clearFieldError,
        validateField,
        setupFormValidation,
        rules,
    };
})();

console.log('PEValidation loaded successfully');

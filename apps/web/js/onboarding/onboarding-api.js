/**
 * PE OS — Onboarding API Client
 * Handles all server communication for onboarding status tracking.
 * Uses PEAuth.authFetch() for authenticated requests.
 */

window.OnboardingAPI = {
    _cache: null,
    _cacheTime: 0,
    _CACHE_TTL: 30000, // 30 seconds

    /**
     * Get current user's onboarding status
     * @returns {Promise<Object>} onboarding status object
     */
    async getStatus() {
        const now = Date.now();
        if (this._cache && (now - this._cacheTime) < this._CACHE_TTL) {
            return this._cache;
        }
        try {
            const response = await PEAuth.authFetch(`${API_BASE_URL}/onboarding/status`);
            if (!response.ok) throw new Error(`Status ${response.status}`);
            const data = await response.json();
            this._cache = data;
            this._cacheTime = now;
            return data;
        } catch (error) {
            console.warn('[Onboarding] Failed to fetch status:', error.message);
            // If API fails, suppress onboarding (don't show to potentially existing users)
            return {
                welcomeShown: true,
                checklistDismissed: true,
                steps: {
                    createDeal: false,
                    uploadDocument: false,
                    reviewExtraction: false,
                    tryDealChat: false,
                    inviteTeamMember: false,
                }
            };
        }
    },

    /**
     * Mark an onboarding step as completed
     * @param {string} stepId - One of: createDeal, uploadDocument, reviewExtraction, tryDealChat, inviteTeamMember
     */
    async completeStep(stepId) {
        // Update cache optimistically
        if (this._cache && this._cache.steps) {
            if (this._cache.steps[stepId]) return; // Already completed
            this._cache.steps[stepId] = true;
        }
        try {
            await PEAuth.authFetch(`${API_BASE_URL}/onboarding/complete-step`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step: stepId }),
            });
        } catch (error) {
            console.warn('[Onboarding] Failed to save step:', stepId, error.message);
        }
    },

    /**
     * Mark welcome modal as shown (won't show again)
     */
    async markWelcomeShown() {
        if (this._cache) this._cache.welcomeShown = true;
        try {
            await PEAuth.authFetch(`${API_BASE_URL}/onboarding/welcome-shown`, {
                method: 'POST',
            });
        } catch (error) {
            console.warn('[Onboarding] Failed to mark welcome shown:', error.message);
        }
    },

    /**
     * Dismiss the onboarding checklist
     */
    async dismissChecklist() {
        if (this._cache) this._cache.checklistDismissed = true;
        try {
            await PEAuth.authFetch(`${API_BASE_URL}/onboarding/dismiss`, {
                method: 'POST',
            });
        } catch (error) {
            console.warn('[Onboarding] Failed to dismiss checklist:', error.message);
        }
    },

    /** Clear cache (useful after completing all steps) */
    clearCache() {
        this._cache = null;
        this._cacheTime = 0;
    }
};

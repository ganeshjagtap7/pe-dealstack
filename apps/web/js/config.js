// ─── PE OS — Global Configuration ───────────────────────────
// Single source of truth for app-wide constants.
// Loaded before all other scripts via <script src="js/config.js">

window.PE_CONFIG = {
  API_BASE_URL: ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:3001/api'
    : '/api',
};

// Convenience alias — many files reference API_BASE_URL directly
window.API_BASE_URL = window.PE_CONFIG.API_BASE_URL;

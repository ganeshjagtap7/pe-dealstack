// ─── PE OS — Global Configuration ───────────────────────────
// Single source of truth for app-wide constants.
// Loaded before all other scripts via <script src="js/config.js">

window.PE_CONFIG = {
  API_BASE_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : '/api',
};

// Convenience alias — many files reference API_BASE_URL directly
window.API_BASE_URL = window.PE_CONFIG.API_BASE_URL;

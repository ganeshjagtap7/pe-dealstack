/**
 * PE OS Authentication Module
 * Uses Supabase Auth for email/password authentication
 */

// Define PEAuth immediately to avoid "not defined" errors
window.PEAuth = {};

// Supabase configuration - loaded from environment via Vite plugin (window.__ENV)
const SUPABASE_URL = window.__ENV?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.__ENV?.SUPABASE_ANON_KEY || '';

// Initialize Supabase client
let supabaseClient = null;

/**
 * Initialize the Supabase client
 * Must be called before any other auth functions
 */
async function initSupabase() {
  if (supabaseClient) return supabaseClient;

  // Supabase JS should be loaded via CDN script tag before this file
  // Check if supabase is available
  if (typeof window.supabase === 'undefined') {
    console.error('Supabase JS not loaded. Make sure to include the CDN script before auth.js');
    throw new Error('Supabase JS not loaded');
  }

  // Create the Supabase client
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseClient;
}

/**
 * Sign up a new user with email and password
 * Workspace creators are always assigned ADMIN role
 * The "title" field is for display (Partner, Analyst, etc.)
 */
async function signUp(email, password, metadata = {}) {
  const client = await initSupabase();

  // Map title values to display names
  const titleLabels = {
    'partner': 'Partner / Managing Director',
    'principal': 'Principal',
    'vp': 'Vice President',
    'associate': 'Associate',
    'analyst': 'Analyst',
    'ops': 'Operations / Admin',
  };

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/verify-email.html`,
      data: {
        full_name: metadata.fullName || '',
        firm_name: metadata.firmName || '',
        // Workspace creator is always ADMIN
        role: 'ADMIN',
        // Title is for display purposes (Partner, Analyst, etc.)
        title: titleLabels[metadata.title] || metadata.title || '',
      }
    }
  });

  if (error) {
    console.error('Signup error:', error.message);
    return { user: null, session: null, error };
  }

  return { user: data.user, session: data.session, error: null };
}

/**
 * Sign in with email and password
 */
async function signIn(email, password) {
  const client = await initSupabase();

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Sign in error:', error.message);
    return { user: null, session: null, error };
  }

  return { user: data.user, session: data.session, error: null };
}

/**
 * Sign out the current user
 */
async function signOut() {
  const client = await initSupabase();
  const { error } = await client.auth.signOut();

  if (error) {
    console.error('Sign out error:', error.message);
  }

  // Clear any legacy localStorage data
  localStorage.removeItem('peosUser');
  sessionStorage.removeItem('peosUser');

  // Redirect to login
  window.location.href = '/login.html';
  return { error };
}

/**
 * Get the current authenticated user
 */
async function getUser() {
  try {
    const client = await initSupabase();
    const { data: { user } } = await client.auth.getUser();
    const { data: { session } } = await client.auth.getSession();
    return { user, session };
  } catch (err) {
    console.error('Get user error:', err);
    return { user: null, session: null };
  }
}

/**
 * Get the current session
 */
async function getSession() {
  try {
    const client = await initSupabase();
    const { data: { session } } = await client.auth.getSession();
    return { session };
  } catch (err) {
    console.error('Get session error:', err);
    return { session: null };
  }
}

/**
 * Get the access token for API calls
 */
async function getAccessToken() {
  const { session } = await getSession();
  return session?.access_token || null;
}

/**
 * Check if user is authenticated
 * If not authenticated, redirect to login page
 */
async function checkAuth(redirectTo = null) {
  const { user, session } = await getUser();

  if (!user || !session) {
    // Store intended destination
    if (redirectTo) {
      sessionStorage.setItem('authRedirect', redirectTo);
    } else {
      sessionStorage.setItem('authRedirect', window.location.href);
    }

    // Redirect to login
    window.location.href = '/login.html';
    return null;
  }

  return { user, session };
}

/**
 * Check if user is NOT authenticated (for login/signup pages)
 * If authenticated, redirect to CRM
 */
async function checkNotAuth() {
  const { user, session } = await getUser();

  if (user && session) {
    // Get redirect destination or default to CRM
    const redirect = sessionStorage.getItem('authRedirect') || '/crm.html';
    sessionStorage.removeItem('authRedirect');
    window.location.href = redirect;
    return false;
  }

  return true;
}

/**
 * Listen for auth state changes
 */
async function onAuthStateChange(callback) {
  const client = await initSupabase();

  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });

  return () => subscription.unsubscribe();
}

/**
 * Reset password - sends email to user
 */
async function resetPassword(email) {
  const client = await initSupabase();

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password.html`,
  });

  return { error };
}

/**
 * Update user password (when logged in)
 */
async function updatePassword(newPassword) {
  const client = await initSupabase();

  const { error } = await client.auth.updateUser({
    password: newPassword
  });

  return { error };
}

/**
 * Resend verification email
 * Used when user didn't receive the email or link expired
 */
async function resendVerificationEmail(email) {
  const client = await initSupabase();

  const { error } = await client.auth.resend({
    type: 'signup',
    email: email,
    options: {
      emailRedirectTo: `${window.location.origin}/verify-email.html`,
    }
  });

  return { error };
}

/**
 * Make an authenticated API request
 * Automatically includes the Authorization header
 */
async function authFetch(url, options = {}) {
  const token = await getAccessToken();

  const headers = {
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

// Assign all functions to window.PEAuth
window.PEAuth = {
  initSupabase,
  signUp,
  signIn,
  signOut,
  getUser,
  getSession,
  getAccessToken,
  checkAuth,
  checkNotAuth,
  onAuthStateChange,
  resetPassword,
  updatePassword,
  resendVerificationEmail,
  authFetch,
  SUPABASE_URL,
};

console.log('PEAuth loaded successfully');

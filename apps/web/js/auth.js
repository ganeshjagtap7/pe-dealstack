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

// Session cache — avoids redundant Supabase API calls within same page
let _cachedSession = null;
let _cachedUser = null;
let _sessionFetchPromise = null;

/**
 * Get the current session (cached within page lifecycle)
 * Only makes one Supabase call per page load
 */
async function getSession() {
  if (_cachedSession) return { session: _cachedSession };

  // Deduplicate concurrent calls (e.g., checkAuth + authFetch racing)
  if (_sessionFetchPromise) return _sessionFetchPromise;

  _sessionFetchPromise = (async () => {
    try {
      const client = await initSupabase();
      const { data: { session } } = await client.auth.getSession();
      _cachedSession = session;
      return { session };
    } catch (err) {
      console.error('Get session error:', err);
      return { session: null };
    } finally {
      _sessionFetchPromise = null;
    }
  })();

  return _sessionFetchPromise;
}

/**
 * Get the current authenticated user (uses cached session)
 */
async function getUser() {
  if (_cachedUser && _cachedSession) {
    return { user: _cachedUser, session: _cachedSession };
  }

  try {
    const { session } = await getSession();
    if (session) {
      _cachedUser = session.user;
      return { user: session.user, session };
    }
    return { user: null, session: null };
  } catch (err) {
    console.error('Get user error:', err);
    return { user: null, session: null };
  }
}

/**
 * Get the access token for API calls (uses cached session)
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
    // Get redirect destination or default to dashboard (which checks onboarding)
    const redirect = sessionStorage.getItem('authRedirect') || '/dashboard.html';
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

// ─── MFA / Two-Factor Authentication ───────────────────────

/**
 * Check if the current user has MFA enrolled
 * Returns { hasMFA, factors }
 */
async function getMFAStatus() {
  const client = await initSupabase();
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) {
    console.error('MFA listFactors error:', error);
    return { hasMFA: false, factors: [] };
  }
  const verifiedFactors = (data.totp || []).filter(f => f.status === 'verified');
  return { hasMFA: verifiedFactors.length > 0, factors: verifiedFactors };
}

/**
 * Enroll a new TOTP factor (generates QR code)
 * Returns { id, qr_code, secret, uri, error }
 */
async function enrollMFA(friendlyName = 'PE OS Authenticator') {
  const client = await initSupabase();
  const { data, error } = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
  });
  if (error) {
    console.error('MFA enroll error:', error);
    return { error };
  }
  return {
    id: data.id,
    qr_code: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
    error: null,
  };
}

/**
 * Verify a TOTP code to complete MFA enrollment or login challenge
 * factorId: the factor ID from enrollment or listFactors
 * code: the 6-digit TOTP code from the authenticator app
 */
async function verifyMFA(factorId, code) {
  const client = await initSupabase();

  // Create a challenge first
  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({ factorId });
  if (challengeError) {
    console.error('MFA challenge error:', challengeError);
    return { error: challengeError };
  }

  // Verify the code against the challenge
  const { data, error } = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (error) {
    console.error('MFA verify error:', error);
    return { error };
  }
  return { data, error: null };
}

/**
 * Unenroll (disable) an MFA factor
 */
async function unenrollMFA(factorId) {
  const client = await initSupabase();
  const { error } = await client.auth.mfa.unenroll({ factorId });
  if (error) {
    console.error('MFA unenroll error:', error);
  }
  return { error };
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
  getMFAStatus,
  enrollMFA,
  verifyMFA,
  unenrollMFA,
  SUPABASE_URL,
};

console.log('PEAuth loaded successfully');

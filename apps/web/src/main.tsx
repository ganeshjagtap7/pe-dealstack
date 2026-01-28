import React from 'react';
import ReactDOM from 'react-dom/client';
import { VDRApp } from './vdr';
import './index.css';

// Check authentication before rendering the app
async function initApp() {
  // Wait for PEAuth to be available (loaded from auth.js)
  const waitForAuth = () => {
    return new Promise<void>((resolve) => {
      if (window.PEAuth) {
        resolve();
      } else {
        const interval = setInterval(() => {
          if (window.PEAuth) {
            clearInterval(interval);
            resolve();
          }
        }, 50);
      }
    });
  };

  await waitForAuth();
  await window.PEAuth.initSupabase();
  const isAuthenticated = await window.PEAuth.checkAuth();

  if (!isAuthenticated) {
    // checkAuth will redirect to login, don't render app
    return;
  }

  // User is authenticated, render the app
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <VDRApp />
    </React.StrictMode>
  );
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    PEAuth: {
      initSupabase: () => Promise<void>;
      checkAuth: () => Promise<boolean>;
      signIn: (email: string, password: string) => Promise<any>;
      signUp: (email: string, password: string, metadata?: any) => Promise<any>;
      signOut: () => Promise<void>;
      getUser: () => Promise<any>;
      getSession: () => Promise<any>;
      getAccessToken: () => Promise<string | null>;
      authFetch: (url: string, options?: RequestInit) => Promise<Response>;
      checkNotAuth: () => Promise<boolean>;
      onAuthStateChange: (callback: (event: string, session: any) => void) => any;
    };
  }
}

initApp();

"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    // Use onAuthStateChange as the single source of truth. It fires
    // immediately with the current session (INITIAL_SESSION event) and
    // on every subsequent auth state change. This avoids the race condition
    // between getUser() and onAuthStateChange overwriting each other.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        // Validate the user server-side on initial load to ensure the
        // session token from local storage is still valid.
        if (event === "INITIAL_SESSION") {
          const { error } = await supabase.auth.getUser();
          if (error) {
            setSession(null);
            setLoading(false);
            return;
          }
        }
        setSession(session);
      } else {
        setSession(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

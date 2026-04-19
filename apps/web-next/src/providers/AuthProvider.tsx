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
    // Use getUser() for the initial check — getSession() reads from local
    // storage and isn't guaranteed to be valid (Supabase docs). The
    // onAuthStateChange listener still provides the session object for
    // subsequent updates (it validates server-side on each event).
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (error || !user) {
        setSession(null);
      }
      // getUser() doesn't return the session, so bootstrap it once via
      // getSession() only after we've confirmed the user is valid.
      if (user) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          setSession(session);
        });
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
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

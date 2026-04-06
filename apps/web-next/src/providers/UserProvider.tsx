"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { api } from "@/lib/api";
import type { AppUser } from "@/types";

interface UserContextType {
  user: AppUser | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  refetch: async () => {},
});

const USER_CACHE_KEY = "pe-user-cache";

function getCachedUser(): AppUser | null {
  try {
    const cached = sessionStorage.getItem(USER_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.name && parsed.name !== "Loading...") return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [user, setUser] = useState<AppUser | null>(getCachedUser);
  const [loading, setLoading] = useState(!getCachedUser());

  const fetchUser = async () => {
    try {
      const data = await api.get<{
        id: string;
        name: string;
        email: string;
        title?: string;
        role?: string;
        avatar?: string;
        preferences?: Record<string, unknown>;
      }>("/users/me");

      const appUser: AppUser = {
        id: data.id || "",
        name: data.name || data.email?.split("@")[0] || "User",
        email: data.email || "",
        role: data.title || data.role || "Team Member",
        systemRole: (data.role as AppUser["systemRole"]) || "MEMBER",
        avatar: data.avatar || "",
        preferences: data.preferences || {},
      };

      setUser(appUser);
      try {
        sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(appUser));
      } catch {
        // ignore
      }
    } catch {
      // API not available yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) fetchUser();
  }, [session]);

  return (
    <UserContext.Provider value={{ user, loading, refetch: fetchUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

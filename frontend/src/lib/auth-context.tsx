"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, type AuthUser, type AuthPatient, type AuthResponse } from "./api";

const STORAGE_KEY = "auramed_auth";

interface AuthState {
  user: AuthUser | null;
  patient: AuthPatient | null;
  token: string | null;
}

interface AuthContextValue extends AuthState {
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const EMPTY: AuthState = { user: null, patient: null, token: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>(EMPTY);
  const [ready, setReady] = useState(false);

  const persist = useCallback((res: AuthResponse) => {
    const next: AuthState = { user: res.user, patient: res.patient, token: res.access_token };
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const clear = useCallback(() => {
    setState(EMPTY);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  // storage theke tule, /me diye verify kori (expired token holey bad)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let stored: AuthState | null = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) stored = JSON.parse(raw);
      } catch {}
      if (stored?.token) {
        setState(stored);
        try {
          const fresh = await api.me();
          if (!cancelled) persist(fresh);
        } catch {
          if (!cancelled) clear();
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [persist, clear]);

  const login = useCallback(async (email: string, password: string) => persist(await api.login({ email, password })), [persist]);
  const register = useCallback(
    async (name: string, email: string, password: string) => persist(await api.register({ name, email, password })),
    [persist],
  );
  const logout = useCallback(() => {
    clear();
    router.push("/login");
  }, [clear, router]);

  return <AuthContext.Provider value={{ ...state, ready, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export function useRequireAuth(): AuthContextValue {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.ready && !auth.token) router.replace("/login");
  }, [auth.ready, auth.token, router]);
  return auth;
}

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { api, type AuthUser, type AuthPatient, type AuthResponse } from "./api";
import { PLACEHOLDER_AUTH } from "./placeholder"; // placeholder

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
  loginWithGoogle: (credential: string) => Promise<void>;
  loginAsGuest: () => void; // placeholder — bypass login for development
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPTY: AuthState = { user: null, patient: null, token: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>(EMPTY);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw) as AuthState);
    } catch {
      // ignore malformed storage
    }
    setReady(true);
  }, []);

  const persist = useCallback((res: AuthResponse) => {
    const next: AuthState = {
      user: res.user,
      patient: res.patient,
      token: res.access_token,
    };
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage write failure
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login({ email, password });
      persist(res);
    },
    [persist]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await api.register({ name, email, password });
      persist(res);
    },
    [persist]
  );

  const loginWithGoogle = useCallback(
    async (credential: string) => {
      const res = await api.googleLogin(credential);
      persist(res);
    },
    [persist]
  );

  // placeholder — sign in with a fake account so the app is usable without a backend
  const loginAsGuest = useCallback(() => {
    persist(PLACEHOLDER_AUTH);
  }, [persist]);

  const logout = useCallback(() => {
    setState(EMPTY);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{ ...state, ready, login, register, loginWithGoogle, loginAsGuest, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

/** Redirects to /login once hydration confirms there is no session. */
export function useRequireAuth(): AuthContextValue {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.ready && !auth.token) router.replace("/login");
  }, [auth.ready, auth.token, router]);
  return auth;
}

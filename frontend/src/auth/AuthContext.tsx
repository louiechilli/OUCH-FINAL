import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

// Same-origin by default — nginx proxies /api/* to the backend regardless of
// which host this is opened from (see PATTERNS.md / past push notification fix).
const apiUrl = import.meta.env.VITE_API_URL ?? "";
const REFRESH_TOKEN_KEY = "epos_refresh_token";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  pinRequired: boolean;
}

type AuthPhase = "loading" | "login" | "pin-setup" | "locked" | "unlocked";

interface AuthContextValue {
  phase: AuthPhase;
  user: AuthUser | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  setupPin: (pin: string, confirmPin: string) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<void>;
  lock: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseErrorMessage(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  return data.error ?? fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AuthPhase>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      setPhase("login");
      return;
    }

    fetch(`${apiUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        accessTokenRef.current = data.accessToken;
        setUser(data.user);
        // Cold start always re-asks for the PIN, like a banking app — the
        // long-lived refresh token just means you skip email/password.
        setPhase(data.user.pinRequired ? "pin-setup" : "locked");
      })
      .catch(() => {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        setPhase("login");
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const res = await fetch(`${apiUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const message = await parseErrorMessage(res, "Login failed");
      setError(message);
      throw new Error(message);
    }
    const data = await res.json();
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
    accessTokenRef.current = data.accessToken;
    setUser(data.user);
    setPhase(data.user.pinRequired ? "pin-setup" : "unlocked");
  }, []);

  const setupPin = useCallback(async (pin: string, confirmPin: string) => {
    setError(null);
    const res = await fetch(`${apiUrl}/api/auth/pin/setup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessTokenRef.current}`,
      },
      body: JSON.stringify({ pin, confirmPin }),
    });
    if (!res.ok) {
      const message = await parseErrorMessage(res, "Could not set PIN");
      setError(message);
      throw new Error(message);
    }
    setUser((current) => (current ? { ...current, pinRequired: false } : current));
    setPhase("unlocked");
  }, []);

  const unlockWithPin = useCallback(async (pin: string) => {
    setError(null);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      setPhase("login");
      return;
    }

    const res = await fetch(`${apiUrl}/api/auth/pin/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken, pin }),
    });
    if (!res.ok) {
      const message = await parseErrorMessage(res, "Incorrect PIN");
      setError(message);
      throw new Error(message);
    }
    const data = await res.json();
    accessTokenRef.current = data.accessToken;
    setUser(data.user);
    setPhase("unlocked");
  }, []);

  const lock = useCallback(() => {
    setPhase((current) => (current === "unlocked" ? "locked" : current));
  }, []);

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    accessTokenRef.current = null;
    setUser(null);
    setError(null);
    setPhase("login");
    if (refreshToken) {
      fetch(`${apiUrl}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ phase, user, error, login, setupPin, unlockWithPin, lock, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

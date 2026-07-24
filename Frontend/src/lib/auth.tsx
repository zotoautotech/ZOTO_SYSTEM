import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isAxiosError } from "axios";
import { api } from "./api";

export interface AuthUser {
  employeeId: string;
  name: string;
  modules: string[] | "ALL";
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (employeeId: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// How often to re-check permissions against the USERS sheet. Matches the
// AppSheet-style expectation: edit MODULES/CAN_DELETE/ACTIVE in the sheet and it
// applies to logged-in users within about a minute, no re-login needed.
const PERMISSION_REFRESH_MS = 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem("zoto_user");
    return raw ? JSON.parse(raw) : null;
  });

  async function login(employeeId: string, password: string) {
    const res = await api.post("/auth/login", { employeeId, password });
    localStorage.setItem("zoto_token", res.data.token);
    localStorage.setItem("zoto_user", JSON.stringify(res.data.user));
    setUser(res.data.user);
  }

  function logout() {
    localStorage.removeItem("zoto_token");
    localStorage.removeItem("zoto_user");
    setUser(null);
  }

  // Live permission refresh: poll /auth/me while logged in so sheet edits to
  // MODULES/CAN_DELETE apply without re-login. A 401 means the account was
  // deactivated/removed in the sheet — log the session out on the spot.
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    async function refresh() {
      try {
        const res = await api.get<AuthUser>("/auth/me");
        if (cancelled) return;
        localStorage.setItem("zoto_user", JSON.stringify(res.data));
        setUser((prev) => (JSON.stringify(prev) === JSON.stringify(res.data) ? prev : res.data));
      } catch (err) {
        if (!cancelled && isAxiosError(err) && err.response?.status === 401) {
          logout();
        }
        // Network/server errors: keep the current session, retry next tick.
      }
    }

    refresh();
    const id = setInterval(refresh, PERMISSION_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.employeeId]);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

import axios from "axios";

// In local dev, relative "/api/v1" is proxied to the Backend dev server (see vite.config.ts).
// In production, Frontend and Backend are separate Vercel projects/domains, so
// VITE_API_BASE_URL must point at the deployed Backend, e.g. https://zoto-backend.vercel.app/api/v1
const baseURL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("zoto_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Endpoints whose own 401s mean "that request was rejected" (wrong password, etc.),
// not "the session/token is invalid" — those shouldn't trigger a global logout.
const AUTH_ACTION_PATHS = ["/auth/login", "/auth/change-password"];

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url: string = err.config?.url ?? "";
    const isAuthAction = AUTH_ACTION_PATHS.some((p) => url.includes(p));
    if (err.response?.status === 401 && !isAuthAction) {
      localStorage.removeItem("zoto_token");
      localStorage.removeItem("zoto_user");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

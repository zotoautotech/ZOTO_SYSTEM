import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { SearchProvider } from "./lib/search";
import { SyncProvider } from "./lib/sync";
import { HeaderActionsProvider } from "./lib/headerActions";
import "./theme/tokens.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      // Left at the library default (true) deliberately — `refetchOnMount: false` was tried
      // here before and caused a recurring class of bug: mutate on page A (e.g. save a new
      // order), invalidateQueries() runs while page B's query has no active observer yet (not
      // mounted), so nothing actually refetches; then navigating to page B mounted the STALE
      // cached data and, with refetchOnMount forced off, never refetched it — only the 30s
      // auto-sync would eventually catch it up. `staleTime` above already prevents refetching
      // on every quick revisit for genuinely fresh (<60s, not invalidated) data, which was the
      // actual problem being solved originally — no need to also block refetching on mount for
      // data that's stale or was explicitly invalidated.
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <SyncProvider>
              <SearchProvider>
                <HeaderActionsProvider>
                  <App />
                </HeaderActionsProvider>
              </SearchProvider>
            </SyncProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);

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

const queryClient = new QueryClient();

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

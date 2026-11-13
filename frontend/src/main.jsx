import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import "./features/dashboard/components/dashboard.css";
import App from "./App.jsx";
import { initializeTheme } from "./features/branding/context/ThemeProvider";

initializeTheme();

// Auto-recover from stale deployment chunks (avoids "Failed to fetch dynamically imported module")
window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    const reloadKey = "chunk_preload_reload";
    const lastReload = Number(sessionStorage.getItem(reloadKey) || 0);
    if (Date.now() - lastReload > 10000) {
        sessionStorage.setItem(reloadKey, String(Date.now()));
        window.location.reload();
    }
});

window.addEventListener("error", (event) => {
    const msg = event?.message || "";
    if (msg.includes("dynamically imported module") || msg.includes("Failed to fetch dynamically imported")) {
        const reloadKey = "chunk_preload_reload";
        const lastReload = Number(sessionStorage.getItem(reloadKey) || 0);
        if (Date.now() - lastReload > 10000) {
            sessionStorage.setItem(reloadKey, String(Date.now()));
            window.location.reload();
        }
    }
});

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>
    </StrictMode>
);

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { initPreferencesOnBoot } from "./lib/preferences";
import { initBackend } from "./lib/backend";
import "./index.css";

initPreferencesOnBoot();
void initBackend().catch((err) => {
  console.error("[nook] Backend init failed:", err);
});

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[nook] App crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="cozy-bg flex h-full min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
        >
          <h1 className="text-olive text-xl font-bold">Something went wrong</h1>
          <p className="text-olive/80 max-w-md text-sm">
            Nook hit an unexpected error. Try refreshing the page. If you just
            added Supabase settings, double-check{" "}
            <code className="text-xs">VITE_SUPABASE_URL</code> and{" "}
            <code className="text-xs">VITE_SUPABASE_ANON_KEY</code> in Vercel.
          </p>
          <button
            type="button"
            className="rounded-full bg-olive px-5 py-2 text-sm font-semibold text-cream"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML =
    "<p style='padding:2rem;font-family:sans-serif'>Root element missing — check index.html.</p>";
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppErrorBoundary>
    </React.StrictMode>
  );
}

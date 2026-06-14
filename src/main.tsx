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

window.addEventListener("unhandledrejection", (event) => {
  console.warn("[nook] Unhandled promise rejection:", event.reason);
  event.preventDefault();
});

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; resetKey: number }
> {
  state = { error: null as Error | null, resetKey: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[nook] App crashed:", error, info.componentStack);
  }

  private reset = () => {
    this.setState((prev) => ({
      error: null,
      resetKey: prev.resetKey + 1,
    }));
  };

  render() {
    if (this.state.error) {
      const showDetail =
        import.meta.env.DEV || import.meta.env.VITE_SHOW_ERROR_DETAIL === "true";
      return (
        <div
          className="cozy-bg flex h-full min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
        >
          <h1 className="text-olive text-xl font-bold">Something went wrong</h1>
          <p className="text-olive/80 max-w-md text-sm">
            Nook hit an unexpected error. Try again or refresh the page.
          </p>
          {showDetail && (
            <p className="max-w-md break-all rounded-xl bg-cream/80 px-4 py-2 font-mono text-xs text-brown/80">
              {this.state.error.message}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              className="rounded-full bg-cream px-5 py-2 text-sm font-semibold text-brown shadow-cozy"
              onClick={this.reset}
            >
              Try again
            </button>
            <button
              type="button"
              className="rounded-full bg-olive px-5 py-2 text-sm font-semibold text-cream"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return (
      <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>
    );
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

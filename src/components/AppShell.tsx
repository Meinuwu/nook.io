import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import BottomNav from "./BottomNav";
import { handleUiClickSound } from "../lib/sfx";
import { useAuth } from "../lib/useAuth";
import { syncLastActive } from "../lib/mockBackend";

export default function AppShell() {
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile) return;
    const userId = profile.userId;
    syncLastActive(userId);
    const interval = window.setInterval(() => syncLastActive(userId), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") syncLastActive(userId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [profile?.userId]);

  useEffect(() => {
    document.addEventListener("click", handleUiClickSound);
    return () => document.removeEventListener("click", handleUiClickSound);
  }, []);

  return (
    <div className="cozy-bg flex min-h-full flex-col">
      <div className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}

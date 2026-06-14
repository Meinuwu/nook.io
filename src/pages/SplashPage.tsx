import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import NookLogo from "../components/NookLogo";
import { useAuth } from "../lib/useAuth";

export default function SplashPage() {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    const holdTimer = setTimeout(() => setLeaving(true), 1300);
    const navTimer = setTimeout(() => {
      if (profile) {
        navigate(profile.avatarCreated ? "/home" : "/onboarding", { replace: true });
      } else {
        navigate("/auth", { replace: true });
      }
    }, 1850);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(navTimer);
    };
  }, [loading, profile, navigate]);

  return (
    <div className="cozy-bg flex h-full items-center justify-center">
      <div className={leaving ? "animate-fade-out" : "animate-fade-in"}>
        <div className="flex flex-col items-center gap-4">
          <NookLogo size={120} layout="stacked" />
          <span className="text-lg font-semibold text-olive">
            study cozy, together
          </span>
        </div>
      </div>
    </div>
  );
}

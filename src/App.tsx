import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/useAuth";
import AppShell from "./components/AppShell";
import SplashPage from "./pages/SplashPage";
import AuthPage from "./pages/AuthPage";
import OnboardingAvatarPage from "./pages/OnboardingAvatarPage";
import HomePage from "./pages/HomePage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import CharacterBuilderPage from "./pages/CharacterBuilderPage";
import StudyRoomPage from "./pages/StudyRoomPage";
import AchievementsPage from "./pages/AchievementsPage";
import FriendsPage from "./pages/FriendsPage";
import EditProfilePage from "./pages/EditProfilePage";
import LeaderboardPage from "./pages/LeaderboardPage";
import type { ReactNode } from "react";

/** Requires an authenticated profile that has finished avatar onboarding. */
function RequireReady({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (!profile) return <Navigate to="/auth" replace />;
  if (!profile.avatarCreated) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

/** Requires auth but allows the onboarding step. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (!profile) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SplashPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingAvatarPage />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireReady>
            <AppShell />
          </RequireReady>
        }
      >
        <Route path="/home" element={<HomePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/edit-profile" element={<EditProfilePage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/achievements" element={<AchievementsPage />} />
        <Route path="/character" element={<CharacterBuilderPage />} />
      </Route>
      <Route
        path="/room/:roomId"
        element={
          <RequireReady>
            <StudyRoomPage />
          </RequireReady>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

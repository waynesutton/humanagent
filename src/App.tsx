import { Routes, Route, Navigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useAuth } from "./hooks/useAuth";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SkillFilePage } from "./pages/SkillFilePage";
import { ConversationsPage } from "./pages/ConversationsPage";
import { BoardPage } from "./pages/BoardPage";
import { FeedPage } from "./pages/FeedPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AgentsPage } from "./pages/AgentsPage";
import { InboxPage } from "./pages/InboxPage";
import { A2AInboxPage } from "./pages/A2AInboxPage";
import { PublicUserProfilePage } from "./pages/PublicUserProfilePage.tsx";

/**
 * Wrapper for protected routes.
 * Redirects to login if not authenticated.
 * Redirects to onboarding if user hasn't completed profile setup.
 */
function AuthRequired({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const viewer = useQuery(api.functions.users.viewer);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
      </div>
    );
  }

  // Not logged in, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Logged in but viewer query still loading
  if (viewer === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
      </div>
    );
  }

  // No user record means they need onboarding
  if (viewer === null) {
    return <Navigate to="/onboarding" replace />;
  }

  // All good, render children
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Onboarding (needs auth but not full profile) */}
      <Route path="/onboarding" element={<OnboardingPage />} />

      {/* Protected routes */}
      <Route
        path="/dashboard"
        element={
          <AuthRequired>
            <DashboardPage />
          </AuthRequired>
        }
      />

      <Route
        path="/skill"
        element={
          <AuthRequired>
            <SkillFilePage />
          </AuthRequired>
        }
      />

      <Route
        path="/conversations"
        element={
          <AuthRequired>
            <ConversationsPage />
          </AuthRequired>
        }
      />

      <Route
        path="/board"
        element={
          <AuthRequired>
            <BoardPage />
          </AuthRequired>
        }
      />

      <Route
        path="/feed"
        element={
          <AuthRequired>
            <FeedPage />
          </AuthRequired>
        }
      />

      <Route
        path="/settings"
        element={
          <AuthRequired>
            <SettingsPage />
          </AuthRequired>
        }
      />

      <Route
        path="/agents"
        element={
          <AuthRequired>
            <AgentsPage />
          </AuthRequired>
        }
      />

      <Route
        path="/inbox"
        element={
          <AuthRequired>
            <InboxPage />
          </AuthRequired>
        }
      />

      <Route
        path="/a2a"
        element={
          <AuthRequired>
            <A2AInboxPage />
          </AuthRequired>
        }
      />

      {/* Public agent page */}
      <Route path="/u/:username" element={<PublicUserProfilePage />} />
      <Route path="/u/:username/:slug" element={<PublicUserProfilePage />} />
      <Route path="/:username" element={<PublicUserProfilePage />} />
      <Route path="/:username/:slug" element={<PublicUserProfilePage />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

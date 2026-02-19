import { lazy, Suspense } from "react";
import type { ComponentType } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Toaster } from "sileo";
import { useAuth } from "./hooks/useAuth";

const lazyNamed = <
  TModule extends Record<string, unknown>,
  TKey extends keyof TModule,
>(
  loader: () => Promise<TModule>,
  exportName: TKey
) =>
  lazy(async () => {
    const module = await loader();
    return { default: module[exportName] as ComponentType };
  });

const LandingPage = lazyNamed(() => import("./pages/LandingPage"), "LandingPage");
const LoginPage = lazyNamed(() => import("./pages/LoginPage"), "LoginPage");
const OnboardingPage = lazyNamed(
  () => import("./pages/OnboardingPage"),
  "OnboardingPage"
);
const DashboardPage = lazyNamed(
  () => import("./pages/DashboardPage"),
  "DashboardPage"
);
const SkillFilePage = lazyNamed(() => import("./pages/SkillFilePage"), "SkillFilePage");
const ConversationsPage = lazyNamed(
  () => import("./pages/ConversationsPage"),
  "ConversationsPage"
);
const BoardPage = lazyNamed(() => import("./pages/BoardPage"), "BoardPage");
const FeedPage = lazyNamed(() => import("./pages/FeedPage"), "FeedPage");
const SettingsPage = lazyNamed(() => import("./pages/SettingsPage"), "SettingsPage");
const AgentsPage = lazyNamed(() => import("./pages/AgentsPage"), "AgentsPage");
const InboxPage = lazyNamed(() => import("./pages/InboxPage"), "InboxPage");
const AgentChatPage = lazyNamed(() => import("./pages/AgentChatPage"), "AgentChatPage");
const A2AInboxPage = lazyNamed(() => import("./pages/A2AInboxPage"), "A2AInboxPage");
const AgentThinkingPage = lazyNamed(
  () => import("./pages/AgentThinkingPage"),
  "AgentThinkingPage"
);
const AutomationPage = lazyNamed(
  () => import("./pages/AutomationPage"),
  "AutomationPage"
);
const AdminPage = lazyNamed(() => import("./pages/AdminPage"), "AdminPage");
const PublicUserProfilePage = lazyNamed(
  () => import("./pages/PublicUserProfilePage.tsx"),
  "PublicUserProfilePage"
);
const PublicSitemapPage = lazy(async () =>
  import("./pages/PublicDocsPage").then((module) => ({
    default: module.PublicSitemapPage,
  }))
);
const PublicLlmsTxtPage = lazy(async () =>
  import("./pages/PublicDocsPage").then((module) => ({
    default: module.PublicLlmsTxtPage,
  }))
);
const PublicLlmsFullPage = lazy(async () =>
  import("./pages/PublicDocsPage").then((module) => ({
    default: module.PublicLlmsFullPage,
  }))
);
const PublicApiDocsPage = lazy(async () =>
  import("./pages/PublicDocsPage").then((module) => ({
    default: module.PublicApiDocsPage,
  }))
);
const PublicToolsDocsPage = lazy(async () =>
  import("./pages/PublicDocsPage").then((module) => ({
    default: module.PublicToolsDocsPage,
  }))
);
const PublicOpenApiPage = lazy(async () =>
  import("./pages/PublicDocsPage").then((module) => ({
    default: module.PublicOpenApiPage,
  }))
);

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

function AdminRequired({ children }: { children: React.ReactNode }) {
  const isAdmin = useQuery(api.functions.admin.isAdmin);

  if (isAdmin === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function RouteLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
    </div>
  );
}

export default function App() {
  return (
    <>
      <Toaster
        position="bottom-right"
        options={{ roundness: 18 }}
      />
      <Suspense fallback={<RouteLoader />}>
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
          path="/chat"
          element={
            <AuthRequired>
              <AgentChatPage />
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

        <Route
          path="/automation"
          element={
            <AuthRequired>
              <AutomationPage />
            </AuthRequired>
          }
        />

        <Route
          path="/thinking"
          element={
            <AuthRequired>
              <AgentThinkingPage />
            </AuthRequired>
          }
        />

        <Route
          path="/security"
          element={
            <AuthRequired>
              <Navigate to="/settings" replace />
            </AuthRequired>
          }
        />

        <Route
          path="/rate-limits"
          element={
            <AuthRequired>
              <Navigate to="/settings" replace />
            </AuthRequired>
          }
        />

        <Route
          path="/admin"
          element={
            <AuthRequired>
              <AdminRequired>
                <AdminPage />
              </AdminRequired>
            </AuthRequired>
          }
        />

        {/* Public profile docs and discovery routes */}
        <Route path="/:username/sitemap.md" element={<PublicSitemapPage />} />
        <Route path="/:username/llms.txt" element={<PublicLlmsTxtPage />} />
        <Route path="/:username/llms-full.md" element={<PublicLlmsFullPage />} />
        <Route path="/:username/:slug/llms.txt" element={<PublicLlmsTxtPage />} />
        <Route path="/:username/:slug/llms-full.md" element={<PublicLlmsFullPage />} />
        <Route path="/api/v1/agents/:username/docs.md" element={<PublicApiDocsPage />} />
        <Route path="/api/v1/agents/:username/tools.md" element={<PublicToolsDocsPage />} />
          <Route path="/api/v1/agents/:username/openapi.json" element={<PublicOpenApiPage />} />

          {/* Public agent page */}
          <Route path="/u/:username" element={<PublicUserProfilePage />} />
          <Route path="/u/:username/:slug" element={<PublicUserProfilePage />} />
          <Route path="/:username" element={<PublicUserProfilePage />} />
          <Route path="/:username/:slug" element={<PublicUserProfilePage />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

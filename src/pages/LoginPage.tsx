import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { getAuth } from "../lib/auth";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const auth = getAuth();
  const { isAuthenticated, isLoading } = useAuth();
  const viewer = useQuery(
    api.functions.users.viewer,
    isAuthenticated ? {} : "skip"
  );
  const navigate = useNavigate();

  // Redirect based on auth state and user profile
  useEffect(() => {
    if (!isAuthenticated) return;
    if (viewer === undefined) return;
    if (viewer && viewer.onboardingComplete) {
      navigate("/dashboard", { replace: true });
    } else {
      navigate("/onboarding", { replace: true });
    }
  }, [isAuthenticated, viewer, navigate]);

  if (isLoading || (isAuthenticated && viewer === undefined)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-0">
      {/* Navigation */}
      <nav className="border-b border-surface-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
              <span className="text-sm font-bold text-white">H</span>
            </div>
            <span className="text-lg font-semibold text-ink-0">HumanAgent</span>
          </Link>
        </div>
      </nav>

      {/* Login form */}
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-ink-0">Welcome back</h1>
            <p className="mt-2 text-ink-1">
              Sign in to manage your agent.
            </p>
          </div>

          <div className="mt-8 space-y-3">
            {/* GitHub OAuth */}
            <button
              onClick={() => auth.signIn("github")}
              className="btn-primary w-full py-3"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              Continue with GitHub
            </button>
          </div>

          <div className="mt-8 text-center">
            <p className="text-xs text-ink-1">
              By signing in, you agree to our{" "}
              <a href="#" className="text-ink-2-interactive hover:underline">
                Terms
              </a>{" "}
              and{" "}
              <a href="#" className="text-ink-2-interactive hover:underline">
                Privacy Policy
              </a>
              .
            </p>
          </div>

          <div className="mt-6 text-center">
            <Link
              to="/"
              className="text-sm text-ink-1 hover:text-ink-0 transition-colors"
            >
              Back to home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../hooks/useAuth";
import { notify } from "../lib/notify";

export function OnboardingPage() {
  const navigate = useNavigate();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const viewer = useQuery(api.functions.users.viewer);
  const createProfile = useMutation(api.functions.users.createProfile);

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Redirect if user already has a profile
  useEffect(() => {
    if (viewer && viewer.onboardingComplete) {
      navigate("/dashboard", { replace: true });
    }
  }, [viewer, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await createProfile({
        username: username.toLowerCase().trim(),
        name: name.trim() || undefined,
        bio: bio.trim() || undefined,
      });
      notify.success("Profile created", "Your agent workspace is ready.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      notify.error("Could not create profile", err, "Please check your inputs.");
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
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

      {/* Onboarding form */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md animate-fade-in">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
              <svg className="h-6 w-6 text-ink-2-interactive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-ink-0">Set up your agent</h1>
            <p className="mt-2 text-ink-1">
              Choose a username for your public agent page.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-ink-0">
                Username
              </label>
              <div className="mt-1.5 flex items-center rounded-lg border border-surface-3 bg-surface-1 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
                <span className="pl-3 text-sm text-ink-2">humanai.gent/</span>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="flex-1 bg-transparent px-2 py-2.5 text-sm text-ink-0 placeholder:text-ink-2 focus:outline-none"
                  placeholder="yourname"
                  required
                  pattern="[a-z0-9_]+"
                  minLength={3}
                  maxLength={30}
                />
              </div>
              <p className="mt-1.5 text-xs text-ink-1">
                Lowercase letters, numbers, and underscores only.
              </p>
            </div>

            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-ink-0">
                Display name <span className="text-ink-2">(optional)</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input mt-1.5"
                placeholder="Your Name"
                maxLength={100}
              />
            </div>

            {/* Bio */}
            <div>
              <label htmlFor="bio" className="block text-sm font-medium text-ink-0">
                Bio <span className="text-ink-2">(optional)</span>
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="input mt-1.5 resize-none"
                placeholder="Tell people what your agent can help with..."
                rows={3}
                maxLength={500}
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username.trim()}
              className="btn-accent w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Creating...
                </>
              ) : (
                "Create agent"
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

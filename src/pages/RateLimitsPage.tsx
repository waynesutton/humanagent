import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";

export function RateLimitsPage() {
  const dashboard = useQuery(api.functions.rateLimits.getDashboard);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl animate-fade-in">
        <div>
          <h1 className="text-2xl font-semibold text-ink-0">Rate limits</h1>
          <p className="mt-1 text-ink-1">
            Monitor active request windows and top keys in the current minute.
          </p>
        </div>

        {dashboard === undefined ? (
          <div className="mt-8 flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="card">
                <p className="text-sm text-ink-1">Active windows</p>
                <p className="mt-2 text-3xl font-semibold text-ink-0">
                  {dashboard.activeWindows}
                </p>
              </div>
              <div className="card">
                <p className="text-sm text-ink-1">Requests in current window</p>
                <p className="mt-2 text-3xl font-semibold text-ink-0">
                  {dashboard.totalRequestsInWindow}
                </p>
              </div>
            </div>

            <div className="mt-6 card">
              <h2 className="text-sm font-medium text-ink-0">Top keys</h2>
              {dashboard.topKeys.length === 0 ? (
                <p className="mt-3 text-sm text-ink-1">No active rate limit windows.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {dashboard.topKeys.map((entry) => (
                    <div
                      key={entry.key}
                      className="flex items-center justify-between rounded-lg border border-surface-3 bg-surface-1 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink-0">{entry.key}</p>
                        <p className="text-xs text-ink-2">
                          resets {new Date(entry.resetAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-1">
                        {entry.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

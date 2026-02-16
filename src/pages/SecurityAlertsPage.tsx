import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";

export function SecurityAlertsPage() {
  const events = useQuery(api.functions.auditLog.getSecurityEvents);
  const csvExport = useQuery(api.functions.auditLog.exportCsv, { limit: 1000 });

  const totalBlocked = useMemo(
    () => events?.filter((event) => event.status === "blocked").length ?? 0,
    [events]
  );

  const totalSecurityActions = useMemo(
    () => events?.filter((event) => event.action === "message_blocked").length ?? 0,
    [events]
  );

  function handleDownloadCsv() {
    if (!csvExport) return;
    const blob = new Blob([csvExport], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `security-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl animate-fade-in">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink-0">Security alerts</h1>
            <p className="mt-1 text-ink-1">
              Monitor blocked requests and high-risk events from your audit log.
            </p>
          </div>
          <button
            onClick={handleDownloadCsv}
            disabled={!csvExport}
            className="btn-secondary text-sm"
          >
            Export audit CSV
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="card">
            <p className="text-sm text-ink-1">Blocked events</p>
            <p className="mt-2 text-3xl font-semibold text-ink-0">{totalBlocked}</p>
          </div>
          <div className="card">
            <p className="text-sm text-ink-1">Message blocks</p>
            <p className="mt-2 text-3xl font-semibold text-ink-0">{totalSecurityActions}</p>
          </div>
        </div>

        <div className="mt-6 card">
          {events === undefined ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-ink-1">No security alerts found.</p>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event._id}
                  className="rounded-lg border border-surface-3 bg-surface-1 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      {event.status}
                    </span>
                    <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-1">
                      {event.action}
                    </span>
                    <span className="text-xs text-ink-2">
                      {new Date(event.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-ink-0">Resource: {event.resource}</p>
                  {event.callerIdentity ? (
                    <p className="mt-1 text-xs text-ink-2">
                      Caller: {event.callerIdentity}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

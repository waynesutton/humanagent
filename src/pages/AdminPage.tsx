import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";

export function AdminPage() {
  const isAdmin = useQuery(api.functions.admin.isAdmin);
  const stats = useQuery(
    api.functions.admin.getDashboardStats,
    isAdmin ? {} : "skip"
  );
  const users = useQuery(
    api.functions.admin.listUsers,
    isAdmin ? { limit: 200 } : "skip"
  );

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl animate-fade-in">
        <div>
          <h1 className="text-2xl font-semibold text-ink-0">Admin dashboard</h1>
          <p className="mt-1 text-ink-1">Manage user-level platform visibility and usage.</p>
        </div>

        {isAdmin === undefined ? (
          <div className="mt-8 flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
          </div>
        ) : !isAdmin ? (
          <div className="mt-6 card">
            <p className="text-sm text-ink-1">Admin access is required for this page.</p>
          </div>
        ) : stats === undefined || users === undefined ? (
          <div className="mt-8 flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Users" value={stats.users} />
              <MetricCard label="Agents" value={stats.agents} />
              <MetricCard label="Active API keys" value={stats.activeApiKeys} />
              <MetricCard label="Open tasks" value={stats.openTasks} />
            </div>

            <div className="mt-6 card">
              <h2 className="text-sm font-medium text-ink-0">Users</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-ink-2">
                    <tr>
                      <th className="py-2 pr-4">Username</th>
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Onboarding</th>
                      <th className="py-2 pr-4">Agents</th>
                      <th className="py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user._id} className="border-t border-surface-3">
                        <td className="py-2 pr-4 text-ink-0">{user.username ?? "-"}</td>
                        <td className="py-2 pr-4 text-ink-1">{user.name ?? "-"}</td>
                        <td className="py-2 pr-4 text-ink-1">
                          {user.onboardingComplete ? "Complete" : "Pending"}
                        </td>
                        <td className="py-2 pr-4 text-ink-1">{user.agentCount}</td>
                        <td className="py-2 text-ink-1">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-1">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-ink-0">{value}</p>
    </div>
  );
}

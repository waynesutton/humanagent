import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Link } from "react-router-dom";
import type { Id } from "../../convex/_generated/dataModel";

type AutomationTab = "a2a" | "thinking";
type ThoughtType =
  | "observation"
  | "reasoning"
  | "decision"
  | "reflection"
  | "goal_update";

export function AutomationPage() {
  const [tab, setTab] = useState<AutomationTab>("a2a");
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | null>(null);
  const [selectedType, setSelectedType] = useState<"all" | ThoughtType>("all");

  const inboxThreads = useQuery(api.functions.a2a.getInboxThreads, { limit: 20 });
  const outboxThreads = useQuery(api.functions.a2a.getOutboxThreads, { limit: 20 });
  const agents = useQuery(api.functions.agents.list);

  const effectiveAgentId = useMemo(() => {
    if (selectedAgentId) return selectedAgentId;
    if (!agents || agents.length === 0) return null;
    return agents[0]?._id ?? null;
  }, [agents, selectedAgentId]);

  const thoughts = useQuery(
    api.functions.agentThinking.getAgentThoughts,
    effectiveAgentId
      ? {
          agentId: effectiveAgentId,
          limit: 50,
          type: selectedType === "all" ? undefined : selectedType,
        }
      : "skip"
  );

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl animate-fade-in">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink-0">Automation</h1>
            <p className="mt-1 text-ink-1">
              Manage agent-to-agent communication and reasoning from one place.
            </p>
          </div>
        </div>

        <div className="mt-6 card p-0">
          <div className="border-b border-surface-3 p-3">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-1 p-1">
              <button
                type="button"
                onClick={() => setTab("a2a")}
                className={`rounded-md px-3 py-2 text-sm ${
                  tab === "a2a" ? "bg-surface-0 text-ink-0 shadow-card" : "text-ink-1"
                }`}
              >
                A2A
              </button>
              <button
                type="button"
                onClick={() => setTab("thinking")}
                className={`rounded-md px-3 py-2 text-sm ${
                  tab === "thinking" ? "bg-surface-0 text-ink-0 shadow-card" : "text-ink-1"
                }`}
              >
                Thinking
              </button>
            </div>
          </div>

          <div className="p-4">
            {tab === "a2a" ? (
              <div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoCard
                    label="Inbox threads"
                    value={inboxThreads ? inboxThreads.length : "-"}
                  />
                  <InfoCard
                    label="Outbox threads"
                    value={outboxThreads ? outboxThreads.length : "-"}
                  />
                </div>
                <div className="mt-4 rounded-lg border border-surface-3 bg-surface-1 p-3">
                  <p className="text-sm text-ink-1">
                    Open the full thread experience to compose, summarize, and reply.
                  </p>
                  <Link to="/a2a" className="btn-secondary mt-3 text-sm">
                    Open A2A inbox
                  </Link>
                </div>
              </div>
            ) : (
              <div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-ink-0">Agent</label>
                    <select
                      className="input mt-1.5"
                      value={effectiveAgentId ?? ""}
                      onChange={(e) => setSelectedAgentId(e.target.value as Id<"agents">)}
                      disabled={!agents || agents.length === 0}
                    >
                      {!agents || agents.length === 0 ? (
                        <option value="">No agents</option>
                      ) : (
                        agents.map((agent) => (
                          <option key={agent._id} value={agent._id}>
                            {agent.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink-0">Type</label>
                    <select
                      className="input mt-1.5"
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value as "all" | ThoughtType)}
                    >
                      <option value="all">All</option>
                      <option value="observation">Observations</option>
                      <option value="reasoning">Reasoning</option>
                      <option value="decision">Decisions</option>
                      <option value="reflection">Reflections</option>
                      <option value="goal_update">Goal updates</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {thoughts === undefined ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                    </div>
                  ) : thoughts.length === 0 ? (
                    <p className="text-sm text-ink-1">No thoughts found.</p>
                  ) : (
                    thoughts.map((thought) => (
                      <div
                        key={thought._id}
                        className="rounded-lg border border-surface-3 bg-surface-1 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-1">
                            {thought.type}
                          </span>
                          <span className="text-xs text-ink-2">
                            {new Date(thought.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-ink-0">{thought.content}</p>
                      </div>
                    ))
                  )}
                </div>
                <Link to="/thinking" className="btn-secondary mt-4 text-sm">
                  Open full thinking view
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function InfoCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-surface-3 bg-surface-1 p-4">
      <p className="text-sm text-ink-1">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink-0">{value}</p>
    </div>
  );
}

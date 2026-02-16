import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import type { Id } from "../../convex/_generated/dataModel";

type ThoughtType =
  | "observation"
  | "reasoning"
  | "decision"
  | "reflection"
  | "goal_update";

const THOUGHT_TYPES: Array<{ id: "all" | ThoughtType; label: string }> = [
  { id: "all", label: "All" },
  { id: "observation", label: "Observations" },
  { id: "reasoning", label: "Reasoning" },
  { id: "decision", label: "Decisions" },
  { id: "reflection", label: "Reflections" },
  { id: "goal_update", label: "Goal updates" },
];

type AgentRow = {
  _id: Id<"agents">;
  name: string;
};

type ThoughtRow = {
  _id: Id<"agentThoughts">;
  type: ThoughtType;
  createdAt: number;
  content: string;
  context?: string;
};

export function AgentThinkingPage() {
  const agents = useQuery(api.functions.agents.list) as AgentRow[] | undefined;
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | null>(null);
  const [selectedType, setSelectedType] = useState<"all" | ThoughtType>("all");

  const effectiveAgentId = useMemo(() => {
    if (selectedAgentId) return selectedAgentId;
    if (!agents || agents.length === 0) return null;
    const firstAgent = agents[0];
    return firstAgent ? firstAgent._id : null;
  }, [agents, selectedAgentId]);

  const thoughts = useQuery(
    api.functions.agentThinking.getAgentThoughts,
    effectiveAgentId
      ? {
          agentId: effectiveAgentId,
          limit: 100,
          type: selectedType === "all" ? undefined : selectedType,
        }
      : "skip"
  ) as ThoughtRow[] | undefined;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl animate-fade-in">
        <div>
          <h1 className="text-2xl font-semibold text-ink-0">Agent thinking</h1>
          <p className="mt-1 text-ink-1">
            View reasoning, decisions, and goal updates from each agent.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="card">
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

          <div className="card">
            <label className="block text-sm font-medium text-ink-0">Type</label>
            <select
              className="input mt-1.5"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as "all" | ThoughtType)}
            >
              {THOUGHT_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 card">
          {!effectiveAgentId ? (
            <p className="text-sm text-ink-1">Create an agent to start collecting thoughts.</p>
          ) : thoughts === undefined ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
            </div>
          ) : thoughts.length === 0 ? (
            <p className="text-sm text-ink-1">No thoughts found for this filter.</p>
          ) : (
            <div className="space-y-3">
              {thoughts.map((thought) => (
                <div
                  key={thought._id}
                  className="rounded-lg border border-surface-3 bg-surface-1 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-ink-1">
                      {thought.type.replace("_", " ")}
                    </span>
                    <span className="text-xs text-ink-2">
                      {new Date(thought.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-0">{thought.content}</p>
                  {thought.context ? (
                    <p className="mt-2 text-xs text-ink-2">Context: {thought.context}</p>
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

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { platformApi } from "../lib/platformApi";
import { notify } from "../lib/notify";
import { useEscapeKey } from "../hooks/useEscapeKey";

type AgentRow = {
  _id: Id<"agents">;
  name: string;
  slug: string;
};

type SkillRow = {
  _id: Id<"skills">;
  identity: {
    name: string;
  };
};

type TeamRow = {
  _id: Id<"agentTeams">;
  name: string;
  slug: string;
  description?: string;
  leadAgentId: Id<"agents">;
  leadAgentName?: string;
  autonomy: {
    executionMode: "manual" | "auto";
    coordinationMode: "lead_only" | "collaborative";
    allowAutonomousTaskCreation: boolean;
    allowEmailReports: boolean;
    thinkingEnabled: boolean;
  };
  memberAgentIds: Array<Id<"agents">>;
  memberAgents: Array<{
    _id: Id<"agents">;
    name: string;
    slug: string;
    role: "lead" | "member";
  }>;
  sharedSkillIds: Array<Id<"skills">>;
  sharedSkillNames: string[];
  taskCount: number;
};

function toSlug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
}

export function TeamsPage() {
  const teams = useQuery(platformApi.convex.teams.list) as TeamRow[] | undefined;
  const agents = useQuery(platformApi.convex.agents.list) as AgentRow[] | undefined;
  const skills = useQuery(platformApi.convex.skills.list, {}) as SkillRow[] | undefined;

  const createTeam = useMutation(platformApi.convex.teams.create);
  const updateTeam = useMutation(platformApi.convex.teams.update);
  const setTeamAgents = useMutation(platformApi.convex.teams.setTeamAgents);
  const setTeamSkills = useMutation(platformApi.convex.teams.setTeamSkills);
  const deleteTeam = useMutation(platformApi.convex.teams.remove);

  const [editingTeamId, setEditingTeamId] = useState<Id<"agentTeams"> | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [leadAgentId, setLeadAgentId] = useState<Id<"agents"> | "">("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<Array<Id<"agents">>>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Array<Id<"skills">>>([]);
  const [executionMode, setExecutionMode] = useState<"manual" | "auto">("auto");
  const [coordinationMode, setCoordinationMode] = useState<"lead_only" | "collaborative">(
    "collaborative"
  );
  const [allowAutonomousTaskCreation, setAllowAutonomousTaskCreation] = useState(true);
  const [allowEmailReports, setAllowEmailReports] = useState(true);
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingDeleteTeam, setPendingDeleteTeam] = useState<TeamRow | null>(null);

  useEscapeKey(() => setPendingDeleteTeam(null), !!pendingDeleteTeam);

  const sortedAgents = useMemo(
    () => [...(agents ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [agents]
  );
  const sortedSkills = useMemo(
    () =>
      [...(skills ?? [])].sort((a, b) => a.identity.name.localeCompare(b.identity.name)),
    [skills]
  );

  function resetForm() {
    setEditingTeamId(null);
    setName("");
    setSlug("");
    setDescription("");
    setLeadAgentId("");
    setSelectedAgentIds([]);
    setSelectedSkillIds([]);
    setExecutionMode("auto");
    setCoordinationMode("collaborative");
    setAllowAutonomousTaskCreation(true);
    setAllowEmailReports(true);
    setThinkingEnabled(true);
  }

  function toggleAgent(agentId: Id<"agents">) {
    setSelectedAgentIds((current) =>
      current.includes(agentId)
        ? current.filter((id) => id !== agentId)
        : [...current, agentId]
    );
  }

  function toggleSkill(skillId: Id<"skills">) {
    setSelectedSkillIds((current) =>
      current.includes(skillId)
        ? current.filter((id) => id !== skillId)
        : [...current, skillId]
    );
  }

  function startEditing(team: TeamRow) {
    setEditingTeamId(team._id);
    setName(team.name);
    setSlug(team.slug);
    setDescription(team.description ?? "");
    setLeadAgentId(team.leadAgentId);
    setSelectedAgentIds(team.memberAgentIds);
    setSelectedSkillIds(team.sharedSkillIds);
    setExecutionMode(team.autonomy.executionMode);
    setCoordinationMode(team.autonomy.coordinationMode);
    setAllowAutonomousTaskCreation(team.autonomy.allowAutonomousTaskCreation);
    setAllowEmailReports(team.autonomy.allowEmailReports);
    setThinkingEnabled(team.autonomy.thinkingEnabled);
  }

  async function handleSaveTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || !leadAgentId) {
      notify.warning("Team name, slug, and lead agent are required");
      return;
    }

    const memberAgentIds = Array.from(new Set([leadAgentId, ...selectedAgentIds]));

    setSaving(true);
    try {
      const autonomy = {
        executionMode,
        coordinationMode,
        allowAutonomousTaskCreation,
        allowEmailReports,
        thinkingEnabled,
      };

      if (editingTeamId) {
        await updateTeam({
          teamId: editingTeamId,
          name: name.trim(),
          description: description.trim() || null,
          leadAgentId,
          autonomy,
        });
        await setTeamAgents({
          teamId: editingTeamId,
          leadAgentId,
          memberAgentIds,
        });
        await setTeamSkills({
          teamId: editingTeamId,
          skillIds: selectedSkillIds,
        });
        notify.success("Team updated");
      } else {
        const teamId = await createTeam({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || undefined,
          leadAgentId,
          memberAgentIds,
          sharedSkillIds: selectedSkillIds,
          autonomy,
        });
        notify.success("Team created");
        setEditingTeamId(teamId);
      }
      resetForm();
    } catch (error) {
      notify.error("Could not save team", error);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteTeam() {
    if (!pendingDeleteTeam) return;
    try {
      await deleteTeam({ teamId: pendingDeleteTeam._id });
      notify.success("Team deleted");
      if (editingTeamId === pendingDeleteTeam._id) {
        resetForm();
      }
      setPendingDeleteTeam(null);
    } catch (error) {
      notify.error("Could not delete team", error);
    }
  }

  if (!teams || !agents || !skills) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl animate-fade-in">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink-0">Teams</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-1">
              Group agents into specialist teams, attach shared skills, and decide if the
              team should work in manual or auto mode.
            </p>
          </div>
          {editingTeamId ? (
            <button type="button" onClick={resetForm} className="btn-secondary text-sm">
              Cancel edit
            </button>
          ) : null}
        </div>

        <form onSubmit={handleSaveTeam} className="card mt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-ink-0">Team name</label>
              <input
                value={name}
                onChange={(e) => {
                  const nextName = e.target.value;
                  setName(nextName);
                  if (!editingTeamId) {
                    setSlug(toSlug(nextName));
                  }
                }}
                className="input mt-1.5"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-0">Slug</label>
              <input
                value={slug}
                onChange={(e) => setSlug(toSlug(e.target.value))}
                className="input mt-1.5"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-ink-0">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input mt-1.5 min-h-24 resize-y"
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-ink-0">Lead agent</label>
              <select
                value={leadAgentId}
                onChange={(e) => {
                  const nextLead = e.target.value as Id<"agents"> | "";
                  setLeadAgentId(nextLead);
                  if (nextLead) {
                    setSelectedAgentIds((current) =>
                      current.includes(nextLead) ? current : [...current, nextLead]
                    );
                  }
                }}
                className="input mt-1.5"
              >
                <option value="">Choose lead agent</option>
                {sortedAgents.map((agent) => (
                  <option key={agent._id} value={agent._id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-0">Execution mode</label>
              <select
                value={executionMode}
                onChange={(e) => setExecutionMode(e.target.value as "manual" | "auto")}
                className="input mt-1.5"
              >
                <option value="auto">Auto</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-ink-0">Coordination mode</label>
              <select
                value={coordinationMode}
                onChange={(e) =>
                  setCoordinationMode(
                    e.target.value as "lead_only" | "collaborative"
                  )
                }
                className="input mt-1.5"
              >
                <option value="collaborative">Collaborative</option>
                <option value="lead_only">Lead only</option>
              </select>
            </div>
            <div className="rounded-lg border border-surface-3 bg-surface-1 p-3">
              <p className="text-sm font-medium text-ink-0">Autonomy</p>
              <div className="mt-2 space-y-2">
                <label className="flex items-center gap-2 text-sm text-ink-1">
                  <input
                    type="checkbox"
                    checked={allowAutonomousTaskCreation}
                    onChange={(e) => setAllowAutonomousTaskCreation(e.target.checked)}
                    className="h-4 w-4 rounded accent-accent"
                  />
                  Allow autonomous task creation
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-1">
                  <input
                    type="checkbox"
                    checked={allowEmailReports}
                    onChange={(e) => setAllowEmailReports(e.target.checked)}
                    className="h-4 w-4 rounded accent-accent"
                  />
                  Allow email reports
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-1">
                  <input
                    type="checkbox"
                    checked={thinkingEnabled}
                    onChange={(e) => setThinkingEnabled(e.target.checked)}
                    className="h-4 w-4 rounded accent-accent"
                  />
                  Enable thinking mode
                </label>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-surface-3 bg-surface-1 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium text-ink-0">Team agents</h2>
                <span className="text-xs text-ink-2">{selectedAgentIds.length} selected</span>
              </div>
              <div className="mt-3 max-h-60 space-y-2 overflow-y-auto">
                {sortedAgents.map((agent) => (
                  <label
                    key={agent._id}
                    className="flex items-center justify-between rounded-lg border border-surface-3 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="text-ink-0">{agent.name}</p>
                      <p className="text-xs text-ink-2">{agent.slug}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedAgentIds.includes(agent._id)}
                      onChange={() => toggleAgent(agent._id)}
                      className="h-4 w-4 rounded accent-accent"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-surface-3 bg-surface-1 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium text-ink-0">Shared skills</h2>
                <span className="text-xs text-ink-2">{selectedSkillIds.length} selected</span>
              </div>
              <div className="mt-3 max-h-60 space-y-2 overflow-y-auto">
                {sortedSkills.map((skill) => (
                  <label
                    key={skill._id}
                    className="flex items-center justify-between rounded-lg border border-surface-3 px-3 py-2 text-sm"
                  >
                    <p className="text-ink-0">{skill.identity.name}</p>
                    <input
                      type="checkbox"
                      checked={selectedSkillIds.includes(skill._id)}
                      onChange={() => toggleSkill(skill._id)}
                      className="h-4 w-4 rounded accent-accent"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={resetForm} className="btn-secondary text-sm">
              Reset
            </button>
            <button type="submit" disabled={saving} className="btn-accent text-sm">
              {saving ? "Saving..." : editingTeamId ? "Save team" : "Create team"}
            </button>
          </div>
        </form>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {teams.length === 0 ? (
            <div className="card lg:col-span-2">
              <h2 className="font-medium text-ink-0">No teams yet</h2>
              <p className="mt-1 text-sm text-ink-1">
                Create your first team to let agents collaborate on shared work.
              </p>
            </div>
          ) : (
            teams.map((team) => (
              <div key={team._id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-ink-0">{team.name}</h2>
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-1">
                        {team.autonomy.executionMode}
                      </span>
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-1">
                        {team.autonomy.coordinationMode}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-2">/{team.slug}</p>
                    {team.description ? (
                      <p className="mt-2 text-sm text-ink-1">{team.description}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEditing(team)}
                      className="btn-secondary text-sm"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteTeam(team)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <InfoCard label="Lead" value={team.leadAgentName ?? "Unknown"} />
                  <InfoCard label="Members" value={String(team.memberAgents.length)} />
                  <InfoCard label="Tasks" value={String(team.taskCount)} />
                </div>

                <div className="mt-4">
                  <p className="text-sm font-medium text-ink-0">Agents</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {team.memberAgents.map((member) => (
                      <span
                        key={member._id}
                        className="rounded-full bg-surface-2 px-2 py-1 text-xs text-ink-1"
                      >
                        {member.name}
                        {member.role === "lead" ? " lead" : ""}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-sm font-medium text-ink-0">Shared skills</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {team.sharedSkillNames.length === 0 ? (
                      <span className="text-sm text-ink-2">No shared skills</span>
                    ) : (
                      team.sharedSkillNames.map((skillName) => (
                        <span
                          key={skillName}
                          className="rounded-full bg-accent/10 px-2 py-1 text-xs text-accent"
                        >
                          {skillName}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {pendingDeleteTeam ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card w-full max-w-md">
            <h2 className="font-semibold text-ink-0">Delete team</h2>
            <p className="mt-2 text-sm text-ink-1">
              Delete <span className="font-medium text-ink-0">{pendingDeleteTeam.name}</span>.
              Team members stay in your workspace. Team task assignments are cleared.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingDeleteTeam(null)}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteTeam()}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete team
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-3 bg-surface-1 p-3">
      <p className="text-xs text-ink-2">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink-0">{value}</p>
    </div>
  );
}

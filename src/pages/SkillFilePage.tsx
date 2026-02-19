import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Id } from "../../convex/_generated/dataModel";
import { notify } from "../lib/notify";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { platformApi } from "../lib/platformApi";
import { KnowledgeGraphCanvas } from "../components/KnowledgeGraphCanvas";

interface Capability {
  name: string;
  description: string;
  toolId?: string;
}

// Type for skill from DB
interface Skill {
  _id: Id<"skills">;
  userId: Id<"users">;
  agentId?: Id<"agents">;
  version: number;
  identity: { name: string; bio: string; avatar?: string };
  capabilities: Capability[];
  knowledgeDomains: string[];
  communicationPrefs: { tone: string; timezone: string; availability: string };
  isPublished: boolean;
  isActive?: boolean;
}

interface AgentOption {
  _id: Id<"agents">;
  name: string;
}

interface SkillAgentAssignment {
  skillId: Id<"skills">;
  agentId: Id<"agents">;
}

type ImportMode = "url" | "text" | "file";
type ImportPayload = { source: string; payload: string };

function parseGitHubRepoUrl(url: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    if (parts[2] === "blob" || parts[2] === "raw" || parts[2] === "tree") return null;
    return { owner: parts[0]!, repo: parts[1]! };
  } catch {
    return null;
  }
}

function toRawGitHubUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "raw.githubusercontent.com") return url;
    if (parsed.hostname !== "github.com") return url;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 5 && parts[2] === "blob") {
      const owner = parts[0];
      const repo = parts[1];
      const branch = parts[3];
      const path = parts.slice(4).join("/");
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    }
    return url;
  } catch {
    return url;
  }
}

async function loadSkillPayloadsFromUrl(inputUrl: string): Promise<ImportPayload[]> {
  const trimmed = inputUrl.trim();
  if (!trimmed) throw new Error("URL is required");

  if (trimmed.includes("skills.sh")) {
    const html = await fetch(trimmed).then((res) => {
      if (!res.ok) throw new Error("Could not load skills.sh page");
      return res.text();
    });
    const githubLink = html.match(/https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/i)?.[0];
    if (!githubLink) throw new Error("No GitHub repository found in skills.sh page");
    return loadSkillPayloadsFromUrl(githubLink);
  }

  const repoMatch = parseGitHubRepoUrl(trimmed);
  if (repoMatch) {
    const treeUrl = `https://api.github.com/repos/${repoMatch.owner}/${repoMatch.repo}/git/trees/HEAD?recursive=1`;
    const tree = await fetch(treeUrl).then((res) => {
      if (!res.ok) throw new Error("Could not read GitHub repository tree");
      return res.json() as Promise<{ tree?: Array<{ path: string; type: string }> }>;
    });
    const files = (tree.tree ?? [])
      .filter((entry) => entry.type === "blob")
      .map((entry) => entry.path)
      .filter((path) => /(^|\/)SKILL\.md$/i.test(path) || /(^|\/)skills\/.*\.md$/i.test(path))
      .slice(0, 20);

    if (files.length === 0) {
      throw new Error("No SKILL.md files found in repository");
    }

    const loaded = await Promise.all(
      files.map(async (path) => {
        const rawUrl = `https://raw.githubusercontent.com/${repoMatch.owner}/${repoMatch.repo}/HEAD/${path}`;
        const payload = await fetch(rawUrl).then((res) => {
          if (!res.ok) throw new Error(`Could not load ${path}`);
          return res.text();
        });
        return { source: rawUrl, payload };
      })
    );
    return loaded;
  }

  const singleUrl = toRawGitHubUrl(trimmed);
  const payload = await fetch(singleUrl).then((res) => {
    if (!res.ok) throw new Error("Could not load import URL");
    return res.text();
  });
  return [{ source: singleUrl, payload }];
}

export function SkillFilePage() {
  // Queries
  const agents = useQuery(api.functions.agents.list) as AgentOption[] | undefined;
  const viewer = useQuery(api.functions.users.viewer);
  // Fetch all skill-agent assignments for the current user
  const skillAgentAssignments = useQuery(api.functions.skills.listSkillAgents) as
    | SkillAgentAssignment[]
    | undefined;

  // State for agent/skill selection
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | "all" | undefined>("all");
  const [selectedSkillId, setSelectedSkillId] = useState<Id<"skills"> | undefined>(undefined);

  // Fetch skills (for selected agent or all)
  const skills = useQuery(
    api.functions.skills.list,
    selectedAgentId === "all" ? {} : selectedAgentId ? { agentId: selectedAgentId } : "skip"
  );

  // Mutations
  const updateSkill = useMutation(api.functions.skills.update);
  const createSkill = useMutation(api.functions.skills.create);
  const removeSkill = useMutation(api.functions.skills.remove);
  const publishSkill = useMutation(api.functions.skills.publish);
  const unpublishSkill = useMutation(api.functions.skills.unpublish);
  const setSkillAgentsMutation = useMutation(api.functions.skills.setSkillAgents);
  const importSkills = useMutation(api.functions.skills.importSkills);

  // Get current skill
  const currentSkill = skills?.find((s: Skill) => s._id === selectedSkillId) ?? skills?.[0];

  // Form state
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [tone, setTone] = useState("friendly and professional");
  const [customTone, setCustomTone] = useState("");
  const [availability, setAvailability] = useState("available");
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEscapeKey(() => setShowImportForm(false), showImportForm);
  useEscapeKey(() => setShowCreateForm(false), showCreateForm && !showImportForm);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillBio, setNewSkillBio] = useState("");
  const [createForAgents, setCreateForAgents] = useState<Id<"agents">[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>("url");
  const [importUrl, setImportUrl] = useState("");
  const [importText, setImportText] = useState("");
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importSucceeded, setImportSucceeded] = useState(false);

  // Load skill data into form when currentSkill changes
  useEffect(() => {
    if (currentSkill) {
      setName(currentSkill.identity.name || "");
      setBio(currentSkill.identity.bio || "");
      setTimezone(currentSkill.communicationPrefs?.timezone || "America/Los_Angeles");
      // Detect if the saved tone is a preset or custom value
      const savedTone = currentSkill.communicationPrefs?.tone || "friendly and professional";
      const presetTones = ["friendly and professional", "formal", "casual", "technical", "concise"];
      if (presetTones.includes(savedTone)) {
        setTone(savedTone);
        setCustomTone("");
      } else {
        setTone("custom");
        setCustomTone(savedTone);
      }
      setAvailability(currentSkill.communicationPrefs?.availability || "available");
      setCapabilities(currentSkill.capabilities || []);
      setDomains(currentSkill.knowledgeDomains || []);
      setSelectedSkillId(currentSkill._id);
    }
  }, [currentSkill?._id]);

  // Reset selected skill when agent filter changes
  useEffect(() => {
    setSelectedSkillId(undefined);
  }, [selectedAgentId]);

  async function handleSave() {
    if (!currentSkill) return;
    setSaving(true);
    try {
      await updateSkill({
        skillId: currentSkill._id,
        identity: { name, bio },
        capabilities,
        knowledgeDomains: domains,
        communicationPrefs: {
          tone: tone === "custom" ? customTone : tone,
          timezone,
          availability,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      notify.success("Skill saved");
    } catch (error) {
      notify.error("Could not save skill", error);
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!currentSkill) return;
    try {
      if (currentSkill.isPublished) {
        await unpublishSkill({ skillId: currentSkill._id });
        notify.success("Skill unpublished");
      } else {
        await publishSkill({ skillId: currentSkill._id });
        notify.success("Skill published");
      }
    } catch (error) {
      notify.error("Could not update publish state", error);
    }
  }

  async function handleCreateSkill() {
    if (!newSkillName.trim()) return;
    setSaving(true);
    try {
      const skillId = await createSkill({
        agentIds: createForAgents.length > 0 ? createForAgents : undefined,
        identity: { name: newSkillName, bio: newSkillBio },
      });
      setSelectedSkillId(skillId);
      setShowCreateForm(false);
      setNewSkillName("");
      setNewSkillBio("");
      setCreateForAgents([]);
      notify.success("Skill created");
    } catch (error) {
      notify.error("Could not create skill", error);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSkill() {
    if (!currentSkill) return;
    try {
      await removeSkill({ skillId: currentSkill._id });
      setSelectedSkillId(undefined);
      setShowDeleteConfirm(false);
      notify.success("Skill deleted");
    } catch (error) {
      notify.error("Could not delete skill", error);
    }
  }

  // Get agent IDs currently assigned to a skill (from junction table)
  const getAssignedAgentIds = useCallback(
    (skillId: Id<"skills">): Id<"agents">[] => {
      if (!skillAgentAssignments) return [];
      return skillAgentAssignments
        .filter((a) => a.skillId === skillId)
        .map((a) => a.agentId);
    },
    [skillAgentAssignments]
  );

  // Toggle an agent assignment on/off for the current skill
  async function handleToggleAgent(agentId: Id<"agents">) {
    if (!currentSkill) return;
    const currentIds = getAssignedAgentIds(currentSkill._id);
    const isAssigned = currentIds.includes(agentId);
    const nextIds = isAssigned
      ? currentIds.filter((id) => id !== agentId)
      : [...currentIds, agentId];
    try {
      await setSkillAgentsMutation({ skillId: currentSkill._id, agentIds: nextIds });
      notify.success(isAssigned ? "Agent removed from skill" : "Agent added to skill");
    } catch (error) {
      notify.error("Could not update assignment", error);
    }
  }

  async function handleToggleActive() {
    if (!currentSkill) return;
    const next = currentSkill.isActive === false;
    try {
      await updateSkill({ skillId: currentSkill._id, isActive: next });
      notify.success(next ? "Skill enabled" : "Skill disabled");
    } catch (error) {
      notify.error("Could not update status", error);
    }
  }

  async function handleImportSkills() {
    setImporting(true);
    setImportMessage(null);
    setImportWarnings([]);
    setImportSucceeded(false);

    try {
      let payloads: ImportPayload[] = [];
      if (importMode === "text") {
        if (!importText.trim()) throw new Error("Paste JSON or markdown to import");
        payloads = [{ source: "manual_text", payload: importText }];
      } else if (importMode === "url") {
        payloads = await loadSkillPayloadsFromUrl(importUrl);
      } else {
        if (importFiles.length === 0) throw new Error("Choose one or more files to import");
        payloads = await Promise.all(
          importFiles.map(async (file) => ({
            source: `file:${file.name}`,
            payload: await file.text(),
          }))
        );
      }

      let totalImported = 0;
      const warnings: string[] = [];
      for (const item of payloads) {
        const result = await importSkills({
          source: item.source,
          payload: item.payload,
          agentIds: createForAgents.length > 0 ? createForAgents : undefined,
          defaultIsActive: true,
        });
        totalImported += result.importedCount;
        warnings.push(...result.warnings);
      }

      setImportWarnings(warnings);
      setImportMessage(`Imported ${totalImported} skill${totalImported === 1 ? "" : "s"} successfully.`);
      setImportSucceeded(true);
      notify.success(
        "Import complete",
        `Imported ${totalImported} skill${totalImported === 1 ? "" : "s"}.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      setImportMessage(message);
      setImportSucceeded(false);
      notify.error("Import failed", error, "Could not import skills.");
    } finally {
      setImporting(false);
    }
  }

  function handleOpenImportForm() {
    setShowImportForm(true);
    setImportMode("url");
    setImportUrl("");
    setImportText("");
    setImportFiles([]);
    setCreateForAgents([]);
    setImportMessage(null);
    setImportWarnings([]);
    setImportSucceeded(false);
  }

  function handleCloseImportForm() {
    setShowImportForm(false);
    setImportMessage(null);
    setImportWarnings([]);
    setImportSucceeded(false);
  }

  function addCapability() {
    setCapabilities([...capabilities, { name: "", description: "" }]);
  }

  function updateCapability(index: number, field: keyof Capability, value: string) {
    const updated = [...capabilities];
    const existing = updated[index];
    if (existing) {
      updated[index] = { ...existing, [field]: value };
      setCapabilities(updated);
    }
  }

  function removeCapability(index: number) {
    setCapabilities(capabilities.filter((_, i) => i !== index));
  }

  function addDomain() {
    if (newDomain.trim() && !domains.includes(newDomain.trim())) {
      setDomains([...domains, newDomain.trim()]);
      setNewDomain("");
    }
  }

  function removeDomain(domain: string) {
    setDomains(domains.filter((d) => d !== domain));
  }

  // Loading state
  if (skills === undefined || agents === undefined || skillAgentAssignments === undefined) {
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
      <div className="mx-auto max-w-4xl animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink-0">Skills</h1>
            <p className="mt-1 text-ink-1">
              Define what your agents know and can do.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleOpenImportForm} className="btn-secondary">
              Import
            </button>
            <button onClick={() => setShowCreateForm(true)} className="btn-accent">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New skill
            </button>
          </div>
        </div>

        {importMessage && (
          <div className="mt-4 rounded-lg border border-surface-3 bg-surface-1 px-4 py-3 text-sm text-ink-0">
            {importMessage}
            {importWarnings.length > 0 && (
              <div className="mt-2 text-xs text-ink-1">
                {importWarnings.slice(0, 3).join(" ")}
              </div>
            )}
          </div>
        )}

        {/* Create skill modal */}
        {showCreateForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="card w-full max-w-md mx-4">
              <h2 className="font-semibold text-ink-0">Create new skill</h2>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink-0">Skill name</label>
                  <input
                    type="text"
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    className="input mt-1.5"
                    placeholder="e.g., Customer Support, Sales Assistant"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-0">Description</label>
                  <textarea
                    value={newSkillBio}
                    onChange={(e) => setNewSkillBio(e.target.value)}
                    className="input mt-1.5 resize-none"
                    rows={2}
                    placeholder="What does this skill help with?"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-0">Assign to agents (optional)</label>
                  <p className="mt-0.5 text-xs text-ink-2">Select one or more agents that will use this skill.</p>
                  <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                    {agents.map((agent: AgentOption) => {
                      const checked = createForAgents.includes(agent._id);
                      return (
                        <label
                          key={agent._id}
                          className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                            checked
                              ? "border-accent bg-accent/5"
                              : "border-surface-3 bg-surface-1 hover:bg-surface-2"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setCreateForAgents((prev) =>
                                checked
                                  ? prev.filter((id) => id !== agent._id)
                                  : [...prev, agent._id]
                              )
                            }
                            className="h-3.5 w-3.5 rounded border-surface-3 text-accent focus:ring-accent"
                          />
                          <span className="text-sm text-ink-0">{agent.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setShowCreateForm(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleCreateSkill} disabled={!newSkillName.trim() || saving} className="btn-accent">
                  {saving ? "Creating..." : "Create skill"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import skill modal */}
        {showImportForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="card w-full max-w-2xl mx-4">
              <h2 className="font-semibold text-ink-0">Import skills</h2>
              <p className="mt-1 text-sm text-ink-1">
                Import from GitHub, skills.sh links, anthropics skills repos, JSON, markdown, or local files.
              </p>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setImportMode("url")}
                  disabled={importSucceeded}
                  className={`btn-secondary ${importMode === "url" ? "border-accent text-ink-0" : ""}`}
                >
                  URL
                </button>
                <button
                  onClick={() => setImportMode("text")}
                  disabled={importSucceeded}
                  className={`btn-secondary ${importMode === "text" ? "border-accent text-ink-0" : ""}`}
                >
                  Paste text
                </button>
                <button
                  onClick={() => setImportMode("file")}
                  disabled={importSucceeded}
                  className={`btn-secondary ${importMode === "file" ? "border-accent text-ink-0" : ""}`}
                >
                  Files
                </button>
              </div>

              <div className="mt-4 space-y-4">
                {importMode === "url" && (
                  <div>
                    <label className="block text-sm font-medium text-ink-0">Import URL</label>
                    <input
                      type="url"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      disabled={importSucceeded}
                      className="input mt-1.5"
                      placeholder="https://github.com/anthropics/skills"
                    />
                    <p className="mt-1 text-xs text-ink-2">
                      Repository URLs import matching SKILL.md files. File URLs import a single skill.
                    </p>
                  </div>
                )}

                {importMode === "text" && (
                  <div>
                    <label className="block text-sm font-medium text-ink-0">Skill JSON or markdown</label>
                    <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      disabled={importSucceeded}
                      className="input mt-1.5 min-h-48 resize-y font-mono text-sm"
                      placeholder="Paste SKILL.md or JSON skill payload"
                    />
                  </div>
                )}

                {importMode === "file" && (
                  <div>
                    <label className="block text-sm font-medium text-ink-0">Upload files</label>
                    <input
                      type="file"
                      accept=".md,.json,text/markdown,application/json"
                      multiple
                      onChange={(e) => setImportFiles(Array.from(e.target.files ?? []))}
                      disabled={importSucceeded}
                      className="input mt-1.5"
                    />
                    <p className="mt-1 text-xs text-ink-2">Supports .md and .json files.</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-ink-0">Assign imported skills to agents (optional)</label>
                  <p className="mt-0.5 text-xs text-ink-2">Select agents that will use the imported skills.</p>
                  <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                    {agents.map((agent: AgentOption) => {
                      const checked = createForAgents.includes(agent._id);
                      return (
                        <label
                          key={agent._id}
                          className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                            checked
                              ? "border-accent bg-accent/5"
                              : "border-surface-3 bg-surface-1 hover:bg-surface-2"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setCreateForAgents((prev) =>
                                checked
                                  ? prev.filter((id) => id !== agent._id)
                                  : [...prev, agent._id]
                              )
                            }
                            disabled={importSucceeded}
                            className="h-3.5 w-3.5 rounded border-surface-3 text-accent focus:ring-accent"
                          />
                          <span className="text-sm text-ink-0">{agent.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                {importSucceeded ? (
                  <button onClick={handleCloseImportForm} className="btn-secondary">
                    Close
                  </button>
                ) : (
                  <>
                    <button onClick={handleCloseImportForm} className="btn-secondary">
                      Cancel
                    </button>
                    <button onClick={handleImportSkills} disabled={importing} className="btn-accent">
                      {importing ? "Importing..." : "Import"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Filters and skill list */}
        <div className="mt-6 flex flex-col lg:flex-row gap-6">
          {/* Sidebar: Skill list */}
          <div className="lg:w-64 shrink-0">
            <div className="mb-4">
              <label className="block text-sm font-medium text-ink-0 mb-1.5">Filter by agent</label>
              <select
                value={selectedAgentId ?? "all"}
                onChange={(e) => setSelectedAgentId(e.target.value === "all" ? "all" : e.target.value as Id<"agents">)}
                className="input"
              >
                <option value="all">All skills</option>
                {agents.map((agent: AgentOption) => (
                  <option key={agent._id} value={agent._id}>{agent.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              {skills.length === 0 ? (
                <div className="rounded-lg bg-surface-1 p-4 text-center text-sm text-ink-1">
                  No skills found. Create your first skill.
                </div>
              ) : (
                skills.map((skill: Skill) => {
                  const assignedIds = getAssignedAgentIds(skill._id);
                  const assignedAgentNames = assignedIds
                    .map((id) => agents.find((a: AgentOption) => a._id === id)?.name)
                    .filter(Boolean);
                  return (
                    <button
                      key={skill._id}
                      onClick={() => setSelectedSkillId(skill._id)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        selectedSkillId === skill._id || (!selectedSkillId && skills[0]?._id === skill._id)
                          ? "border-accent bg-accent/5"
                          : "border-surface-3 bg-surface-1 hover:bg-surface-2"
                      }`}
                    >
                      <div className="font-medium text-ink-0 text-sm">{skill.identity.name}</div>
                      <div className="text-xs text-ink-2 mt-0.5 flex items-center gap-2">
                        <span>v{skill.version}</span>
                        {skill.isPublished && <span className="status-online" />}
                        <span className={skill.isActive === false ? "text-yellow-500" : "text-emerald-500"}>
                          {skill.isActive === false ? "Disabled" : "Enabled"}
                        </span>
                      </div>
                      {assignedAgentNames.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {assignedAgentNames.map((name) => (
                            <span
                              key={name}
                              className="inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-1"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Main: Skill editor */}
          {currentSkill ? (
            <div className="flex-1 min-w-0">
              {/* Skill header with actions */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
                <div className="flex items-center gap-2">
                  <span className="badge-neutral">v{currentSkill.version}</span>
                  {currentSkill.isPublished && (
                    <a
                      href={`/${viewer?.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-ink-2-interactive hover:underline"
                    >
                      View public page
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="btn-secondary text-red-500 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                  <button onClick={handleToggleActive} className="btn-secondary">
                    {currentSkill.isActive === false ? "Enable" : "Disable"}
                  </button>
                  <button
                    onClick={handlePublish}
                    className={`btn-secondary ${currentSkill.isPublished ? "text-ink-2-interactive" : ""}`}
                  >
                    {currentSkill.isPublished ? (
                      <>
                        <span className="status-online" />
                        Published
                      </>
                    ) : (
                      "Publish"
                    )}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-accent"
                  >
                    {saving ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Saving
                      </>
                    ) : saved ? (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Saved
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </button>
                </div>
              </div>

              {showDeleteConfirm && (
                <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                  <p className="text-sm text-ink-0">Delete this skill permanently?</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary">
                      Cancel
                    </button>
                    <button onClick={handleDeleteSkill} className="btn-secondary text-red-500 hover:bg-red-500/10">
                      Delete skill
                    </button>
                  </div>
                </div>
              )}

              {/* Agent assignment (multi-select) */}
              <div className="card mb-6">
                <h2 className="font-semibold text-ink-0">Assigned agents</h2>
                <p className="mt-1 text-sm text-ink-1">
                  Select which agents can use this skill. A skill can work with any number of agents.
                </p>
                {agents.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-2">No agents found. Create an agent first.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {agents.map((agent: AgentOption) => {
                      const isChecked = getAssignedAgentIds(currentSkill._id).includes(agent._id);
                      return (
                        <label
                          key={agent._id}
                          className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                            isChecked
                              ? "border-accent bg-accent/5"
                              : "border-surface-3 bg-surface-1 hover:bg-surface-2"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleAgent(agent._id)}
                            className="h-4 w-4 rounded border-surface-3 text-accent focus:ring-accent"
                          />
                          <span className="text-sm font-medium text-ink-0">{agent.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Form sections */}
              <div className="space-y-6">
                {/* Identity */}
                <section className="card">
                  <h2 className="font-semibold text-ink-0">Identity</h2>
                  <p className="mt-1 text-sm text-ink-1">
                    Basic information about this skill.
                  </p>
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-ink-0">
                        Skill name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input mt-1.5"
                        placeholder="Your skill's name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink-0">
                        Description
                      </label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        className="input mt-1.5 resize-none"
                        rows={3}
                        placeholder="What does this skill help with?"
                      />
                    </div>
                  </div>
                </section>

                {/* Capabilities */}
                <section className="card">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-ink-0">Capabilities</h2>
                      <p className="mt-1 text-sm text-ink-1">
                        Actions this skill enables.
                      </p>
                    </div>
                    <button onClick={addCapability} className="btn-secondary text-sm">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Add
                    </button>
                  </div>
                  <div className="mt-5 space-y-3">
                    {capabilities.length === 0 ? (
                      <div className="rounded-lg bg-surface-1 py-8 text-center">
                        <svg className="mx-auto h-8 w-8 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                        </svg>
                        <p className="mt-2 text-sm text-ink-1">No capabilities defined</p>
                        <button onClick={addCapability} className="mt-3 text-sm text-ink-2-interactive hover:underline">
                          Add your first capability
                        </button>
                      </div>
                    ) : (
                      capabilities.map((cap, i) => (
                        <div key={i} className="rounded-lg border border-surface-3 bg-surface-1 p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 space-y-3">
                              <input
                                type="text"
                                value={cap.name}
                                onChange={(e) => updateCapability(i, "name", e.target.value)}
                                className="input"
                                placeholder="Capability name (e.g., schedule_meeting)"
                              />
                              <textarea
                                value={cap.description}
                                onChange={(e) => updateCapability(i, "description", e.target.value)}
                                className="input resize-none"
                                rows={2}
                                placeholder="What does this capability do?"
                              />
                            </div>
                            <button
                              onClick={() => removeCapability(i)}
                              className="rounded p-1.5 text-ink-2 hover:bg-surface-2 hover:text-red-500 transition-colors"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {/* Knowledge domains */}
                <section className="card">
                  <h2 className="font-semibold text-ink-0">Knowledge domains</h2>
                  <p className="mt-1 text-sm text-ink-1">
                    Topics this skill covers.
                  </p>
                  <div className="mt-5">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDomain())}
                        className="input flex-1"
                        placeholder="Add a domain (e.g., JavaScript, Marketing)"
                      />
                      <button onClick={addDomain} className="btn-secondary">
                        Add
                      </button>
                    </div>
                    {domains.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {domains.map((domain) => (
                          <span
                            key={domain}
                            className="inline-flex items-center gap-1.5 rounded-full bg-surface-1 px-3 py-1 text-sm text-ink-0"
                          >
                            {domain}
                            <button
                              onClick={() => removeDomain(domain)}
                              className="rounded-full p-0.5 hover:bg-surface-2 transition-colors"
                            >
                              <svg className="h-3 w-3 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                {/* Communication preferences */}
                <section className="card">
                  <h2 className="font-semibold text-ink-0">Communication preferences</h2>
                  <p className="mt-1 text-sm text-ink-1">
                    How this skill communicates.
                  </p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-ink-0">
                        Tone
                      </label>
                      <select
                        value={tone}
                        onChange={(e) => setTone(e.target.value)}
                        className="input mt-1.5"
                      >
                        <option value="friendly and professional">Friendly and professional</option>
                        <option value="formal">Formal</option>
                        <option value="casual">Casual</option>
                        <option value="technical">Technical</option>
                        <option value="concise">Concise</option>
                        <option value="custom">Custom</option>
                      </select>
                      {/* Text input for custom tone */}
                      {tone === "custom" && (
                        <input
                          type="text"
                          value={customTone}
                          onChange={(e) => setCustomTone(e.target.value)}
                          placeholder="Describe your preferred tone"
                          className="input mt-2"
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink-0">
                        Availability
                      </label>
                      <select
                        value={availability}
                        onChange={(e) => setAvailability(e.target.value)}
                        className="input mt-1.5"
                      >
                        <option value="available">Available</option>
                        <option value="busy">Busy</option>
                        <option value="away">Away</option>
                        <option value="dnd">Do not disturb</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-ink-0">
                        Timezone
                      </label>
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="input mt-1.5"
                      >
                        <option value="America/Los_Angeles">Pacific Time (PT)</option>
                        <option value="America/Denver">Mountain Time (MT)</option>
                        <option value="America/Chicago">Central Time (CT)</option>
                        <option value="America/New_York">Eastern Time (ET)</option>
                        <option value="Europe/London">London (GMT)</option>
                        <option value="Europe/Paris">Paris (CET)</option>
                        <option value="Asia/Tokyo">Tokyo (JST)</option>
                        <option value="Asia/Shanghai">Shanghai (CST)</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Knowledge Graph */}
                <KnowledgeGraphSection
                  skillId={currentSkill._id}
                  assignedAgentIds={getAssignedAgentIds(currentSkill._id)}
                  agents={agents}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center py-12">
                <svg className="mx-auto h-12 w-12 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-ink-0">No skills yet</h3>
                <p className="mt-2 text-sm text-ink-1">
                  Create your first skill to define what your agents can do.
                </p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="btn-accent mt-6"
                >
                  Create skill
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

// -- Knowledge Graph Section --

const NODE_TYPES = [
  { value: "concept", label: "Concept" },
  { value: "technique", label: "Technique" },
  { value: "reference", label: "Reference" },
  { value: "moc", label: "Map of Content" },
  { value: "claim", label: "Claim" },
  { value: "procedure", label: "Procedure" },
] as const;

type NodeType = typeof NODE_TYPES[number]["value"];

interface KnowledgeNode {
  _id: Id<"knowledgeNodes">;
  title: string;
  description: string;
  content: string;
  nodeType: NodeType;
  tags: string[];
  linkedNodeIds: Id<"knowledgeNodes">[];
  isPublished: boolean;
  createdAt: number;
  updatedAt: number;
}

function KnowledgeGraphSection({
  skillId,
  assignedAgentIds,
  agents,
}: {
  skillId: Id<"skills">;
  assignedAgentIds: Id<"agents">[];
  agents: AgentOption[];
}) {
  const nodes = useQuery(platformApi.convex.knowledgeGraph.listNodes, { skillId }) as KnowledgeNode[] | undefined;
  const stats = useQuery(platformApi.convex.knowledgeGraph.getGraphStats, { skillId });
  const llmProviderStatus = useQuery(platformApi.convex.settings.getCredentialStatus);
  const createNode = useMutation(platformApi.convex.knowledgeGraph.createNode);
  const updateNode = useMutation(platformApi.convex.knowledgeGraph.updateNode);
  const deleteNode = useMutation(platformApi.convex.knowledgeGraph.deleteNode);
  const linkNodesMut = useMutation(platformApi.convex.knowledgeGraph.linkNodes);
  const unlinkNodesMut = useMutation(platformApi.convex.knowledgeGraph.unlinkNodes);
  const triggerAutoGenerate = useMutation(platformApi.convex.knowledgeGraph.triggerAutoGenerate);

  const [showCreateNode, setShowCreateNode] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Id<"knowledgeNodes"> | null>(null);
  const [editingNode, setEditingNode] = useState<Id<"knowledgeNodes"> | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "graph">("list");
  const [generating, setGenerating] = useState(false);
  const [autoGenAgent, setAutoGenAgent] = useState<Id<"agents"> | "">(
    assignedAgentIds[0] ?? ""
  );

  // Create form state
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newNodeType, setNewNodeType] = useState<NodeType>("concept");
  const [newTags, setNewTags] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editNodeType, setEditNodeType] = useState<NodeType>("concept");
  const [editTags, setEditTags] = useState("");
  const [saving, setSaving] = useState(false);

  // Link state
  const [linkingFrom, setLinkingFrom] = useState<Id<"knowledgeNodes"> | null>(null);

  useEscapeKey(() => {
    setShowCreateNode(false);
    setSelectedNode(null);
    setEditingNode(null);
    setLinkingFrom(null);
  }, showCreateNode || !!selectedNode || !!editingNode || !!linkingFrom);

  const editNode = nodes?.find((n) => n._id === editingNode);

  useEffect(() => {
    if (editNode) {
      setEditTitle(editNode.title);
      setEditDescription(editNode.description);
      setEditContent(editNode.content);
      setEditNodeType(editNode.nodeType);
      setEditTags(editNode.tags.join(", "));
    }
  }, [editNode?._id]);

  // Check if any LLM provider is configured
  const hasLlmConfigured = llmProviderStatus
    ? Object.values(llmProviderStatus).some(
        (s) => s && typeof s === "object" && "configured" in s && s.configured
      )
    : false;

  async function handleAutoGenerate() {
    if (!autoGenAgent || generating) return;
    setGenerating(true);
    try {
      await triggerAutoGenerate({
        skillId,
        agentId: autoGenAgent as Id<"agents">,
      });
      notify.success(
        "Graph generation started",
        "Your LLM is analyzing the skill. Nodes will appear shortly."
      );
    } catch (error) {
      notify.error("Could not start generation", error);
    } finally {
      // Keep generating state for a few seconds since the action runs async
      setTimeout(() => setGenerating(false), 8000);
    }
  }

  async function handleCreateNode() {
    if (!newTitle.trim() || !newContent.trim()) return;
    setCreating(true);
    try {
      await createNode({
        skillId,
        title: newTitle,
        description: newDescription || newTitle,
        content: newContent,
        nodeType: newNodeType,
        tags: newTags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setShowCreateNode(false);
      setNewTitle("");
      setNewDescription("");
      setNewContent("");
      setNewNodeType("concept");
      setNewTags("");
      notify.success("Knowledge node created");
    } catch (error) {
      notify.error("Could not create node", error);
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateNode() {
    if (!editingNode) return;
    setSaving(true);
    try {
      await updateNode({
        nodeId: editingNode,
        title: editTitle,
        description: editDescription,
        content: editContent,
        nodeType: editNodeType,
        tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setEditingNode(null);
      notify.success("Node updated");
    } catch (error) {
      notify.error("Could not update node", error);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteNode(nodeId: Id<"knowledgeNodes">) {
    try {
      await deleteNode({ nodeId });
      if (selectedNode === nodeId) setSelectedNode(null);
      if (editingNode === nodeId) setEditingNode(null);
      notify.success("Node deleted");
    } catch (error) {
      notify.error("Could not delete node", error);
    }
  }

  async function handleLinkTo(targetId: Id<"knowledgeNodes">) {
    if (!linkingFrom || linkingFrom === targetId) return;
    try {
      await linkNodesMut({ sourceNodeId: linkingFrom, targetNodeId: targetId });
      setLinkingFrom(null);
      notify.success("Nodes linked");
    } catch (error) {
      notify.error("Could not link nodes", error);
    }
  }

  async function handleUnlink(sourceId: Id<"knowledgeNodes">, targetId: Id<"knowledgeNodes">) {
    try {
      await unlinkNodesMut({ sourceNodeId: sourceId, targetNodeId: targetId });
      notify.success("Link removed");
    } catch (error) {
      notify.error("Could not unlink nodes", error);
    }
  }

  const nodeCount = nodes?.length ?? 0;

  return (
    <section className="card">
      {/* Header with view toggle and actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-ink-0">Knowledge Graph</h2>
          <p className="mt-1 text-sm text-ink-1">
            Interconnected knowledge nodes your agent traverses for context.
            {nodeCount > 0 && (
              <span className="ml-2 text-ink-2">
                {nodeCount} node{nodeCount !== 1 ? "s" : ""}
                {stats?.byType && Object.keys(stats.byType).length > 0 && (
                  <span className="ml-1">
                    ({Object.entries(stats.byType as Record<string, number>)
                      .map(([type, count]) => `${count} ${type}`)
                      .join(", ")})
                  </span>
                )}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View mode toggle */}
          {nodeCount > 0 && (
            <div className="flex rounded-lg border border-surface-3 overflow-hidden">
              <button
                onClick={() => setViewMode("list")}
                className={`px-2.5 py-1.5 text-xs transition-colors ${
                  viewMode === "list"
                    ? "bg-surface-2 text-ink-0"
                    : "text-ink-2 hover:text-ink-1"
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("graph")}
                className={`px-2.5 py-1.5 text-xs transition-colors ${
                  viewMode === "graph"
                    ? "bg-surface-2 text-ink-0"
                    : "text-ink-2 hover:text-ink-1"
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
              </button>
            </div>
          )}
          <button onClick={() => setShowCreateNode(true)} className="btn-secondary text-sm">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add node
          </button>
        </div>
      </div>

      {/* Auto Generate section */}
      <div className="mt-4 rounded-lg border border-surface-3 bg-surface-1 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-ink-0">Auto Generate</p>
            <p className="mt-0.5 text-xs text-ink-2">
              {hasLlmConfigured
                ? "Use your connected LLM to analyze this skill and generate a knowledge graph automatically."
                : "Connect an LLM provider in Settings to enable auto generation."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {agents.length > 1 && hasLlmConfigured && (
              <select
                value={autoGenAgent}
                onChange={(e) => setAutoGenAgent(e.target.value as Id<"agents">)}
                className="input text-xs py-1.5"
                disabled={generating}
              >
                <option value="">Select agent</option>
                {agents.map((agent) => (
                  <option key={agent._id} value={agent._id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={handleAutoGenerate}
              disabled={!hasLlmConfigured || !autoGenAgent || generating}
              className="btn-accent text-sm"
              title={
                !hasLlmConfigured
                  ? "Configure an LLM provider in Settings first"
                  : !autoGenAgent
                    ? "Select an agent"
                    : undefined
              }
            >
              {generating ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Generating...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                  </svg>
                  Auto Generate
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Create node form */}
      {showCreateNode && (
        <div className="mt-4 rounded-lg border border-accent/30 bg-surface-1 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-ink-0">Title</label>
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="input mt-1" placeholder="Node title" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-0">Type</label>
              <select value={newNodeType} onChange={(e) => setNewNodeType(e.target.value as NodeType)} className="input mt-1">
                {NODE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-0">Description (scannable summary, under 200 chars)</label>
            <input type="text" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="input mt-1" placeholder="Short description for progressive disclosure" maxLength={200} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-0">Content (full knowledge, supports markdown)</label>
            <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} className="input mt-1 resize-y min-h-32 font-mono text-sm" placeholder="Full node content. Use [[Node Title]] to reference other nodes." />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-0">Tags (comma separated)</label>
            <input type="text" value={newTags} onChange={(e) => setNewTags(e.target.value)} className="input mt-1" placeholder="e.g., react, performance, architecture" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreateNode(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={handleCreateNode} disabled={creating || !newTitle.trim() || !newContent.trim()} className="btn-accent text-sm">
              {creating ? "Creating..." : "Create node"}
            </button>
          </div>
        </div>
      )}

      {/* Linking mode banner */}
      {linkingFrom && (
        <div className="mt-4 rounded-lg border border-accent bg-accent/10 p-3 text-sm text-ink-0 flex items-center justify-between">
          <span>
            Select a target node to link with <strong>{nodes?.find((n) => n._id === linkingFrom)?.title}</strong>
          </span>
          <button onClick={() => setLinkingFrom(null)} className="btn-secondary text-xs">Cancel</button>
        </div>
      )}

      {/* Graph view */}
      {viewMode === "graph" && nodes && nodes.length > 0 && (
        <div className="mt-4">
          <KnowledgeGraphCanvas
            nodes={nodes}
            selectedNodeId={selectedNode}
            onNodeClick={(id) =>
              setSelectedNode(selectedNode === id ? null : (id as Id<"knowledgeNodes">))
            }
          />
        </div>
      )}

      {/* Node list (shown in list mode or as detail below graph) */}
      {(viewMode === "list" || !nodes?.length) && (
        <div className="mt-4 space-y-2">
          {!nodes ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
            </div>
          ) : nodes.length === 0 ? (
            <div className="rounded-lg bg-surface-1 py-8 text-center">
              <svg className="mx-auto h-8 w-8 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
              <p className="mt-2 text-sm text-ink-1">No knowledge nodes yet</p>
              <p className="mt-1 text-xs text-ink-2">
                Add nodes manually or use Auto Generate to build a traversable knowledge graph.
              </p>
            </div>
          ) : (
            nodes.map((node) => (
              <div
                key={node._id}
                className={`rounded-lg border p-3 transition-colors ${
                  selectedNode === node._id
                    ? "border-accent bg-accent/5"
                    : linkingFrom
                      ? "border-surface-3 bg-surface-1 hover:border-accent cursor-pointer"
                      : "border-surface-3 bg-surface-1 hover:bg-surface-2"
                }`}
                onClick={() => {
                  if (linkingFrom && linkingFrom !== node._id) {
                    handleLinkTo(node._id);
                  } else {
                    setSelectedNode(selectedNode === node._id ? null : node._id);
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-ink-0">{node.title}</span>
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-2 uppercase tracking-wide">
                        {node.nodeType}
                      </span>
                      {node.linkedNodeIds.length > 0 && (
                        <span className="text-[10px] text-ink-2">
                          {node.linkedNodeIds.length} link{node.linkedNodeIds.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-1 line-clamp-1">{node.description}</p>
                    {node.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {node.tags.slice(0, 5).map((tag) => (
                          <span key={tag} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-2">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setLinkingFrom(node._id); }}
                      className="rounded p-1.5 text-ink-2 hover:bg-surface-2 transition-colors"
                      title="Link to another node"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.818a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.28 8.57" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingNode(node._id); }}
                      className="rounded p-1.5 text-ink-2 hover:bg-surface-2 transition-colors"
                      title="Edit node"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteNode(node._id); }}
                      className="rounded p-1.5 text-ink-2 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                      title="Delete node"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Expanded detail view */}
                {selectedNode === node._id && !linkingFrom && (
                  <div className="mt-3 border-t border-surface-3 pt-3">
                    <div className="prose prose-sm max-w-none text-ink-0">
                      <pre className="whitespace-pre-wrap text-xs bg-surface-2 rounded p-3 overflow-x-auto">{node.content}</pre>
                    </div>
                    {node.linkedNodeIds.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-ink-0 mb-1.5">Linked nodes</p>
                        <div className="space-y-1">
                          {node.linkedNodeIds.map((linkedId) => {
                            const linked = nodes.find((n) => n._id === linkedId);
                            if (!linked) return null;
                            return (
                              <div key={linkedId} className="flex items-center justify-between rounded bg-surface-2 px-2.5 py-1.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelectedNode(linkedId); }}
                                  className="text-xs text-ink-2-interactive hover:underline"
                                >
                                  {linked.title}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleUnlink(node._id, linkedId); }}
                                  className="text-[10px] text-ink-2 hover:text-red-500"
                                >
                                  unlink
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Selected node detail panel (shown below graph view) */}
      {viewMode === "graph" && selectedNode && nodes && (
        <SelectedNodeDetail
          node={nodes.find((n) => n._id === selectedNode) ?? null}
          nodes={nodes}
          onClose={() => setSelectedNode(null)}
          onEdit={(id) => setEditingNode(id)}
          onDelete={handleDeleteNode}
          onUnlink={handleUnlink}
          onNavigate={setSelectedNode}
        />
      )}

      {/* Edit node modal */}
      {editingNode && editNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="card w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="font-semibold text-ink-0">Edit knowledge node</h2>
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-ink-0">Title</label>
                  <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="input mt-1" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink-0">Type</label>
                  <select value={editNodeType} onChange={(e) => setEditNodeType(e.target.value as NodeType)} className="input mt-1">
                    {NODE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-0">Description</label>
                <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="input mt-1" maxLength={200} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-0">Content</label>
                <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="input mt-1 resize-y min-h-40 font-mono text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-0">Tags (comma separated)</label>
                <input type="text" value={editTags} onChange={(e) => setEditTags(e.target.value)} className="input mt-1" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setEditingNode(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleUpdateNode} disabled={saving} className="btn-accent">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Detail panel shown below graph view when a node is selected */
function SelectedNodeDetail({
  node,
  nodes,
  onClose,
  onEdit,
  onDelete,
  onUnlink,
  onNavigate,
}: {
  node: KnowledgeNode | null;
  nodes: KnowledgeNode[];
  onClose: () => void;
  onEdit: (id: Id<"knowledgeNodes">) => void;
  onDelete: (id: Id<"knowledgeNodes">) => void;
  onUnlink: (source: Id<"knowledgeNodes">, target: Id<"knowledgeNodes">) => void;
  onNavigate: (id: Id<"knowledgeNodes">) => void;
}) {
  if (!node) return null;

  return (
    <div className="mt-3 rounded-lg border border-accent/30 bg-surface-1 p-4 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-ink-0">{node.title}</span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-2 uppercase tracking-wide">
              {node.nodeType}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-1">{node.description}</p>
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button onClick={() => onEdit(node._id)} className="rounded p-1.5 text-ink-2 hover:bg-surface-2 transition-colors" title="Edit">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
          <button onClick={() => onDelete(node._id)} className="rounded p-1.5 text-ink-2 hover:bg-red-500/10 hover:text-red-500 transition-colors" title="Delete">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <button onClick={onClose} className="rounded p-1.5 text-ink-2 hover:bg-surface-2 transition-colors" title="Close">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <pre className="mt-3 whitespace-pre-wrap text-xs bg-surface-2 rounded p-3 overflow-x-auto text-ink-0 max-h-48 overflow-y-auto">
        {node.content}
      </pre>
      {node.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {node.tags.map((tag) => (
            <span key={tag} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-2">{tag}</span>
          ))}
        </div>
      )}
      {node.linkedNodeIds.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-ink-0 mb-1.5">Linked nodes</p>
          <div className="flex flex-wrap gap-1.5">
            {node.linkedNodeIds.map((linkedId) => {
              const linked = nodes.find((n) => n._id === linkedId);
              if (!linked) return null;
              return (
                <button
                  key={linkedId}
                  onClick={() => onNavigate(linkedId)}
                  className="rounded bg-surface-2 px-2 py-1 text-xs text-ink-2-interactive hover:bg-surface-3 transition-colors"
                >
                  {linked.title}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

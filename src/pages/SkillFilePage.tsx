import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Id } from "../../convex/_generated/dataModel";

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
  isActive?: boolean; // Optional for backwards compatibility
}

interface AgentOption {
  _id: Id<"agents">;
  name: string;
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
  const assignToAgent = useMutation(api.functions.skills.assignToAgent);
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
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillBio, setNewSkillBio] = useState("");
  const [createForAgent, setCreateForAgent] = useState<Id<"agents"> | undefined>(undefined);
  const [importMode, setImportMode] = useState<ImportMode>("url");
  const [importUrl, setImportUrl] = useState("");
  const [importText, setImportText] = useState("");
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);

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
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!currentSkill) return;
    if (currentSkill.isPublished) {
      await unpublishSkill({ skillId: currentSkill._id });
    } else {
      await publishSkill({ skillId: currentSkill._id });
    }
  }

  async function handleCreateSkill() {
    if (!newSkillName.trim()) return;
    setSaving(true);
    try {
      const skillId = await createSkill({
        agentId: createForAgent,
        identity: { name: newSkillName, bio: newSkillBio },
      });
      setSelectedSkillId(skillId);
      setShowCreateForm(false);
      setNewSkillName("");
      setNewSkillBio("");
      setCreateForAgent(undefined);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSkill() {
    if (!currentSkill) return;
    await removeSkill({ skillId: currentSkill._id });
    setSelectedSkillId(undefined);
    setShowDeleteConfirm(false);
  }

  async function handleAssignToAgent(agentId: Id<"agents"> | null) {
    if (!currentSkill) return;
    await assignToAgent({ skillId: currentSkill._id, agentId });
  }

  async function handleToggleActive() {
    if (!currentSkill) return;
    const next = currentSkill.isActive === false;
    await updateSkill({ skillId: currentSkill._id, isActive: next });
  }

  async function handleImportSkills() {
    setImporting(true);
    setImportMessage(null);
    setImportWarnings([]);

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
          agentId: createForAgent,
          defaultIsActive: true,
        });
        totalImported += result.importedCount;
        warnings.push(...result.warnings);
      }

      setImportWarnings(warnings);
      setImportMessage(`Imported ${totalImported} skill${totalImported === 1 ? "" : "s"} successfully.`);
      setShowImportForm(false);
      setImportUrl("");
      setImportText("");
      setImportFiles([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      setImportMessage(message);
    } finally {
      setImporting(false);
    }
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
  if (skills === undefined || agents === undefined) {
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
            <button onClick={() => setShowImportForm(true)} className="btn-secondary">
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
                  <label className="block text-sm font-medium text-ink-0">Assign to agent (optional)</label>
                  <select
                    value={createForAgent ?? ""}
                    onChange={(e) => setCreateForAgent(e.target.value ? e.target.value as Id<"agents"> : undefined)}
                    className="input mt-1.5"
                  >
                    <option value="">No agent (unassigned)</option>
                    {agents.map((agent: AgentOption) => (
                      <option key={agent._id} value={agent._id}>{agent.name}</option>
                    ))}
                  </select>
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
                  className={`btn-secondary ${importMode === "url" ? "border-accent text-ink-0" : ""}`}
                >
                  URL
                </button>
                <button
                  onClick={() => setImportMode("text")}
                  className={`btn-secondary ${importMode === "text" ? "border-accent text-ink-0" : ""}`}
                >
                  Paste text
                </button>
                <button
                  onClick={() => setImportMode("file")}
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
                      className="input mt-1.5"
                    />
                    <p className="mt-1 text-xs text-ink-2">Supports .md and .json files.</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-ink-0">Assign imported skills to agent (optional)</label>
                  <select
                    value={createForAgent ?? ""}
                    onChange={(e) => setCreateForAgent(e.target.value ? e.target.value as Id<"agents"> : undefined)}
                    className="input mt-1.5"
                  >
                    <option value="">No agent (unassigned)</option>
                    {agents.map((agent: AgentOption) => (
                      <option key={agent._id} value={agent._id}>{agent.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setShowImportForm(false)} className="btn-secondary">
                  Cancel
                </button>
                <button onClick={handleImportSkills} disabled={importing} className="btn-accent">
                  {importing ? "Importing..." : "Import"}
                </button>
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
                  const agentName = agents.find((a: AgentOption) => a._id === skill.agentId)?.name;
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
                        {agentName && <span className="text-ink-1">{agentName}</span>}
                      </div>
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

              {/* Agent assignment */}
              <div className="card mb-6">
                <h2 className="font-semibold text-ink-0">Assigned agent</h2>
                <p className="mt-1 text-sm text-ink-1">Which agent should use this skill?</p>
                <select
                  value={currentSkill.agentId ?? ""}
                  onChange={(e) => handleAssignToAgent(e.target.value ? e.target.value as Id<"agents"> : null)}
                  className="input mt-3"
                >
                  <option value="">Unassigned</option>
                  {agents.map((agent: AgentOption) => (
                    <option key={agent._id} value={agent._id}>{agent.name}</option>
                  ))}
                </select>
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

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

export function SkillFilePage() {
  // Queries
  const agents = useQuery(api.functions.agents.list);
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

  // Get current skill
  const currentSkill = skills?.find((s: Skill) => s._id === selectedSkillId) ?? skills?.[0];

  // Form state
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [tone, setTone] = useState("friendly and professional");
  const [availability, setAvailability] = useState("available");
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillBio, setNewSkillBio] = useState("");
  const [createForAgent, setCreateForAgent] = useState<Id<"agents"> | undefined>(undefined);

  // Load skill data into form when currentSkill changes
  useEffect(() => {
    if (currentSkill) {
      setName(currentSkill.identity.name || "");
      setBio(currentSkill.identity.bio || "");
      setTimezone(currentSkill.communicationPrefs?.timezone || "America/Los_Angeles");
      setTone(currentSkill.communicationPrefs?.tone || "friendly and professional");
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
        communicationPrefs: { tone, timezone, availability },
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
    if (!confirm("Delete this skill? This cannot be undone.")) return;
    await removeSkill({ skillId: currentSkill._id });
    setSelectedSkillId(undefined);
  }

  async function handleAssignToAgent(agentId: Id<"agents"> | null) {
    if (!currentSkill) return;
    await assignToAgent({ skillId: currentSkill._id, agentId });
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
          <button
            onClick={() => setShowCreateForm(true)}
            className="btn-accent"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New skill
          </button>
        </div>

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
                    {agents.map((agent) => (
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
                {agents.map((agent) => (
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
                  const agentName = agents.find((a) => a._id === skill.agentId)?.name;
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
                    onClick={handleDeleteSkill}
                    className="btn-secondary text-red-500 hover:bg-red-500/10"
                  >
                    Delete
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
                  {agents.map((agent) => (
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
                      </select>
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

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Id } from "../../convex/_generated/dataModel";
import { notify } from "../lib/notify";
import { useVoiceChat } from "../hooks/useVoiceChat";

interface ChatMessage {
  role: "agent" | "external";
  content: string;
  timestamp: number;
}

interface AgentChat {
  _id: Id<"conversations">;
  agentId?: Id<"agents">;
  messages: Array<ChatMessage>;
  createdAt: number;
}

interface AgentListItem {
  _id: Id<"agents">;
  name: string;
  slug: string;
  description?: string;
  isDefault: boolean;
}

type SetupField = "mission" | "style" | "name";

interface SetupOption {
  key: "A" | "B" | "C" | "D";
  label: string;
  value: string;
}

interface SetupStep {
  field: SetupField;
  prompt: string;
  placeholder: string;
  options: Array<SetupOption>;
}

interface SetupState {
  origin: "empty" | "slash";
  answers: Partial<Record<SetupField, string>>;
}

type SlashCommand =
  | { type: "new"; seed?: string }
  | { type: "switch"; target: string }
  | { type: "help" }
  | { type: "cancel" }
  | { type: "unknown" };

const MISSION_OPTIONS: Array<SetupOption> = [
  { key: "A", label: "Plan a project or next steps", value: "Plan a project or next steps" },
  { key: "B", label: "Build a workflow or feature", value: "Build a workflow or feature" },
  { key: "C", label: "Research and analyze something", value: "Research and analyze something" },
  { key: "D", label: "Handle communication or support", value: "Handle communication or support" },
];

const STYLE_OPTIONS: Array<SetupOption> = [
  { key: "A", label: "Fast and concise", value: "Fast and concise" },
  { key: "B", label: "Strategic and structured", value: "Strategic and structured" },
  { key: "C", label: "Friendly and collaborative", value: "Friendly and collaborative" },
  { key: "D", label: "Execution first", value: "Execution first" },
];

function slugifyAgentName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function buildUniqueAgentSlug(name: string, agents: Array<AgentListItem>): string {
  const base = slugifyAgentName(name) || "agent";
  const existing = new Set(agents.map((agent) => agent.slug));
  if (!existing.has(base)) {
    return base;
  }
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function parseSlashCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const [rawCommand, ...rest] = trimmed.slice(1).split(/\s+/);
  const command = rawCommand?.toLowerCase() ?? "";
  const remainder = rest.join(" ").trim();

  if (command === "new" || command === "new-agent" || command === "create-agent") {
    return { type: "new", seed: remainder || undefined };
  }
  if (command === "agent" || command === "use") {
    return { type: "switch", target: remainder };
  }
  if (command === "help") {
    return { type: "help" };
  }
  if (command === "cancel") {
    return { type: "cancel" };
  }
  return { type: "unknown" };
}

function getSetupNameOptions(mission?: string): Array<SetupOption> {
  const normalized = mission?.toLowerCase() ?? "";
  if (normalized.includes("research") || normalized.includes("analyze")) {
    return [
      { key: "A", label: "Analyst", value: "Analyst" },
      { key: "B", label: "Scout", value: "Scout" },
      { key: "C", label: "Brief", value: "Brief" },
      { key: "D", label: "Radar", value: "Radar" },
    ];
  }
  if (normalized.includes("communication") || normalized.includes("support")) {
    return [
      { key: "A", label: "Signal", value: "Signal" },
      { key: "B", label: "Relay", value: "Relay" },
      { key: "C", label: "Support", value: "Support" },
      { key: "D", label: "Reply", value: "Reply" },
    ];
  }
  if (normalized.includes("plan") || normalized.includes("project")) {
    return [
      { key: "A", label: "Planner", value: "Planner" },
      { key: "B", label: "Guide", value: "Guide" },
      { key: "C", label: "Navigator", value: "Navigator" },
      { key: "D", label: "Pilot", value: "Pilot" },
    ];
  }
  return [
    { key: "A", label: "Builder", value: "Builder" },
    { key: "B", label: "Operator", value: "Operator" },
    { key: "C", label: "Launch", value: "Launch" },
    { key: "D", label: "Maker", value: "Maker" },
  ];
}

function getCurrentSetupStep(setupState: SetupState): SetupStep {
  if (!setupState.answers.mission) {
    return {
      field: "mission",
      prompt: "What should this new agent help with first",
      placeholder: "Type a task, or answer with A, B, C, or D",
      options: MISSION_OPTIONS,
    };
  }
  if (!setupState.answers.style) {
    return {
      field: "style",
      prompt: "How should the agent work",
      placeholder: "Type a working style, or answer with A, B, C, or D",
      options: STYLE_OPTIONS,
    };
  }
  return {
    field: "name",
    prompt: "Pick a name for the agent",
    placeholder: "Type a name, or answer with A, B, C, or D",
    options: getSetupNameOptions(setupState.answers.mission),
  };
}

function resolveSetupAnswer(step: SetupStep, input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = step.options.find((option) => {
    const normalized = trimmed.toLowerCase();
    return (
      normalized === option.key.toLowerCase() ||
      normalized === option.label.toLowerCase() ||
      normalized === option.value.toLowerCase()
    );
  });
  return match?.value ?? trimmed;
}

function buildSetupIntro(origin: SetupState["origin"]): string {
  if (origin === "empty") {
    return "No agent is set up for chat yet. I can create one here. Pick A, B, C, or D, or type your own answer.";
  }
  return "Creating a new agent in chat. Pick A, B, C, or D, or type your own answer.";
}

function findMatchingAgent(
  target: string,
  agents: Array<AgentListItem>
): { kind: "match"; agent: AgentListItem } | { kind: "multiple" } | { kind: "none" } {
  const normalized = target.trim().toLowerCase();
  if (!normalized) {
    return { kind: "none" };
  }

  const exact = agents.find(
    (agent) =>
      agent.slug.toLowerCase() === normalized || agent.name.trim().toLowerCase() === normalized
  );
  if (exact) {
    return { kind: "match", agent: exact };
  }

  const partialMatches = agents.filter(
    (agent) =>
      agent.slug.toLowerCase().includes(normalized) ||
      agent.name.trim().toLowerCase().includes(normalized)
  );
  if (partialMatches.length === 1) {
    return { kind: "match", agent: partialMatches[0]! };
  }
  if (partialMatches.length > 1) {
    return { kind: "multiple" };
  }
  return { kind: "none" };
}

function getAgentSuggestions(target: string, agents: Array<AgentListItem>): Array<AgentListItem> {
  const normalized = target.trim().toLowerCase();
  const ranked = agents
    .map((agent) => {
      const name = agent.name.trim().toLowerCase();
      const slug = agent.slug.toLowerCase();
      let rank = 4;

      if (!normalized) {
        rank = agent.isDefault ? 0 : 1;
      } else if (name === normalized || slug === normalized) {
        rank = 0;
      } else if (name.startsWith(normalized) || slug.startsWith(normalized)) {
        rank = 1;
      } else if (name.includes(normalized) || slug.includes(normalized)) {
        rank = 2;
      }

      return { agent, rank };
    })
    .filter((entry) => entry.rank < 4)
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      if (left.agent.isDefault !== right.agent.isDefault) {
        return left.agent.isDefault ? -1 : 1;
      }
      return left.agent.name.localeCompare(right.agent.name);
    });

  return ranked.slice(0, 6).map((entry) => entry.agent);
}

export function AgentChatPage() {
  const agents = useQuery(api.functions.agents.list) as Array<AgentListItem> | undefined;
  const chats = useQuery(api.functions.conversations.listAgentChats, {}) as
    | Array<AgentChat>
    | undefined;
  const createAgent = useMutation(api.functions.agents.create);
  const startAgentChat = useMutation(api.functions.conversations.startAgentChat);
  const sendDashboardMessage = useMutation(api.functions.conversations.sendDashboardMessage);
  const createTaskFromChat = useMutation(api.functions.board.createTaskFromChat);

  const speak = useAction(api.functions.voice.speak);

  const [selectedConversationId, setSelectedConversationId] = useState<Id<"conversations"> | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | null>(null);
  const [draft, setDraft] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [awaitingAgentReply, setAwaitingAgentReply] = useState(false);
  const [pendingReplyConversationId, setPendingReplyConversationId] = useState<Id<"conversations"> | null>(null);
  const [pendingReplyAgentCountBaseline, setPendingReplyAgentCountBaseline] = useState<number | null>(null);
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [selectedAgentSuggestionIndex, setSelectedAgentSuggestionIndex] = useState(0);

  // Audio playback state
  const [speakingMessageIdx, setSpeakingMessageIdx] = useState<number | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setSpeakingMessageIdx(null);
  }, []);

  async function handleSpeak(messageIdx: number, text: string) {
    if (!selectedAgentId || !text.trim()) return;

    // If already playing this message, stop it
    if (speakingMessageIdx === messageIdx) {
      stopAudio();
      return;
    }

    stopAudio();
    setIsGeneratingAudio(true);
    setSpeakingMessageIdx(messageIdx);

    try {
      const result = await speak({ agentId: selectedAgentId, text: text.trim() });
      if (!result?.audioUrl) {
        notify.warning("Voice not available", "Configure a voice provider (ElevenLabs or OpenAI) in your agent settings.");
        setSpeakingMessageIdx(null);
        return;
      }

      const audio = new Audio(result.audioUrl);
      audioRef.current = audio;
      audio.addEventListener("ended", () => {
        setSpeakingMessageIdx(null);
        audioRef.current = null;
      });
      audio.addEventListener("error", () => {
        notify.error("Audio playback failed");
        setSpeakingMessageIdx(null);
        audioRef.current = null;
      });
      await audio.play();
    } catch (error) {
      notify.error("Could not generate speech", error);
      setSpeakingMessageIdx(null);
    } finally {
      setIsGeneratingAudio(false);
    }
  }

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const preferredAgent = useMemo(() => {
    if (!agents || agents.length === 0) return null;
    return agents.find((agent) => agent.isDefault) ?? agents[0] ?? null;
  }, [agents]);

  useEffect(() => {
    if (!agents || agents.length === 0) return;
    if (!selectedAgentId) {
      setSelectedAgentId(preferredAgent?._id ?? null);
    }
  }, [agents, preferredAgent, selectedAgentId]);

  useEffect(() => {
    if (!agents) return;
    if (agents.length === 0) {
      setSetupState((current) => current ?? { origin: "empty", answers: {} });
      return;
    }
    setSetupState((current) => (current?.origin === "empty" ? null : current));
  }, [agents]);

  useEffect(() => {
    if (!chats || !selectedConversationId || !selectedAgentId) return;
    const selected = chats.find((chat: AgentChat) => chat._id === selectedConversationId);
    if (!selected || !selected.agentId) return;
    if (selected.agentId !== selectedAgentId) {
      setSelectedAgentId(selected.agentId);
    }
  }, [chats, selectedConversationId, selectedAgentId]);

  const selectedConversation = useMemo(() => {
    if (!chats || !selectedConversationId) return null;
    return (chats.find((chat: AgentChat) => chat._id === selectedConversationId) as AgentChat | undefined) ?? null;
  }, [chats, selectedConversationId]);

  const currentSetupStep = useMemo(() => {
    if (!setupState) return null;
    return getCurrentSetupStep(setupState);
  }, [setupState]);

  const activeDraftCommand = useMemo(() => parseSlashCommand(draft), [draft]);

  const agentCommandSuggestions = useMemo(() => {
    if (!agents || agents.length === 0 || activeDraftCommand?.type !== "switch") {
      return [];
    }
    return getAgentSuggestions(activeDraftCommand.target, agents);
  }, [activeDraftCommand, agents]);

  useEffect(() => {
    if (agentCommandSuggestions.length === 0) {
      setSelectedAgentSuggestionIndex(0);
      return;
    }
    setSelectedAgentSuggestionIndex((current) =>
      Math.min(current, agentCommandSuggestions.length - 1)
    );
  }, [agentCommandSuggestions]);

  // Voice chat: speech-to-text + auto TTS for agent responses
  const voiceSendMessage = useCallback(
    async (text: string) => {
      if (!selectedConversationId || !text.trim()) return;
      const agentMsgCount =
        selectedConversation?.messages.filter((m: ChatMessage) => m.role === "agent").length ?? 0;
      try {
        setIsBusy(true);
        setAwaitingAgentReply(true);
        setPendingReplyConversationId(selectedConversationId);
        setPendingReplyAgentCountBaseline(agentMsgCount);
        await sendDashboardMessage({ conversationId: selectedConversationId, content: text.trim() });
      } catch (error) {
        notify.error("Could not send message", error);
        setAwaitingAgentReply(false);
        setPendingReplyConversationId(null);
        setPendingReplyAgentCountBaseline(null);
      } finally {
        setIsBusy(false);
      }
    },
    [selectedConversationId, selectedConversation, sendDashboardMessage]
  );

  const voiceChat = useVoiceChat({
    agentId: selectedAgentId,
    onTranscript: (text: string) => setDraft(text),
    onSendMessage: voiceSendMessage,
    autoSend: true,
  });

  // Auto-speak the latest agent response when it arrives
  const prevAwaitingRef = useRef(false);
  useEffect(() => {
    if (prevAwaitingRef.current && !awaitingAgentReply && voiceChat.voiceAvailable) {
      const messages = selectedConversation?.messages;
      const lastMsg = messages?.[messages.length - 1];
      if (lastMsg?.role === "agent" && lastMsg.content.trim()) {
        void voiceChat.speakText(lastMsg.content);
      }
    }
    prevAwaitingRef.current = awaitingAgentReply;
  }, [awaitingAgentReply, selectedConversation?.messages, voiceChat]);

  useEffect(() => {
    if (!awaitingAgentReply || !pendingReplyConversationId || !chats) return;
    const pendingConversation = chats.find(
      (chat: AgentChat) => chat._id === pendingReplyConversationId
    );
    if (!pendingConversation) return;
    const agentMessageCount = pendingConversation.messages.filter(
      (message) => message.role === "agent"
    ).length;
    if (
      pendingReplyAgentCountBaseline !== null &&
      agentMessageCount > pendingReplyAgentCountBaseline
    ) {
      setAwaitingAgentReply(false);
      setPendingReplyConversationId(null);
      setPendingReplyAgentCountBaseline(null);
    }
  }, [
    awaitingAgentReply,
    pendingReplyConversationId,
    pendingReplyAgentCountBaseline,
    chats,
  ]);

  const startSetup = useCallback(
    (origin: SetupState["origin"], seed?: string) => {
      stopAudio();
      voiceChat.stopListening();
      voiceChat.stopSpeaking();
      setAwaitingAgentReply(false);
      setPendingReplyConversationId(null);
      setPendingReplyAgentCountBaseline(null);
      setSetupState({
        origin,
        answers: seed?.trim() ? { mission: seed.trim() } : {},
      });
      setDraft("");
    },
    [stopAudio, voiceChat]
  );

  const clearSetup = useCallback(() => {
    setSetupState((current) => (current?.origin === "empty" && (!agents || agents.length === 0) ? current : null));
    setDraft("");
  }, [agents]);

  async function sendConversationMessage(
    conversationId: Id<"conversations">,
    content: string,
    fallbackDraft?: string
  ) {
    const trimmed = content.trim();
    if (!trimmed) return;
    const conversation = chats?.find((chat: AgentChat) => chat._id === conversationId) ?? null;
    const agentMessageCountBeforeSend =
      conversation?.messages.filter((message) => message.role === "agent").length ?? 0;
    try {
      setIsBusy(true);
      setAwaitingAgentReply(true);
      setPendingReplyConversationId(conversationId);
      setPendingReplyAgentCountBaseline(agentMessageCountBeforeSend);
      await sendDashboardMessage({ conversationId, content: trimmed });
    } catch (error) {
      notify.error("Could not send message", error);
      if (fallbackDraft) {
        setDraft(fallbackDraft);
      }
      setAwaitingAgentReply(false);
      setPendingReplyConversationId(null);
      setPendingReplyAgentCountBaseline(null);
    } finally {
      setIsBusy(false);
    }
  }

  async function openOrCreateChat(agentId: Id<"agents">) {
    setSelectedAgentId(agentId);
    setSetupState(null);
    setAwaitingAgentReply(false);
    setPendingReplyConversationId(null);
    setPendingReplyAgentCountBaseline(null);
    const existing = chats?.find((chat: AgentChat) => chat.agentId === agentId);
    if (existing) {
      setSelectedConversationId(existing._id);
      return;
    }

    try {
      setIsBusy(true);
      const conversationId = await startAgentChat({ agentId });
      setSelectedConversationId(conversationId);
    } catch (error) {
      notify.error("Could not start chat", error);
    } finally {
      setIsBusy(false);
    }
  }

  async function createAgentFromSetup(answers: Record<SetupField, string>) {
    const name = answers.name.trim();
    if (!name) {
      notify.warning("Name needed", "Pick a name for the new agent first.");
      return;
    }

    const slug = buildUniqueAgentSlug(name, agents ?? []);
    const description = `Created from chat. First task: ${answers.mission}. Working style: ${answers.style}.`;

    try {
      setIsBusy(true);
      const agentId = await createAgent({
        name,
        slug,
        description,
      });
      const conversationId = await startAgentChat({ agentId });
      setSelectedAgentId(agentId);
      setSelectedConversationId(conversationId);
      setSetupState(null);
      setDraft("");
      notify.success("Agent created", `${name} is ready.`);
      await sendConversationMessage(conversationId, answers.mission);
    } catch (error) {
      notify.error("Could not create agent", error);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSetupAnswer(input: string) {
    if (!setupState || !currentSetupStep) return;
    const answer = resolveSetupAnswer(currentSetupStep, input);
    if (!answer) {
      notify.warning("Answer needed", "Pick A, B, C, or D, or type your own answer.");
      return;
    }

    const nextAnswers = {
      ...setupState.answers,
      [currentSetupStep.field]: answer,
    };

    if (currentSetupStep.field === "name") {
      await createAgentFromSetup(nextAnswers as Record<SetupField, string>);
      return;
    }

    setSetupState({
      ...setupState,
      answers: nextAnswers,
    });
    setDraft("");
  }

  async function handleSlashCommand(command: SlashCommand): Promise<boolean> {
    if (command.type === "help") {
      notify.info("Chat commands", "Use /new to create an agent, /agent <name> to switch, and /cancel to exit setup.");
      setDraft("");
      return true;
    }

    if (command.type === "cancel") {
      if (setupState) {
        if (!agents || agents.length === 0) {
          setSetupState({ origin: "empty", answers: {} });
          setDraft("");
          notify.info("Setup reset", "Answer the prompts to create your first agent.");
        } else {
          clearSetup();
          notify.info("Setup closed", "Back to normal chat.");
        }
      }
      return true;
    }

    if (command.type === "new") {
      startSetup(agents && agents.length > 0 ? "slash" : "empty", command.seed);
      return true;
    }

    if (command.type === "switch") {
      if (!agents || agents.length === 0) {
        notify.warning("No agents yet", "Create one with /new.");
        return true;
      }
      if (!command.target.trim()) {
        notify.info("Pick an agent", "Try /agent support or /agent research.");
        return true;
      }
      const match = findMatchingAgent(command.target, agents);
      if (match.kind === "multiple") {
        notify.warning("Multiple matches", "Use a more specific agent name or slug.");
        return true;
      }
      if (match.kind === "none") {
        notify.warning("Agent not found", "Try /agent <name> or create one with /new.");
        return true;
      }
      setDraft("");
      await openOrCreateChat(match.agent._id);
      return true;
    }

    notify.warning("Unknown command", "Use /new, /agent <name>, /help, or /cancel.");
    return true;
  }

  async function handleSendMessage() {
    const content = draft.trim();
    if (!content) return;

    const slashCommand = parseSlashCommand(content);
    if (slashCommand) {
      await handleSlashCommand(slashCommand);
      return;
    }

    if (setupState) {
      await handleSetupAnswer(content);
      return;
    }

    if (!selectedConversationId) return;
    setDraft("");
    await sendConversationMessage(selectedConversationId, content, content);
  }

  async function handleCreateTask() {
    if (!selectedConversationId || !draft.trim()) return;
    const content = draft.trim();
    try {
      setIsBusy(true);
      await createTaskFromChat({
        conversationId: selectedConversationId,
        description: content,
      });
      setDraft("");
      notify.success("Task created", "Added to the board Inbox column.");
    } catch (error) {
      notify.error("Could not create task", error);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateTaskFromMessage(content: string) {
    if (!selectedConversationId) return;
    const description = content.trim();
    if (!description) return;
    try {
      setIsBusy(true);
      await createTaskFromChat({
        conversationId: selectedConversationId,
        description,
      });
      notify.success("Task created", "Added to the board Inbox column.");
    } catch (error) {
      notify.error("Could not create task", error);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleAgentSuggestionSelect(agent: AgentListItem) {
    setDraft("");
    await openOrCreateChat(agent._id);
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const hasAgentSuggestions =
      !showSetupPanel &&
      activeDraftCommand?.type === "switch" &&
      agentCommandSuggestions.length > 0;

    if (hasAgentSuggestions && event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedAgentSuggestionIndex((current) =>
        current + 1 >= agentCommandSuggestions.length ? 0 : current + 1
      );
      return;
    }

    if (hasAgentSuggestions && event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedAgentSuggestionIndex((current) =>
        current - 1 < 0 ? agentCommandSuggestions.length - 1 : current - 1
      );
      return;
    }

    if (hasAgentSuggestions && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const selectedAgent = agentCommandSuggestions[selectedAgentSuggestionIndex];
      if (selectedAgent && !isBusy) {
        void handleAgentSuggestionSelect(selectedAgent);
      }
      return;
    }

    if (event.key !== "Enter" || !event.shiftKey) return;
    event.preventDefault();
    if (!draft.trim() || isBusy) return;
    void handleSendMessage();
  }

  const setupIntro = useMemo(() => {
    if (!setupState) return null;
    return buildSetupIntro(setupState.origin);
  }, [setupState]);

  const setupAnswerEntries = useMemo(
    () =>
      setupState
        ? ([
            { label: "First task", value: setupState.answers.mission },
            { label: "Working style", value: setupState.answers.style },
            { label: "Agent name", value: setupState.answers.name },
          ] as const).filter((entry) => entry.value)
        : [],
    [setupState]
  );

  const showBootstrapChat = !!agents && agents.length === 0 && !!setupState;
  const showSetupPanel = !!setupState && !showBootstrapChat;

  if (!agents || !chats) {
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
      <div className="animate-fade-in h-[calc(100vh-140px)]">
        <div className="flex h-full rounded-lg border border-surface-3 bg-surface-0 overflow-hidden">
          <div className="w-72 border-r border-surface-3 flex flex-col">
            <div className="border-b border-surface-3 p-4">
              <h1 className="text-lg font-semibold text-ink-0">Agent Chat</h1>
              <p className="mt-1 text-xs text-ink-2">1:1 with each agent, plus /new and /agent commands.</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {agents.length === 0 ? (
                <div className="p-4 text-sm text-ink-2">
                  No agents yet. Use the chat setup on the right to create one here.
                </div>
              ) : (
                agents.map((agent) => {
                  const chat = chats.find((row: AgentChat) => row.agentId === agent._id);
                  const isSelected = selectedAgentId === agent._id;
                  return (
                    <button
                      key={agent._id}
                      onClick={() => void openOrCreateChat(agent._id)}
                      className={`w-full border-b border-surface-3 p-3 text-left transition-colors hover:bg-surface-1 ${
                        isSelected ? "bg-surface-1" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-ink-0">{agent.name}</span>
                        {chat ? (
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-1">
                            {chat.messages.length}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-ink-2 truncate">
                        {chat?.messages[chat.messages.length - 1]?.content ?? "No messages yet"}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            {showBootstrapChat ? (
              <>
                <div className="border-b border-surface-3 p-4">
                  <h2 className="font-medium text-ink-0">Create your first agent</h2>
                  <p className="mt-1 text-sm text-ink-2">
                    Answer the prompts below and I will set up the agent in chat.
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {setupIntro ? (
                    <div className="flex justify-start">
                      <div className="max-w-[70%] rounded-lg bg-surface-1 p-3 text-sm text-ink-0">
                        {setupIntro}
                      </div>
                    </div>
                  ) : null}

                  {setupState?.answers.mission ? (
                    <>
                      <div className="flex justify-start">
                        <div className="max-w-[70%] rounded-lg bg-surface-1 p-3 text-sm text-ink-0">
                          What should this new agent help with first
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="max-w-[70%] rounded-lg bg-accent p-3 text-sm text-white">
                          {setupState.answers.mission}
                        </div>
                      </div>
                    </>
                  ) : null}

                  {setupState?.answers.mission && setupState.answers.style ? (
                    <>
                      <div className="flex justify-start">
                        <div className="max-w-[70%] rounded-lg bg-surface-1 p-3 text-sm text-ink-0">
                          How should the agent work
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="max-w-[70%] rounded-lg bg-accent p-3 text-sm text-white">
                          {setupState.answers.style}
                        </div>
                      </div>
                    </>
                  ) : null}

                  {setupState?.answers.mission &&
                  setupState.answers.style &&
                  setupState.answers.name ? (
                    <>
                      <div className="flex justify-start">
                        <div className="max-w-[70%] rounded-lg bg-surface-1 p-3 text-sm text-ink-0">
                          Pick a name for the agent
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <div className="max-w-[70%] rounded-lg bg-accent p-3 text-sm text-white">
                          {setupState.answers.name}
                        </div>
                      </div>
                    </>
                  ) : null}

                  {currentSetupStep ? (
                    <div className="flex justify-start">
                      <div className="max-w-[70%] rounded-lg bg-surface-1 p-3 text-ink-0">
                        <p className="text-sm">{currentSetupStep.prompt}</p>
                        <div className="mt-3 space-y-2">
                          {currentSetupStep.options.map((option) => (
                            <button
                              key={`${currentSetupStep.field}-${option.key}`}
                              type="button"
                              onClick={() => void handleSetupAnswer(option.key)}
                              disabled={isBusy}
                              className="flex w-full items-center gap-2 rounded border border-surface-3 bg-surface-0 px-3 py-2 text-left text-sm text-ink-1 transition hover:bg-surface-2 hover:text-ink-0 disabled:opacity-50"
                            >
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-surface-3 text-xs font-semibold text-ink-2">
                                {option.key}
                              </span>
                              <span>{option.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-surface-3 p-4">
                  <div className="flex gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={handleDraftKeyDown}
                      placeholder={currentSetupStep?.placeholder ?? "Type your answer"}
                      className="input flex-1 resize-none"
                      rows={3}
                      disabled={isBusy}
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={handleSendMessage}
                        disabled={!draft.trim() || isBusy}
                        className="btn-accent"
                      >
                        Continue
                      </button>
                      <button
                        type="button"
                        onClick={() => startSetup("empty")}
                        disabled={isBusy}
                        className="btn-secondary"
                      >
                        Restart
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-ink-2">
                    Type your own answer or use A, B, C, or D. Shift+Enter continues.
                  </p>
                </div>
              </>
            ) : selectedConversation ? (
              <>
                <div className="border-b border-surface-3 p-4">
                  <h2 className="font-medium text-ink-0">
                    {agents.find((agent) => agent._id === selectedConversation.agentId)?.name ?? "Agent"}
                  </h2>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {selectedConversation.messages.length === 0 ? (
                    <p className="text-sm text-ink-2">Start chatting. You can create tasks from your message draft.</p>
                  ) : (
                    selectedConversation.messages.map((message, idx) => (
                      <div
                        key={idx}
                        className={`group flex ${message.role === "agent" ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg p-3 ${
                            message.role === "agent" ? "bg-surface-1 text-ink-0" : "bg-accent text-white"
                          }`}
                        >
                          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <p className={`text-xs ${message.role === "agent" ? "text-ink-2" : "text-white/70"}`}>
                                {new Date(message.timestamp).toLocaleString()}
                              </p>
                              {message.role === "agent" && (
                                <button
                                  type="button"
                                  onClick={() => void handleSpeak(idx, message.content)}
                                  disabled={isGeneratingAudio && speakingMessageIdx !== idx}
                                  className={`rounded p-1 transition-all ${
                                    speakingMessageIdx === idx
                                      ? "text-accent bg-accent/10"
                                      : "text-ink-2 hover:text-ink-0 hover:bg-surface-2 opacity-0 group-hover:opacity-100"
                                  } disabled:opacity-30`}
                                  title={speakingMessageIdx === idx ? "Stop speaking" : "Listen to this message"}
                                >
                                  {isGeneratingAudio && speakingMessageIdx === idx ? (
                                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                                  ) : speakingMessageIdx === idx ? (
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                                    </svg>
                                  ) : (
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                    </svg>
                                  )}
                                </button>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleCreateTaskFromMessage(message.content)}
                              disabled={isBusy || !message.content.trim()}
                              className={`text-xs underline underline-offset-2 transition-opacity ${
                                message.role === "agent" ? "text-ink-1" : "text-white/80"
                              } ${isBusy ? "opacity-50" : "opacity-0 group-hover:opacity-100"}`}
                              title="Create task from this message"
                            >
                              Create task
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {awaitingAgentReply &&
                  pendingReplyConversationId === selectedConversation._id ? (
                    <div className="flex justify-start">
                      <div className="max-w-[70%] rounded-lg bg-surface-1 p-3 text-ink-0">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 animate-pulse rounded-full bg-ink-2" />
                          <div
                            className="h-2 w-2 animate-pulse rounded-full bg-ink-2"
                            style={{ animationDelay: "120ms" }}
                          />
                          <div
                            className="h-2 w-2 animate-pulse rounded-full bg-ink-2"
                            style={{ animationDelay: "240ms" }}
                          />
                          <span className="ml-1 text-xs text-ink-2">Agent is thinking...</span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-surface-3 p-4">
                  {showSetupPanel && currentSetupStep ? (
                    <div className="mb-3 rounded-lg border border-surface-3 bg-surface-1 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-ink-0">New agent setup</p>
                          <p className="mt-1 text-sm text-ink-1">{currentSetupStep.prompt}</p>
                        </div>
                        <button
                          type="button"
                          onClick={clearSetup}
                          disabled={isBusy}
                          className="text-xs text-ink-2 transition hover:text-ink-0"
                        >
                          Cancel
                        </button>
                      </div>
                      {setupAnswerEntries.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {setupAnswerEntries.map((entry) => (
                            <span
                              key={entry.label}
                              className="rounded-full bg-surface-0 px-2.5 py-1 text-xs text-ink-1"
                            >
                              {entry.label}: {entry.value}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {currentSetupStep.options.map((option) => (
                          <button
                            key={`${currentSetupStep.field}-${option.key}`}
                            type="button"
                            onClick={() => void handleSetupAnswer(option.key)}
                            disabled={isBusy}
                            className="flex items-center gap-2 rounded border border-surface-3 bg-surface-0 px-3 py-2 text-left text-sm text-ink-1 transition hover:bg-surface-2 hover:text-ink-0 disabled:opacity-50"
                          >
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-surface-3 text-xs font-semibold text-ink-2">
                              {option.key}
                            </span>
                            <span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {!showSetupPanel && activeDraftCommand?.type === "switch" ? (
                    <div className="mb-3 rounded-lg border border-surface-3 bg-surface-1 p-3">
                      <p className="text-sm font-medium text-ink-0">Switch agent</p>
                      <p className="mt-1 text-sm text-ink-1">
                        {activeDraftCommand.target.trim()
                          ? "Matching agents for your command"
                          : "Start typing a name or slug, or pick an agent below"}
                      </p>
                      {agentCommandSuggestions.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {agentCommandSuggestions.map((agent) => (
                            <button
                              key={agent._id}
                              type="button"
                              onClick={() => void handleAgentSuggestionSelect(agent)}
                              disabled={isBusy}
                              className={`flex w-full items-start justify-between gap-3 rounded border px-3 py-2 text-left transition disabled:opacity-50 ${
                                agentCommandSuggestions[selectedAgentSuggestionIndex]?._id === agent._id
                                  ? "border-accent bg-accent/5"
                                  : "border-surface-3 bg-surface-0 hover:bg-surface-2"
                              }`}
                              aria-selected={
                                agentCommandSuggestions[selectedAgentSuggestionIndex]?._id === agent._id
                              }
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-sm font-medium text-ink-0">
                                    {agent.name}
                                  </span>
                                  {agent.isDefault ? (
                                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-1">
                                      Default
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-xs text-ink-2">/{agent.slug}</p>
                                {agent.description ? (
                                  <p className="mt-1 line-clamp-2 text-xs text-ink-2">
                                    {agent.description}
                                  </p>
                                ) : null}
                              </div>
                              <span className="shrink-0 text-xs text-ink-2">Open</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-ink-2">
                          No agents match yet. Keep typing or try `/new`.
                        </p>
                      )}
                      {agentCommandSuggestions.length > 0 ? (
                        <p className="mt-3 text-xs text-ink-2">
                          Use arrow keys to move through matches, then press Enter to open the selected agent.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Voice listening indicator */}
                  {!showSetupPanel && voiceChat.isListening && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                      <div className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                      </div>
                      <span className="text-sm text-red-700">Listening...</span>
                      {voiceChat.interimTranscript && (
                        <span className="ml-2 text-sm text-red-500 italic truncate">
                          {voiceChat.interimTranscript}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={voiceChat.stopListening}
                        className="ml-auto text-xs text-red-600 hover:text-red-800"
                      >
                        Stop
                      </button>
                    </div>
                  )}

                  {/* TTS playback indicator */}
                  {!showSetupPanel && (voiceChat.isSpeaking || voiceChat.isGeneratingAudio) && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg bg-accent/5 border border-accent/20 px-3 py-2">
                      {voiceChat.isGeneratingAudio ? (
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                      ) : (
                        <div className="flex items-center gap-0.5">
                          <div className="h-3 w-0.5 animate-pulse bg-accent rounded-full" />
                          <div className="h-4 w-0.5 animate-pulse bg-accent rounded-full" style={{ animationDelay: "75ms" }} />
                          <div className="h-2 w-0.5 animate-pulse bg-accent rounded-full" style={{ animationDelay: "150ms" }} />
                          <div className="h-3.5 w-0.5 animate-pulse bg-accent rounded-full" style={{ animationDelay: "225ms" }} />
                        </div>
                      )}
                      <span className="text-sm text-accent">
                        {voiceChat.isGeneratingAudio ? "Generating speech..." : "Agent speaking..."}
                      </span>
                      <button
                        type="button"
                        onClick={voiceChat.stopSpeaking}
                        className="ml-auto text-xs text-accent hover:text-accent/80"
                      >
                        Stop
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={handleDraftKeyDown}
                      placeholder={
                        showSetupPanel
                          ? currentSetupStep?.placeholder ?? "Type your answer"
                          : voiceChat.isListening
                            ? "Listening..."
                            : "Message your agent..."
                      }
                      className="input flex-1 resize-none"
                      rows={3}
                      disabled={isBusy || (!showSetupPanel && voiceChat.isListening)}
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={handleSendMessage}
                        disabled={!draft.trim() || isBusy}
                        className="btn-accent"
                      >
                        {showSetupPanel ? "Continue" : "Send"}
                      </button>

                      {/* Mic button for voice input */}
                      {showSetupPanel ? (
                        <button
                          type="button"
                          onClick={clearSetup}
                          disabled={isBusy}
                          className="btn-secondary"
                        >
                          Cancel setup
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={voiceChat.isListening ? voiceChat.stopListening : voiceChat.startListening}
                            disabled={!voiceChat.isSupported || !voiceChat.voiceAvailable || isBusy}
                            className={`rounded border px-3 py-1.5 text-sm font-medium transition-all ${
                              voiceChat.isListening
                                ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                                : voiceChat.voiceAvailable && voiceChat.isSupported
                                  ? "border-surface-3 bg-surface-1 text-ink-1 hover:bg-surface-2 hover:text-ink-0"
                                  : "border-surface-3 bg-surface-1 text-ink-2 opacity-50 cursor-not-allowed"
                            }`}
                            title={
                              !voiceChat.isSupported
                                ? "Voice not supported in this browser"
                                : !voiceChat.voiceAvailable
                                  ? "Add ElevenLabs or OpenAI key in Settings to use voice"
                                  : voiceChat.isListening
                                    ? "Stop listening"
                                    : "Talk to agent"
                            }
                          >
                            {voiceChat.isListening ? (
                              <svg className="mx-auto h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                              </svg>
                            ) : (
                              <svg className="mx-auto h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />
                              </svg>
                            )}
                          </button>

                          <button
                            onClick={handleCreateTask}
                            disabled={!draft.trim() || isBusy}
                            className="btn-secondary"
                            title="Create task in board Inbox"
                          >
                            Create task
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-ink-2">
                    {showSetupPanel
                      ? "Type your own answer or use A, B, C, or D. Shift+Enter continues. Use /cancel to exit setup."
                      : "Enter = new line, Shift+Enter = send. Use /new to create an agent or /agent <name> to switch. Matching agents appear as you type, and arrow keys plus Enter can open one."}
                    {!showSetupPanel &&
                      voiceChat.voiceAvailable &&
                      voiceChat.isSupported &&
                      " Click mic to talk."}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <h3 className="text-lg font-medium text-ink-0">Select an agent</h3>
                  <p className="mt-1 text-sm text-ink-1">
                    Open a 1:1 chat and send tasks to your board. You can also use /new to create another agent.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

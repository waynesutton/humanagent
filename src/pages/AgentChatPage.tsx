import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Id } from "../../convex/_generated/dataModel";
import { notify } from "../lib/notify";

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

export function AgentChatPage() {
  const agents = useQuery(api.functions.agents.list);
  const chats = useQuery(api.functions.conversations.listAgentChats, {});
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

  useEffect(() => {
    if (!agents || agents.length === 0) return;
    if (!selectedAgentId) {
      setSelectedAgentId(agents[0]!._id);
    }
  }, [agents, selectedAgentId]);

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

  async function openOrCreateChat(agentId: Id<"agents">) {
    setSelectedAgentId(agentId);
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

  async function handleSendMessage() {
    if (!selectedConversationId || !draft.trim()) return;
    const content = draft.trim();
    const agentMessageCountBeforeSend =
      selectedConversation?.messages.filter((message) => message.role === "agent")
        .length ?? 0;
    setDraft("");
    try {
      setIsBusy(true);
      setAwaitingAgentReply(true);
      setPendingReplyConversationId(selectedConversationId);
      setPendingReplyAgentCountBaseline(agentMessageCountBeforeSend);
      await sendDashboardMessage({ conversationId: selectedConversationId, content });
    } catch (error) {
      notify.error("Could not send message", error);
      setDraft(content);
      setAwaitingAgentReply(false);
      setPendingReplyConversationId(null);
      setPendingReplyAgentCountBaseline(null);
    } finally {
      setIsBusy(false);
    }
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

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || !event.shiftKey) return;
    event.preventDefault();
    if (!draft.trim() || isBusy) return;
    void handleSendMessage();
  }

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
              <p className="mt-1 text-xs text-ink-2">1:1 with each agent and push tasks to board.</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {agents.length === 0 ? (
                <div className="p-4 text-sm text-ink-2">No agents yet. Create one first.</div>
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
            {selectedConversation ? (
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
                  <div className="flex gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={handleDraftKeyDown}
                      placeholder="Message your agent..."
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
                        Send
                      </button>
                      <button
                        onClick={handleCreateTask}
                        disabled={!draft.trim() || isBusy}
                        className="btn-secondary"
                        title="Create task in board Inbox"
                      >
                        Create task
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-ink-2">
                    Enter = new line, Shift+Enter = send
                  </p>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <h3 className="text-lg font-medium text-ink-0">Select an agent</h3>
                  <p className="mt-1 text-sm text-ink-1">Open a 1:1 chat and send tasks to your board.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

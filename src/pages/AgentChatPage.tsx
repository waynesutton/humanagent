import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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

  const [selectedConversationId, setSelectedConversationId] = useState<Id<"conversations"> | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | null>(null);
  const [draft, setDraft] = useState("");
  const [isBusy, setIsBusy] = useState(false);

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

  async function openOrCreateChat(agentId: Id<"agents">) {
    setSelectedAgentId(agentId);
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
    setDraft("");
    try {
      setIsBusy(true);
      await sendDashboardMessage({ conversationId: selectedConversationId, content });
    } catch (error) {
      notify.error("Could not send message", error);
      setDraft(content);
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
                            <p className={`text-xs ${message.role === "agent" ? "text-ink-2" : "text-white/70"}`}>
                              {new Date(message.timestamp).toLocaleString()}
                            </p>
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
                </div>

                <div className="border-t border-surface-3 p-4">
                  <div className="flex gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
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

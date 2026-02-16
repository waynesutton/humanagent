import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { notify } from "../lib/notify";

type ThreadTab = "inbox" | "outbox";
type ThreadItem = {
  threadId: string;
  lastMessageAt: number;
  messageCount: number;
  preview: string;
  fromAgentName?: string;
  toAgentName?: string;
};
type ThreadMessage = {
  _id: string;
  createdAt: number;
  content: string;
  direction: "inbound" | "outbound";
  agentId?: Id<"agents">;
  peerAgentId?: Id<"agents">;
};
type MyAgent = {
  _id: Id<"agents">;
  name: string;
  slug: string;
  isPublic: boolean;
};
type PublicAgentOption = {
  _id: Id<"agents">;
  name: string;
  slug: string;
  description?: string;
};

export function A2AInboxPage() {
  const [activeTab, setActiveTab] = useState<ThreadTab>("inbox");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [summaryResult, setSummaryResult] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [composeFromAgentId, setComposeFromAgentId] = useState<Id<"agents"> | null>(null);
  const [composeTargetUsername, setComposeTargetUsername] = useState("");
  const [composeTargetAgentSearch, setComposeTargetAgentSearch] = useState("");
  const [composeTargetAgentId, setComposeTargetAgentId] = useState<Id<"agents"> | null>(null);
  const [composePinnedTargetLabel, setComposePinnedTargetLabel] = useState<string | null>(null);
  const [composeMessage, setComposeMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [quickReplyMessage, setQuickReplyMessage] = useState("");

  const inboxThreads = useQuery(api.functions.a2a.getInboxThreads, {
    limit: 60,
  }) as ThreadItem[] | undefined;
  const outboxThreads = useQuery(api.functions.a2a.getOutboxThreads, {
    limit: 60,
  }) as ThreadItem[] | undefined;
  const threadMessages = useQuery(
    api.functions.a2a.getThreadMessages,
    selectedThreadId ? { threadId: selectedThreadId, limit: 200 } : "skip"
  ) as ThreadMessage[] | undefined;
  const myAgents = useQuery(api.functions.agents.list) as MyAgent[] | undefined;
  const targetPublicAgents = useQuery(
    api.functions.agents.listPublicByUsername,
    composeTargetUsername.trim().length > 0
      ? { username: composeTargetUsername.trim().toLowerCase() }
      : "skip"
  ) as PublicAgentOption[] | undefined;
  const summarizeThread = useMutation(api.functions.a2a.summarizeThread);
  const sendFromDashboard = useMutation(api.functions.a2a.sendFromDashboard);

  const threads = activeTab === "inbox" ? inboxThreads : outboxThreads;

  const selectedAgentId = useMemo(() => {
    if (!threadMessages || threadMessages.length === 0) return undefined;
    return threadMessages[threadMessages.length - 1]?.agentId;
  }, [threadMessages]);
  const selectedPair = useMemo(() => {
    if (!threadMessages || threadMessages.length === 0) return null;
    for (let i = threadMessages.length - 1; i >= 0; i -= 1) {
      const message = threadMessages[i];
      if (message?.agentId && message.peerAgentId) {
        return {
          myAgentId: message.agentId,
          peerAgentId: message.peerAgentId,
        };
      }
    }
    return null;
  }, [threadMessages]);
  const filteredTargetPublicAgents = useMemo(() => {
    const all = targetPublicAgents ?? [];
    const q = composeTargetAgentSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter((agent) => {
      const text = `${agent.name} ${agent.slug} ${agent.description ?? ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [targetPublicAgents, composeTargetAgentSearch]);

  async function handleSendMessage() {
    if (!composeFromAgentId || !composeTargetAgentId || !composeMessage.trim()) {
      const message = "Select sender, recipient, and message.";
      setComposeError(message);
      notify.warning("Missing message details", message);
      return;
    }

    if (composeFromAgentId === composeTargetAgentId) {
      const message = "Sender and recipient must be different agents.";
      setComposeError(message);
      notify.warning("Invalid recipient", message);
      return;
    }

    setSending(true);
    setComposeError(null);
    try {
      const result = await sendFromDashboard({
        fromAgentId: composeFromAgentId,
        toAgentId: composeTargetAgentId,
        message: composeMessage.trim(),
      });
      setComposeMessage("");
      setComposeTargetAgentId(null);
      setComposePinnedTargetLabel(null);
      setActiveTab("outbox");
      setSelectedThreadId(result.threadId);
      setSummaryResult(null);
      notify.success("A2A message sent");
    } catch (error) {
      notify.error("Could not send A2A message", error);
      setComposeError(
        error instanceof Error ? error.message : "Could not send A2A message."
      );
    } finally {
      setSending(false);
    }
  }

  async function handleQuickReply() {
    if (!selectedPair || !quickReplyMessage.trim()) {
      return;
    }
    setSending(true);
    setComposeError(null);
    try {
      await sendFromDashboard({
        fromAgentId: selectedPair.myAgentId,
        toAgentId: selectedPair.peerAgentId,
        message: quickReplyMessage.trim(),
      });
      setQuickReplyMessage("");
      setActiveTab("outbox");
      setSummaryResult(null);
      notify.success("Quick reply sent");
    } catch (error) {
      notify.error("Could not send quick reply", error);
      setComposeError(
        error instanceof Error ? error.message : "Could not send quick reply."
      );
    } finally {
      setSending(false);
    }
  }

  function handleStartFromSelectedThread() {
    if (!selectedPair) return;
    setComposeFromAgentId(selectedPair.myAgentId);
    setComposeTargetAgentId(selectedPair.peerAgentId);
    setComposePinnedTargetLabel("Recipient from selected thread");
    setComposeError(null);
  }

  async function handleSummarizeSelectedThread() {
    if (!selectedThreadId) return;
    setSummarizing(true);
    setSummaryResult(null);
    try {
      const result = await summarizeThread({
        threadId: selectedThreadId,
        agentId: selectedAgentId,
      });
      setSummaryResult(result.summary);
      notify.success("Thread summarized");
    } catch (error) {
      notify.error("Could not summarize thread", error);
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl animate-fade-in">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink-0">Agent to agent inbox</h1>
            <p className="mt-1 text-ink-1">
              Monitor incoming and outgoing agent conversations and summarize threads on demand.
            </p>
          </div>
        </div>

        <div className="mt-6 card">
          <h2 className="text-lg font-semibold text-ink-0">Compose new A2A message</h2>
          <p className="mt-1 text-sm text-ink-1">
            Choose one of your agents, pick a public recipient agent, and start a thread.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-ink-0">From my agent</label>
              <select
                className="input mt-1.5"
                value={composeFromAgentId ?? ""}
                onChange={(e) =>
                  setComposeFromAgentId(
                    e.target.value ? (e.target.value as Id<"agents">) : null
                  )
                }
              >
                <option value="">Select sender agent</option>
                {(myAgents ?? []).map((agent) => (
                  <option key={agent._id} value={agent._id}>
                    {agent.name} ({agent.slug}){agent.isPublic ? " public" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-0">Recipient username</label>
              <input
                className="input mt-1.5"
                value={composeTargetUsername}
                onChange={(e) => {
                  setComposeTargetUsername(e.target.value);
                  setComposeTargetAgentSearch("");
                  setComposeTargetAgentId(null);
                  setComposePinnedTargetLabel(null);
                }}
                placeholder="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-0">Recipient agent search</label>
              <input
                className="input mt-1.5"
                value={composeTargetAgentSearch}
                onChange={(e) => setComposeTargetAgentSearch(e.target.value)}
                placeholder="Search by name or slug"
                disabled={!targetPublicAgents || targetPublicAgents.length === 0}
              />
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-1">
            <div>
              <label className="block text-sm font-medium text-ink-0">Recipient public agent</label>
              <select
                className="input mt-1.5"
                value={composeTargetAgentId ?? ""}
                onChange={(e) =>
                  setComposeTargetAgentId(
                    e.target.value ? (e.target.value as Id<"agents">) : null
                  )
                }
                disabled={
                  (!targetPublicAgents || targetPublicAgents.length === 0) &&
                  composeTargetAgentId === null
                }
              >
                <option value="">
                  {composeTargetUsername.trim().length === 0
                    ? "Enter username first"
                    : "Select recipient agent"}
                </option>
                {filteredTargetPublicAgents.map((agent) => (
                  <option key={agent._id} value={agent._id}>
                    {agent.name} ({agent.slug})
                  </option>
                ))}
              </select>
              {composePinnedTargetLabel ? (
                <p className="mt-1 text-xs text-ink-2">{composePinnedTargetLabel}</p>
              ) : null}
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-ink-0">Message</label>
            <textarea
              className="input mt-1.5 resize-none"
              rows={3}
              value={composeMessage}
              onChange={(e) => setComposeMessage(e.target.value)}
              placeholder="Write the first agent to agent message..."
            />
          </div>
          {composeError ? <p className="mt-3 text-sm text-red-500">{composeError}</p> : null}
          <div className="mt-4">
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={sending}
              className="btn-accent text-sm"
            >
              {sending ? "Sending..." : "Send message"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="card p-0">
            <div className="border-b border-surface-3 p-3">
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-1 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("inbox");
                    setSelectedThreadId(null);
                    setSummaryResult(null);
                  }}
                  className={`rounded-md px-3 py-2 text-sm ${
                    activeTab === "inbox"
                      ? "bg-surface-0 text-ink-0 shadow-card"
                      : "text-ink-1 hover:text-ink-0"
                  }`}
                >
                  Inbox
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("outbox");
                    setSelectedThreadId(null);
                    setSummaryResult(null);
                  }}
                  className={`rounded-md px-3 py-2 text-sm ${
                    activeTab === "outbox"
                      ? "bg-surface-0 text-ink-0 shadow-card"
                      : "text-ink-1 hover:text-ink-0"
                  }`}
                >
                  Outbox
                </button>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              {threads === undefined ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                </div>
              ) : threads.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm text-ink-1">
                    No {activeTab === "inbox" ? "incoming" : "outgoing"} A2A threads yet.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-surface-3">
                  {threads.map((thread: ThreadItem) => (
                    <button
                      key={thread.threadId}
                      type="button"
                      onClick={() => {
                        setSelectedThreadId(thread.threadId);
                        setSummaryResult(null);
                      }}
                      className={`w-full p-3 text-left transition-colors ${
                        selectedThreadId === thread.threadId
                          ? "bg-surface-1"
                          : "hover:bg-surface-1"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-ink-0">
                          {activeTab === "inbox"
                            ? thread.fromAgentName ?? "Unknown sender"
                            : thread.toAgentName ?? "Unknown recipient"}
                        </p>
                        <span className="shrink-0 text-xs text-ink-2">
                          {new Date(thread.lastMessageAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-ink-1">{thread.preview}</p>
                      <p className="mt-1 text-2xs text-ink-2">{thread.messageCount} messages</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            {!selectedThreadId ? (
              <div className="py-16 text-center">
                <p className="text-sm text-ink-1">Select a thread to view messages.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-3 pb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-ink-0">Thread details</h2>
                    <p className="mt-1 text-xs text-ink-2">{selectedThreadId}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleStartFromSelectedThread}
                      disabled={!selectedPair}
                      className="btn-secondary text-sm"
                    >
                      Start from this thread
                    </button>
                    <button
                      type="button"
                      onClick={handleSummarizeSelectedThread}
                      disabled={summarizing}
                      className="btn-secondary text-sm"
                    >
                      {summarizing ? "Summarizing..." : "Summarize thread"}
                    </button>
                  </div>
                </div>

                <div className="mt-4 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
                  {threadMessages === undefined ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
                    </div>
                  ) : threadMessages.length === 0 ? (
                    <p className="py-8 text-center text-sm text-ink-1">No messages found for this thread.</p>
                  ) : (
                    threadMessages.map((message: ThreadMessage) => (
                      <div
                        key={message._id}
                        className={`max-w-[85%] rounded-lg border p-3 ${
                          message.direction === "outbound"
                            ? "ml-auto border-accent/30 bg-accent/10"
                            : "mr-auto border-surface-3 bg-surface-1"
                        }`}
                      >
                        <p className="text-sm text-ink-0">{message.content}</p>
                        <p className="mt-2 text-2xs text-ink-2">
                          {message.direction === "outbound" ? "Sent" : "Received"}{" "}
                          {new Date(message.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                {summaryResult ? (
                  <div className="mt-4 rounded-lg border border-surface-3 bg-surface-1 p-3">
                    <p className="text-xs font-medium text-ink-0">Latest summary</p>
                    <pre className="mt-2 whitespace-pre-wrap text-xs text-ink-1">{summaryResult}</pre>
                  </div>
                ) : null}

                <div className="mt-4 rounded-lg border border-surface-3 bg-surface-1 p-3">
                  <p className="text-xs font-medium text-ink-0">Quick reply</p>
                  <textarea
                    className="input mt-2 resize-none"
                    rows={2}
                    value={quickReplyMessage}
                    onChange={(e) => setQuickReplyMessage(e.target.value)}
                    placeholder="Reply to the peer agent in this thread..."
                  />
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={handleQuickReply}
                      disabled={sending || !selectedPair || quickReplyMessage.trim().length === 0}
                      className="btn-accent text-sm"
                    >
                      {sending ? "Sending..." : "Send quick reply"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

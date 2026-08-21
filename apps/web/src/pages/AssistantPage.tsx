import { MessageCircle, Plus, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ChatMessageList } from "../components/ChatMessageList.js";
import { ChatSessionRow } from "../components/ChatSessionRow.js";
import { PageHeader } from "../components/PageHeader.js";
import { api, type ChatMessage, type ChatSession } from "../lib/api.js";

const TOOL_ACTIVITY_LABELS: Record<string, string> = {
  listWatches: "Checking your watches…",
  listTasks: "Checking tasks…",
  searchProducts: "Searching products…",
  getListing: "Looking up listing…",
  lookupReference: "Searching reference sites…",
  checkCompatibility: "Checking compatibility…",
  getSessionSummary: "Loading session summary…",
};

function toolActivityLabel(toolName: string): string {
  return TOOL_ACTIVITY_LABELS[toolName] ?? `Using ${toolName}…`;
}

export function AssistantPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [activity, setActivity] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const isActiveSessionFull = activeSession?.status === "full";

  const loadSessions = useCallback(async () => {
    const { sessions: nextSessions } = await api.listChatSessions();
    setSessions(nextSessions);
    return nextSessions;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const nextSessions = await loadSessions();
        if (nextSessions.length > 0) {
          setActiveSessionId(nextSessions[0]!.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sessions");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadSessions]);

  useEffect(() => {
    if (sending) return;
    const interval = setInterval(() => {
      void loadSessions().catch(() => undefined);
    }, 4000);
    return () => clearInterval(interval);
  }, [loadSessions, sending]);

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    void (async () => {
      try {
        const { messages: nextMessages } = await api.listChatMessages(activeSessionId);
        setMessages(nextMessages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load messages");
      }
    })();
  }, [activeSessionId]);

  async function handleNewSession() {
    setError(null);
    const { session } = await api.createChatSession();
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setMessages([]);
    setDraft("");
    setStreamingText("");
  }

  async function handleDeleteSession(sessionId: string) {
    await api.deleteChatSession(sessionId);
    const nextSessions = await loadSessions();
    if (activeSessionId === sessionId) {
      setActiveSessionId(nextSessions[0]?.id ?? null);
      setMessages([]);
    }
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!activeSessionId || !draft.trim() || sending) return;
    if (activeSession?.status === "full") return;

    const content = draft.trim();
    setDraft("");
    setSending(true);
    setStreamingText("");
    setActivity("Thinking…");
    setError(null);

    try {
      await api.sendChatMessage(activeSessionId, content, {
        onTextDelta: (delta) => {
          setActivity(null);
          setStreamingText((prev) => prev + delta);
        },
        onToolCall: (toolName) => setActivity(toolActivityLabel(toolName)),
        onMessage: (message) => {
          if (message.role === "tool") {
            setActivity("Thinking…");
          }
          setMessages((prev) => {
            const existing = prev.findIndex((item) => item.id === message.id);
            if (existing >= 0) {
              const next = [...prev];
              next[existing] = message;
              return next;
            }
            return [...prev, message];
          });
        },
        onSessionUpdate: (session) => {
          setSessions((prev) => prev.map((item) => (item.id === session.id ? session : item)));
        },
        onError: (message) => setError(message),
      });
      setStreamingText("");
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setActivity(null);
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">Loading assistant…</div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Assistant"
        subtitle="Domain-aware chat with read-only access to your watches, tasks, and catalog."
        action={
          <button
            type="button"
            onClick={() => void handleNewSession()}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-brand-purple/40 hover:bg-neutral-800"
          >
            <Plus size={16} />
            New session
          </button>
        }
      />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950/40">
          <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
            <MessageCircle size={14} />
            Sessions
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {sessions.length === 0 ? (
              <p className="px-2 py-4 text-xs text-neutral-500">No sessions yet. Start a new one.</p>
            ) : (
              sessions.map((session) => (
                <ChatSessionRow
                  key={session.id}
                  session={session}
                  active={session.id === activeSessionId}
                  onSelect={() => setActiveSessionId(session.id)}
                  onDelete={() => void handleDeleteSession(session.id)}
                />
              ))
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {!activeSessionId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-neutral-500">
              <MessageCircle size={32} strokeWidth={1.5} />
              <p className="text-sm">Create a session to start chatting.</p>
              <button
                type="button"
                onClick={() => void handleNewSession()}
                className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-medium text-neutral-950"
              >
                New session
              </button>
            </div>
          ) : (
            <>
              <ChatMessageList
                messages={messages}
                streamingText={streamingText || undefined}
                activity={activity}
              />
              {error && (
                <div className="mx-8 mb-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}
              <form onSubmit={(event) => void handleSend(event)} className="border-t border-neutral-800 px-8 py-4">
                {isActiveSessionFull && (
                  <p className="mb-2 text-sm text-neutral-400">This session is full — start a new one to continue.</p>
                )}
                <div className="flex items-end gap-3">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSend(event);
                      }
                    }}
                    rows={2}
                    placeholder="Ask about your watches, tasks, or products…"
                    disabled={sending || isActiveSessionFull}
                    className="min-h-[52px] flex-1 resize-none rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-brand-purple/50 focus:outline-none disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={sending || isActiveSessionFull || !draft.trim()}
                    className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-brand-gradient text-neutral-950 transition-opacity disabled:opacity-40"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

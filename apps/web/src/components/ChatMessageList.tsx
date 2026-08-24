import { Wrench } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ChatMessage } from "../lib/api.js";

const TOOL_LABELS: Record<string, string> = {
  listWatches: "Checked your watches",
  listTasks: "Checked tasks",
  searchProducts: "Searched products",
  getListing: "Looked up listing",
  lookupReference: "Looked up reference",
  checkCompatibility: "Checked compatibility",
  getSessionSummary: "Loaded session summary",
  getHandbookEntry: "Loaded handbook entry",
};

function toolLabel(toolName: string | null): string {
  if (!toolName) return "Used a tool";
  return TOOL_LABELS[toolName] ?? `Used ${toolName}`;
}

function ToolMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-start">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-400">
        <Wrench size={12} className="text-brand-purple" />
        <span>{toolLabel(message.toolName)}</span>
      </div>
    </div>
  );
}

function ActivityBubble({ label }: { label: string }) {
  return (
    <div className="flex justify-start">
      <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-400">
        <span className="flex gap-0.5">
          <span className="h-1 w-1 animate-bounce rounded-full bg-brand-purple [animation-delay:0ms]" />
          <span className="h-1 w-1 animate-bounce rounded-full bg-brand-purple [animation-delay:150ms]" />
          <span className="h-1 w-1 animate-bounce rounded-full bg-brand-purple [animation-delay:300ms]" />
        </span>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function ChatMessageList({
  messages,
  streamingText,
  activity,
}: {
  messages: ChatMessage[];
  streamingText?: string;
  activity?: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: streamingText ? "auto" : "smooth", block: "end" });
  }, [messages, streamingText, activity]);

  if (messages.length === 0 && !streamingText && !activity) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-sm text-neutral-500">
        Ask about your watches, tasks, or product catalog.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-8 py-6">
      {messages.map((message) => {
        if (message.role === "tool") {
          return <ToolMessage key={message.id} message={message} />;
        }
        const isUser = message.role === "user";
        return (
          <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                isUser
                  ? "bg-brand-purple/20 text-neutral-100"
                  : "border border-neutral-800 bg-neutral-900/80 text-neutral-200"
              }`}
            >
              {message.content}
            </div>
          </div>
        );
      })}
      {activity && !streamingText && <ActivityBubble label={activity} />}
      {streamingText && (
        <div className="flex justify-start">
          <div className="max-w-[75%] rounded-2xl border border-neutral-800 bg-neutral-900/80 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-neutral-200">
            {streamingText}
            <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-brand-blue" />
          </div>
        </div>
      )}
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}

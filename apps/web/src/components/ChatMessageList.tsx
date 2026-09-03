import { MessageCircleQuestion, Wrench } from "lucide-react";
import { useEffect, useRef } from "react";
import { CLARIFYING_QUESTION_TOOL_NAME, type ChatMessage } from "../lib/api.js";
import { toolDoneLabel } from "../lib/chatToolLabels.js";

function ToolMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-start">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-400">
        <Wrench size={12} className="text-brand-purple" />
        <span>{toolDoneLabel(message.toolName)}</span>
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

/** Options the assistant offered when it ended its turn with a Clarification. */
export function clarificationOptions(message: ChatMessage): string[] {
  if (message.role !== "assistant" || message.toolName !== CLARIFYING_QUESTION_TOOL_NAME) return [];
  const raw = message.toolArgs?.options;
  if (!Array.isArray(raw)) return [];
  return raw.filter((option): option is string => typeof option === "string" && option.trim().length > 0);
}

function ClarificationOptions({
  options,
  disabled,
  onSelect,
}: {
  options: string[];
  disabled: boolean;
  onSelect?: (text: string) => void;
}) {
  return (
    <div className="mt-2 flex max-w-[75%] flex-wrap gap-2" role="group" aria-label="Suggested answers">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled || !onSelect}
          onClick={() => onSelect?.(option)}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-purple/40 bg-brand-purple/10 px-3 py-1.5 text-xs text-neutral-100 transition-colors hover:border-brand-purple hover:bg-brand-purple/20 disabled:cursor-default disabled:border-neutral-800 disabled:bg-neutral-900/40 disabled:text-neutral-500"
        >
          <MessageCircleQuestion size={12} className="text-brand-purple" />
          {option}
        </button>
      ))}
    </div>
  );
}

export function ChatMessageList({
  messages,
  streamingText,
  activity,
  disabled = false,
  onOptionSelect,
}: {
  messages: ChatMessage[];
  streamingText?: string;
  activity?: string | null;
  /** Disables clarification chips while a turn is in flight or the session is full. */
  disabled?: boolean;
  onOptionSelect?: (text: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: streamingText ? "auto" : "smooth", block: "end" });
  }, [messages, streamingText, activity]);

  // Assistant rows that only issued tool calls carry no text; the tool chips tell that story.
  const visible = messages.filter((message) => message.role !== "assistant" || message.content.trim().length > 0);
  const lastVisibleId = visible.at(-1)?.id ?? null;

  if (visible.length === 0 && !streamingText && !activity) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-sm text-neutral-500">
        Ask about prices, your watches, compatibility, or the product catalog.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-8 py-6">
      {visible.map((message) => {
        if (message.role === "tool") {
          return <ToolMessage key={message.id} message={message} />;
        }
        const isUser = message.role === "user";
        const options = clarificationOptions(message);
        const isLast = message.id === lastVisibleId;
        return (
          <div key={message.id} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                isUser
                  ? "bg-brand-purple/20 text-neutral-100"
                  : "border border-neutral-800 bg-neutral-900/80 text-neutral-200"
              }`}
            >
              {message.content}
            </div>
            {options.length > 0 && (
              <ClarificationOptions
                options={options}
                disabled={disabled || !isLast || Boolean(streamingText)}
                onSelect={onOptionSelect}
              />
            )}
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

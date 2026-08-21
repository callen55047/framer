import { ChatSessionSummarySchema } from "@framer/schema";
import { zodToJsonSchema } from "zod-to-json-schema";

const schemaDocument = zodToJsonSchema(ChatSessionSummarySchema, "ChatSessionSummary");

export function getChatSessionSummaryJsonSchema(): Record<string, unknown> {
  const definitions = (schemaDocument as { definitions?: Record<string, unknown> }).definitions;
  if (definitions && typeof definitions.ChatSessionSummary === "object") {
    return definitions.ChatSessionSummary as Record<string, unknown>;
  }
  return schemaDocument as Record<string, unknown>;
}

export interface SummarizeMessageInput {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string | null;
}

export function buildChatSessionSummaryPromptPrefix(
  messages: SummarizeMessageInput[],
  existingSummary?: string | null
): string {
  const transcript = messages
    .map((message) => {
      const prefix =
        message.role === "tool"
          ? `[tool:${message.toolName ?? "unknown"}]`
          : `[${message.role}]`;
      return `${prefix} ${message.content.slice(0, 1500)}`;
    })
    .join("\n");

  const prior = existingSummary?.trim()
    ? `Existing summary to update:\n${existingSummary.trim()}\n\n`
    : "";

  return `${prior}Summarize this assistant chat session for future reference. Capture user goals, products discussed, decisions, and open questions. Be concise (max 4000 characters).
New messages:
${transcript}

Return only JSON matching the schema.

`;
}

export function deterministicSessionSummary(messages: SummarizeMessageInput[]): string {
  const lines = messages
    .filter((message) => message.role !== "tool")
    .slice(-6)
    .map((message) => `${message.role}: ${message.content.trim().replace(/\s+/g, " ").slice(0, 120)}`);
  return lines.join(" | ") || "Empty session.";
}

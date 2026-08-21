import { ChatSessionTitleSchema } from "@framer/schema";
import { zodToJsonSchema } from "zod-to-json-schema";

const schemaDocument = zodToJsonSchema(ChatSessionTitleSchema, "ChatSessionTitle");

export function getChatSessionTitleJsonSchema(): Record<string, unknown> {
  const definitions = (schemaDocument as { definitions?: Record<string, unknown> }).definitions;
  if (definitions && typeof definitions.ChatSessionTitle === "object") {
    return definitions.ChatSessionTitle as Record<string, unknown>;
  }
  return schemaDocument as Record<string, unknown>;
}

export function buildChatSessionTitlePromptPrefix(userMessage: string, assistantMessage: string): string {
  return `Generate a short title (max 60 characters) for this chat session based on the first exchange.
User: ${userMessage.slice(0, 500)}
Assistant: ${assistantMessage.slice(0, 500)}
Return only JSON matching the schema.

`;
}

export function deterministicSessionTitle(userMessage: string): string {
  const trimmed = userMessage.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 60) return trimmed || "New chat";
  return `${trimmed.slice(0, 59)}…`;
}

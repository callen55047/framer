import { z } from "zod";
import { IdSchema } from "./ids.js";

export const ChatSessionStatusSchema = z.enum(["active", "full"]);
export type ChatSessionStatus = z.infer<typeof ChatSessionStatusSchema>;

export const ChatTitleSourceSchema = z.enum(["user", "auto"]);
export type ChatTitleSource = z.infer<typeof ChatTitleSourceSchema>;

export const ChatMessageRoleSchema = z.enum(["user", "assistant", "tool"]);
export type ChatMessageRole = z.infer<typeof ChatMessageRoleSchema>;

/** `none` = never summarized, `stale` = messages arrived after the last summary, `current` = summary covers every message. */
export const ChatSummaryStatusSchema = z.enum(["none", "stale", "current"]);
export type ChatSummaryStatus = z.infer<typeof ChatSummaryStatusSchema>;

export const ChatSessionSchema = z.object({
  id: IdSchema,
  ownerId: IdSchema,
  title: z.string().min(1).max(120),
  titleSource: ChatTitleSourceSchema,
  provider: z.string(),
  model: z.string(),
  contextBudgetTokens: z.number().int().positive(),
  tokenCount: z.number().int().nonnegative(),
  status: ChatSessionStatusSchema,
  summary: z.string().nullable().optional(),
  summaryUpdatedAt: z.string().datetime().nullable().optional(),
  summaryThroughMessageId: IdSchema.nullable().optional(),
  summaryStatus: ChatSummaryStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ChatSession = z.infer<typeof ChatSessionSchema>;

/** One Tool Call issued by an assistant Message. `id` is the chat_messages.id of the matching tool row. */
export const ChatToolCallSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  args: z.record(z.unknown()),
});
export type ChatToolCall = z.infer<typeof ChatToolCallSchema>;

export const ChatMessageSchema = z.object({
  id: IdSchema,
  sessionId: IdSchema,
  role: ChatMessageRoleSchema,
  content: z.string(),
  toolName: z.string().nullable(),
  toolArgs: z.record(z.unknown()).nullable(),
  toolResult: z.unknown().nullable(),
  toolCalls: z.array(ChatToolCallSchema).nullable().optional(),
  tokenCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/**
 * Name of the tool the assistant calls to end its turn with a Clarification.
 * The resulting assistant Message carries `toolName` = this constant and
 * `toolArgs` = a parsed `Clarification`. See CONTEXT.md#Assistant.
 */
export const CLARIFYING_QUESTION_TOOL_NAME = "askClarifyingQuestion" as const;

export const ClarificationSchema = z.object({
  question: z.string().trim().min(1).max(500),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(4).optional(),
  allowFreeText: z.boolean().default(true),
});
export type Clarification = z.infer<typeof ClarificationSchema>;

export const CreateChatSessionInputSchema = z.object({
  title: z.string().min(1).max(120).optional(),
});
export type CreateChatSessionInput = z.infer<typeof CreateChatSessionInputSchema>;

export const UpdateChatSessionInputSchema = z.object({
  title: z.string().min(1).max(120),
});
export type UpdateChatSessionInput = z.infer<typeof UpdateChatSessionInputSchema>;

export const SendChatMessageInputSchema = z.object({
  content: z.string().min(1).max(32000),
});
export type SendChatMessageInput = z.infer<typeof SendChatMessageInputSchema>;

export const ChatSessionTitleSchema = z.object({
  title: z.string().min(1).max(60),
});
export type ChatSessionTitle = z.infer<typeof ChatSessionTitleSchema>;

export const ChatSessionSummarySchema = z.object({
  summary: z.string().min(1).max(4000),
});
export type ChatSessionSummary = z.infer<typeof ChatSessionSummarySchema>;

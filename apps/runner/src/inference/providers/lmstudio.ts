import {
  ListingExtractionSchema,
  ChatSessionTitleSchema,
  ChatSessionSummarySchema,
  ListingRelevanceSchema,
  WatchTitleSchema,
  type ReferenceSource,
  type ListingItemKind,
  type ProductCategory,
} from "@framer/schema";
import { buildExtractionPromptPrefix, getListingExtractionJsonSchema } from "../extractionSchema.js";
import { buildRelevancePromptPrefix, getListingRelevanceJsonSchema } from "../relevanceSchema.js";
import { buildWatchTitlePromptPrefix, getWatchTitleJsonSchema } from "../watchTitleSchema.js";
import {
  buildChatSessionTitlePromptPrefix,
  deterministicSessionTitle,
  getChatSessionTitleJsonSchema,
} from "../sessionTitleSchema.js";
import {
  buildChatSessionSummaryPromptPrefix,
  deterministicSessionSummary,
  getChatSessionSummaryJsonSchema,
} from "../sessionSummarySchema.js";
import {
  parseOpenAiSseStream,
  parseToolCallArgs,
  toOpenAiMessages,
  toOpenAiTools,
} from "../chatStreamUtils.js";
import type { ChatMessage, ChatStreamEvent, ChatTool, InferenceConfig, InferenceProvider } from "../types.js";

const extractionJsonSchema = getListingExtractionJsonSchema();
const relevanceJsonSchema = getListingRelevanceJsonSchema();
const watchTitleJsonSchema = getWatchTitleJsonSchema();
const sessionTitleJsonSchema = getChatSessionTitleJsonSchema();
const sessionSummaryJsonSchema = getChatSessionSummaryJsonSchema();

export function createLmStudioProvider(config: InferenceConfig): InferenceProvider {
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  async function generate(prompt: string, schema: Record<string, unknown>, name: string) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: { name, strict: true, schema },
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`LM Studio request failed: ${res.status} ${await res.text().catch(() => "")}`);
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("LM Studio response missing choices[0].message.content");
    }
    return JSON.parse(content);
  }

  return {
    kind: "lmstudio",
    async extractListing(pageText, source, hints) {
      const parsed = await generate(
        buildExtractionPromptPrefix(source, hints) + pageText,
        extractionJsonSchema,
        "listing_extraction"
      );
      return ListingExtractionSchema.parse(parsed);
    },
    async classifyListingRelevance(pageText, itemKind) {
      const parsed = await generate(
        buildRelevancePromptPrefix(itemKind) + pageText,
        relevanceJsonSchema,
        "listing_relevance"
      );
      return ListingRelevanceSchema.parse(parsed);
    },
    async generateWatchTitle(input) {
      const parsed = await generate(
        buildWatchTitlePromptPrefix(input),
        watchTitleJsonSchema,
        "watch_title"
      );
      return WatchTitleSchema.parse(parsed).displayTitle;
    },
    async generateSessionTitle(userMessage: string, assistantMessage: string) {
      try {
        const parsed = await generate(
          buildChatSessionTitlePromptPrefix(userMessage, assistantMessage),
          sessionTitleJsonSchema,
          "chat_session_title"
        );
        return ChatSessionTitleSchema.parse(parsed).title;
      } catch {
        return deterministicSessionTitle(userMessage);
      }
    },
    async summarizeChatSession(messages, existingSummary) {
      try {
        const parsed = await generate(
          buildChatSessionSummaryPromptPrefix(messages, existingSummary),
          sessionSummaryJsonSchema,
          "chat_session_summary"
        );
        return ChatSessionSummarySchema.parse(parsed).summary;
      } catch {
        return deterministicSessionSummary(messages);
      }
    },
    async *chat(messages: ChatMessage[], tools: ChatTool[]): AsyncIterable<ChatStreamEvent> {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          messages: toOpenAiMessages(messages),
          tools: tools.length > 0 ? toOpenAiTools(tools) : undefined,
          stream: true,
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        throw new Error(`LM Studio chat failed: ${res.status} ${await res.text().catch(() => "")}`);
      }

      const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();
      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of parseOpenAiSseStream(res.body)) {
        const choice = (chunk.choices as Array<{ delta?: Record<string, unknown>; finish_reason?: string }> | undefined)?.[0];
        const delta = choice?.delta;
        if (delta?.content && typeof delta.content === "string") {
          yield { type: "text-delta", delta: delta.content };
        }

        const toolCalls = delta?.tool_calls as
          | Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>
          | undefined;
        if (toolCalls) {
          for (const call of toolCalls) {
            const index = call.index ?? 0;
            const existing = pendingToolCalls.get(index) ?? { id: call.id ?? `call_${index}`, name: "", args: "" };
            if (call.id) existing.id = call.id;
            if (call.function?.name) existing.name = call.function.name;
            if (call.function?.arguments) existing.args += call.function.arguments;
            pendingToolCalls.set(index, existing);
          }
        }

        const usage = chunk.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
        if (usage) {
          promptTokens = Number(usage.prompt_tokens ?? 0);
          completionTokens = Number(usage.completion_tokens ?? 0);
        }
      }

      for (const call of pendingToolCalls.values()) {
        if (!call.name) continue;
        yield {
          type: "tool-call",
          id: call.id,
          name: call.name,
          args: parseToolCallArgs(call.args),
        };
      }

      if (promptTokens > 0 || completionTokens > 0) {
        yield { type: "usage", promptTokens, completionTokens };
      }
      yield { type: "done" };
    },
  };
}

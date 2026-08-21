import {
  ListingExtractionSchema,
  ChatSessionTitleSchema,
  ChatSessionSummarySchema,
  type ReferenceSource,
  type ListingItemKind,
  type ProductCategory,
} from "@framer/schema";
import { ListingRelevanceSchema, WatchTitleSchema } from "@framer/schema";
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
  parseNdjsonStream,
  parseToolCallArgs,
  toOllamaMessages,
  toOllamaTools,
} from "../chatStreamUtils.js";
import type { ChatMessage, ChatStreamEvent, ChatTool, InferenceConfig, InferenceProvider } from "../types.js";

const extractionJsonSchema = getListingExtractionJsonSchema();
const relevanceJsonSchema = getListingRelevanceJsonSchema();
const watchTitleJsonSchema = getWatchTitleJsonSchema();
const sessionTitleJsonSchema = getChatSessionTitleJsonSchema();
const sessionSummaryJsonSchema = getChatSessionSummaryJsonSchema();

export function createOllamaProvider(config: InferenceConfig): InferenceProvider {
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  async function generate(prompt: string, schema: Record<string, unknown>) {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        prompt,
        format: schema,
        stream: false,
        options: { temperature: 0 },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama request failed: ${res.status} ${await res.text().catch(() => "")}`);
    }

    const body = (await res.json()) as { response: string };
    return JSON.parse(body.response);
  }

  return {
    kind: "ollama",
    async extractListing(pageText: string, source?: ReferenceSource, hints?: { itemKind?: ListingItemKind; expectedCategory?: ProductCategory | null }) {
      const parsed = await generate(
        buildExtractionPromptPrefix(source, hints) + pageText,
        extractionJsonSchema
      );
      return ListingExtractionSchema.parse(parsed);
    },
    async classifyListingRelevance(pageText: string, itemKind: ListingItemKind) {
      const parsed = await generate(buildRelevancePromptPrefix(itemKind) + pageText, relevanceJsonSchema);
      return ListingRelevanceSchema.parse(parsed);
    },
    async generateWatchTitle(input) {
      const parsed = await generate(buildWatchTitlePromptPrefix(input), watchTitleJsonSchema);
      return WatchTitleSchema.parse(parsed).displayTitle;
    },
    async generateSessionTitle(userMessage: string, assistantMessage: string) {
      try {
        const parsed = await generate(
          buildChatSessionTitlePromptPrefix(userMessage, assistantMessage),
          sessionTitleJsonSchema
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
          sessionSummaryJsonSchema
        );
        return ChatSessionSummarySchema.parse(parsed).summary;
      } catch {
        return deterministicSessionSummary(messages);
      }
    },
    async *chat(messages: ChatMessage[], tools: ChatTool[]): AsyncIterable<ChatStreamEvent> {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          messages: toOllamaMessages(messages),
          tools: tools.length > 0 ? toOllamaTools(tools) : undefined,
          stream: true,
          options: { temperature: 0.7 },
        }),
      });

      if (!res.ok) {
        throw new Error(`Ollama chat failed: ${res.status} ${await res.text().catch(() => "")}`);
      }

      const pendingToolCalls = new Map<number, { id: string; name: string; args: string }>();
      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of parseNdjsonStream(res.body)) {
        const message = chunk.message as
          | {
              content?: string;
              tool_calls?: Array<{
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            }
          | undefined;

        if (message?.content) {
          yield { type: "text-delta", delta: message.content };
        }

        if (message?.tool_calls) {
          for (const [index, call] of message.tool_calls.entries()) {
            const id = call.id ?? `call_${index}`;
            const name = call.function?.name ?? "";
            const argsFragment = call.function?.arguments ?? "";
            const existing = pendingToolCalls.get(index) ?? { id, name, args: "" };
            existing.id = id;
            if (name) existing.name = name;
            existing.args += argsFragment;
            pendingToolCalls.set(index, existing);
          }
        }

        if (chunk.done) {
          promptTokens = Number(chunk.prompt_eval_count ?? 0);
          completionTokens = Number(chunk.eval_count ?? 0);
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

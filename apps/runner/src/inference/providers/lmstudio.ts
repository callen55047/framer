import { ListingExtractionSchema, ListingRelevanceSchema, WatchTitleSchema, type ListingExtraction, type ReferenceSource, type ListingItemKind, type ProductCategory } from "@framer/schema";
import { buildExtractionPromptPrefix, getListingExtractionJsonSchema } from "../extractionSchema.js";
import { buildRelevancePromptPrefix, getListingRelevanceJsonSchema } from "../relevanceSchema.js";
import { buildWatchTitlePromptPrefix, getWatchTitleJsonSchema } from "../watchTitleSchema.js";
import type { InferenceConfig, InferenceProvider } from "../types.js";

const extractionJsonSchema = getListingExtractionJsonSchema();
const relevanceJsonSchema = getListingRelevanceJsonSchema();
const watchTitleJsonSchema = getWatchTitleJsonSchema();

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
  };
}

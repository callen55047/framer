import { ListingExtractionSchema, type ReferenceSource, type ListingItemKind, type ProductCategory } from "@framer/schema";
import { buildExtractionPromptPrefix, getListingExtractionJsonSchema } from "../extractionSchema.js";
import { buildRelevancePromptPrefix, getListingRelevanceJsonSchema } from "../relevanceSchema.js";
import { buildWatchTitlePromptPrefix, getWatchTitleJsonSchema } from "../watchTitleSchema.js";
import type { InferenceConfig, InferenceProvider } from "../types.js";
import { ListingRelevanceSchema, WatchTitleSchema } from "@framer/schema";

const extractionJsonSchema = getListingExtractionJsonSchema();
const relevanceJsonSchema = getListingRelevanceJsonSchema();
const watchTitleJsonSchema = getWatchTitleJsonSchema();

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
  };
}

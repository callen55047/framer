import { runInference } from "../pools/inferencePool.js";
import { config, reloadInferenceFromEnv } from "../config.js";
import { createInferenceProvider } from "./createProvider.js";
import type { InferenceProvider } from "./types.js";
import type { ListingExtraction, ListingItemKind, ListingRelevance, ProductCategory, ReferenceSource } from "@framer/schema";

let activeProvider = createInferenceProvider(config.inference);

/** Rebind the active provider after env-based configuration changes (benchmark harness). */
export function setInferenceProviderForTests(provider: InferenceProvider): void {
  activeProvider = provider;
}

/** Reset to the configured production provider. */
export function resetInferenceProvider(): void {
  reloadInferenceFromEnv();
  activeProvider = createInferenceProvider(config.inference);
}

export async function extractListing(
  pageText: string,
  source?: ReferenceSource,
  hints?: { itemKind?: ListingItemKind; expectedCategory?: ProductCategory | null }
): Promise<ListingExtraction> {
  return runInference(() => activeProvider.extractListing(pageText, source, hints));
}

export async function classifyListingRelevance(
  pageText: string,
  itemKind: ListingItemKind
): Promise<ListingRelevance> {
  return runInference(() => activeProvider.classifyListingRelevance(pageText, itemKind));
}

export async function generateWatchTitle(input: {
  listingTitle: string;
  domain: string;
  itemKind: ListingItemKind;
  expectedCategory?: ProductCategory | null;
}): Promise<string> {
  return runInference(() => activeProvider.generateWatchTitle(input));
}

export function getActiveInferenceProviderKind(): string {
  return activeProvider.kind;
}

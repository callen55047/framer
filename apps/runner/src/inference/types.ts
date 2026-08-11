import type {
  ListingExtraction,
  ListingItemKind,
  ListingRelevance,
  ProductCategory,
  ReferenceSource,
} from "@framer/schema";

export const INFERENCE_PROVIDER_KINDS = ["ollama", "lmstudio"] as const;
export type InferenceProviderKind = (typeof INFERENCE_PROVIDER_KINDS)[number];

export interface InferenceConfig {
  provider: InferenceProviderKind;
  baseUrl: string;
  model: string;
}

export interface InferenceProvider {
  readonly kind: InferenceProviderKind;
  extractListing(
    pageText: string,
    source?: ReferenceSource,
    hints?: { itemKind?: ListingItemKind; expectedCategory?: ProductCategory | null }
  ): Promise<ListingExtraction>;
  classifyListingRelevance(pageText: string, itemKind: ListingItemKind): Promise<ListingRelevance>;
  generateWatchTitle(input: {
    listingTitle: string;
    domain: string;
    itemKind: ListingItemKind;
    expectedCategory?: ProductCategory | null;
  }): Promise<string>;
}

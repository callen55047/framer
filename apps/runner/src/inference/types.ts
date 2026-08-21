import type {
  ListingExtraction,
  ListingItemKind,
  ListingRelevance,
  ProductCategory,
  ReferenceSource,
  Spec,
} from "@framer/schema";

export const INFERENCE_PROVIDER_KINDS = ["ollama", "lmstudio"] as const;
export type InferenceProviderKind = (typeof INFERENCE_PROVIDER_KINDS)[number];

export interface InferenceConfig {
  provider: InferenceProviderKind;
  baseUrl: string;
  model: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: { id: string; name: string; args: Record<string, unknown> }[];
}

export interface ChatTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ChatStreamEvent =
  | { type: "text-delta"; delta: string }
  | { type: "tool-call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "usage"; promptTokens: number; completionTokens: number }
  | { type: "done" };

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
  generateSessionTitle(userMessage: string, assistantMessage: string): Promise<string>;
  summarizeChatSession(
    messages: { role: "user" | "assistant" | "tool"; content: string; toolName?: string | null }[],
    existingSummary?: string | null
  ): Promise<string>;
  extractProductSpecs(pageText: string): Promise<Spec>;
  synthesizeResearchAnswer(question: string, excerpts: string): Promise<string>;
  chat(messages: ChatMessage[], tools: ChatTool[]): AsyncIterable<ChatStreamEvent>;
}

import { formatUnsupportedListingMessage } from "@framer/schema";
import { classifyListingRelevance } from "../inference/extractListing.js";
import { hasAffirmativeProductListingEvidence } from "../lib/ecwidListing.js";
import { buildListingPageText } from "../lib/listingPageText.js";
import { truncateForPrompt } from "../lib/html.js";
import { markListingUnsupportedRemote } from "../lib/apiClient.js";
import type { ListingItemKind } from "@framer/schema";

export class UnsupportedListingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedListingError";
  }
}

export interface ValidateStageInput {
  pageText: string;
  html?: string;
  pageUrl?: string;
  listingId: string;
  itemKind: ListingItemKind;
}

export async function validateStage(input: ValidateStageInput): Promise<void> {
  const listingText = input.html
    ? truncateForPrompt(buildListingPageText(input.html))
    : truncateForPrompt(input.pageText);
  const relevance = await classifyListingRelevance(listingText, input.itemKind);
  if (relevance.supported) return;

  if (input.html && hasAffirmativeProductListingEvidence(input.html, input.pageUrl)) {
    return;
  }

  await markListingUnsupportedRemote(input.listingId, relevance.reason);
  throw new UnsupportedListingError(formatUnsupportedListingMessage(relevance.reason));
}

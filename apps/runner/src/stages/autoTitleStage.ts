import { generateWatchTitle } from "../inference/extractListing.js";
import { deterministicWatchTitle } from "../inference/watchTitleSchema.js";
import { setWatchDisplayTitleRemote } from "../lib/apiClient.js";
import type { ListingItemKind, ProductCategory } from "@framer/schema";

export async function autoTitleStage(input: {
  watchIds: string[];
  listingTitle: string;
  domain: string;
  itemKind: ListingItemKind;
  expectedCategory?: ProductCategory | null;
}): Promise<void> {
  if (input.watchIds.length === 0) return;

  let displayTitle: string;
  try {
    displayTitle = await generateWatchTitle({
      listingTitle: input.listingTitle,
      domain: input.domain,
      itemKind: input.itemKind,
      expectedCategory: input.expectedCategory,
    });
  } catch {
    displayTitle = deterministicWatchTitle(input.domain, input.listingTitle);
  }

  await Promise.all(input.watchIds.map((watchId) => setWatchDisplayTitleRemote(watchId, displayTitle)));
}

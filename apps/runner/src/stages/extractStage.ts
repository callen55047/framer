import type { ExtractedVariant, ListingExtraction } from "@framer/schema";
import { groundExtraction, isRetailerReferenceSource, type ListingItemKind, type ProductCategory, type ReferenceSource } from "@framer/schema";
import { extractListing } from "../inference/extractListing.js";
import { tryExtractEcwidListing } from "../lib/ecwidListing.js";
import { buildListingPageText } from "../lib/listingPageText.js";
import { truncateForPrompt } from "../lib/html.js";
import { extractShopifyVariantSnapshot } from "../lib/shopifyListing.js";
import { computeVariantAggregate } from "@framer/schema";

export interface ExtractStageInput {
  pageText: string;
  html?: string;
  pageUrl?: string;
  referenceSource?: ReferenceSource;
  itemKind?: ListingItemKind;
  expectedCategory?: ProductCategory | null;
}

export interface ExtractResult {
  extraction: ListingExtraction;
  variants: ExtractedVariant[];
  groundedFields: string[];
}

/**
 * Extract Stage: schema-constrained decoding guarantees shape; Grounding
 * (CONTEXT.md#Grounding) is the check for truth. Price and title are
 * critical fields — if either is ungrounded, this throws and the Stage
 * retries, since a different sampling of the same deterministic (temp=0)
 * model call will produce the same wrong answer only if the page itself is
 * genuinely ambiguous, in which case exhausting attempts and failing the Job
 * is the correct outcome rather than silently persisting a guess.
 *
 * Shopify product pages are extracted deterministically from embedded
 * `meta.product` JSON (variant-aware via ?variant=) before falling back to
 * the local model on unstructured retailer HTML.
 */
export async function extractStage(input: ExtractStageInput): Promise<ExtractResult> {
  const { pageText, html, pageUrl, referenceSource, itemKind, expectedCategory } = input;
  const hints = { itemKind, expectedCategory };

  if (referenceSource && !isRetailerReferenceSource(referenceSource)) {
    console.warn(
      `[extract] domain "${referenceSource.id}" (${referenceSource.category}) is not retailer-classified; extracting as listing anyway`
    );
  }

  const groundingText = html ? buildListingPageText(html) : pageText;

  const shopifySnapshot =
    html && pageUrl ? extractShopifyVariantSnapshot(html, pageUrl) : null;
  const ecwidExtraction = html && pageUrl ? tryExtractEcwidListing(html, pageUrl) : null;

  let extraction: ListingExtraction;
  let variants: ExtractedVariant[];

  if (shopifySnapshot) {
    variants = shopifySnapshot.variants;
    const aggregate = computeVariantAggregate(variants);
    extraction = {
      title: shopifySnapshot.title,
      price: aggregate.price ?? variants[0]?.price ?? 0,
      currency: aggregate.currency ?? shopifySnapshot.currency,
      inStock: aggregate.inStock,
      brand: shopifySnapshot.brand,
      modelYear: null,
    };
  } else if (ecwidExtraction) {
    variants = [
      {
        providerId: "default",
        label: ecwidExtraction.title,
        options: [],
        price: ecwidExtraction.price,
        currency: ecwidExtraction.currency,
        inStock: ecwidExtraction.inStock,
      },
    ];
    extraction = ecwidExtraction;
  } else {
    extraction = await extractListing(truncateForPrompt(pageText), referenceSource, hints);
    variants = [
      {
        providerId: "default",
        label: extraction.title,
        options: [],
        price: extraction.price,
        currency: extraction.currency,
        inStock: extraction.inStock,
      },
    ];
  }

  const groundingSource =
    shopifySnapshot
      ? `${groundingText} ${shopifySnapshot.variants
          .map((variant) => `$${variant.price.toFixed(2)}`)
          .join(" ")}`
      : groundingText;

  const result = groundExtraction(extraction, groundingSource);

  if (!result.grounded) {
    throw new Error(
      `extraction not grounded in source text; ungrounded fields: ${result.ungroundedFields.join(", ")}`
    );
  }

  return { extraction, variants, groundedFields: result.groundedFields };
}

import type { ExtractedVariant, ListingExtraction, VariantPreference } from "@framer/schema";
import {
  anyVariantAvailable,
  matchShopifyVariant,
  parseVariantDimensions,
  type ShopifyVariantRecord,
} from "./variantMatching.js";

interface ShopifyMetaVariant {
  id: number;
  price: number;
  name?: string;
  public_title?: string;
  available?: boolean;
}

interface ShopifyMetaProduct {
  vendor?: string;
  title?: string;
  variants?: ShopifyMetaVariant[];
}

interface ShopifyMeta {
  product?: ShopifyMetaProduct;
}

export interface ShopifyVariantSnapshot {
  title: string;
  brand: string | null;
  currency: string;
  variants: ExtractedVariant[];
}

export class ShopifyVariantMatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyVariantMatchError";
  }
}

/** Shopify storefront pages embed `var meta = {...}` with product + variant prices in cents. */
export function extractShopifyVariantSnapshot(html: string, pageUrl: string): ShopifyVariantSnapshot | null {
  const meta = parseShopifyMeta(html);
  if (!meta?.product?.variants?.length) return null;

  const product = meta.product;
  const baseVariants = product.variants ?? [];
  const records = enrichShopifyVariants(baseVariants, html);
  const currency = parseShopifyCurrency(html) ?? "USD";
  const title = deriveListingTitle(product, records[0] ?? null);
  const brand = product.vendor?.trim() || null;

  const variants = records.map((record) => toExtractedVariant(record, currency));

  return { title, brand, currency, variants };
}

export function tryExtractShopifyListing(
  html: string,
  pageUrl: string,
  preference?: VariantPreference | null
): ListingExtraction | null {
  const snapshot = extractShopifyVariantSnapshot(html, pageUrl);
  if (!snapshot) return null;

  const records = snapshot.variants.map((variant) => ({
    id: Number(variant.providerId),
    price: Math.round(variant.price * 100),
    name: variant.label,
    public_title: variant.label,
    available: variant.inStock,
  }));

  const variantId = parseVariantIdFromUrl(pageUrl);
  let selected: ExtractedVariant | null = null;

  if (preference) {
    const match = matchShopifyVariant(records, preference);
    if (!match) {
      throw new ShopifyVariantMatchError(
        `no unique Shopify variant matched ${preference.frameSize} / ${preference.wheelSizeInches}"`
      );
    }
    selected = snapshot.variants.find((variant) => variant.providerId === String(match.id)) ?? null;
  } else if (variantId !== null) {
    selected = snapshot.variants.find((variant) => variant.providerId === String(variantId)) ?? null;
  } else {
    selected = snapshot.variants[0] ?? null;
  }

  if (!selected) return null;

  const inStock = preference
    ? selected.inStock
    : anyVariantAvailable(records);

  return {
    title: snapshot.title,
    price: selected.price,
    currency: selected.currency,
    inStock,
    brand: snapshot.brand,
    modelYear: null,
  };
}

function toExtractedVariant(record: ShopifyVariantRecord, currency: string): ExtractedVariant {
  const label = variantLabel(record);
  const dimensions = parseVariantDimensions(label);
  return {
    providerId: String(record.id),
    label,
    options: label.includes("/")
      ? label.split("/").map((part, index) => ({ name: `Option ${index + 1}`, value: part.trim() }))
      : [{ name: "Variant", value: label }],
    frameSize: dimensions.frameSize ?? undefined,
    wheelSizeInches: dimensions.wheelSizeInches ?? undefined,
    price: record.price / 100,
    currency,
    inStock: record.available ?? true,
  };
}

function variantLabel(variant: ShopifyVariantRecord): string {
  return variant.public_title?.trim() || variant.name?.trim() || "Default";
}

function parseShopifyMeta(html: string): ShopifyMeta | null {
  const marker = "var meta = ";
  const start = html.indexOf(marker);
  if (start === -1) return null;

  const jsonStart = start + marker.length;
  if (html[jsonStart] !== "{") return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = jsonStart; i < html.length; i++) {
    const char = html[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1)) as ShopifyMeta;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseEmbeddedProductJson(html: string): { variants?: ShopifyMetaVariant[] } | null {
  const markers = ["var afterpay_product = ", "var CKCurrentProduct = "];
  for (const marker of markers) {
    const start = html.indexOf(marker);
    if (start === -1) continue;
    const jsonStart = start + marker.length;
    if (html[jsonStart] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = jsonStart; i < html.length; i++) {
      const char = html[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\" && inString) {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "{") depth++;
      if (char === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(jsonStart, i + 1)) as { variants?: ShopifyMetaVariant[] };
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function enrichShopifyVariants(
  baseVariants: ShopifyMetaVariant[],
  html: string
): ShopifyVariantRecord[] {
  const embedded = parseEmbeddedProductJson(html);
  const availabilityById = new Map<number, boolean>();
  for (const variant of embedded?.variants ?? []) {
    if (variant.available !== undefined) {
      availabilityById.set(variant.id, variant.available);
    }
  }

  return baseVariants.map((variant) => ({
    ...variant,
    available: variant.available ?? availabilityById.get(variant.id),
  }));
}

function parseShopifyCurrency(html: string): string | null {
  const match = html.match(/Shopify\.currency\s*=\s*(\{[^}]+\})/);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]) as { active?: string };
    return parsed.active && parsed.active.length === 3 ? parsed.active : null;
  } catch {
    return null;
  }
}

function parseVariantIdFromUrl(pageUrl: string): number | null {
  try {
    const value = new URL(pageUrl).searchParams.get("variant");
    if (!value) return null;
    const id = Number(value);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

function deriveListingTitle(
  product: ShopifyMetaProduct,
  variant: ShopifyVariantRecord | null
): string {
  const explicitTitle = product.title?.trim();
  if (explicitTitle) return explicitTitle;

  const variantName = variant?.name?.trim();
  if (!variantName) return "Unknown product";

  const dashIndex = variantName.indexOf(" - ");
  return dashIndex > 0 ? variantName.slice(0, dashIndex).trim() : variantName;
}

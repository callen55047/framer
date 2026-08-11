import type { ListingExtraction } from "@framer/schema";
import { fetchPooled } from "../pools/fetchPool.js";
import { tryExtractShopifyListing } from "./shopifyListing.js";

interface JsonLdProduct {
  name?: string;
  brand?: string | { name?: string };
  offers?: {
    price?: string | number;
    priceCurrency?: string;
    availability?: string;
  };
}

export interface EcwidStaticProductPage {
  htmlCode?: string;
  jsonLDHtml?: string;
  metaDescriptionHtml?: string;
  title?: string;
}

export function isEcwidStorefrontPage(html: string): boolean {
  return (
    html.includes("id=\"ecwid_html\"") ||
    html.includes("ec-instant-site") ||
    html.includes("id=\"ecwid_body\"")
  );
}

export function parseEcwidStoreId(html: string): number | null {
  const patterns = [/"siteId":\s*(\d+)/, /siteId\\?":\s*(\d+)/, /siteId[=:](\d+)/];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const id = Number(match[1]);
      if (Number.isFinite(id)) return id;
    }
  }
  return null;
}

export function parseEcwidProductId(html: string, pageUrl: string): number | null {
  const imageMatch = html.match(/\/products\/(\d+)\//);
  if (imageMatch?.[1]) {
    const id = Number(imageMatch[1]);
    if (Number.isFinite(id)) return id;
  }

  try {
    const slug = new URL(pageUrl).pathname.split("/").pop() ?? "";
    const slugMatch = html.match(new RegExp(`"urlPath":"[^"]*${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^}]*"productId":(\\d+)`));
    if (slugMatch?.[1]) {
      const id = Number(slugMatch[1]);
      if (Number.isFinite(id)) return id;
    }
  } catch {
    return null;
  }

  return null;
}

function parseJsonLdProducts(html: string): JsonLdProduct[] {
  const products: JsonLdProduct[] = [];
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as JsonLdProduct & { "@type"?: string };
      const type = parsed["@type"];
      if (type === "Product" || (typeof type === "string" && type.includes("Product"))) {
        products.push(parsed);
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return products;
}

function parseBrand(brand: JsonLdProduct["brand"]): string | null {
  if (typeof brand === "string") return brand.trim() || null;
  if (brand && typeof brand === "object" && brand.name) return brand.name.trim() || null;
  return null;
}

function parsePrice(value: string | number | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function deriveEcwidTitle(product: JsonLdProduct, html: string): string {
  const titleAttr = html.match(/title="([^"]+Frame[^"]*2023[^"]*)"/i)?.[1];
  if (titleAttr) return titleAttr.replace(/&amp;#39;/g, "'").trim();

  const name = product.name?.trim();
  if (!name) return "Unknown product";
  const pipeIndex = name.indexOf("|");
  return pipeIndex > 0 ? name.slice(0, pipeIndex).trim() : name;
}

export function inferEcwidInStock(html: string): boolean {
  const optionBlocks = html.match(/form-control--radio[\s\S]*?<\/label>/gi) ?? [];
  if (optionBlocks.length === 0) {
    const lower = html.toLowerCase();
    if (lower.includes("sold out") || lower.includes("out of stock")) return false;
    return true;
  }

  return optionBlocks.some((block) => {
    if (/form-control--disabled|disabled/i.test(block)) return false;
    if (/Sold out/i.test(block)) return false;
    return true;
  });
}

export function tryExtractEcwidListing(html: string, pageUrl: string): ListingExtraction | null {
  const product = parseJsonLdProducts(html)[0];
  if (!product?.offers) return null;

  const price = parsePrice(product.offers.price);
  if (price === null) return null;

  const currency = product.offers.priceCurrency?.trim() || "USD";
  const title = deriveEcwidTitle(product, html);
  const brand = parseBrand(product.brand);
  const hasVariantOptions = /form-control--radio/i.test(html);
  const inStock = hasVariantOptions
    ? inferEcwidInStock(html)
    : (product.offers.availability?.includes("InStock") ?? inferEcwidInStock(html));

  return {
    title,
    price,
    currency,
    inStock,
    brand,
    modelYear: null,
  };
}

export function hasAffirmativeProductListingEvidence(html: string, pageUrl?: string): boolean {
  if (pageUrl && tryExtractShopifyListing(html, pageUrl)) return true;
  if (pageUrl && tryExtractEcwidListing(html, pageUrl)) return true;

  if (
    isEcwidStorefrontPage(html) &&
    pageUrl?.includes("/products/") &&
    parseEcwidStoreId(html) !== null &&
    parseEcwidProductId(html, pageUrl) !== null
  ) {
    return true;
  }

  return false;
}

export async function fetchEcwidStaticProductPage(
  storeId: number,
  productId: number
): Promise<EcwidStaticProductPage | null> {
  const url = `https://storefront.ecwid.com/product-page/${storeId}/${productId}/static-code?cleanUrls=true`;
  const res = await fetchPooled(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as EcwidStaticProductPage;
}

export async function augmentEcwidProductHtml(html: string, pageUrl: string): Promise<string> {
  if (!isEcwidStorefrontPage(html) || !pageUrl.includes("/products/")) return html;

  const storeId = parseEcwidStoreId(html);
  const productId = parseEcwidProductId(html, pageUrl);
  if (storeId === null || productId === null) return html;

  const staticPage = await fetchEcwidStaticProductPage(storeId, productId);
  if (!staticPage) return html;

  return [
    html,
    staticPage.htmlCode ?? "",
    staticPage.jsonLDHtml ?? "",
    staticPage.metaDescriptionHtml ?? "",
  ].join("");
}

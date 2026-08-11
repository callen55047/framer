import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { JobKindSchema, type JobKind } from "./job.js";

export const ReferenceSourceCategorySchema = z.enum([
  "manufacturer_specs",
  "technical_reference",
  "component_database",
  "bike_specs",
  "tire_testing",
  "news_reviews",
  "product_testing",
  "retailer_pricing",
  "retailer_pricing_specs",
]);
export type ReferenceSourceCategory = z.infer<typeof ReferenceSourceCategorySchema>;

export const ReferenceSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
  category: ReferenceSourceCategorySchema,
  domains: z.array(z.string().min(1)).min(1),
  jobKinds: z.array(JobKindSchema).min(1),
});
export type ReferenceSource = z.infer<typeof ReferenceSourceSchema>;

const ReferenceSourceCatalogSchema = z.array(ReferenceSourceSchema);

function loadReferenceSources(): ReferenceSource[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const catalogPath = join(here, "..", "data", "reference-sources.json");
  const raw = JSON.parse(readFileSync(catalogPath, "utf8")) as unknown;
  return ReferenceSourceCatalogSchema.parse(raw);
}

export const REFERENCE_SOURCES: readonly ReferenceSource[] = loadReferenceSources();

const RETAILER_CATEGORIES = new Set<ReferenceSourceCategory>([
  "retailer_pricing",
  "retailer_pricing_specs",
]);

/** Strip leading www. and lowercase for stable domain comparison. */
export function normalizeDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

const domainIndex = new Map<string, ReferenceSource>();
for (const source of REFERENCE_SOURCES) {
  for (const domain of source.domains) {
    domainIndex.set(normalizeDomain(domain), source);
  }
}

export function findReferenceSourceByDomain(domain: string): ReferenceSource | undefined {
  return domainIndex.get(normalizeDomain(domain));
}

export function findReferenceSourceByUrl(url: string): ReferenceSource | undefined {
  const hostname = new URL(url).hostname;
  return findReferenceSourceByDomain(hostname);
}

export function isKnownFetchDomain(domain: string): boolean {
  return domainIndex.has(normalizeDomain(domain));
}

export function getKnownFetchDomains(): readonly string[] {
  return [...domainIndex.keys()].sort();
}

export function getReferenceSourcesForJobKind(kind: JobKind): ReferenceSource[] {
  return REFERENCE_SOURCES.filter((source) => source.jobKinds.includes(kind));
}

export function isRetailerReferenceSource(source: ReferenceSource): boolean {
  return RETAILER_CATEGORIES.has(source.category);
}

/** Minimal shape returned by the API when a watch URL matches a known source. */
export const MatchedReferenceSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: ReferenceSourceCategorySchema,
});
export type MatchedReferenceSource = z.infer<typeof MatchedReferenceSourceSchema>;

export function toMatchedReferenceSource(
  source: ReferenceSource
): MatchedReferenceSource {
  return MatchedReferenceSourceSchema.parse({
    id: source.id,
    name: source.name,
    category: source.category,
  });
}

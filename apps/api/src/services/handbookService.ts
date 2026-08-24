import {
  REFERENCE_SOURCES,
  ReferenceSourceCategorySchema,
  getSearchableSourcesForCategory,
  handbookAnnotationId,
  handbookDiagramId,
  handbookIllustrationPublicPath,
  isRetailerReferenceSource,
  loadAllHandbookEntriesWithProse,
  loadHandbookEntryWithProse,
  type AssistantReferenceCategory,
  type HandbookEntryWithProse,
  type ReferenceSource,
  type ReferenceSourceCategory,
} from "@framer/schema";

const CATEGORY_LABELS: Record<ReferenceSourceCategory, string> = {
  manufacturer_specs: "Manufacturer Specs & Compatibility",
  technical_reference: "Technical Reference & Compatibility",
  component_database: "Component Database & Compatibility",
  bike_specs: "Bike Specs & Comparison",
  tire_testing: "Tire Testing & Specifications",
  news_reviews: "MTB News & Reviews",
  product_testing: "MTB Reviews & Product Testing",
  retailer_pricing: "Retailer Pricing",
  retailer_pricing_specs: "Retailer Pricing Specs",
};

const CATEGORY_ROLES: Partial<Record<ReferenceSourceCategory, string>> = {
  manufacturer_specs: "Primary Spec source",
  technical_reference: "Compatibility reference",
  component_database: "Structured lookup pages",
  bike_specs: "Bike-level geometry and spec pages",
  tire_testing: "Tire-specific Specs",
  retailer_pricing: "Listing price, title, and stock only",
  retailer_pricing_specs: "Listing price and product specs from retailers",
  news_reviews: "Supplementary research only — never persisted as Specs without manufacturer grounding",
  product_testing: "Supplementary research only — never persisted as Specs without manufacturer grounding",
};

export interface HandbookSourceProjection {
  id: string;
  name: string;
  url: string;
  category: ReferenceSourceCategory;
  categoryLabel: string;
  jobKinds: ReferenceSource["jobKinds"];
  searchable: boolean;
  searchRendering: ReferenceSource["searchRendering"];
  isRetailer: boolean;
}

export interface HandbookSourceGroup {
  category: ReferenceSourceCategory;
  label: string;
  role: string | null;
  sources: HandbookSourceProjection[];
}

export interface HandbookEntryResponse extends HandbookEntryWithProse {
  illustrationPath: string | null;
  baseBikePath: string | null;
  diagram: string | null;
  annotation: string | null;
}

function projectSource(source: ReferenceSource): HandbookSourceProjection {
  const assistantCategory = ReferenceSourceCategorySchema.options.includes(source.category)
    ? (source.category as AssistantReferenceCategory)
    : null;
  const searchable =
    assistantCategory !== null &&
    !isRetailerReferenceSource(source) &&
    getSearchableSourcesForCategory(assistantCategory).some((candidate) => candidate.id === source.id);

  return {
    id: source.id,
    name: source.name,
    url: source.url,
    category: source.category,
    categoryLabel: CATEGORY_LABELS[source.category],
    jobKinds: source.jobKinds,
    searchable,
    searchRendering: source.searchRendering,
    isRetailer: isRetailerReferenceSource(source),
  };
}

export function listHandbookSourceGroups(): HandbookSourceGroup[] {
  const byCategory = new Map<ReferenceSourceCategory, HandbookSourceProjection[]>();

  for (const source of REFERENCE_SOURCES) {
    const projection = projectSource(source);
    const group = byCategory.get(source.category) ?? [];
    group.push(projection);
    byCategory.set(source.category, group);
  }

  return ReferenceSourceCategorySchema.options
    .filter((category) => byCategory.has(category))
    .map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      role: CATEGORY_ROLES[category] ?? null,
      sources: (byCategory.get(category) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

function toEntryResponse(entry: HandbookEntryWithProse): HandbookEntryResponse {
  return {
    ...entry,
    illustrationPath: handbookIllustrationPublicPath(entry.illustration),
    baseBikePath: null,
    diagram: handbookDiagramId(entry.illustration),
    annotation: handbookAnnotationId(entry.illustration),
  };
}

export function getHandbookCatalog() {
  const entries = loadAllHandbookEntriesWithProse().map(toEntryResponse);
  const sourceIndex = new Map(REFERENCE_SOURCES.map((source) => [source.id, projectSource(source)]));

  const entriesWithSources = entries.map((entry) => ({
    ...entry,
    sources: (entry.sourceIds ?? [])
      .map((id) => sourceIndex.get(id))
      .filter((source): source is HandbookSourceProjection => source !== undefined),
  }));

  return {
    entries: entriesWithSources,
    sourceGroups: listHandbookSourceGroups(),
    specSourceNote:
      "Review and news sites must not be used as Spec sources. Only manufacturer and technical-reference pages supply grounded Product Specs.",
  };
}

export function getHandbookEntryBySlug(slug: string) {
  const entry = loadHandbookEntryWithProse(slug);
  if (!entry) return null;

  const sourceIndex = new Map(REFERENCE_SOURCES.map((source) => [source.id, projectSource(source)]));
  const response = toEntryResponse(entry);

  return {
    ...response,
    sources: (entry.sourceIds ?? [])
      .map((id) => sourceIndex.get(id))
      .filter((source): source is HandbookSourceProjection => source !== undefined),
  };
}

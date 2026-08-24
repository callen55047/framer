import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { KNOWN_DIAGRAM_IDS } from "./bikeGeometry.js";
import { ProductCategorySchema, type ProductCategory } from "./product.js";
import { SpecSchema, type Spec } from "./spec.js";

export const HandbookEntryKindSchema = z.enum(["measurement", "standard", "concept"]);
export type HandbookEntryKind = z.infer<typeof HandbookEntryKindSchema>;

export const HandbookEntryStatusSchema = z.enum(["compared", "explained"]);
export type HandbookEntryStatus = z.infer<typeof HandbookEntryStatusSchema>;

export const HandbookUnitSchema = z.enum(["deg", "mm", "in"]);
export type HandbookUnit = z.infer<typeof HandbookUnitSchema>;

export const GeometryOverlayIllustrationSchema = z.object({
  kind: z.literal("geometry-overlay"),
  overlay: z.string().min(1),
});

export const StandaloneIllustrationSchema = z.object({
  kind: z.literal("standalone"),
  image: z.string().min(1),
});

export const DiagramIllustrationSchema = z.object({
  kind: z.literal("diagram"),
  diagram: z.string().min(1),
  annotation: z.string().optional(),
});

export const HandbookIllustrationSchema = z.discriminatedUnion("kind", [
  GeometryOverlayIllustrationSchema,
  StandaloneIllustrationSchema,
  DiagramIllustrationSchema,
]);
export type HandbookIllustration = z.infer<typeof HandbookIllustrationSchema>;

export const HandbookTypicalRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
});

export const HandbookEntrySchema = z
  .object({
    slug: z.string().min(1),
    kind: HandbookEntryKindSchema,
    label: z.string().min(1),
    status: HandbookEntryStatusSchema,
    specKey: z.string().optional(),
    unit: HandbookUnitSchema.optional(),
    appliesTo: z.array(ProductCategorySchema).optional(),
    typicalRange: HandbookTypicalRangeSchema.optional(),
    illustration: HandbookIllustrationSchema,
    sourceIds: z.array(z.string().min(1)).optional(),
  })
  .superRefine((entry, ctx) => {
    if (entry.status === "compared" && !entry.specKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "compared entries require specKey",
        path: ["specKey"],
      });
    }
    if (entry.status === "explained" && entry.specKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "explained entries must not carry specKey",
        path: ["specKey"],
      });
    }
    if (entry.specKey && !(entry.specKey in SpecSchema.shape)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `unknown specKey: ${entry.specKey}`,
        path: ["specKey"],
      });
    }
  });

export type HandbookEntry = z.infer<typeof HandbookEntrySchema>;

export type HandbookEntryWithProse = HandbookEntry & {
  summary: string;
  prose: string;
};

const HandbookCatalogSchema = z.array(HandbookEntrySchema);

function schemaPackageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..");
}

function loadHandbookCatalog(): HandbookEntry[] {
  const catalogPath = join(schemaPackageRoot(), "data", "handbook.json");
  const raw = JSON.parse(readFileSync(catalogPath, "utf8")) as unknown;
  return HandbookCatalogSchema.parse(raw);
}

export const HANDBOOK_ENTRIES: readonly HandbookEntry[] = loadHandbookCatalog();

const entryBySlug = new Map<string, HandbookEntry>();
const entryBySpecKey = new Map<keyof Spec, HandbookEntry>();

for (const entry of HANDBOOK_ENTRIES) {
  entryBySlug.set(entry.slug, entry);
  if (entry.specKey) {
    entryBySpecKey.set(entry.specKey as keyof Spec, entry);
  }
}

/** Rider-facing labels for Spec keys — derived from compared Handbook entries. */
export const SPEC_FIELD_LABELS: Record<keyof Spec, string> = Object.fromEntries(
  (Object.keys(SpecSchema.shape) as (keyof Spec)[]).map((key) => {
    const entry = entryBySpecKey.get(key);
    if (!entry) {
      throw new Error(`Handbook catalog missing compared entry for spec key: ${key}`);
    }
    return [key, entry.label];
  })
) as Record<keyof Spec, string>;

export function getHandbookEntry(slug: string): HandbookEntry | undefined {
  return entryBySlug.get(slug);
}

export function getHandbookEntryBySpecKey(specKey: keyof Spec): HandbookEntry | undefined {
  return entryBySpecKey.get(specKey);
}

export function getHandbookEntries(): readonly HandbookEntry[] {
  return HANDBOOK_ENTRIES;
}

export function getHandbookProsePath(slug: string): string {
  return join(schemaPackageRoot(), "data", "handbook", `${slug}.md`);
}

export function loadHandbookProse(slug: string): string {
  const prosePath = getHandbookProsePath(slug);
  return readFileSync(prosePath, "utf8");
}

function extractSummary(prose: string): string {
  const lines = prose
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  return lines[0] ?? "";
}

export function loadHandbookEntryWithProse(slug: string): HandbookEntryWithProse | undefined {
  const entry = getHandbookEntry(slug);
  if (!entry) return undefined;
  const prose = loadHandbookProse(slug);
  return {
    ...entry,
    prose,
    summary: extractSummary(prose),
  };
}

export function loadAllHandbookEntriesWithProse(): HandbookEntryWithProse[] {
  return HANDBOOK_ENTRIES.map((entry) => {
    const prose = loadHandbookProse(entry.slug);
    return {
      ...entry,
      prose,
      summary: extractSummary(prose),
    };
  });
}

/** Repo-root assets path for illustration existence checks (tests). */
export function resolveHandbookAssetPath(relativePath: string): string {
  const repoRoot = join(schemaPackageRoot(), "..", "..");
  return join(repoRoot, "assets", "handbook", relativePath);
}

export function handbookIllustrationPublicPath(illustration: HandbookIllustration): string | null {
  if (illustration.kind === "geometry-overlay") {
    return `/handbook/${illustration.overlay}`;
  }
  if (illustration.kind === "standalone") {
    return `/handbook/${illustration.image}`;
  }
  return null;
}

export function handbookIllustrationAssetPath(illustration: HandbookIllustration): string | null {
  if (illustration.kind === "geometry-overlay") {
    return resolveHandbookAssetPath(illustration.overlay);
  }
  if (illustration.kind === "standalone") {
    return resolveHandbookAssetPath(illustration.image);
  }
  return null;
}

export function handbookDiagramId(illustration: HandbookIllustration): string | null {
  if (illustration.kind === "diagram") {
    return illustration.diagram;
  }
  return null;
}

export function handbookAnnotationId(illustration: HandbookIllustration): string | null {
  if (illustration.kind === "diagram") {
    return illustration.annotation ?? illustration.diagram;
  }
  return null;
}

export function isKnownDiagramId(id: string): boolean {
  return (KNOWN_DIAGRAM_IDS as readonly string[]).includes(id);
}

export { KNOWN_DIAGRAM_IDS };

export function handbookAssetExists(relativePath: string): boolean {
  return existsSync(resolveHandbookAssetPath(relativePath));
}

export const HANDBOOK_BASE_BIKE_PATH: string | null = null;

export function appliesToCategories(entry: HandbookEntry): ProductCategory[] {
  return entry.appliesTo ?? [];
}

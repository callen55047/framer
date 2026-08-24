import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HANDBOOK_ENTRIES,
  HANDBOOK_BASE_BIKE_PATH,
  SPEC_FIELD_LABELS,
  getHandbookEntry,
  getHandbookEntryBySpecKey,
  getHandbookProsePath,
  handbookIllustrationAssetPath,
  isKnownDiagramId,
  loadHandbookProse,
} from "./handbook.js";
import { SpecSchema } from "./spec.js";

describe("handbook", () => {
  it("loads catalog entries with unique slugs", () => {
    expect(HANDBOOK_ENTRIES.length).toBeGreaterThan(0);
    const slugs = HANDBOOK_ENTRIES.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("covers every SpecSchema key with exactly one compared entry", () => {
    const specKeys = Object.keys(SpecSchema.shape) as (keyof typeof SpecSchema.shape)[];
    for (const key of specKeys) {
      const matches = HANDBOOK_ENTRIES.filter((entry) => entry.specKey === key && entry.status === "compared");
      expect(matches).toHaveLength(1);
      expect(getHandbookEntryBySpecKey(key as keyof typeof SPEC_FIELD_LABELS)?.slug).toBe(matches[0]?.slug);
    }
  });

  it("derives SPEC_FIELD_LABELS from compared entries", () => {
    for (const key of Object.keys(SpecSchema.shape) as (keyof typeof SPEC_FIELD_LABELS)[]) {
      const entry = getHandbookEntryBySpecKey(key);
      expect(entry).toBeDefined();
      expect(SPEC_FIELD_LABELS[key]).toBe(entry?.label);
    }
  });

  it("has prose file for every entry", () => {
    for (const entry of HANDBOOK_ENTRIES) {
      const prosePath = getHandbookProsePath(entry.slug);
      expect(existsSync(prosePath)).toBe(true);
      const prose = loadHandbookProse(entry.slug);
      expect(prose.trim().length).toBeGreaterThan(0);
      expect(getHandbookEntry(entry.slug)?.slug).toBe(entry.slug);
    }
  });

  it("has illustration assets for every entry", () => {
    for (const entry of HANDBOOK_ENTRIES) {
      if (entry.illustration.kind === "diagram") {
        expect(isKnownDiagramId(entry.illustration.diagram)).toBe(true);
        if (entry.illustration.annotation) {
          expect(isKnownDiagramId(entry.illustration.annotation)).toBe(true);
        }
        continue;
      }
      const assetPath = handbookIllustrationAssetPath(entry.illustration);
      expect(assetPath).not.toBeNull();
      expect(existsSync(assetPath!)).toBe(true);
    }
  });

  it("exposes base bike public path as null (parametric diagrams)", () => {
    expect(HANDBOOK_BASE_BIKE_PATH).toBeNull();
  });
});

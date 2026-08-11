import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildListingPageText } from "./listingPageText.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures/ecwid");

describe("buildListingPageText", () => {
  it("includes Ecwid meta and JSON-LD when the body shell is nearly empty", () => {
    const html = readFileSync(path.join(fixturesDir, "gearhub-augmented-product.html"), "utf8");
    const text = buildListingPageText(html);

    expect(text.length).toBeGreaterThan(100);
    expect(text).toMatch(/Rocky Mountain/i);
    expect(text).toMatch(/995/);
    expect(text).toMatch(/Instinct/i);
  });
});

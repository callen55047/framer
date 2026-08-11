import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractVisibleText } from "./html.js";
import { tryExtractShopifyListing } from "./shopifyListing.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const instinctArtifact = path.join(
  repoRoot,
  "artifacts/jobs/dc4fa869-a453-449c-83e2-4501d1423dc8/fetch.html.gz"
);

describe("shopify listing regression", () => {
  it("extracts Instinct C50 from the saved mudsweatandgears artifact", () => {
    let html: string;
    try {
      html = gunzipSync(readFileSync(instinctArtifact)).toString("utf8");
    } catch {
      return; // artifact not present in CI — fixture snippet tests cover behavior
    }

    const pageUrl =
      "https://mudsweatandgears.ca/products/instinct-c50-1?variant=44714674979044";
    const result = tryExtractShopifyListing(html, pageUrl);

    expect(result?.title).toBe("Instinct C50");
    expect(result?.price).toBe(6999.99);
    expect(result?.brand).toBe("Rocky Mountain Bikes");

    const visible = extractVisibleText(html);
    expect(visible).toMatch(/instinct c50/i);
    expect(visible).not.toMatch(/turbulent/i);
  });
});

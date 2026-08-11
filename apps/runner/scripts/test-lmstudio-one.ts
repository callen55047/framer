import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getListingExtractionJsonSchema } from "../src/inference/extractionSchema.js";
import { extractVisibleText } from "../src/lib/html.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(moduleDir, "../fixtures/poc/jenson-wheel.html"), "utf8");
const text = extractVisibleText(html);
const schema = getListingExtractionJsonSchema();

async function main(): Promise<void> {
  console.log("schema:", JSON.stringify(schema, null, 2));

  const body = {
    model: process.env.LM_STUDIO_MODEL ?? "qwen3.5-9b-deepseek-v4-flash",
    messages: [
      {
        role: "user",
        content:
          "You are extracting structured product listing data from a scraped retailer web page. Only use information that literally appears in the page text below.\n\nPAGE TEXT:\n" +
          text,
      },
    ],
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: { name: "listing_extraction", strict: true, schema },
    },
  };

  const start = Date.now();
  const res = await fetch("http://localhost:1234/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  console.log("status:", res.status, "elapsed ms:", Date.now() - start);
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

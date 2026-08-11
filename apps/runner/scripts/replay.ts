import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { groundExtraction } from "@framer/schema";
import { config } from "../src/config.js";
import { readArtifact } from "../src/lib/artifactStore.js";
import { extractVisibleText, truncateForPrompt } from "../src/lib/html.js";
import { extractListing } from "../src/inference/extractListing.js";

/**
 * Offline replay harness (CONTEXT.md, plan todo "replay-harness"): re-runs
 * Extraction + Grounding over every stored fetch Artifact without touching
 * the network. This is the regression set for prompt and schema changes —
 * the highest-leverage payoff of persisting raw HTML at all. Still calls
 * the local model (that's the thing being tested); "offline" means no
 * re-fetching of live pages.
 *
 * Usage: npm run replay --workspace=@framer/runner
 */
async function findFetchArtifacts(jobsDir: string): Promise<string[]> {
  let jobDirs: string[];
  try {
    jobDirs = await readdir(jobsDir);
  } catch {
    return [];
  }
  const paths: string[] = [];
  for (const jobId of jobDirs) {
    const candidate = path.join(jobsDir, jobId, "fetch.html.gz");
    try {
      const s = await stat(candidate);
      if (s.isFile()) paths.push(candidate);
    } catch {
      // no fetch artifact for this job, skip
    }
  }
  return paths;
}

async function main() {
  const jobsDir = path.join(config.artifactsDir, "jobs");
  const artifactPaths = await findFetchArtifacts(jobsDir);

  if (artifactPaths.length === 0) {
    console.log(`No fetch artifacts found under ${jobsDir}. Run the Runner against a real Watch first.`);
    return;
  }

  console.log(`Replaying extraction over ${artifactPaths.length} stored artifact(s)...\n`);

  let groundedCount = 0;
  for (const artifactPath of artifactPaths) {
    const jobId = path.basename(path.dirname(artifactPath));
    const html = await readArtifact(artifactPath);
    const text = extractVisibleText(html);

    try {
      const extraction = await extractListing(truncateForPrompt(text));
      const result = groundExtraction(extraction, text);
      groundedCount += result.grounded ? 1 : 0;

      console.log(`job ${jobId}`);
      console.log(`  extraction: ${JSON.stringify(extraction)}`);
      console.log(`  grounded:   ${result.grounded} (fields: ${result.groundedFields.join(", ")})`);
      if (result.ungroundedFields.length > 0) {
        console.log(`  ungrounded: ${result.ungroundedFields.join(", ")}`);
      }
    } catch (err) {
      console.log(`job ${jobId}`);
      console.log(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log("");
  }

  console.log(`Summary: ${groundedCount}/${artifactPaths.length} extractions grounded.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

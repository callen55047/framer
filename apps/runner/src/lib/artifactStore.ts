import { gzipSync, gunzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

/**
 * Raw fetched HTML is stored on disk, gzipped, keyed by job and stage — not
 * in Postgres. A few hundred MB of blobs makes backups painful for data
 * whose only access pattern is "read the whole thing by id". The database
 * row (see @framer/schema Artifact) only ever stores this path.
 */
export async function writeArtifact(jobId: string, stage: string, contentType: string, body: string): Promise<{
  path: string;
  byteSize: number;
}> {
  const dir = path.join(config.artifactsDir, "jobs", jobId);
  await mkdir(dir, { recursive: true });
  const ext = contentType.includes("html") ? "html" : "txt";
  const filePath = path.join(dir, `${stage}.${ext}.gz`);
  const compressed = gzipSync(Buffer.from(body, "utf8"));
  await writeFile(filePath, compressed);
  return { path: filePath, byteSize: compressed.byteLength };
}

export async function readArtifact(filePath: string): Promise<string> {
  const compressed = await readFile(filePath);
  return gunzipSync(compressed).toString("utf8");
}

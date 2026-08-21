#!/usr/bin/env tsx
/**
 * Health-check every reference source searchUrlTemplate.
 * Run: npm run probe:sources
 *
 * Exits non-zero when a server-rendered source fails status, size, or probe-term checks.
 */
import {
  REFERENCE_SOURCES,
  buildReferenceSearchUrl,
  type ReferenceSource,
} from "@framer/schema";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

interface ProbeResult {
  sourceId: string;
  url: string;
  status: number;
  bytes: number;
  termHits: number;
  ok: boolean;
  note?: string;
}

function probeTerms(source: ReferenceSource): string[] {
  const query = source.searchProbeQuery ?? "altitude";
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

async function probeSource(source: ReferenceSource): Promise<ProbeResult> {
  if (!source.searchUrlTemplate) {
    return {
      sourceId: source.id,
      url: source.url,
      status: 0,
      bytes: 0,
      termHits: 0,
      ok: true,
      note: "no search template",
    };
  }

  if (source.searchRendering !== "server") {
    return {
      sourceId: source.id,
      url: buildReferenceSearchUrl(source, source.searchProbeQuery ?? "test"),
      status: 0,
      bytes: 0,
      termHits: 0,
      ok: true,
      note: `skipped (${source.searchRendering})`,
    };
  }

  const query = source.searchProbeQuery ?? "altitude";
  const url = buildReferenceSearchUrl(source, query);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    const body = await res.text();
    const bytes = Buffer.byteLength(body, "utf8");
    const normalized = body.toLowerCase();
    const terms = probeTerms(source);
    const termHits = terms.filter((term) => normalized.includes(term)).length;
    const ok = res.ok && bytes > 1000 && (terms.length === 0 || termHits > 0);

    return {
      sourceId: source.id,
      url,
      status: res.status,
      bytes,
      termHits,
      ok,
      note: ok ? undefined : `failed checks (status=${res.status}, bytes=${bytes}, hits=${termHits}/${terms.length})`,
    };
  } catch (err) {
    return {
      sourceId: source.id,
      url,
      status: 0,
      bytes: 0,
      termHits: 0,
      ok: false,
      note: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

async function main(): Promise<void> {
  const results = await Promise.all(REFERENCE_SOURCES.map((source) => probeSource(source)));

  console.log("Reference source probe results:\n");
  let failures = 0;

  for (const result of results) {
    const statusLabel = result.ok ? "OK" : "FAIL";
    if (!result.ok) failures += 1;
    console.log(
      `[${statusLabel}] ${result.sourceId.padEnd(28)} ${result.status || "-"} ${String(result.bytes).padStart(8)}B hits=${result.termHits} ${result.note ?? result.url}`
    );
  }

  console.log(`\n${results.length} sources, ${failures} failures`);
  if (failures > 0) {
    process.exitCode = 1;
  }
}

void main();

import {
  getKnownFetchDomains,
  isKnownFetchDomain,
  normalizeDomain,
} from "@framer/schema";
import { config } from "../config.js";
import { Semaphore } from "./semaphore.js";

const overallConcurrency = new Semaphore(config.fetchPoolConcurrency);
const lastRequestAtByDomain = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function assertFetchDomainAllowed(url: string): void {
  const mode = config.fetchAllowlistMode;
  if (mode === "off") return;

  const domain = normalizeDomain(new URL(url).hostname);
  if (isKnownFetchDomain(domain)) return;

  const hint = `known domains include: ${getKnownFetchDomains().slice(0, 5).join(", ")}…`;
  if (mode === "warn") {
    console.warn(`[fetch] unknown domain "${domain}" — not in reference source registry (${hint})`);
    return;
  }

  throw new Error(
    `fetch blocked: domain "${domain}" is not in the reference source registry (${hint}); see docs/reference-sources.md`
  );
}

/**
 * The fetch pool: bounded overall concurrency plus a minimum interval
 * between requests to the same domain, so a burst of watches on one
 * retailer can't look like abuse. This is the pool a scraper needs;
 * inference has entirely different constraints (see inferencePool.ts).
 */
export async function fetchPooled(url: string, init?: RequestInit): Promise<Response> {
  assertFetchDomainAllowed(url);
  const domain = new URL(url).hostname;
  return overallConcurrency.run(async () => {
    const lastAt = lastRequestAtByDomain.get(domain) ?? 0;
    const waitMs = lastAt + config.fetchPoolMinIntervalPerDomainMs - Date.now();
    if (waitMs > 0) await sleep(waitMs);
    lastRequestAtByDomain.set(domain, Date.now());
    return fetch(url, init);
  });
}

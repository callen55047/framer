import "dotenv/config";
import { loadInferenceConfigFromEnv } from "./inference/loadConfig.js";
import type { InferenceConfig } from "./inference/types.js";

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

let inferenceConfig: InferenceConfig = loadInferenceConfigFromEnv();

/** Re-read inference provider settings from the environment (integrated runner startup). */
export function reloadInferenceFromEnv(): void {
  inferenceConfig = loadInferenceConfigFromEnv();
}

const FETCH_ALLOWLIST_MODES = ["off", "warn", "enforce"] as const;
export type FetchAllowlistMode = (typeof FETCH_ALLOWLIST_MODES)[number];

function parseFetchAllowlistMode(value: string): FetchAllowlistMode {
  if ((FETCH_ALLOWLIST_MODES as readonly string[]).includes(value)) {
    return value as FetchAllowlistMode;
  }
  throw new Error(
    `Invalid FETCH_ALLOWLIST_MODE "${value}"; expected one of: ${FETCH_ALLOWLIST_MODES.join(", ")}`
  );
}

export const config = {
  apiBaseUrl: env("API_BASE_URL", "http://localhost:4000"),
  agentToken: env("AGENT_TOKEN", "dev-agent-token"),
  agentId: env("AGENT_ID", "runner-local-1"),
  get inference(): InferenceConfig {
    return inferenceConfig;
  },
  artifactsDir: env("ARTIFACTS_DIR", "../../artifacts"),
  pollIntervalMs: Number(env("POLL_INTERVAL_MS", "2000")),
  leaseSeconds: Number(env("LEASE_SECONDS", "60")),
  /**
   * Two separate bounded pools, not one. Scraping is network-bound and its
   * real constraint is per-retailer politeness; inference is GPU/CPU-bound
   * and effectively serial on a single local model. See docs/ARCHITECTURE.md and
   * CONTEXT.md#Runner — this replaces the original "a thread per job" idea,
   * which would just queue up behind inference anyway while risking a ban from
   * the fetch side.
   */
  fetchPoolConcurrency: Number(env("FETCH_POOL_CONCURRENCY", "4")),
  fetchPoolMinIntervalPerDomainMs: Number(env("FETCH_POOL_MIN_INTERVAL_PER_DOMAIN_MS", "2000")),
  inferencePoolDepth: Number(env("INFERENCE_POOL_DEPTH", "1")),
  /** off | warn | enforce — see docs/reference-sources.md */
  fetchAllowlistMode: parseFetchAllowlistMode(env("FETCH_ALLOWLIST_MODE", "warn")),
};

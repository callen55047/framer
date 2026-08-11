import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(moduleDir, "..");
const projectRoot = path.resolve(apiRoot, "../..");
const defaultDataDir = path.join(projectRoot, ".data");

export const config = {
  port: Number(env("PORT", "4000")),
  projectRoot,
  dataDir: env("DATA_DIR", defaultDataDir),
  databasePath: env("DATABASE_PATH", path.join(defaultDataDir, "framer.db")),
  artifactsDir: env("ARTIFACTS_DIR", path.join(defaultDataDir, "artifacts")),
  webDistPath: env("WEB_DIST_PATH", path.join(projectRoot, "apps/web/dist")),
  /**
   * Legacy bearer token for external agent HTTP calls. In-process runner
   * bypasses HTTP but routes still accept this for manual tooling.
   */
  agentToken: env("AGENT_TOKEN", "dev-agent-token"),
  runner: {
    enabled: env("RUNNER_ENABLED", "true") === "true",
    agentId: env("RUNNER_AGENT_ID", "runner-local-1"),
    pollIntervalMs: Number(env("RUNNER_POLL_INTERVAL_MS", "2000")),
    leaseSeconds: Number(env("RUNNER_LEASE_SECONDS", "60")),
    inferenceProvider: env("INFERENCE_PROVIDER", "ollama"),
    inferenceBaseUrl: process.env.INFERENCE_BASE_URL,
    inferenceModel: process.env.INFERENCE_MODEL,
    ollamaBaseUrl: env("OLLAMA_BASE_URL", "http://localhost:11434"),
    ollamaModel: env("OLLAMA_MODEL", "llama3.2"),
    lmStudioBaseUrl: env("LM_STUDIO_BASE_URL", "http://localhost:1234/v1"),
    lmStudioModel: process.env.LM_STUDIO_MODEL,
    fetchPoolConcurrency: Number(env("FETCH_POOL_CONCURRENCY", "4")),
    fetchPoolMinIntervalPerDomainMs: Number(env("FETCH_POOL_MIN_INTERVAL_PER_DOMAIN_MS", "2000")),
    inferencePoolDepth: Number(env("INFERENCE_POOL_DEPTH", "1")),
  },
  sweepEnabled: env("FRAMER_SWEEP_ENABLED", "true") === "true",
};

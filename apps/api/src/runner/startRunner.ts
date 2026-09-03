import { mkdirSync } from "node:fs";
import { configureJobApi } from "@framer/runner/lib/jobApi.js";
import { config as runnerConfig, reloadInferenceFromEnv } from "@framer/runner/config.js";
import { runJob } from "@framer/runner/pipeline.js";
import type { JobKind, JobRecord } from "@framer/schema";
import { config } from "../config.js";
import { createInternalJobApi } from "./internalJobApi.js";
import { applyRunnerInferenceEnv } from "./inferenceEnv.js";
import { runSummarizeChatSessionJob } from "../services/chatSummarizeService.js";

const IMPLEMENTED_KINDS: JobKind[] = [
  "Acknowledge",
  "RefreshListing",
  "SummarizeChatSession",
  "ExtractSpecs",
  "ResearchQuestion",
];

export function startIntegratedRunner(): void {
  if (!config.runner.enabled) {
    console.log("[runner] disabled (RUNNER_ENABLED=false)");
    return;
  }

  mkdirSync(config.artifactsDir, { recursive: true });
  process.env.ARTIFACTS_DIR = config.artifactsDir;
  process.env.FETCH_POOL_CONCURRENCY = String(config.runner.fetchPoolConcurrency);
  process.env.FETCH_POOL_MIN_INTERVAL_PER_DOMAIN_MS = String(config.runner.fetchPoolMinIntervalPerDomainMs);
  process.env.INFERENCE_POOL_DEPTH = String(config.runner.inferencePoolDepth);
  applyRunnerInferenceEnv();
  reloadInferenceFromEnv();

  const jobApi = createInternalJobApi(config.runner.agentId, config.runner.leaseSeconds);
  configureJobApi(jobApi);

  let stopping = false;
  const pollIntervalMs = config.runner.pollIntervalMs;
  const leaseSeconds = config.runner.leaseSeconds;

  async function pollOnce(): Promise<boolean> {
    const job = await jobApi.claimJob(IMPLEMENTED_KINDS);
    if (!job) return false;
    console.log(`[runner] claimed job ${job.id} (${job.kind})`);

    const heartbeatMs = Math.max((leaseSeconds * 1000) / 2, 5000);
    const heartbeat = setInterval(() => {
      jobApi.heartbeatJob(job.id).catch((err: unknown) => {
        console.warn(`[runner] heartbeat failed for job ${job.id}:`, err);
      });
    }, heartbeatMs);

    try {
      if (job.kind === "SummarizeChatSession") {
        const output = await runSummarizeChatSessionJob(job);
        await jobApi.completeJob(job.id, output);
      } else {
        await runJob(job);
      }
    } finally {
      clearInterval(heartbeat);
      jobApi.clearActiveLease();
    }
    return true;
  }

  async function loop(): Promise<void> {
    while (!stopping) {
      try {
        await pollOnce();
      } catch (err) {
        console.error("[runner] poll iteration failed:", err);
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  process.on("SIGINT", () => {
    stopping = true;
  });

  const { provider, baseUrl, model } = runnerConfig.inference;

  console.log(
    `[runner] integrated (${config.runner.agentId}): inference=${provider} baseUrl=${baseUrl} model=${model}`
  );
  void loop();
}

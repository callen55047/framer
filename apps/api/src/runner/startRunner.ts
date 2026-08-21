import { mkdirSync } from "node:fs";
import { configureJobApi } from "@framer/runner/lib/jobApi.js";
import { reloadInferenceFromEnv } from "@framer/runner/config.js";
import { runJob } from "@framer/runner/pipeline.js";
import type { JobKind, JobRecord } from "@framer/schema";
import { config } from "../config.js";
import { createInternalJobApi } from "./internalJobApi.js";
import { runSummarizeChatSessionJob } from "../services/chatSummarizeService.js";

const IMPLEMENTED_KINDS: JobKind[] = [
  "Acknowledge",
  "RefreshListing",
  "SummarizeChatSession",
  "ExtractSpecs",
  "ResearchQuestion",
];

function applyRunnerInferenceEnv(): void {
  process.env.INFERENCE_PROVIDER = config.runner.inferenceProvider;
  if (config.runner.inferenceBaseUrl) {
    process.env.INFERENCE_BASE_URL = config.runner.inferenceBaseUrl;
  } else {
    delete process.env.INFERENCE_BASE_URL;
  }
  if (config.runner.inferenceModel) {
    process.env.INFERENCE_MODEL = config.runner.inferenceModel;
  } else {
    delete process.env.INFERENCE_MODEL;
  }
  process.env.OLLAMA_BASE_URL = config.runner.ollamaBaseUrl;
  process.env.OLLAMA_MODEL = config.runner.ollamaModel;
  process.env.LM_STUDIO_BASE_URL = config.runner.lmStudioBaseUrl;
  if (config.runner.lmStudioModel) {
    process.env.LM_STUDIO_MODEL = config.runner.lmStudioModel;
  } else {
    delete process.env.LM_STUDIO_MODEL;
  }
  reloadInferenceFromEnv();
}

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

  const inference = config.runner.inferenceProvider;
  const model =
    config.runner.inferenceModel ??
    (inference === "lmstudio"
      ? config.runner.lmStudioModel ?? config.runner.ollamaModel
      : config.runner.ollamaModel);
  const baseUrl =
    config.runner.inferenceBaseUrl ??
    (inference === "lmstudio" ? config.runner.lmStudioBaseUrl : config.runner.ollamaBaseUrl);

  console.log(
    `[runner] integrated (${config.runner.agentId}): inference=${inference} baseUrl=${baseUrl} model=${model}`
  );
  void loop();
}

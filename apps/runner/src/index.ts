import { config } from "./config.js";
import { claimJob, clearActiveLease, configureJobApi, heartbeatJob } from "./lib/jobApi.js";
import { httpJobApi } from "./lib/httpJobApi.js";
import { runJob } from "./pipeline.js";
import type { JobKind } from "@framer/schema";

configureJobApi(httpJobApi);

/**
 * Long-lived poll loop, not cron — cron's minimum granularity is one
 * minute, and "spawn a thread per job" would just queue up behind a single
 * local model anyway. See CONTEXT.md#Runner and docs/ARCHITECTURE.md. Only kinds this
 * Runner actually implements are requested, so an unimplemented DiscoverListings
 * row never gets claimed and stranded.
 */
const IMPLEMENTED_KINDS: JobKind[] = [
  "RefreshListing",
  "SummarizeChatSession",
  "ExtractSpecs",
  "ResearchQuestion",
];

const args = process.argv.slice(2);
const runOnce = args.includes("--once");
const runUntilEmpty = args.includes("--until-empty");

let stopping = false;

async function pollOnce(): Promise<boolean> {
  const job = await claimJob(IMPLEMENTED_KINDS);
  if (!job) return false;
  console.log(`[runner] claimed job ${job.id} (${job.kind})`);

  const heartbeatMs = Math.max((config.leaseSeconds * 1000) / 2, 5000);
  const heartbeat = setInterval(() => {
    heartbeatJob(job.id).catch((err) => {
      console.warn(`[runner] heartbeat failed for job ${job.id}:`, err);
    });
  }, heartbeatMs);

  try {
    await runJob(job);
  } finally {
    clearInterval(heartbeat);
    clearActiveLease();
  }
  return true;
}

async function loop(): Promise<void> {
  if (runOnce || runUntilEmpty) {
    if (runUntilEmpty) {
      while (!stopping) {
        const didWork = await pollOnce().catch((err) => {
          console.error("[runner] poll iteration failed:", err);
          return false;
        });
        if (!didWork) break;
      }
    } else {
      await pollOnce().catch((err) => console.error("[runner] poll iteration failed:", err));
    }
    return;
  }

  while (!stopping) {
    try {
      await pollOnce();
    } catch (err) {
      console.error("[runner] poll iteration failed:", err);
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
}

process.on("SIGINT", () => {
  console.log("[runner] shutting down");
  stopping = true;
});

const mode = runOnce ? "once" : runUntilEmpty ? "until-empty" : "daemon";
console.log(
  `[runner] starting (${mode}): agentId=${config.agentId} api=${config.apiBaseUrl} inference=${config.inference.provider} baseUrl=${config.inference.baseUrl} model=${config.inference.model} pollIntervalMs=${config.pollIntervalMs}`
);
loop();

#!/usr/bin/env tsx
import "dotenv/config";
import type { JobKind } from "@framer/schema";
import { claimJob, clearActiveLease, completeJob, configureJobApi, failJob, getActiveLeaseToken } from "../src/lib/jobApi.js";
import { httpJobApi } from "../src/lib/httpJobApi.js";
import { config } from "../src/config.js";

configureJobApi(httpJobApi);

function parseArgs(argv: string[]) {
  const once = argv.includes("--once");
  const shouldFail = argv.includes("--fail");
  const kindsIdx = argv.indexOf("--kinds");
  const kinds =
    kindsIdx >= 0 && argv[kindsIdx + 1]
      ? (argv[kindsIdx + 1]!.split(",") as JobKind[])
      : (["Acknowledge"] as JobKind[]);
  return { once, shouldFail, kinds };
}

async function processOne(kinds: JobKind[], shouldFail: boolean): Promise<boolean> {
  const job = await claimJob(kinds);
  if (!job) {
    console.log("[worker] no eligible jobs");
    return false;
  }

  const leaseToken = getActiveLeaseToken(job.id);
  console.log(
    JSON.stringify(
      {
        claimed: true,
        jobId: job.id,
        kind: job.kind,
        taskId: job.taskId,
        input: job.input,
        leaseToken,
        agentId: config.agentId,
      },
      null,
      2
    )
  );

  if (shouldFail) {
    await failJob(job.id, undefined, "manual worker --fail", true);
    console.log(`[worker] failed job ${job.id}`);
    return true;
  }

  if (job.kind === "Acknowledge") {
    await completeJob(job.id, {
      acknowledgedAt: new Date().toISOString(),
      note: "completed by manual worker",
    });
    console.log(`[worker] completed Acknowledge job ${job.id}`);
    return true;
  }

  console.error(`[worker] job kind "${job.kind}" is not supported by manual worker — use the runner`);
  clearActiveLease();
  return true;
}

async function main() {
  const { once, shouldFail, kinds } = parseArgs(process.argv.slice(2));

  if (!once) {
    console.error("Usage: npm run worker -- --once [--fail] [--kinds Acknowledge,RefreshListing]");
    process.exit(1);
  }

  await processOne(kinds, shouldFail);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

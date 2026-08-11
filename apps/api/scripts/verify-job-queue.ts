#!/usr/bin/env tsx
/**
 * Acceptance script for the job queue protocol. Spawns an isolated server
 * with RUNNER_ENABLED=false so claims are not raced by the integrated runner.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_TOKEN = "dev-agent-token";
const AGENT_A = "verify-agent-a";
const AGENT_B = "verify-agent-b";
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function waitForHealth(baseUrl: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server did not become healthy at ${baseUrl}`);
}

async function api<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AGENT_TOKEN}`,
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status}: ${JSON.stringify(body)}`);
  return body as T;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

async function claim(baseUrl: string, agentId: string, kinds: string[] = ["Acknowledge"]) {
  return api<{ job: { id: string; kind: string; taskId: string } | null; leaseToken: string | null }>(
    baseUrl,
    "/api/jobs/claim",
    {
      method: "POST",
      body: JSON.stringify({ agentId, kinds, leaseSeconds: 2 }),
    }
  );
}

async function complete(baseUrl: string, agentId: string, jobId: string, leaseToken: string) {
  return api<{ job: { status: string } }>(baseUrl, `/api/jobs/${jobId}/complete`, {
    method: "POST",
    body: JSON.stringify({
      agentId,
      leaseToken,
      output: { acknowledgedAt: new Date().toISOString(), note: "verify script" },
    }),
  });
}

async function getTask(baseUrl: string, taskId: string) {
  return api<{ task: { status: string }; jobs: { id: string; status: string }[] }>(
    baseUrl,
    `/api/tasks/${taskId}`
  );
}

async function runChecks(baseUrl: string): Promise<void> {
  console.log("1. Create 2-step acknowledge-proof task");
  const created = await api<{ task: { id: string }; jobs: { id: string }[] }>(
    baseUrl,
    "/api/tasks/acknowledge-proof?steps=2",
    { method: "POST" }
  );
  const taskId = created.task.id;
  assert(created.jobs.length === 2, "expected 2 jobs");

  console.log("2. Claim step 1");
  const c1 = await claim(baseUrl, AGENT_A);
  assert(c1.job?.id === created.jobs[0]!.id, "first job should be claimable");
  assert(!!c1.leaseToken, "lease token required");

  console.log("3. Reject stale complete (wrong token)");
  const bad = await fetch(`${baseUrl}/api/jobs/${c1.job!.id}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AGENT_TOKEN}` },
    body: JSON.stringify({ agentId: AGENT_A, leaseToken: "wrong", output: { acknowledgedAt: new Date().toISOString() } }),
  });
  assert(bad.status === 404, "wrong token should 404");

  console.log("4. Complete step 1");
  await complete(baseUrl, AGENT_A, c1.job!.id, c1.leaseToken!);

  console.log("5. Only step 2 claimable now");
  const c2 = await claim(baseUrl, AGENT_B);
  assert(c2.job?.id === created.jobs[1]!.id, "second job should unlock after first succeeds");
  await complete(baseUrl, AGENT_B, c2.job!.id, c2.leaseToken!);

  const final = await getTask(baseUrl, taskId);
  assert(final.task.status === "succeeded", `task should be succeeded, got ${final.task.status}`);
  assert(final.jobs.every((j) => j.status === "succeeded"), "all jobs should succeed");

  console.log("6. Concurrent claim: two agents, one job");
  const created2 = await api<{ task: { id: string }; jobs: { id: string }[] }>(
    baseUrl,
    "/api/tasks/acknowledge-proof?steps=1",
    { method: "POST" }
  );
  const [aClaim, bClaim] = await Promise.all([claim(baseUrl, AGENT_A), claim(baseUrl, AGENT_B)]);
  const winners = [aClaim, bClaim].filter((c) => c.job?.id === created2.jobs[0]!.id);
  assert(winners.length === 1, "exactly one agent should claim the job");
  const winnerAgent = aClaim.job?.id === created2.jobs[0]!.id ? AGENT_A : AGENT_B;
  await complete(baseUrl, winnerAgent, created2.jobs[0]!.id, winners[0]!.leaseToken!);

  console.log("7. SPA routes");
  const root = await fetch(`${baseUrl}/`);
  assert(root.status === 200, "dashboard should be served at /");
  const deep = await fetch(`${baseUrl}/watchlist`);
  assert(deep.status === 200, "client route should fall back to SPA");

  console.log("verify:queue OK");
}

async function main() {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "framer-verify-"));
  const dbPath = path.join(tmpDir, "framer.db");
  const port = 4099;
  const baseUrl = `http://127.0.0.1:${port}`;

  let child: ChildProcess | null = null;
  try {
    child = spawn("node", ["dist/index.js"], {
      cwd: apiRoot,
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_PATH: dbPath,
        DATA_DIR: tmpDir,
        ARTIFACTS_DIR: path.join(tmpDir, "artifacts"),
        RUNNER_ENABLED: "false",
        AGENT_TOKEN,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    await waitForHealth(baseUrl);
    await runChecks(baseUrl);
  } finally {
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

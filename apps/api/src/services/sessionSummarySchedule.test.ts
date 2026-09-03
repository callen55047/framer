import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCAL_OWNER_ID } from "@framer/schema";
import { createTestServer } from "../test/createTestServer.js";

describe("sessionSummarySchedule", () => {
  afterEach(() => {
    vi.resetModules();
  });

  async function seedSession() {
    const { pool, newId } = await import("../db/pool.js");
    const sessionId = newId();
    await pool.query(
      `insert into chat_sessions (id, owner_id, title, title_source, provider, model)
       values ($1, $2, 'Test chat', 'auto', 'lmstudio', 'test')`,
      [sessionId, LOCAL_OWNER_ID]
    );
    await pool.query(
      `insert into chat_messages (id, session_id, role, content)
       values ($1, $2, 'user', 'hello')`,
      [newId(), sessionId]
    );
    return { sessionId, pool, newId };
  }

  it("schedules a summarize job with a future not_before", async () => {
    const server = await createTestServer();
    process.env.CHAT_SUMMARY_IDLE_MINUTES = "5";
    vi.resetModules();
    const { scheduleSessionSummary } = await import("../services/sessionSummarySchedule.js");
    try {
      const { sessionId, pool } = await seedSession();
      const jobId = await scheduleSessionSummary(sessionId);
      expect(jobId).toBeTruthy();

      const { rows } = await pool.query(
        `select j.kind, j.status, j.not_before, json_extract(j.input, '$.sessionId') as session_id
         from jobs j where j.id = $1`,
        [jobId]
      );
      expect(rows[0]?.kind).toBe("SummarizeChatSession");
      expect(rows[0]?.status).toBe("queued");
      expect(rows[0]?.session_id).toBe(sessionId);
      expect(rows[0]?.not_before).toBeTruthy();

      const { rows: claimable } = await pool.query(
        `select id from jobs
         where id = $1
           and status = 'queued'
           and (not_before is null or not_before <= datetime('now'))`,
        [jobId]
      );
      expect(claimable).toHaveLength(0);
    } finally {
      await server.close();
    }
  });

  it("pushes not_before forward instead of enqueueing duplicates", async () => {
    const server = await createTestServer();
    process.env.CHAT_SUMMARY_IDLE_MINUTES = "5";
    vi.resetModules();
    const { scheduleSessionSummary } = await import("../services/sessionSummarySchedule.js");
    try {
      const { sessionId, pool } = await seedSession();
      const first = await scheduleSessionSummary(sessionId);
      const { rows: before } = await pool.query("select not_before from jobs where id = $1", [first]);
      const firstNotBefore = before[0]?.not_before as string;

      await new Promise((resolve) => setTimeout(resolve, 1100));
      const second = await scheduleSessionSummary(sessionId);
      expect(second).toBe(first);

      const { rows: after } = await pool.query("select not_before from jobs where id = $1", [first]);
      expect(after[0]?.not_before).not.toBe(firstNotBefore);

      const { rows: jobCount } = await pool.query(
        `select count(*) as count from jobs
         where kind = 'SummarizeChatSession'
           and json_extract(input, '$.sessionId') = $1`,
        [sessionId]
      );
      expect(Number(jobCount[0]?.count)).toBe(1);
    } finally {
      await server.close();
    }
  });

  it("reconciles stale sessions at startup with not_before from updated_at", async () => {
    const server = await createTestServer();
    process.env.CHAT_SUMMARY_IDLE_MINUTES = "5";
    vi.resetModules();
    const { reconcileSessionSummaries } = await import("../services/sessionSummarySchedule.js");
    try {
      const { sessionId, pool } = await seedSession();
      await pool.query(
        `update chat_sessions set updated_at = datetime('now', '-10 minutes') where id = $1`,
        [sessionId]
      );

      const scheduled = await reconcileSessionSummaries();
      expect(scheduled).toBe(1);

      const { rows } = await pool.query(
        `select not_before from jobs
         where kind = 'SummarizeChatSession'
           and json_extract(input, '$.sessionId') = $1`,
        [sessionId]
      );
      expect(rows[0]?.not_before).toBeTruthy();

      const { rows: claimable } = await pool.query(
        `select id from jobs
         where kind = 'SummarizeChatSession'
           and json_extract(input, '$.sessionId') = $1
           and status = 'queued'
           and (not_before is null or not_before <= datetime('now'))`,
        [sessionId]
      );
      expect(claimable).toHaveLength(1);
    } finally {
      await server.close();
    }
  });
});

describe("claimNextJob not_before gate", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("does not claim jobs before not_before", async () => {
    const server = await createTestServer();
    vi.resetModules();
    const { claimNextJob } = await import("../lib/jobQueue.js");
    const { pool, newId, withTransaction } = await import("../db/pool.js");
    try {
      const taskId = newId();
      const jobId = newId();
      await pool.query(
        `insert into tasks (id, owner_id, kind, label, status, origin)
         values ($1, $2, 'Acknowledge', 'test', 'queued', 'user')`,
        [taskId, LOCAL_OWNER_ID]
      );
      await pool.query(
        `insert into jobs (id, task_id, kind, status, input, not_before)
         values ($1, $2, 'Acknowledge', 'queued', $3, datetime('now', '+1 hour'))`,
        [jobId, taskId, JSON.stringify({})]
      );

      const claimed = await withTransaction((client) => claimNextJob(client, "test-agent", ["Acknowledge"], 30));
      expect(claimed).toBeNull();

      await pool.query(`update jobs set not_before = datetime('now', '-1 minute') where id = $1`, [jobId]);
      const claimedLater = await withTransaction((client) =>
        claimNextJob(client, "test-agent", ["Acknowledge"], 30)
      );
      expect(claimedLater?.job.id).toBe(jobId);
    } finally {
      await server.close();
    }
  });
});

describe("session summary reader tools", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("lists other sessions with summaries and fetches one by id", async () => {
    const server = await createTestServer();
    vi.resetModules();
    const { executeChatTool } = await import("../lib/chatTools.js");
    const { pool, newId } = await import("../db/pool.js");
    try {
      const currentSessionId = newId();
      const pastSessionId = newId();
      await pool.query(
        `insert into chat_sessions (id, owner_id, title, title_source, provider, model, summary, summary_updated_at)
         values ($1, $2, 'Current chat', 'auto', 'lmstudio', 'test', null, null),
                ($3, $2, 'Past build notes', 'auto', 'lmstudio', 'test', 'User asked about stem length.', datetime('now'))`,
        [currentSessionId, LOCAL_OWNER_ID, pastSessionId]
      );

      const listed = await executeChatTool("listSessionSummaries", {}, { sessionId: currentSessionId });
      expect(listed).toEqual([
        {
          sessionId: pastSessionId,
          title: "Past build notes",
          summarizedAt: expect.any(String),
        },
      ]);

      const fetched = await executeChatTool(
        "getSessionSummary",
        { sessionId: pastSessionId },
        { sessionId: currentSessionId }
      );
      expect(fetched).toMatchObject({
        sessionId: pastSessionId,
        summary: "User asked about stem length.",
        summaryUpdatedAt: expect.any(String),
      });
    } finally {
      await server.close();
    }
  });
});

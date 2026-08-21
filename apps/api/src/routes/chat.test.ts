import { afterEach, describe, expect, it } from "vitest";
import { createTestServer } from "../test/createTestServer.js";

describe("chat routes", () => {
  let server: Awaited<ReturnType<typeof createTestServer>> | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("creates, lists, and deletes chat sessions", async () => {
    server = await createTestServer();

    const createRes = await fetch(`${server.baseUrl}/api/chat/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(createRes.status).toBe(201);
    const { session } = await createRes.json();
    expect(session.title).toBe("New chat");
    expect(session.contextBudgetTokens).toBe(128000);

    const listRes = await fetch(`${server.baseUrl}/api/chat/sessions`);
    const { sessions } = await listRes.json();
    expect(sessions).toHaveLength(1);

    const deleteRes = await fetch(`${server.baseUrl}/api/chat/sessions/${session.id}`, { method: "DELETE" });
    expect(deleteRes.status).toBe(204);
  });

  it("reports summary status as none, current, then stale", async () => {
    server = await createTestServer();
    const { pool, newId } = await import("../db/pool.js");

    const createRes = await fetch(`${server.baseUrl}/api/chat/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const { session } = await createRes.json();
    expect(session.summaryStatus).toBe("none");

    async function readStatus(): Promise<string> {
      const res = await fetch(`${server!.baseUrl}/api/chat/sessions`);
      const { sessions } = await res.json();
      return sessions.find((item: { id: string }) => item.id === session.id).summaryStatus;
    }

    const summarizedMessageId = newId();
    await pool.query(
      `insert into chat_messages (id, session_id, role, content, created_at)
       values ($1, $2, 'user', 'hello', datetime('now', '-1 hour'))`,
      [summarizedMessageId, session.id]
    );
    expect(await readStatus()).toBe("none");

    await pool.query(
      `update chat_sessions
       set summary = 'a summary', summary_through_message_id = $2
       where id = $1`,
      [session.id, summarizedMessageId]
    );
    expect(await readStatus()).toBe("current");

    await pool.query(
      `insert into chat_messages (id, session_id, role, content, created_at)
       values ($1, $2, 'assistant', 'reply', datetime('now'))`,
      [newId(), session.id]
    );
    expect(await readStatus()).toBe("stale");
  });

  it("rejects messages on full sessions with 409", async () => {
    server = await createTestServer();

    const createRes = await fetch(`${server.baseUrl}/api/chat/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const { session } = await createRes.json();

    const { pool } = await import("../db/pool.js");
    await pool.query("update chat_sessions set status = 'full' where id = $1", [session.id]);

    const messageRes = await fetch(`${server.baseUrl}/api/chat/sessions/${session.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });
    expect(messageRes.status).toBe(409);
  });
});

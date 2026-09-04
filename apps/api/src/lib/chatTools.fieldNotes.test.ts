import { afterEach, describe, expect, it } from "vitest";
import { createTestServer } from "../test/createTestServer.js";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

describe("chat field note tools", () => {
  let close: (() => Promise<void>) | null = null;

  afterEach(async () => {
    await close?.();
    close = null;
  });

  async function setup() {
    const server = await createTestServer();
    close = server.close;
    const { pool } = await import("../db/pool.js");
    const { LOCAL_OWNER_ID } = await import("@framer/schema");
    // createFieldNoteTool records sourceSessionId with an FK to chat_sessions,
    // so the session referenced by ChatToolContext must be a real row.
    await pool.query(
      `insert into chat_sessions (id, owner_id, provider, model) values ($1, $2, 'test', 'test')`,
      [SESSION_ID, LOCAL_OWNER_ID]
    );
    const { executeChatTool } = await import("./chatTools.js");
    return (name: string, args: Record<string, unknown> = {}) =>
      executeChatTool(name, args, { sessionId: SESSION_ID });
  }

  it("createFieldNote saves a draft, invisible to searchFieldNotes until confirmed", async () => {
    const run = await setup();

    const created = (await run("createFieldNote", {
      title: "Flip chip to short — B-tension needs resetting",
      body: "The derailleur wasn't shifting properly after flipping the chip to short.",
      brand: "Rocky Mountain",
      model: "Altitude",
      tags: ["flip-chip"],
    })) as { id: string; status: string; message: string };

    expect(created.status).toBe("draft");
    expect(created.message).toMatch(/awaiting your review/i);

    const searchResult = (await run("searchFieldNotes", { query: "shifting" })) as { notes: unknown[] };
    expect(searchResult.notes).toHaveLength(0);

    const { confirmFieldNoteDraft } = await import("../services/fieldNoteService.js");
    const { LOCAL_OWNER_ID } = await import("@framer/schema");
    await confirmFieldNoteDraft(LOCAL_OWNER_ID, created.id);

    const afterConfirm = (await run("searchFieldNotes", { query: "shifting" })) as { notes: unknown[] };
    expect(afterConfirm.notes).toHaveLength(1);
  });

  it("createFieldNote records the originating session id", async () => {
    const run = await setup();
    const created = (await run("createFieldNote", { title: "x", body: "y" })) as { id: string };

    const { getFieldNote } = await import("../services/fieldNoteService.js");
    const { LOCAL_OWNER_ID } = await import("@framer/schema");
    const note = await getFieldNote(LOCAL_OWNER_ID, created.id);
    expect(note?.sourceSessionId).toBe(SESSION_ID);
    expect(note?.source).toBe("assistant");
  });

  it("searchFieldNotes and getFieldNote are read-only lookups over published notes", async () => {
    const run = await setup();
    const { createFieldNote } = await import("../services/fieldNoteService.js");
    const { LOCAL_OWNER_ID } = await import("@framer/schema");

    const published = await createFieldNote(LOCAL_OWNER_ID, {
      title: "Dropper collar loose",
      body: "Tightened the collar and the slipping stopped.",
      symptom: "Dropper post slipping under load",
      resolution: "Tightened the collar bolt",
    });

    const searchResult = (await run("searchFieldNotes", { query: "dropper collar" })) as {
      notes: Array<{ id: string; symptom: string | null }>;
    };
    expect(searchResult.notes.map((n) => n.id)).toContain(published.id);
    expect(searchResult.notes[0]?.symptom).toBe("Dropper post slipping under load");

    const full = (await run("getFieldNote", { id: published.id })) as { body: string };
    expect(full.body).toMatch(/Tightened the collar/);

    await expect(run("getFieldNote", { id: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(
      /not found/
    );
  });
});

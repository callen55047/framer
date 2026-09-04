import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

async function setupDb() {
  const dataDir = mkdtempSync(path.join(tmpdir(), "framer-field-notes-test-"));
  process.env.DATABASE_PATH = path.join(dataDir, "framer.db");
  vi.resetModules();
  const { runMigrations } = await import("../db/migrate.js");
  await runMigrations();
  const service = await import("./fieldNoteService.js");
  const { pool, LOCAL_OWNER_ID } = await loadPoolAndOwner();
  return { dataDir, service, pool, LOCAL_OWNER_ID };
}

async function loadPoolAndOwner() {
  const { pool } = await import("../db/pool.js");
  const { LOCAL_OWNER_ID } = await import("@framer/schema");
  return { pool, LOCAL_OWNER_ID };
}

describe("fieldNoteService", () => {
  let cleanup: (() => void) | undefined;

  afterEach(async () => {
    cleanup?.();
    cleanup = undefined;
  });

  it("buildFieldNoteFtsQuery ORs terms and strips FTS operator characters", async () => {
    const { service } = await setupDb();
    expect(service.buildFieldNoteFtsQuery("b-tension")).toBe('"b-tension"*');
    expect(service.buildFieldNoteFtsQuery('unbalanced " quote AND')).toBe(
      '"unbalanced" OR "quote" OR "and"*'
    );
    expect(service.buildFieldNoteFtsQuery("")).toBeNull();
    expect(service.buildFieldNoteFtsQuery("   ")).toBeNull();
  });

  it("creates a note, links tags/products/handbook slugs, and reindexes on update", async () => {
    const { service, pool, LOCAL_OWNER_ID } = await setupDb();
    cleanup = () => void pool.end();

    const note = await service.createFieldNote(LOCAL_OWNER_ID, {
      title: "Flip chip to short — B-tension needs resetting",
      body: "The derailleur wasn't shifting properly after flipping the chip to short.",
      symptom: "Chain collided with the derailleur in the highest gear",
      cause: "Same chain length on a 10mm shorter chainstay changed derailleur position",
      resolution: "Backed off the B-tension screw for a few mm of clearance",
      brand: "Rocky Mountain",
      model: "Altitude",
      modelYearFrom: 2021,
      modelYearTo: 2023,
      tags: ["flip-chip", "b-tension"],
      handbookSlugs: ["chainstay"],
    });
    expect(note.status).toBe("published");
    expect(note.tags).toEqual(["b-tension", "flip-chip"]);
    expect(note.handbookSlugs).toEqual(["chainstay"]);

    const found = await service.searchFieldNotes(LOCAL_OWNER_ID, {
      query: "chain rubbing chainstay",
      limit: 10,
    });
    expect(found.map((n) => n.id)).toContain(note.id);

    const updated = await service.updateFieldNote(LOCAL_OWNER_ID, note.id, {
      body: "Completely different wording now, mentions gremlins instead.",
      tags: ["flip-chip"],
    });
    expect(updated?.tags).toEqual(["flip-chip"]);

    const staleSearch = await service.searchFieldNotes(LOCAL_OWNER_ID, { query: "gremlins", limit: 10 });
    expect(staleSearch.map((n) => n.id)).toContain(note.id);

    const oldTermGone = await service.searchFieldNotes(LOCAL_OWNER_ID, {
      query: "shifting",
      limit: 10,
    });
    expect(oldTermGone.map((n) => n.id)).not.toContain(note.id);
  });

  it("excludes drafts from search and list, includes them after confirm", async () => {
    const { service, pool, LOCAL_OWNER_ID } = await setupDb();
    cleanup = () => void pool.end();

    const draft = await service.createFieldNote(
      LOCAL_OWNER_ID,
      { title: "Dropper collar loose", body: "Assistant-drafted note about a slipping dropper collar." },
      { source: "assistant", status: "draft" }
    );

    expect(await service.listFieldNotes(LOCAL_OWNER_ID)).toHaveLength(0);
    expect(await service.searchFieldNotes(LOCAL_OWNER_ID, { query: "dropper", limit: 10 })).toHaveLength(0);
    expect(await service.listFieldNoteDrafts(LOCAL_OWNER_ID)).toHaveLength(1);

    const confirmed = await service.confirmFieldNoteDraft(LOCAL_OWNER_ID, draft.id);
    expect(confirmed?.status).toBe("published");
    expect(await service.listFieldNotes(LOCAL_OWNER_ID)).toHaveLength(1);
  });

  it("matches a note whose year range covers the queried model year, not one that doesn't", async () => {
    const { service, pool, LOCAL_OWNER_ID } = await setupDb();
    cleanup = () => void pool.end();

    await service.createFieldNote(LOCAL_OWNER_ID, {
      title: "Altitude flip chip note",
      body: "Some prose about tensioning.",
      brand: "Rocky Mountain",
      model: "Altitude",
      modelYearFrom: 2021,
      modelYearTo: 2023,
    });

    const inRange = await service.listFieldNotes(LOCAL_OWNER_ID, { modelYear: 2022 });
    expect(inRange).toHaveLength(1);

    const outOfRange = await service.listFieldNotes(LOCAL_OWNER_ID, { modelYear: 2019 });
    expect(outOfRange).toHaveLength(0);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { createTestServer } from "../test/createTestServer.js";

const ALTITUDE_NOTE = {
  title: "Flip chip to short — B-tension needs resetting",
  body: "Flipped the rear axle chip from long to short, moving the axle 10mm forward. The derailleur wasn't shifting properly afterwards.",
  symptom: "Chain collided with the derailleur in the highest gear",
  cause: "Same chain length on a 10mm shorter chainstay changed derailleur position",
  resolution: "Backed off the B-tension screw for a few mm of clearance",
  brand: "Rocky Mountain",
  model: "Altitude",
  modelYearFrom: 2021,
  modelYearTo: 2023,
  tags: ["flip-chip", "drivetrain", "b-tension", "chainstay"],
  handbookSlugs: ["chainstay", "wheelbase"],
};

describe("field notes routes", () => {
  let server: Awaited<ReturnType<typeof createTestServer>> | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("creates, lists, gets, updates, and deletes a note", async () => {
    server = await createTestServer();

    const createRes = await fetch(`${server.baseUrl}/api/field-notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ALTITUDE_NOTE),
    });
    expect(createRes.status).toBe(201);
    const { note } = await createRes.json();
    expect(note.status).toBe("published");
    expect(note.source).toBe("user");
    expect(note.tags).toEqual(expect.arrayContaining(["flip-chip", "b-tension"]));
    expect(note.handbookSlugs).toEqual(expect.arrayContaining(["chainstay", "wheelbase"]));

    const listRes = await fetch(`${server.baseUrl}/api/field-notes`);
    const { notes } = await listRes.json();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe(note.id);

    const getRes = await fetch(`${server.baseUrl}/api/field-notes/${note.id}`);
    expect(getRes.status).toBe(200);

    const patchRes = await fetch(`${server.baseUrl}/api/field-notes/${note.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags: ["flip-chip"] }),
    });
    expect(patchRes.status).toBe(200);
    const { note: patched } = await patchRes.json();
    expect(patched.tags).toEqual(["flip-chip"]);

    const deleteRes = await fetch(`${server.baseUrl}/api/field-notes/${note.id}`, { method: "DELETE" });
    expect(deleteRes.status).toBe(204);

    const missingRes = await fetch(`${server.baseUrl}/api/field-notes/${note.id}`);
    expect(missingRes.status).toBe(404);
  });

  it("rejects an unknown Handbook slug with 400", async () => {
    server = await createTestServer();
    const res = await fetch(`${server.baseUrl}/api/field-notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x", body: "y", handbookSlugs: ["not-a-real-slug"] }),
    });
    expect(res.status).toBe(400);
  });

  it("searches by free text and ranks the Altitude note first", async () => {
    server = await createTestServer();
    await fetch(`${server.baseUrl}/api/field-notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ALTITUDE_NOTE),
    });
    await fetch(`${server.baseUrl}/api/field-notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Unrelated brake bleed", body: "Bled the brakes with mineral oil." }),
    });

    const res = await fetch(`${server.baseUrl}/api/field-notes?query=chain%20rubbing%20chainstay`);
    const { notes } = await res.json();
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes[0].title).toBe(ALTITUDE_NOTE.title);
  });

  it("filters search by brand/model and model year within range", async () => {
    server = await createTestServer();
    await fetch(`${server.baseUrl}/api/field-notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ALTITUDE_NOTE),
    });

    const hit = await fetch(
      `${server.baseUrl}/api/field-notes?query=tension&brand=Rocky%20Mountain&modelYear=2022`
    );
    expect((await hit.json()).notes).toHaveLength(1);

    const miss = await fetch(`${server.baseUrl}/api/field-notes?query=tension&modelYear=2019`);
    expect((await miss.json()).notes).toHaveLength(0);
  });

  it("does not swallow /drafts or /tags as an :id route", async () => {
    server = await createTestServer();
    const draftsRes = await fetch(`${server.baseUrl}/api/field-notes/drafts`);
    expect(draftsRes.status).toBe(200);
    expect((await draftsRes.json()).drafts).toEqual([]);

    const tagsRes = await fetch(`${server.baseUrl}/api/field-notes/tags`);
    expect(tagsRes.status).toBe(200);
    expect((await tagsRes.json()).tags).toEqual([]);
  });

  it("keeps a draft out of search and listing until confirmed", async () => {
    server = await createTestServer();
    const { createFieldNote } = await import("../services/fieldNoteService.js");
    const { LOCAL_OWNER_ID } = await import("@framer/schema");

    const draft = await createFieldNote(
      LOCAL_OWNER_ID,
      { title: "Dropper collar loose", body: "Assistant drafted this from a chat turn." },
      { source: "assistant", status: "draft" }
    );
    expect(draft.status).toBe("draft");

    const listRes = await fetch(`${server.baseUrl}/api/field-notes`);
    expect((await listRes.json()).notes).toHaveLength(0);

    const searchRes = await fetch(`${server.baseUrl}/api/field-notes?query=dropper`);
    expect((await searchRes.json()).notes).toHaveLength(0);

    const draftsRes = await fetch(`${server.baseUrl}/api/field-notes/drafts`);
    const { drafts } = await draftsRes.json();
    expect(drafts).toHaveLength(1);

    const confirmRes = await fetch(`${server.baseUrl}/api/field-notes/${draft.id}/confirm`, { method: "POST" });
    expect(confirmRes.status).toBe(200);
    const { note: confirmed } = await confirmRes.json();
    expect(confirmed.status).toBe("published");

    const afterConfirmList = await fetch(`${server.baseUrl}/api/field-notes`);
    expect((await afterConfirmList.json()).notes).toHaveLength(1);
  });
});

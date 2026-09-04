import type { CreateFieldNoteInput, FieldNote, FieldNoteSearchInput, UpdateFieldNoteInput } from "@framer/schema";
import { dbClient, newId, pool, withTransaction, type DbClient } from "../db/pool.js";
import { mapFieldNote } from "../lib/mappers.js";

/**
 * Field Notes: rider-authored, owner-scoped records of lived experience with
 * a bike or part. See CONTEXT.md#Knowledge and packages/schema/src/fieldNote.ts.
 *
 * `field_notes_fts` is a plain (non-external-content) FTS5 table, kept in
 * sync here rather than by SQL trigger, because two of its columns (bike,
 * tags) are derived from a join rather than a single row on `field_notes`.
 * Every write that touches title/body/symptom/cause/resolution/brand/model/
 * tags must call reindexNote in the same transaction.
 *
 * All queries below use only `$n` placeholders (never a literal `?`) because
 * `apps/api/src/db/client.ts#convertPlaceholders` reorders params by `$n`
 * occurrence and silently mis-binds a statement that mixes the two styles —
 * see the note on `inClause` there. Tag/product filters use correlated
 * `exists (...)` subqueries for the same reason.
 */

export type FieldNoteWithLinks = FieldNote;

export interface FieldNoteFilter {
  status?: "draft" | "published";
  brand?: string;
  model?: string;
  modelYear?: number;
  tag?: string;
}

export interface FieldNoteSearchResult extends FieldNote {
  rank: number | null;
}

const FTS_OPERATOR_CHARS = /["*(){}:^]/g;

/**
 * Builds a safe FTS5 MATCH expression from free user text. Terms are OR'd —
 * not AND'd — because bm25 already ranks fuller matches higher, and a rider
 * describing a half-remembered symptom will almost always include a word the
 * note itself doesn't use (tested: "chain rubbing chainstay" against a note
 * that never says "rubbing" returns 0 hits under AND, 1 under OR).
 */
export function buildFieldNoteFtsQuery(raw: string): string | null {
  const terms = raw
    .toLowerCase()
    .replace(FTS_OPERATOR_CHARS, " ")
    .split(/\s+/)
    .filter((term) => term.length > 0);
  if (terms.length === 0) return null;
  return terms.map((term, i) => (i === terms.length - 1 ? `"${term}"*` : `"${term}"`)).join(" OR ");
}

async function loadLinks(
  client: DbClient,
  noteId: string
): Promise<{ productIds: string[]; tags: string[]; handbookSlugs: string[] }> {
  const [{ rows: productRows }, { rows: tagRows }, { rows: handbookRows }] = await Promise.all([
    client.query<{ product_id: string }>("select product_id from field_note_products where note_id = $1", [
      noteId,
    ]),
    client.query<{ tag: string }>("select tag from field_note_tags where note_id = $1 order by tag", [noteId]),
    client.query<{ slug: string }>(
      "select slug from field_note_handbook_links where note_id = $1 order by slug",
      [noteId]
    ),
  ]);
  return {
    productIds: productRows.map((r) => r.product_id),
    tags: tagRows.map((r) => r.tag),
    handbookSlugs: handbookRows.map((r) => r.slug),
  };
}

async function replaceLinks(
  client: DbClient,
  noteId: string,
  input: { productIds?: string[]; tags?: string[]; handbookSlugs?: string[] }
): Promise<void> {
  if (input.productIds !== undefined) {
    await client.query("delete from field_note_products where note_id = $1", [noteId]);
    for (const productId of input.productIds) {
      await client.query("insert into field_note_products (note_id, product_id) values ($1, $2)", [
        noteId,
        productId,
      ]);
    }
  }
  if (input.tags !== undefined) {
    await client.query("delete from field_note_tags where note_id = $1", [noteId]);
    for (const tag of new Set(input.tags.map((t) => t.trim().toLowerCase()))) {
      await client.query("insert into field_note_tags (note_id, tag) values ($1, $2)", [noteId, tag]);
    }
  }
  if (input.handbookSlugs !== undefined) {
    await client.query("delete from field_note_handbook_links where note_id = $1", [noteId]);
    for (const slug of new Set(input.handbookSlugs)) {
      await client.query("insert into field_note_handbook_links (note_id, slug) values ($1, $2)", [
        noteId,
        slug,
      ]);
    }
  }
}

async function reindexNote(client: DbClient, noteId: string): Promise<void> {
  const { rows } = await client.query(
    "select title, body, symptom, cause, resolution, brand, model, status from field_notes where id = $1",
    [noteId]
  );
  const row = rows[0];
  await client.query("delete from field_notes_fts where note_id = $1", [noteId]);
  if (!row) return;

  const { rows: tagRows } = await client.query<{ tag: string }>(
    "select tag from field_note_tags where note_id = $1",
    [noteId]
  );

  await client.query(
    `insert into field_notes_fts (note_id, title, body, symptom, cause, resolution, bike, tags)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      noteId,
      row.title,
      row.body,
      row.symptom ?? "",
      row.cause ?? "",
      row.resolution ?? "",
      [row.brand, row.model].filter(Boolean).join(" "),
      tagRows.map((t) => t.tag).join(" "),
    ]
  );
}

async function loadNote(client: DbClient, ownerId: string, id: string): Promise<FieldNote | null> {
  const { rows } = await client.query("select * from field_notes where id = $1 and owner_id = $2", [
    id,
    ownerId,
  ]);
  const row = rows[0];
  if (!row) return null;
  const links = await loadLinks(client, id);
  return mapFieldNote(row, links) as FieldNote;
}

export async function createFieldNote(
  ownerId: string,
  input: CreateFieldNoteInput,
  opts: { source?: "user" | "assistant"; sourceSessionId?: string | null; status?: "draft" | "published" } = {}
): Promise<FieldNote> {
  const id = newId();
  const source = opts.source ?? "user";
  const status = opts.status ?? "published";

  return withTransaction(async (client) => {
    await client.query(
      `insert into field_notes
         (id, owner_id, title, body, symptom, cause, resolution, brand, model,
          model_year_from, model_year_to, status, source, source_session_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        id,
        ownerId,
        input.title,
        input.body,
        input.symptom ?? null,
        input.cause ?? null,
        input.resolution ?? null,
        input.brand ?? null,
        input.model ?? null,
        input.modelYearFrom ?? null,
        input.modelYearTo ?? null,
        status,
        source,
        opts.sourceSessionId ?? null,
      ]
    );
    await replaceLinks(client, id, {
      productIds: input.productIds ?? [],
      tags: input.tags ?? [],
      handbookSlugs: input.handbookSlugs ?? [],
    });
    await reindexNote(client, id);
    const note = await loadNote(client, ownerId, id);
    if (!note) throw new Error("field note failed to persist");
    return note;
  });
}

export async function updateFieldNote(
  ownerId: string,
  id: string,
  input: UpdateFieldNoteInput
): Promise<FieldNote | null> {
  return withTransaction(async (client) => {
    const existing = await loadNote(client, ownerId, id);
    if (!existing) return null;

    await client.query(
      `update field_notes
          set title = $3,
              body = $4,
              symptom = $5,
              cause = $6,
              resolution = $7,
              brand = $8,
              model = $9,
              model_year_from = $10,
              model_year_to = $11,
              updated_at = datetime('now')
        where id = $1 and owner_id = $2`,
      [
        id,
        ownerId,
        input.title ?? existing.title,
        input.body ?? existing.body,
        input.symptom !== undefined ? input.symptom : existing.symptom,
        input.cause !== undefined ? input.cause : existing.cause,
        input.resolution !== undefined ? input.resolution : existing.resolution,
        input.brand !== undefined ? input.brand : existing.brand,
        input.model !== undefined ? input.model : existing.model,
        input.modelYearFrom !== undefined ? input.modelYearFrom : existing.modelYearFrom,
        input.modelYearTo !== undefined ? input.modelYearTo : existing.modelYearTo,
      ]
    );
    await replaceLinks(client, id, {
      productIds: input.productIds,
      tags: input.tags,
      handbookSlugs: input.handbookSlugs,
    });
    await reindexNote(client, id);
    return loadNote(client, ownerId, id);
  });
}

export async function deleteFieldNote(ownerId: string, id: string): Promise<boolean> {
  return withTransaction(async (client) => {
    await client.query("delete from field_notes_fts where note_id = $1", [id]);
    const { rows } = await client.query(
      "delete from field_notes where id = $1 and owner_id = $2 returning id",
      [id, ownerId]
    );
    return rows.length > 0;
  });
}

export async function getFieldNote(ownerId: string, id: string): Promise<FieldNote | null> {
  return loadNote(dbClient, ownerId, id);
}

export async function confirmFieldNoteDraft(ownerId: string, id: string): Promise<FieldNote | null> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `update field_notes set status = 'published', updated_at = datetime('now')
        where id = $1 and owner_id = $2 and status = 'draft'
        returning id`,
      [id, ownerId]
    );
    if (rows.length === 0) return null;
    return loadNote(client, ownerId, id);
  });
}

export async function listFieldNoteDrafts(ownerId: string): Promise<FieldNote[]> {
  return listFieldNotes(ownerId, { status: "draft" });
}

export async function listFieldNoteTags(ownerId: string): Promise<{ tag: string; count: number }[]> {
  const { rows } = await pool.query<{ tag: string; count: number }>(
    `select t.tag as tag, count(*) as count
       from field_note_tags t
       join field_notes n on n.id = t.note_id
      where n.owner_id = $1 and n.status = 'published'
      group by t.tag
      order by count desc, t.tag asc`,
    [ownerId]
  );
  return rows;
}

export async function listFieldNotes(ownerId: string, filter: FieldNoteFilter = {}): Promise<FieldNote[]> {
  const status = filter.status ?? "published";
  const { rows } = await pool.query<{ id: string } & Record<string, unknown>>(
    `select n.*
       from field_notes n
      where n.owner_id = $1
        and n.status = $2
        and ($3 is null or lower(n.brand) = lower($3))
        and ($4 is null or lower(n.model) = lower($4))
        and ($5 is null or (
              (n.model_year_from is null or n.model_year_from <= $5)
          and (n.model_year_to is null or n.model_year_to >= $5)
        ))
        and ($6 is null or exists (
              select 1 from field_note_tags t where t.note_id = n.id and t.tag = $6
        ))
      order by n.updated_at desc`,
    [ownerId, status, filter.brand ?? null, filter.model ?? null, filter.modelYear ?? null, filter.tag ?? null]
  );

  const notes: FieldNote[] = [];
  for (const row of rows) {
    const links = await loadLinks(dbClient, row.id);
    notes.push(mapFieldNote(row, links) as FieldNote);
  }
  return notes;
}

/**
 * Published-only search. Free-text `query` runs against the FTS index
 * ranked by bm25; without one, falls back to the same filters ordered by
 * recency. Drafts never appear here — they're excluded by the `status`
 * filter, not by absence from the FTS index (which still holds drafts so a
 * confirm doesn't require a reindex).
 */
export async function searchFieldNotes(
  ownerId: string,
  input: FieldNoteSearchInput
): Promise<FieldNoteSearchResult[]> {
  const matchQuery = input.query ? buildFieldNoteFtsQuery(input.query) : null;

  if (!matchQuery) {
    const notes = await listFieldNotes(ownerId, {
      status: "published",
      brand: input.brand,
      model: input.model,
      modelYear: input.modelYear,
      tag: input.tag,
    });
    return notes.slice(0, input.limit).map((note) => ({ ...note, rank: null }));
  }

  const { rows } = await pool.query<{ id: string; rank: number } & Record<string, unknown>>(
    `select n.*, bm25(field_notes_fts) as rank
       from field_notes_fts f
       join field_notes n on n.id = f.note_id
      where field_notes_fts match $1
        and n.owner_id = $2
        and n.status = 'published'
        and ($3 is null or lower(n.brand) = lower($3))
        and ($4 is null or lower(n.model) = lower($4))
        and ($5 is null or (
              (n.model_year_from is null or n.model_year_from <= $5)
          and (n.model_year_to is null or n.model_year_to >= $5)
        ))
        and ($6 is null or exists (
              select 1 from field_note_tags t where t.note_id = n.id and t.tag = $6
        ))
      order by rank
      limit $7`,
    [
      matchQuery,
      ownerId,
      input.brand ?? null,
      input.model ?? null,
      input.modelYear ?? null,
      input.tag ?? null,
      input.limit,
    ]
  );

  const results: FieldNoteSearchResult[] = [];
  for (const row of rows) {
    const links = await loadLinks(dbClient, row.id);
    results.push({ ...(mapFieldNote(row, links) as FieldNote), rank: row.rank as number });
  }
  return results;
}

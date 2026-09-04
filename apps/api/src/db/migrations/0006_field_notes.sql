-- Field Notes: rider-authored, owner-scoped records of lived experience with
-- a bike or part (symptom / cause / resolution), distinct from the
-- code-authoritative Handbook. See CONTEXT.md#Knowledge.
--
-- status: draft rows are written by the assistant (createFieldNote tool) and
-- are excluded from search/list until the owner confirms them in the UI.
-- source/source_session_id trace an assistant-authored draft back to the
-- conversation that produced it; source_session_id is nulled rather than
-- blocked on session delete so a draft outlives its conversation.
create table if not exists field_notes (
  id text primary key,
  owner_id text not null references owners(id),
  title text not null,
  body text not null,
  symptom text,
  cause text,
  resolution text,
  brand text,
  model text,
  model_year_from integer,
  model_year_to integer,
  status text not null default 'published'
    check (status in ('draft', 'published')),
  source text not null default 'user'
    check (source in ('user', 'assistant')),
  source_session_id text references chat_sessions(id) on delete set null,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create index if not exists field_notes_owner_idx on field_notes (owner_id, status);
create index if not exists field_notes_bike_idx on field_notes (lower(brand), lower(model));

create table if not exists field_note_products (
  note_id text not null references field_notes(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  primary key (note_id, product_id)
);

create table if not exists field_note_tags (
  note_id text not null references field_notes(id) on delete cascade,
  tag text not null,
  primary key (note_id, tag)
);
create index if not exists field_note_tags_tag_idx on field_note_tags (tag);

create table if not exists field_note_handbook_links (
  note_id text not null references field_notes(id) on delete cascade,
  slug text not null,
  primary key (note_id, slug)
);

-- Plain (non-external-content) FTS5 index. Kept in sync by the service layer
-- (fieldNoteService.reindexNote), not by SQL triggers, because two of its
-- columns (bike, tags) are derived from joins rather than a single row.
create virtual table if not exists field_notes_fts using fts5(
  note_id unindexed,
  title,
  body,
  symptom,
  cause,
  resolution,
  bike,
  tags,
  tokenize = 'porter unicode61'
);

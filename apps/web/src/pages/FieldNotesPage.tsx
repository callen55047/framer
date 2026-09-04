import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { NotebookPen, Plus, Search, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader.js";
import { EmptyState } from "../components/EmptyState.js";
import { FieldNoteForm } from "../components/FieldNoteForm.js";
import { FieldNoteDraftReview } from "../components/FieldNoteDraftReview.js";
import { api, type FieldNote, type FieldNoteTagCount } from "../lib/api.js";

function bikeLabel(note: FieldNote): string | null {
  if (!note.brand && !note.model) return null;
  const years =
    note.modelYearFrom || note.modelYearTo
      ? ` (${note.modelYearFrom ?? "…"}–${note.modelYearTo ?? "…"})`
      : "";
  return `${[note.brand, note.model].filter(Boolean).join(" ")}${years}`;
}

export function FieldNotesPage() {
  const [notes, setNotes] = useState<FieldNote[] | null>(null);
  const [drafts, setDrafts] = useState<FieldNote[]>([]);
  const [tags, setTags] = useState<FieldNoteTagCount[]>([]);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .listFieldNotes({ query: query || undefined, tag: activeTag ?? undefined })
      .then(({ notes: loaded }) => setNotes(loaded))
      .catch((err: Error) => setError(err.message));
  }, [query, activeTag]);

  useEffect(() => {
    const handle = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, query]);

  useEffect(() => {
    api.listFieldNoteTags().then(({ tags: loaded }) => setTags(loaded));
  }, [notes]);

  useEffect(() => {
    api.listFieldNoteDrafts().then(({ drafts: loaded }) => setDrafts(loaded));
  }, [notes]);

  async function confirmDraft(id: string) {
    await api.confirmFieldNoteDraft(id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    load();
  }

  async function discardDraft(id: string) {
    await api.deleteFieldNote(id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  return (
    <div>
      <PageHeader
        title="Field Notes"
        subtitle="Your own recorded experience with bikes and parts — symptoms, causes, and what fixed them."
        action={
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-purple/20 px-3 py-1.5 text-sm font-medium text-brand-blue hover:bg-brand-purple/30"
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? "Cancel" : "New note"}
          </button>
        }
      />

      <div className="mx-auto max-w-5xl space-y-6 px-8 py-6">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        {showForm ? (
          <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
            <FieldNoteForm
              onSaved={() => {
                setShowForm(false);
                load();
              }}
              onCancel={() => setShowForm(false)}
            />
          </section>
        ) : null}

        {drafts.length > 0 ? (
          <section className="space-y-3">
            {drafts.map((draft) => (
              <FieldNoteDraftReview
                key={draft.id}
                draft={draft}
                onConfirm={() => confirmDraft(draft.id)}
                onDiscard={() => discardDraft(draft.id)}
              />
            ))}
          </section>
        ) : null}

        <section className="space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              placeholder="Search your notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 py-2 pl-9 pr-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-brand-purple focus:outline-none"
            />
          </div>

          {tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTag(null)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  activeTag === null
                    ? "bg-brand-purple/15 text-brand-blue"
                    : "text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-200"
                }`}
              >
                All
              </button>
              {tags.map(({ tag, count }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    activeTag === tag
                      ? "bg-brand-purple/15 text-brand-blue"
                      : "text-neutral-500 hover:bg-neutral-800/60 hover:text-neutral-200"
                  }`}
                >
                  {tag} <span className="text-neutral-600">({count})</span>
                </button>
              ))}
            </div>
          ) : null}

          {!notes ? (
            <p className="py-12 text-center text-sm text-neutral-500">Loading notes…</p>
          ) : notes.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title="No Field Notes yet"
              description="Record what you learn while working on your bikes — symptoms, causes, and fixes — so you (or the assistant) can find it again."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {notes.map((note) => (
                <Link
                  key={note.id}
                  to={`/notes/${note.id}`}
                  className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-5 transition-colors hover:border-neutral-700"
                >
                  <h3 className="font-medium text-neutral-100">{note.title}</h3>
                  {bikeLabel(note) ? <p className="mt-1 text-xs text-neutral-500">{bikeLabel(note)}</p> : null}
                  {note.symptom ? <p className="mt-2 text-sm text-neutral-400 line-clamp-2">{note.symptom}</p> : null}
                  {note.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {note.tags.map((tag) => (
                        <span key={tag} className="rounded-md bg-neutral-800/80 px-2 py-0.5 text-xs text-neutral-400">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

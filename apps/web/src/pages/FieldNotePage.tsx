import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Markdown from "react-markdown";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { FieldNoteForm } from "../components/FieldNoteForm.js";
import { api, type FieldNote } from "../lib/api.js";

export function FieldNotePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [note, setNote] = useState<FieldNote | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNote(null);
    setError(null);
    api
      .getFieldNote(id)
      .then(({ note: loaded }) => setNote(loaded))
      .catch((err: Error) => setError(err.message));
  }, [id]);

  async function handleDelete() {
    if (!note) return;
    if (!confirm(`Delete "${note.title}"? This can't be undone.`)) return;
    await api.deleteFieldNote(note.id);
    navigate("/notes");
  }

  if (error) {
    return (
      <div className="px-8 py-12">
        <p className="text-sm text-red-400">{error}</p>
        <Link to="/notes" className="mt-4 inline-block text-sm text-brand-blue hover:underline">
          Back to Field Notes
        </Link>
      </div>
    );
  }

  if (!note) {
    return <p className="px-8 py-12 text-center text-sm text-neutral-500">Loading note…</p>;
  }

  const bike =
    note.brand || note.model
      ? `${[note.brand, note.model].filter(Boolean).join(" ")}${
          note.modelYearFrom || note.modelYearTo
            ? ` (${note.modelYearFrom ?? "…"}–${note.modelYearTo ?? "…"})`
            : ""
        }`
      : null;

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <Link to="/notes" className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-200">
        <ArrowLeft size={16} />
        Field Notes
      </Link>

      {editing ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <FieldNoteForm
            existing={note}
            onSaved={(updated) => {
              setNote(updated);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-neutral-50">{note.title}</h1>
              {bike ? <p className="mt-1 text-sm text-neutral-500">{bike}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="Edit"
                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                onClick={handleDelete}
                aria-label="Delete"
                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {note.symptom || note.cause || note.resolution ? (
            <dl className="mb-8 grid gap-4 rounded-xl border border-neutral-800 bg-neutral-950/40 p-5 text-sm sm:grid-cols-3">
              {note.symptom ? (
                <div>
                  <dt className="text-neutral-500">Symptom</dt>
                  <dd className="mt-1 text-neutral-100">{note.symptom}</dd>
                </div>
              ) : null}
              {note.cause ? (
                <div>
                  <dt className="text-neutral-500">Cause</dt>
                  <dd className="mt-1 text-neutral-100">{note.cause}</dd>
                </div>
              ) : null}
              {note.resolution ? (
                <div>
                  <dt className="text-neutral-500">Resolution</dt>
                  <dd className="mt-1 text-neutral-100">{note.resolution}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <div className="prose prose-invert max-w-none prose-p:text-neutral-300 prose-strong:text-neutral-100">
            <Markdown>{note.body}</Markdown>
          </div>

          {note.tags.length > 0 ? (
            <div className="mt-8 flex flex-wrap gap-1.5">
              {note.tags.map((tag) => (
                <span key={tag} className="rounded-md bg-neutral-800/80 px-2 py-0.5 text-xs text-neutral-400">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {note.handbookSlugs.length > 0 ? (
            <section className="mt-10 border-t border-neutral-800 pt-8">
              <h2 className="mb-3 text-lg font-medium text-neutral-100">Related Handbook entries</h2>
              <ul className="space-y-2">
                {note.handbookSlugs.map((slug) => (
                  <li key={slug}>
                    <Link to={`/handbook/${slug}`} className="text-sm text-brand-blue hover:underline">
                      {slug}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

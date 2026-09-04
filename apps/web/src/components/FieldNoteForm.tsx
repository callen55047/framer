import { useState } from "react";
import { api, type FieldNote, type FieldNoteInput } from "../lib/api.js";

const labelClass = "text-xs font-medium text-neutral-400";
const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-brand-purple focus:outline-none";

function toNote(input: FieldNoteInput): FieldNoteInput {
  return {
    ...input,
    title: input.title.trim(),
    body: input.body.trim(),
    symptom: input.symptom?.trim() || undefined,
    cause: input.cause?.trim() || undefined,
    resolution: input.resolution?.trim() || undefined,
    brand: input.brand?.trim() || undefined,
    model: input.model?.trim() || undefined,
    tags: input.tags?.map((t) => t.trim()).filter(Boolean),
  };
}

/**
 * Create/edit form for a Field Note — the rider's own recorded experience
 * with a bike or part (symptom / cause / resolution). See CONTEXT.md#Knowledge.
 */
export function FieldNoteForm({
  existing,
  onSaved,
  onCancel,
}: {
  existing?: FieldNote;
  onSaved: (note: FieldNote) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [symptom, setSymptom] = useState(existing?.symptom ?? "");
  const [cause, setCause] = useState(existing?.cause ?? "");
  const [resolution, setResolution] = useState(existing?.resolution ?? "");
  const [brand, setBrand] = useState(existing?.brand ?? "");
  const [model, setModel] = useState(existing?.model ?? "");
  const [modelYearFrom, setModelYearFrom] = useState(existing?.modelYearFrom?.toString() ?? "");
  const [modelYearTo, setModelYearTo] = useState(existing?.modelYearTo?.toString() ?? "");
  const [tagsText, setTagsText] = useState(existing?.tags.join(", ") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const input = toNote({
        title,
        body,
        symptom: symptom || undefined,
        cause: cause || undefined,
        resolution: resolution || undefined,
        brand: brand || undefined,
        model: model || undefined,
        modelYearFrom: modelYearFrom ? Number(modelYearFrom) : undefined,
        modelYearTo: modelYearTo ? Number(modelYearTo) : undefined,
        tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
      });
      const { note } = existing ? await api.updateFieldNote(existing.id, input) : await api.createFieldNote(input);
      onSaved(note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="space-y-1.5">
        <label htmlFor="fn-title" className={labelClass}>
          Title
        </label>
        <input
          id="fn-title"
          required
          placeholder="Flip chip to short — B-tension needs resetting"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="fn-body" className={labelClass}>
          What happened
        </label>
        <textarea
          id="fn-body"
          required
          rows={6}
          placeholder="Write it the way you'd tell a friend — markdown supported."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className={`${inputClass} resize-y`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <label htmlFor="fn-symptom" className={labelClass}>
            Symptom
          </label>
          <input
            id="fn-symptom"
            placeholder="Chain collided with derailleur"
            value={symptom}
            onChange={(e) => setSymptom(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="fn-cause" className={labelClass}>
            Cause
          </label>
          <input
            id="fn-cause"
            placeholder="Shorter chainstay changed tension"
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="fn-resolution" className={labelClass}>
            Resolution
          </label>
          <input
            id="fn-resolution"
            placeholder="Backed off the B-tension screw"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <label htmlFor="fn-brand" className={labelClass}>
            Brand
          </label>
          <input
            id="fn-brand"
            placeholder="Rocky Mountain"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="fn-model" className={labelClass}>
            Model
          </label>
          <input
            id="fn-model"
            placeholder="Altitude"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="fn-year-from" className={labelClass}>
            Year from
          </label>
          <input
            id="fn-year-from"
            type="number"
            placeholder="2021"
            value={modelYearFrom}
            onChange={(e) => setModelYearFrom(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="fn-year-to" className={labelClass}>
            Year to
          </label>
          <input
            id="fn-year-to"
            type="number"
            placeholder="2023"
            value={modelYearTo}
            onChange={(e) => setModelYearTo(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="fn-tags" className={labelClass}>
          Tags (comma separated)
        </label>
        <input
          id="fn-tags"
          placeholder="flip-chip, drivetrain, b-tension"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          className={inputClass}
        />
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={submitting || !title.trim() || !body.trim()}
          className="rounded-lg bg-brand-purple/20 px-4 py-2 text-sm font-medium text-brand-blue transition-colors hover:bg-brand-purple/30 disabled:opacity-50"
        >
          {submitting ? "Saving…" : existing ? "Save changes" : "Save note"}
        </button>
      </div>
    </form>
  );
}

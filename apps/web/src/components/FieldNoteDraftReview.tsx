import { Check, Sparkles, Trash2 } from "lucide-react";
import type { FieldNote } from "../lib/api.js";

/**
 * A draft Field Note the assistant wrote from a chat turn (createFieldNote
 * tool). Read-only until the rider confirms or discards it — see the
 * "Recording notes" section of the assistant SYSTEM_PROMPT in chatService.ts.
 */
export function FieldNoteDraftReview({
  draft,
  onConfirm,
  onDiscard,
}: {
  draft: FieldNote;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="rounded-xl border border-brand-purple/30 bg-brand-purple/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-brand-blue">
        <Sparkles size={14} />
        Drafted by the assistant — awaiting your review
      </div>
      <h3 className="font-medium text-neutral-100">{draft.title}</h3>
      <p className="mt-1 line-clamp-3 text-sm text-neutral-400">{draft.body}</p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-purple/20 px-3 py-1.5 text-xs font-medium text-brand-blue hover:bg-brand-purple/30"
        >
          <Check size={14} />
          Confirm
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
        >
          <Trash2 size={14} />
          Discard
        </button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { api, type CreateWatchInput } from "../lib/api.js";

const FRAME_SIZE_OPTIONS = [
  { value: "XS", label: "XS" },
  { value: "S", label: "S" },
  { value: "M", label: "M" },
  { value: "L", label: "L" },
  { value: "XL", label: "XL" },
  { value: "XXL", label: "XXL" },
] as const;

const WHEEL_SIZE_OPTIONS = [
  { value: "26", label: '26"' },
  { value: "27.5", label: '27.5"' },
  { value: "29", label: '29"' },
] as const;

const CATEGORIES = [
  { value: "frame", label: "Frame" },
  { value: "fork", label: "Fork" },
  { value: "wheelset", label: "Wheelset" },
  { value: "drivetrain", label: "Drivetrain" },
  { value: "brakes", label: "Brakes" },
  { value: "cockpit", label: "Cockpit" },
  { value: "tires", label: "Tires" },
  { value: "other", label: "Other" },
] as const;

const labelClass = "text-xs font-medium text-neutral-400";

export function AddWatchForm({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [displayTitle, setDisplayTitle] = useState("");
  const [itemKind, setItemKind] = useState<CreateWatchInput["itemKind"]>("component");
  const [category, setCategory] = useState<NonNullable<CreateWatchInput["category"]>>("frame");
  const [useSizeFilter, setUseSizeFilter] = useState(false);
  const [frameSize, setFrameSize] = useState<NonNullable<CreateWatchInput["frameSize"]>>("M");
  const [wheelSizeInches, setWheelSizeInches] =
    useState<NonNullable<CreateWatchInput["wheelSizeInches"]>>("29");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createWatch({
        url: url.trim(),
        displayTitle: displayTitle.trim() || undefined,
        itemKind,
        category: itemKind === "component" ? category : undefined,
        frameSize: itemKind === "complete_bike" && useSizeFilter ? frameSize : undefined,
        wheelSizeInches: itemKind === "complete_bike" && useSizeFilter ? wheelSizeInches : undefined,
      });
      setUrl("");
      setDisplayTitle("");
      setItemKind("component");
      setCategory("frame");
      setUseSizeFilter(false);
      setFrameSize("M");
      setWheelSizeInches("29");
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add watch");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <label htmlFor="watch-url" className={labelClass}>
            Listing URL
          </label>
          <div className="flex gap-2">
            <input
              id="watch-url"
              type="url"
              required
              placeholder="https://www.jensonusa.com/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-brand-purple focus:outline-none"
            />
            <button
              type="submit"
              disabled={submitting}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Add Watch
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="watch-title" className={labelClass}>
            Display title <span className="font-normal text-neutral-600">(optional)</span>
          </label>
          <input
            id="watch-title"
            type="text"
            placeholder="e.g. OEM Rocky Mountain Instinct Price, Local bike shop price"
            value={displayTitle}
            onChange={(e) => setDisplayTitle(e.target.value)}
            maxLength={120}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-brand-purple focus:outline-none"
          />
          <p className="text-[11px] text-neutral-600">
            Leave blank to auto-generate after the first refresh. New watches track all discovered variants by default.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className={labelClass}>Item type</legend>
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-800 px-3 py-2 text-sm text-neutral-300 transition-colors has-[:checked]:border-brand-purple/50 has-[:checked]:bg-brand-purple/5">
                <input
                  type="radio"
                  name="itemKind"
                  checked={itemKind === "component"}
                  onChange={() => setItemKind("component")}
                  className="accent-brand-purple"
                />
                Component
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-800 px-3 py-2 text-sm text-neutral-300 transition-colors has-[:checked]:border-brand-purple/50 has-[:checked]:bg-brand-purple/5">
                <input
                  type="radio"
                  name="itemKind"
                  checked={itemKind === "complete_bike"}
                  onChange={() => setItemKind("complete_bike")}
                  className="accent-brand-purple"
                />
                Complete bike
              </label>
            </div>
          </fieldset>

          {itemKind === "component" && (
            <div className="space-y-1.5">
              <label htmlFor="watch-category" className={labelClass}>
                Component category
              </label>
              <select
                id="watch-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-brand-purple focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {itemKind === "complete_bike" && (
            <div className="space-y-3 sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={useSizeFilter}
                  onChange={(e) => setUseSizeFilter(e.target.checked)}
                  className="accent-brand-purple"
                />
                Filter discovered variants by frame and wheel size
              </label>
              {useSizeFilter && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="watch-frame-size" className={labelClass}>
                      Frame size filter
                    </label>
                    <select
                      id="watch-frame-size"
                      value={frameSize}
                      onChange={(e) => setFrameSize(e.target.value as typeof frameSize)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-brand-purple focus:outline-none"
                    >
                      {FRAME_SIZE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="watch-wheel-size" className={labelClass}>
                      Wheel size filter
                    </label>
                    <select
                      id="watch-wheel-size"
                      value={wheelSizeInches}
                      onChange={(e) =>
                        setWheelSizeInches(e.target.value as typeof wheelSizeInches)
                      }
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-brand-purple focus:outline-none"
                    >
                      {WHEEL_SIZE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </form>
    </section>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";

interface HandbookIndex {
  slugBySpecKey: Map<string, string>;
  labelBySpecKey: Map<string, string>;
}

let handbookIndexPromise: Promise<HandbookIndex> | null = null;

function loadHandbookIndex(): Promise<HandbookIndex> {
  if (!handbookIndexPromise) {
    handbookIndexPromise = api.getHandbook().then(({ entries }) => {
      const slugBySpecKey = new Map<string, string>();
      const labelBySpecKey = new Map<string, string>();
      for (const entry of entries) {
        if (entry.specKey) {
          slugBySpecKey.set(entry.specKey, entry.slug);
          labelBySpecKey.set(entry.specKey, entry.label);
        }
      }
      return { slugBySpecKey, labelBySpecKey };
    });
  }
  return handbookIndexPromise;
}

interface SpecLabelProps {
  specKey: string;
  label?: string;
  className?: string;
}

/** Links a Spec field label to its Handbook entry when one exists. */
export function SpecLabel({ specKey, label, className = "" }: SpecLabelProps) {
  const [slug, setSlug] = useState<string | null>(null);
  const [resolvedLabel, setResolvedLabel] = useState(label ?? specKey);

  useEffect(() => {
    let active = true;
    loadHandbookIndex().then((index) => {
      if (!active) return;
      setSlug(index.slugBySpecKey.get(specKey) ?? null);
      if (!label) {
        setResolvedLabel(index.labelBySpecKey.get(specKey) ?? specKey);
      }
    });
    return () => {
      active = false;
    };
  }, [specKey, label]);

  if (!slug) {
    return <span className={className}>{resolvedLabel}</span>;
  }

  return (
    <Link to={`/handbook/${slug}`} className={`text-brand-blue hover:underline ${className}`}>
      {resolvedLabel}
    </Link>
  );
}

const STOPWORDS = new Set(["bike", "bicycle", "the", "a", "an", "new"]);

/** Lowercases, strips punctuation, drops stopwords, collapses whitespace. Shared by the API's Resolution grading and any client that wants to preview a match before sending data across the wire. */
export function normalizeModelTokens(text: string): Set<string> {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token) && !/^(19|20)\d{2}$/.test(token));
  return new Set(cleaned);
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Strips a leading brand name from a title, e.g. "DT Swiss XM 1700" + "DT Swiss" -> "XM 1700". */
export function deriveModelGuess(title: string, brand: string): string {
  const trimmedTitle = title.trim();
  if (trimmedTitle.toLowerCase().startsWith(brand.trim().toLowerCase())) {
    return trimmedTitle.slice(brand.length).trim();
  }
  return trimmedTitle;
}

export class ReferenceFetchHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string
  ) {
    super(`fetch ${url} returned ${status}`);
    this.name = "ReferenceFetchHttpError";
  }
}

export class ReferenceBlockedError extends Error {
  constructor(
    public readonly url: string,
    public readonly reason: string
  ) {
    super(`blocked: ${reason} (${url})`);
    this.name = "ReferenceBlockedError";
  }
}

export class ReferenceEmptyError extends Error {
  constructor(
    public readonly url: string,
    public readonly reason: string
  ) {
    super(`empty: ${reason} (${url})`);
    this.name = "ReferenceEmptyError";
  }
}

const CHALLENGE_MARKERS = [
  "prove humanity",
  "just a moment",
  "cf-challenge",
  "recaptcha",
  "checking your browser",
  "access denied",
  "enable javascript",
];

export function detectBotChallenge(html: string, text: string): string | null {
  const haystack = `${html}\n${text}`.toLowerCase();
  for (const marker of CHALLENGE_MARKERS) {
    if (haystack.includes(marker)) return marker;
  }
  return null;
}

export function assertReferenceContent(params: {
  html: string;
  text: string;
  url: string;
  queryTerms?: string[];
  isSearchPage?: boolean;
}): void {
  const { html, text, url, queryTerms = [], isSearchPage = false } = params;

  if (text.length < 20) {
    throw new ReferenceEmptyError(url, "almost no visible text");
  }

  const challenge = detectBotChallenge(html, text);
  if (challenge && text.length < 5000) {
    throw new ReferenceBlockedError(url, challenge);
  }

  if (html.length > 5000 && text.length < html.length * 0.002) {
    throw new ReferenceEmptyError(url, "text ratio too low — likely JS-rendered shell");
  }

  if (isSearchPage && queryTerms.length > 0) {
    const normalized = text.toLowerCase();
    const tokens = queryTerms
      .flatMap((term) => term.toLowerCase().split(/\s+/))
      .filter((token) => token.length > 2);
    const hits = tokens.filter((token) => normalized.includes(token)).length;
    if (tokens.length > 0 && hits === 0) {
      throw new ReferenceEmptyError(url, "search page has no query-term matches");
    }
  }
}

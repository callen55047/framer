import * as cheerio from "cheerio";
import { extractVisibleText } from "./html.js";

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'");
}

function extractMetaContent($: cheerio.CheerioAPI, selector: string): string | null {
  const value = $(selector).attr("content")?.trim();
  return value ? decodeHtmlEntities(value) : null;
}

function extractJsonLdText(html: string): string[] {
  const parts: string[] = [];
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      collectJsonLdStrings(parsed, parts);
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }
  return parts;
}

function collectJsonLdStrings(node: unknown, parts: string[]): void {
  if (typeof node === "string") {
    const trimmed = decodeHtmlEntities(node.trim());
    if (trimmed.length > 0) parts.push(trimmed);
    return;
  }
  if (Array.isArray(node)) {
    for (const entry of node) collectJsonLdStrings(entry, parts);
    return;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) {
      collectJsonLdStrings(value, parts);
    }
  }
}

/**
 * Builds the text relevance/extraction models should see for a listing page.
 * Ecwid/Lightspeed instant-site shells often ship almost no visible body text,
 * so meta tags and JSON-LD are included alongside stripped body content.
 */
export function buildListingPageText(html: string): string {
  const $ = cheerio.load(html);
  const parts = [extractVisibleText(html)];

  const title = $("title").text().trim() || extractMetaContent($, 'meta[property="og:title"]');
  const description =
    extractMetaContent($, 'meta[name="description"]') ??
    extractMetaContent($, 'meta[property="og:description"]');

  if (title) parts.push(title);
  if (description) parts.push(description);
  parts.push(...extractJsonLdText(html));

  return parts
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 0)
    .join(" ");
}

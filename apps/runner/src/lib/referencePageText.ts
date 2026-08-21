import * as cheerio from "cheerio";

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'");
}

function cellText(cell: cheerio.Cheerio<any>): string {
  return decodeHtmlEntities(cell.text()).replace(/\s+/g, " ").trim();
}

function tableToLines($: cheerio.CheerioAPI, table: any): string[] {
  const lines: string[] = [];
  $(table)
    .find("tr")
    .each((_, row) => {
      const cells = $(row)
        .find("th, td")
        .map((__, cell) => cellText($(cell)))
        .get()
        .filter(Boolean);
      if (cells.length > 0) {
        lines.push(cells.join(" | "));
      }
    });
  return lines;
}

/**
 * Extracts reference-page text with table row/column structure preserved.
 * Unlike buildListingPageText, this keeps geometry tables readable for the model.
 */
export function buildReferencePageText(html: string, options?: { section?: string }): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer").remove();

  const parts: string[] = [];

  $("table").each((_, table) => {
    parts.push(...tableToLines($, table));
  });

  $("h1, h2, h3, h4, h5, h6").each((_, heading) => {
    const text = decodeHtmlEntities($(heading).text()).replace(/\s+/g, " ").trim();
    if (text) parts.push(`## ${text}`);
  });

  $("li").each((_, item) => {
    const text = decodeHtmlEntities($(item).text()).replace(/\s+/g, " ").trim();
    if (text) parts.push(`- ${text}`);
  });

  const bodyText = decodeHtmlEntities($("body").text()).replace(/\s+/g, " ").trim();
  if (bodyText) parts.push(bodyText);

  let combined = parts.filter(Boolean).join("\n");

  if (options?.section) {
    const needle = options.section.toLowerCase();
    const lines = combined.split("\n");
    const start = lines.findIndex((line) => line.toLowerCase().includes(needle));
    if (start >= 0) {
      combined = lines.slice(start, start + 80).join("\n");
    }
  }

  return combined.trim();
}

export const MAX_REFERENCE_EXCERPT_CHARS = 12000;

export function truncateReferenceText(text: string, maxChars = MAX_REFERENCE_EXCERPT_CHARS): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

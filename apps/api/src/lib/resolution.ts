import type { DbClient } from "../db/client.js";
import { newId } from "../db/client.js";
import { jaccardSimilarity, normalizeModelTokens } from "@framer/schema";

export type ResolutionGrade = "high" | "review" | "new";

export interface ResolutionCandidate {
  productId: string;
  score: number;
  brandMatch: boolean;
  modelMatch: boolean;
  yearMatch: boolean;
}

export interface ResolveInput {
  brand: string;
  modelGuess: string;
  modelYear: number | null;
  gtin: string | null;
  category: string;
}

/**
 * Resolution: prefers an exact GTIN join; otherwise grades by deterministic
 * agreement across brand, normalized model tokens, and model year. See
 * CONTEXT.md#Resolution. Biased toward splitting — a false merge corrupts
 * shared price history and is expensive to undo, a false split is a single
 * merge click — so anything short of full 3/3 agreement creates a new
 * Product rather than attaching to an existing one.
 */
export async function resolveProduct(
  client: DbClient,
  input: ResolveInput
): Promise<{ productId: string; grade: ResolutionGrade; candidate: ResolutionCandidate | null }> {
  if (input.gtin) {
    const { rows } = await client.query<{ id: string }>("select id from products where gtin = $1 limit 1", [
      input.gtin,
    ]);
    if (rows[0]) {
      return { productId: rows[0].id, grade: "high", candidate: null };
    }
  }

  const { rows: sameBrand } = await client.query<{ id: string; model: string; model_year: number | null }>(
    "select id, model, model_year from products where lower(brand) = lower($1)",
    [input.brand]
  );

  const inputTokens = normalizeModelTokens(input.modelGuess);
  let best: ResolutionCandidate | null = null;

  for (const row of sameBrand) {
    const modelMatch = jaccardSimilarity(inputTokens, normalizeModelTokens(row.model)) >= 0.5;
    const yearMatch = input.modelYear !== null && row.model_year !== null && input.modelYear === row.model_year;
    const agreementCount = Number(true /* brandMatch, guaranteed by the query */) + Number(modelMatch) + Number(yearMatch);
    const candidate: ResolutionCandidate = {
      productId: row.id,
      score: agreementCount / 3,
      brandMatch: true,
      modelMatch,
      yearMatch,
    };
    if (!best || candidate.score > best.score) best = candidate;
  }

  if (best && best.score === 1) {
    return { productId: best.productId, grade: "high", candidate: best };
  }

  const newProductId = newId();
  const { rows: created } = await client.query<{ id: string }>(
    `insert into products (id, brand, model, model_year, category, gtin)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [newProductId, input.brand, input.modelGuess || input.brand, input.modelYear, input.category, input.gtin]
  );
  const createdId = created[0]!.id;

  if (best && best.score >= 2 / 3) {
    await client.query(
      `insert into product_duplicate_reviews (id, new_product_id, candidate_product_id, score)
       values ($1, $2, $3, $4)`,
      [newId(), createdId, best.productId, best.score]
    );
    return { productId: createdId, grade: "review", candidate: best };
  }

  return { productId: createdId, grade: "new", candidate: best };
}

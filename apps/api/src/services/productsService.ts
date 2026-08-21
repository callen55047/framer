import { SpecSchema, type Spec } from "@framer/schema";
import { pool } from "../db/pool.js";

export async function mergeProductSpecs(productId: string, incoming: Spec): Promise<Spec> {
  const parsedIncoming = SpecSchema.parse(incoming);
  const { rows } = await pool.query("select specs from products where id = $1", [productId]);
  const row = rows[0];
  if (!row) {
    throw new Error(`product not found: ${productId}`);
  }

  let existing: Spec = {};
  try {
    existing = SpecSchema.parse(typeof row.specs === "string" ? JSON.parse(row.specs) : row.specs);
  } catch {
    existing = {};
  }

  const merged = SpecSchema.parse({ ...existing, ...parsedIncoming });
  await pool.query(
    `update products set specs = $2, updated_at = datetime('now') where id = $1`,
    [productId, JSON.stringify(merged)]
  );
  return merged;
}

import { z } from "zod";
import { IdSchema } from "./ids.js";

/**
 * A single local user, seeded once. No login in v1 (see CONTEXT.md and the
 * ADR-worthy decision recorded in the plan): every user-owned table carries
 * ownerId and every query is scoped by it, so real auth later is additive.
 */
export const LOCAL_OWNER_ID = "00000000-0000-0000-0000-000000000001";

export const OwnerSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type Owner = z.infer<typeof OwnerSchema>;

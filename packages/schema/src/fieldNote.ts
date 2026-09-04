import { z } from "zod";
import { IdSchema } from "./ids.js";
import { getHandbookEntry } from "./handbook.js";

/**
 * A Field Note is a rider-authored account of something learned by working
 * on a real bike — a symptom, its cause, and what fixed it. Unlike a
 * Handbook Entry it is user-written, carries no typed contract, and never
 * participates in Compatibility Rules. See CONTEXT.md#Knowledge.
 *
 * `draft` rows come from the assistant's createFieldNote tool call and are
 * invisible to search/listing until the owner confirms them.
 */
export const FieldNoteStatusSchema = z.enum(["draft", "published"]);
export type FieldNoteStatus = z.infer<typeof FieldNoteStatusSchema>;

export const FieldNoteSourceSchema = z.enum(["user", "assistant"]);
export type FieldNoteSource = z.infer<typeof FieldNoteSourceSchema>;

const TagSchema = z.string().trim().min(1).max(40);

export const FieldNoteSchema = z.object({
  id: IdSchema,
  ownerId: IdSchema,
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  symptom: z.string().min(1).nullable(),
  cause: z.string().min(1).nullable(),
  resolution: z.string().min(1).nullable(),
  brand: z.string().min(1).nullable(),
  model: z.string().min(1).nullable(),
  modelYearFrom: z.number().int().nullable(),
  modelYearTo: z.number().int().nullable(),
  status: FieldNoteStatusSchema,
  source: FieldNoteSourceSchema,
  sourceSessionId: IdSchema.nullable(),
  productIds: z.array(IdSchema),
  tags: z.array(TagSchema),
  handbookSlugs: z.array(z.string().min(1)),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FieldNote = z.infer<typeof FieldNoteSchema>;

function checkYearRange(
  data: { modelYearFrom?: number | null; modelYearTo?: number | null },
  ctx: z.RefinementCtx
) {
  if (
    data.modelYearFrom != null &&
    data.modelYearTo != null &&
    data.modelYearFrom > data.modelYearTo
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "modelYearFrom must be <= modelYearTo",
      path: ["modelYearFrom"],
    });
  }
}

function checkHandbookSlugs(data: { handbookSlugs?: string[] }, ctx: z.RefinementCtx) {
  for (const slug of data.handbookSlugs ?? []) {
    if (!getHandbookEntry(slug)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `unknown Handbook slug: ${slug}`,
        path: ["handbookSlugs"],
      });
    }
  }
}

const FieldNoteWritableFieldsSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  symptom: z.string().min(1).optional(),
  cause: z.string().min(1).optional(),
  resolution: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  modelYearFrom: z.number().int().optional(),
  modelYearTo: z.number().int().optional(),
  productIds: z.array(IdSchema).optional(),
  tags: z.array(TagSchema).optional(),
  handbookSlugs: z.array(z.string().min(1)).optional(),
});

export const CreateFieldNoteInputSchema = FieldNoteWritableFieldsSchema.superRefine((data, ctx) => {
  checkYearRange(data, ctx);
  checkHandbookSlugs(data, ctx);
});
export type CreateFieldNoteInput = z.infer<typeof CreateFieldNoteInputSchema>;

export const UpdateFieldNoteInputSchema = FieldNoteWritableFieldsSchema.partial().superRefine(
  (data, ctx) => {
    checkYearRange(data, ctx);
    checkHandbookSlugs(data, ctx);
  }
);
export type UpdateFieldNoteInput = z.infer<typeof UpdateFieldNoteInputSchema>;

export const FieldNoteSearchInputSchema = z.object({
  query: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  modelYear: z.number().int().optional(),
  tag: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});
export type FieldNoteSearchInput = z.infer<typeof FieldNoteSearchInputSchema>;

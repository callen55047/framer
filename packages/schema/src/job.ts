import { z } from "zod";
import { IdSchema } from "./ids.js";
import { VariantDiscoveryFilterSchema, VariantSnapshotSchema } from "./variant.js";
import { ListingItemKindSchema } from "./listingItem.js";
import { ProductCategorySchema } from "./product.js";

/**
 * The closed set of Job kinds. Acceptance checking requires a fixed output
 * shape per kind, so this set is deliberately not open-ended free text.
 * See CONTEXT.md#Job.
 */
export const JobKindSchema = z.enum([
  "Acknowledge",
  "RefreshListing",
  "ExtractSpecs",
  "DiscoverListings",
  "SummarizeChatSession",
]);
export type JobKind = z.infer<typeof JobKindSchema>;

export const JobStatusSchema = z.enum(["queued", "leased", "succeeded", "failed", "cancelled"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const TaskStatusSchema = z.enum(["queued", "active", "succeeded", "partial", "failed"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * One step within a Job's pipeline. Retries are scoped to the failed Stage,
 * not the whole Job, so a model-output failure never re-triggers a network
 * fetch. See CONTEXT.md#Stage. Acknowledge jobs have no stages.
 */
export const StageNameSchema = z.enum(["fetch", "validate", "extract", "resolve", "persist"]);
export type StageName = z.infer<typeof StageNameSchema>;

export const StageStatusSchema = z.enum(["pending", "running", "succeeded", "failed"]);
export type StageStatus = z.infer<typeof StageStatusSchema>;

export const MAX_STAGE_ATTEMPTS = 3;

export const StageRecordSchema = z.object({
  id: IdSchema,
  jobId: IdSchema,
  name: StageNameSchema,
  status: StageStatusSchema,
  attempt: z.number().int().nonnegative(),
  artifactId: IdSchema.nullable(),
  error: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
});
export type StageRecord = z.infer<typeof StageRecordSchema>;

/** Pipeline-proof job: no fetch, model, or stages — validates claim/complete only. */
export const AcknowledgeInputSchema = z.object({
  step: z.number().int().positive(),
  label: z.string().optional(),
});
export type AcknowledgeInput = z.infer<typeof AcknowledgeInputSchema>;

export const AcknowledgeOutputSchema = z.object({
  acknowledgedAt: z.string().datetime(),
  note: z.string().optional(),
});
export type AcknowledgeOutput = z.infer<typeof AcknowledgeOutputSchema>;

export const TaskOriginSchema = z.enum(["user", "sweep"]);
export type TaskOrigin = z.infer<typeof TaskOriginSchema>;

/**
 * RefreshListing: re-fetch a Listing's page, extract price/title/stock,
 * ground the extraction against the fetched HTML, resolve to a Product,
 * and persist a new PricePoint.
 */
export const RefreshListingInputSchema = z.object({
  listingId: IdSchema,
  url: z.string().url(),
  itemKind: ListingItemKindSchema.default("component"),
  expectedCategory: ProductCategorySchema.nullable().optional(),
  watchIds: z.array(IdSchema).optional(),
  discoveryFilter: VariantDiscoveryFilterSchema.nullable().optional(),
  /** Whether this refresh was user-initiated or from the scheduled sweep. */
  taskOrigin: TaskOriginSchema.default("user"),
});
export type RefreshListingInput = z.infer<typeof RefreshListingInputSchema>;

export const RefreshListingOutputSchema = z.object({
  price: z.number().nonnegative(),
  currency: z.string().length(3),
  inStock: z.boolean(),
  title: z.string(),
  scrapedAt: z.string().datetime(),
  productId: IdSchema.nullable(),
  resolutionGrade: z.enum(["high", "review", "new"]),
  variantCount: z.number().int().nonnegative(),
  lowestInStockPrice: z.number().nonnegative().nullable(),
  highestInStockPrice: z.number().nonnegative().nullable(),
});
export type RefreshListingOutput = z.infer<typeof RefreshListingOutputSchema>;

/** Rolling summary of an Assistant Session's messages. */
export const SummarizeChatSessionInputSchema = z.object({
  sessionId: IdSchema,
});
export type SummarizeChatSessionInput = z.infer<typeof SummarizeChatSessionInputSchema>;

export const SummarizeChatSessionOutputSchema = z.object({
  summary: z.string(),
  messageCount: z.number().int().nonnegative(),
  summarizedAt: z.string().datetime(),
});
export type SummarizeChatSessionOutput = z.infer<typeof SummarizeChatSessionOutputSchema>;

export const JobInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("Acknowledge"), payload: AcknowledgeInputSchema }),
  z.object({ kind: z.literal("RefreshListing"), payload: RefreshListingInputSchema }),
  z.object({ kind: z.literal("ExtractSpecs"), payload: z.record(z.unknown()) }),
  z.object({ kind: z.literal("DiscoverListings"), payload: z.record(z.unknown()) }),
  z.object({ kind: z.literal("SummarizeChatSession"), payload: SummarizeChatSessionInputSchema }),
]);
export type JobInput = z.infer<typeof JobInputSchema>;

export const JobRecordSchema = z.object({
  id: IdSchema,
  taskId: IdSchema,
  kind: JobKindSchema,
  status: JobStatusSchema,
  attempt: z.number().int().nonnegative(),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  dependsOnJobId: IdSchema.nullable(),
  leasedBy: z.string().nullable(),
  leaseExpiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type JobRecord = z.infer<typeof JobRecordSchema>;

export const TaskRecordSchema = z.object({
  id: IdSchema,
  ownerId: IdSchema,
  kind: JobKindSchema,
  label: z.string(),
  status: TaskStatusSchema,
  origin: TaskOriginSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TaskRecord = z.infer<typeof TaskRecordSchema>;

/** Validate completion output for a claimed job kind. */
export function parseJobOutput(kind: JobKind, output: unknown): Record<string, unknown> {
  switch (kind) {
    case "Acknowledge":
      return AcknowledgeOutputSchema.parse(output);
    case "RefreshListing":
      return RefreshListingOutputSchema.parse(output);
    case "SummarizeChatSession":
      return SummarizeChatSessionOutputSchema.parse(output);
    case "ExtractSpecs":
    case "DiscoverListings":
      return z.record(z.unknown()).parse(output);
    default: {
      const _exhaustive: never = kind;
      throw new Error(`unknown job kind: ${_exhaustive}`);
    }
  }
}

// --- Runner <-> API claim protocol -----------------------------------------

export const ClaimRequestSchema = z.object({
  agentId: z.string().min(1),
  kinds: z.array(JobKindSchema).optional(),
  leaseSeconds: z.number().int().positive().default(60),
});
export type ClaimRequest = z.infer<typeof ClaimRequestSchema>;

export const ClaimResponseSchema = z.object({
  job: JobRecordSchema.nullable(),
  /** Opaque token for this specific claim; required on heartbeat/complete/fail. */
  leaseToken: z.string().nullable(),
});
export type ClaimResponse = z.infer<typeof ClaimResponseSchema>;

export const HeartbeatRequestSchema = z.object({
  agentId: z.string().min(1),
  leaseToken: z.string().min(1),
  leaseSeconds: z.number().int().positive().default(60),
});
export type HeartbeatRequest = z.infer<typeof HeartbeatRequestSchema>;

export const CompleteRequestSchema = z.object({
  agentId: z.string().min(1),
  leaseToken: z.string().min(1),
  output: z.record(z.unknown()),
});
export type CompleteRequest = z.infer<typeof CompleteRequestSchema>;

export const FailRequestSchema = z.object({
  agentId: z.string().min(1),
  leaseToken: z.string().min(1),
  /** Omitted for stage-less jobs such as Acknowledge. */
  stage: StageNameSchema.optional(),
  error: z.string().min(1),
  /** true if this Stage has exhausted MAX_STAGE_ATTEMPTS and the whole Job should fail */
  terminal: z.boolean(),
});
export type FailRequest = z.infer<typeof FailRequestSchema>;

export const StageReportSchema = z.object({
  agentId: z.string().min(1),
  leaseToken: z.string().min(1),
  name: StageNameSchema,
  status: StageStatusSchema,
  attempt: z.number().int().nonnegative(),
  artifactId: IdSchema.nullable().optional(),
  error: z.string().nullable().optional(),
});
export type StageReport = z.infer<typeof StageReportSchema>;

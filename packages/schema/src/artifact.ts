import { z } from "zod";
import { IdSchema } from "./ids.js";
import { StageNameSchema } from "./job.js";

/**
 * The persisted output of a Stage, most importantly the raw fetched HTML.
 * The database row is metadata only; the body lives on disk (or object
 * storage later) at `path`, gzipped. See CONTEXT.md#Artifact.
 */
export const ArtifactSchema = z.object({
  id: IdSchema,
  jobId: IdSchema,
  stage: StageNameSchema,
  contentType: z.string(),
  path: z.string(),
  byteSize: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

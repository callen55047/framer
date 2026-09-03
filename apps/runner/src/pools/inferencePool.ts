import { config } from "../config.js";
import { Semaphore } from "./semaphore.js";

/**
 * Depth 1-2 by default. A local LM Studio backend serializes requests to a
 * single loaded model regardless of how many callers queue up, so a deeper
 * pool here doesn't add throughput — it just risks OOM from concurrent
 * context buffers. See CONTEXT.md#Runner.
 */
const inferenceSemaphore = new Semaphore(config.inferencePoolDepth);

export async function runInference<T>(fn: () => Promise<T>): Promise<T> {
  return inferenceSemaphore.run(fn);
}

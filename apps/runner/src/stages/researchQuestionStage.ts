import {
  ASSISTANT_REFERENCE_CATEGORIES,
  ExtractSpecsInputSchema,
  ResearchQuestionInputSchema,
  type AssistantReferenceCategory,
  type JobRecord,
} from "@framer/schema";
import { completeJob, mergeProductSpecsRemote } from "../lib/jobApi.js";
import { runStage } from "../lib/stageRunner.js";
import { fetchStage } from "./fetchStage.js";
import { extractSpecsStage } from "./extractSpecsStage.js";
import {
  fetchCatalogReferencePage,
  searchReferenceCategory,
} from "../lib/referenceSearch.js";
import { synthesizeResearchAnswer } from "../inference/extractSpecs.js";

export async function runExtractSpecs(job: JobRecord): Promise<void> {
  const input = ExtractSpecsInputSchema.parse(job.input);

  const fetched = await runStage(job.id, "fetch", () => fetchStage(job.id, input.url), (r) => r.artifactId);
  const extracted = await runStage(job.id, "extract", () => extractSpecsStage(fetched.text));
  await runStage(job.id, "persist", async () => {
    await mergeProductSpecsRemote(input.productId, extracted.groundedSpecs);
  });

  await completeJob(job.id, {
    productId: input.productId,
    url: input.url,
    specs: extracted.groundedSpecs,
    extractedAt: new Date().toISOString(),
    groundedFields: extracted.groundedFields,
  });
}

export async function runResearchQuestion(job: JobRecord): Promise<void> {
  const input = ResearchQuestionInputSchema.parse(job.input);
  const categories =
    input.categories?.filter((category) =>
      (ASSISTANT_REFERENCE_CATEGORIES as readonly string[]).includes(category)
    ) ??
    (["bike_specs", "manufacturer_specs", "technical_reference"] as AssistantReferenceCategory[]);

  const sources: Array<{ url: string; sourceId: string; sourceName: string; excerpt: string }> = [];

  await runStage(job.id, "fetch", async () => {
    for (const category of categories) {
      if (sources.length >= 3) break;
      try {
        const search = await searchReferenceCategory(category, input.question, 3);
        for (const result of search.results.slice(0, 2)) {
          if (sources.length >= 3) break;
          try {
            const page = await fetchCatalogReferencePage(result.url);
            sources.push({
              url: page.url,
              sourceId: page.sourceId ?? result.sourceId,
              sourceName: page.sourceName ?? result.sourceName,
              excerpt: page.excerpt,
            });
          } catch {
            // try next result
          }
        }
        if (sources.length > 0) break;
      } catch {
        // try next category
      }
    }
    if (sources.length === 0) {
      throw new Error("no reference pages could be fetched for research question");
    }
    return { sources };
  });

  const excerptBlock = sources
    .map((source, index) => `Source ${index + 1}: ${source.sourceName} (${source.url})\n${source.excerpt}`)
    .join("\n\n---\n\n");

  const answer = await runStage(job.id, "extract", async () => {
    const synthesized = await synthesizeResearchAnswer(input.question, excerptBlock);
    return { answer: synthesized };
  });

  let specsUpdated = false;
  if (input.targetProductId && sources[0]) {
    await runStage(job.id, "persist", async () => {
      try {
        const extracted = await extractSpecsStage(sources[0]!.excerpt);
        await mergeProductSpecsRemote(input.targetProductId!, extracted.groundedSpecs);
        specsUpdated = true;
      } catch {
        specsUpdated = false;
      }
    });
  }

  await completeJob(job.id, {
    question: input.question,
    answer: answer.answer,
    sources: sources.map((source) => ({
      url: source.url,
      sourceId: source.sourceId,
      sourceName: source.sourceName,
    })),
    specsUpdated,
    researchedAt: new Date().toISOString(),
  });
}

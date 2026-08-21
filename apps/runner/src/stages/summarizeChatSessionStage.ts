import { SummarizeChatSessionInputSchema } from "@framer/schema";
import { createInferenceProvider } from "../inference/createProvider.js";
import { loadInferenceConfigFromEnv } from "../inference/loadConfig.js";
import { completeJob } from "../lib/jobApi.js";
import type { JobRecord } from "@framer/schema";
import { config } from "../config.js";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.agentToken}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${init?.method ?? "GET"} ${path} -> ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

export async function runSummarizeChatSession(job: JobRecord): Promise<void> {
  const input = SummarizeChatSessionInputSchema.parse(job.input);
  const loaded = await apiFetch<{
    sessionId: string;
    existingSummary: string | null;
    messages: Array<{ role: "user" | "assistant" | "tool"; content: string; toolName: string | null; id: string }>;
  }>(`/api/runner/chat/sessions/${input.sessionId}/summary-input`);

  if (loaded.messages.length === 0) {
    await completeJob(job.id, {
      summary: loaded.existingSummary ?? "",
      messageCount: 0,
      summarizedAt: new Date().toISOString(),
    });
    return;
  }

  const provider = createInferenceProvider(loadInferenceConfigFromEnv());
  const summary = await provider.summarizeChatSession(
    loaded.messages.map((message) => ({
      role: message.role,
      content: message.content,
      toolName: message.toolName,
    })),
    loaded.existingSummary
  );

  const throughMessageId = loaded.messages.at(-1)?.id ?? null;
  const result = await apiFetch<{ summary: string; messageCount: number; summarizedAt: string }>(
    `/api/runner/chat/sessions/${input.sessionId}/summary`,
    {
      method: "POST",
      body: JSON.stringify({ summary, throughMessageId }),
    }
  );

  await completeJob(job.id, result);
}

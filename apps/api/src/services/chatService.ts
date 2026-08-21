import { LOCAL_OWNER_ID } from "@framer/schema";
import { createInferenceProvider } from "@framer/runner/inference/createProvider.js";
import { loadInferenceConfigFromEnv } from "@framer/runner/inference/loadConfig.js";
import type { ChatMessage as ProviderChatMessage, InferenceProvider } from "@framer/runner/inference/types.js";
import { config } from "../config.js";
import { newId, pool, dbClient, type DbClient } from "../db/pool.js";
import { summaryStatusSql } from "../lib/chatSummaryStatus.js";
import { CHAT_TOOLS, executeChatTool } from "../lib/chatTools.js";
import { mapChatMessage, mapChatSession } from "../lib/mappers.js";
import { estimateMessagesTokens, estimateTokens } from "../lib/tokenEstimate.js";
import { scheduleSessionSummary } from "./sessionSummarySchedule.js";

const SYSTEM_PROMPT = `You are the Framer assistant — a sarcastic but competent guide for mountain bike prices, watches, builds, compatibility, and catalog data.

## Persona
- Dry, blunt, exasperated — but you still do the work. Sarcasm never blocks tool use or accurate answers.
- Default to concise replies. When the user asked for specs, geometry tables, compatibility lists, or step-by-step setup info, give the full breakdown with citations — brevity caps do not apply there.

## Scope
Answer questions about: mountain bikes, components, compatibility, geometry, tubeless/setup guides, watches, listings, prices, tasks, and this app's catalog.
Refuse off-topic questions in one line.

## Research procedure (mandatory for spec/compatibility/geometry questions)
1. Decompose the question: bike/model/year, size, wheel config (29 vs mullet), and the attribute asked (geometry, stem, tubeless, etc.).
2. searchProducts to find catalog matches — never ask the user for internal Product UUIDs.
3. searchReference with a focused query across relevant categories (bike_specs, manufacturer_specs, technical_reference).
4. fetchReferencePage on the best 1–3 result URLs. Cite source name + URL in your answer.
5. If catalog Specs exist, use checkCompatibility or findCompatibleProducts — verdict "unknown" means missing Specs, not permission to guess.
6. If in-chat research exhausts ~3 page fetches or still lacks data, enqueueResearch and tell the user to watch the Tasks tab.

## Tools and accuracy (non-negotiable)
- Never fabricate prices, geometry numbers, compatibility, or product data.
- findCompatibleProducts answers "what fits my bike" — use it for stems, forks, etc.
- checkCompatibility returns compatible / incompatible / unknown — treat unknown as missing data, not a pass.
- Do not tell the user to look things up themselves when enqueueResearch is available.`;

const MAX_TOOL_ITERATIONS = 10;

const SESSION_SELECT = `select cs.*, ${summaryStatusSql("cs")} as summary_status from chat_sessions cs`;

export class ChatContextFullError extends Error {
  constructor(message = "context_full") {
    super(message);
    this.name = "ChatContextFullError";
  }
}

export type ChatSseEvent =
  | { event: "text-delta"; data: { delta: string } }
  | { event: "tool-call"; data: { messageId: string; toolName: string; toolArgs: Record<string, unknown> } }
  | { event: "message-done"; data: { message: ReturnType<typeof mapChatMessage> } }
  | { event: "session-update"; data: { session: ReturnType<typeof mapChatSession> } }
  | { event: "error"; data: { error: string } }
  | { event: "done"; data: Record<string, never> };

function applyRunnerInferenceEnv(): void {
  process.env.INFERENCE_PROVIDER = config.runner.inferenceProvider;
  if (config.runner.inferenceBaseUrl) {
    process.env.INFERENCE_BASE_URL = config.runner.inferenceBaseUrl;
  } else {
    delete process.env.INFERENCE_BASE_URL;
  }
  if (config.runner.inferenceModel) {
    process.env.INFERENCE_MODEL = config.runner.inferenceModel;
  } else {
    delete process.env.INFERENCE_MODEL;
  }
  process.env.OLLAMA_BASE_URL = config.runner.ollamaBaseUrl;
  process.env.OLLAMA_MODEL = config.runner.ollamaModel;
  process.env.LM_STUDIO_BASE_URL = config.runner.lmStudioBaseUrl;
  if (config.runner.lmStudioModel) {
    process.env.LM_STUDIO_MODEL = config.runner.lmStudioModel;
  } else {
    delete process.env.LM_STUDIO_MODEL;
  }
}

let cachedProvider: InferenceProvider | null = null;

export function getChatProvider(): InferenceProvider {
  if (!cachedProvider) {
    applyRunnerInferenceEnv();
    cachedProvider = createInferenceProvider(loadInferenceConfigFromEnv());
  }
  return cachedProvider;
}

export function resetChatProviderForTests(): void {
  cachedProvider = null;
}

export function setChatProviderForTests(provider: InferenceProvider): void {
  cachedProvider = provider;
}

function getInferenceMeta() {
  applyRunnerInferenceEnv();
  const inferenceConfig = loadInferenceConfigFromEnv();
  return { provider: inferenceConfig.provider, model: inferenceConfig.model };
}

async function getSession(sessionId: string) {
  const { rows } = await pool.query(
    `${SESSION_SELECT} where cs.id = $1 and cs.owner_id = $2`,
    [sessionId, LOCAL_OWNER_ID]
  );
  return rows[0] ?? null;
}

async function listSessionMessages(sessionId: string) {
  const { rows } = await pool.query(
    "select * from chat_messages where session_id = $1 order by created_at asc",
    [sessionId]
  );
  return rows;
}

function rowToProviderMessage(row: Record<string, unknown>): ProviderChatMessage {
  if (row.role === "tool") {
    return {
      role: "tool",
      content: typeof row.tool_result === "string" ? row.tool_result : JSON.stringify(row.tool_result ?? row.content),
      toolCallId: typeof row.id === "string" ? row.id : undefined,
    };
  }
  return {
    role: row.role as ProviderChatMessage["role"],
    content: String(row.content ?? ""),
  };
}

async function persistMessage(
  client: DbClient,
  input: {
    sessionId: string;
    role: "user" | "assistant" | "tool";
    content: string;
    toolName?: string | null;
    toolArgs?: Record<string, unknown> | null;
    toolResult?: unknown;
    tokenCount?: number;
    id?: string;
  }
) {
  const messageId = input.id ?? newId();
  const tokenCount =
    input.tokenCount ??
    estimateTokens(input.content) +
      (input.toolArgs ? estimateTokens(JSON.stringify(input.toolArgs)) : 0) +
      (input.toolResult !== undefined ? estimateTokens(JSON.stringify(input.toolResult)) : 0);

  const { rows } = await client.query(
    `insert into chat_messages (
       id, session_id, role, content, tool_name, tool_args, tool_result, token_count
     ) values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [
      messageId,
      input.sessionId,
      input.role,
      input.content,
      input.toolName ?? null,
      input.toolArgs ? JSON.stringify(input.toolArgs) : null,
      input.toolResult !== undefined ? JSON.stringify(input.toolResult) : null,
      tokenCount,
    ]
  );

  await client.query(
    `update chat_sessions
     set token_count = token_count + $2,
         updated_at = datetime('now')
     where id = $1`,
    [input.sessionId, tokenCount]
  );

  await scheduleSessionSummary(input.sessionId, client);

  return rows[0]!;
}

async function refreshSession(sessionId: string, extra?: { status?: "active" | "full"; tokenCount?: number }) {
  const sets = ["updated_at = datetime('now')"];
  const params: unknown[] = [sessionId];
  if (extra?.status) {
    sets.push(`status = $${params.length + 1}`);
    params.push(extra.status);
  }
  if (extra?.tokenCount !== undefined) {
    sets.push(`token_count = $${params.length + 1}`);
    params.push(extra.tokenCount);
  }
  await pool.query(`update chat_sessions set ${sets.join(", ")} where id = $1`, params);
  const session = await getSession(sessionId);
  return session ? mapChatSession(session) : null;
}

export async function createChatSession(title?: string) {
  const { provider, model } = getInferenceMeta();
  const sessionId = newId();
  await pool.query(
    `insert into chat_sessions (id, owner_id, title, title_source, provider, model)
     values ($1, $2, $3, 'auto', $4, $5)`,
    [sessionId, LOCAL_OWNER_ID, title ?? "New chat", provider, model]
  );
  return mapChatSession((await getSession(sessionId))!);
}

export async function listChatSessions() {
  const { rows } = await pool.query(
    `${SESSION_SELECT} where cs.owner_id = $1 order by cs.updated_at desc`,
    [LOCAL_OWNER_ID]
  );
  return rows.map(mapChatSession);
}

export async function updateChatSessionTitle(sessionId: string, title: string) {
  const { rows } = await pool.query(
    `update chat_sessions
     set title = $2, title_source = 'user', updated_at = datetime('now')
     where id = $1 and owner_id = $3
     returning id`,
    [sessionId, title, LOCAL_OWNER_ID]
  );
  if (!rows[0]) return null;
  const session = await getSession(sessionId);
  return session ? mapChatSession(session) : null;
}

export async function deleteChatSession(sessionId: string) {
  const { rows } = await pool.query(
    "delete from chat_sessions where id = $1 and owner_id = $2 returning id",
    [sessionId, LOCAL_OWNER_ID]
  );
  return rows.length > 0;
}

export async function listChatMessages(sessionId: string) {
  const session = await getSession(sessionId);
  if (!session) return null;
  const rows = await listSessionMessages(sessionId);
  return rows.map(mapChatMessage);
}

function wouldExceedBudget(
  session: Record<string, unknown>,
  historyRows: Record<string, unknown>[],
  userText: string
): boolean {
  const budget = Number(session.context_budget_tokens ?? 128000);
  const current = Number(session.token_count ?? 0);
  const projected =
    current +
    estimateTokens(SYSTEM_PROMPT) +
    estimateMessagesTokens(
      historyRows.map((row) => ({
        content: String(row.content ?? ""),
        toolArgs: row.tool_args ? JSON.parse(String(row.tool_args)) : undefined,
        toolResult: row.tool_result ? JSON.parse(String(row.tool_result)) : undefined,
      }))
    ) +
    estimateTokens(userText);
  return projected > budget;
}

async function maybeAutoTitleSession(
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
  titleSource: string
) {
  if (titleSource === "user") return;
  void (async () => {
    try {
      const provider = getChatProvider();
      const title = await provider.generateSessionTitle(userMessage, assistantMessage);
      await pool.query(
        `update chat_sessions
         set title = $2, title_source = 'auto', updated_at = datetime('now')
         where id = $1 and title_source = 'auto'`,
        [sessionId, title]
      );
    } catch (err) {
      console.warn("[chat] auto-title failed:", err);
    }
  })();
}

export async function* sendChatMessage(
  sessionId: string,
  userText: string,
  provider: InferenceProvider = getChatProvider()
): AsyncGenerator<ChatSseEvent> {
  const session = await getSession(sessionId);
  if (!session) {
    yield { event: "error", data: { error: "session not found" } };
    return;
  }
  if (session.status === "full") {
    yield { event: "error", data: { error: "context_full" } };
    return;
  }

  const historyRows = await listSessionMessages(sessionId);
  if (wouldExceedBudget(session, historyRows, userText)) {
    await refreshSession(sessionId, { status: "full" });
    const updated = await getSession(sessionId);
    if (updated) {
      yield { event: "session-update", data: { session: mapChatSession(updated) } };
    }
    yield { event: "error", data: { error: "context_full" } };
    return;
  }

  const userRow = await persistMessage(dbClient, {
    sessionId,
    role: "user",
    content: userText,
  });
  yield {
    event: "message-done",
    data: { message: mapChatMessage(userRow) },
  };

  const isFirstExchange = historyRows.length === 0;
  let assistantText = "";
  let turnUsage = { promptTokens: 0, completionTokens: 0 };

  let providerMessages: ProviderChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...historyRows.map((row) => {
      if (row.role === "tool") {
        return {
          role: "tool" as const,
          content: row.tool_result ? String(row.tool_result) : String(row.content ?? ""),
          toolCallId: String(row.id),
        };
      }
      return rowToProviderMessage(row);
    }),
    { role: "user", content: userText },
  ];

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const pendingToolCalls: { id: string; name: string; args: Record<string, unknown> }[] = [];
      assistantText = "";

      for await (const event of provider.chat(providerMessages, CHAT_TOOLS)) {
        if (event.type === "text-delta") {
          assistantText += event.delta;
          yield { event: "text-delta", data: { delta: event.delta } };
        } else if (event.type === "tool-call") {
          pendingToolCalls.push({ id: event.id, name: event.name, args: event.args });
        } else if (event.type === "usage") {
          turnUsage = { promptTokens: event.promptTokens, completionTokens: event.completionTokens };
        }
      }

      if (pendingToolCalls.length === 0) {
        break;
      }

      const assistantWithTools: ProviderChatMessage = {
        role: "assistant",
        content: assistantText,
        toolCalls: pendingToolCalls.map((call) => ({
          id: call.id,
          name: call.name,
          args: call.args,
        })),
      };
      providerMessages = [...providerMessages, assistantWithTools];

      if (assistantText.trim() || pendingToolCalls.length > 0) {
        const assistantRow = await persistMessage(dbClient, {
          sessionId,
          role: "assistant",
          content: assistantText,
        });
        yield { event: "message-done", data: { message: mapChatMessage(assistantRow) } };
      }

      for (const call of pendingToolCalls) {
        let toolResult: unknown;
        try {
          toolResult = await executeChatTool(call.name, call.args, { sessionId });
        } catch (err) {
          toolResult = { error: err instanceof Error ? err.message : "tool failed" };
        }

        const resultContent = JSON.stringify(toolResult);
        providerMessages = [
          ...providerMessages,
          { role: "tool", content: resultContent, toolCallId: call.id },
        ];

        const toolRow = await persistMessage(dbClient, {
          sessionId,
          role: "tool",
          content: "",
          id: call.id,
          toolName: call.name,
          toolArgs: call.args,
          toolResult,
        });
        yield {
          event: "tool-call",
          data: { messageId: toolRow.id as string, toolName: call.name, toolArgs: call.args },
        };
        yield { event: "message-done", data: { message: mapChatMessage(toolRow) } };
      }
    }

    if (assistantText.trim()) {
      const assistantRow = await persistMessage(dbClient, {
        sessionId,
        role: "assistant",
        content: assistantText,
        tokenCount: turnUsage.completionTokens > 0 ? turnUsage.completionTokens : undefined,
      });
      providerMessages = [...providerMessages, { role: "assistant", content: assistantText }];
      yield { event: "message-done", data: { message: mapChatMessage(assistantRow) } };

      if (isFirstExchange) {
        void maybeAutoTitleSession(
          sessionId,
          userText,
          assistantText,
          String(session.title_source ?? "auto")
        );
      }
    } else if (turnUsage.completionTokens > 0 && providerMessages.at(-1)?.role !== "assistant") {
      // Final assistant message was already persisted during tool loop with no trailing text.
    }

    const updatedSession = await getSession(sessionId);
    if (updatedSession) {
      const budget = Number(updatedSession.context_budget_tokens ?? 128000);
      const tokenCount = Number(updatedSession.token_count ?? 0);
      const status = tokenCount >= budget ? "full" : "active";
      if (status !== updatedSession.status) {
        await refreshSession(sessionId, { status });
        const finalSession = await getSession(sessionId);
        if (finalSession) {
          yield { event: "session-update", data: { session: mapChatSession(finalSession) } };
        }
      }
    }

    yield { event: "done", data: {} };
  } catch (err) {
    console.error("[chat] send failed:", err);
    yield {
      event: "error",
      data: { error: err instanceof Error ? err.message : "chat failed" },
    };
  }
}

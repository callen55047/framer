import { CLARIFYING_QUESTION_TOOL_NAME, ClarificationSchema, LOCAL_OWNER_ID } from "@framer/schema";
import { createInferenceProvider } from "@framer/runner/inference/createProvider.js";
import { loadInferenceConfigFromEnv } from "@framer/runner/inference/loadConfig.js";
import type {
  ChatMessage as ProviderChatMessage,
  ChatTool,
  InferenceProvider,
} from "@framer/runner/inference/types.js";
import { config } from "../config.js";
import { newId, pool, dbClient, type DbClient } from "../db/pool.js";
import { applyRunnerInferenceEnv } from "../runner/inferenceEnv.js";
import { summaryStatusSql } from "../lib/chatSummaryStatus.js";
import { CHAT_TOOLS, executeChatTool } from "../lib/chatTools.js";
import { mapChatMessage, mapChatSession } from "../lib/mappers.js";
import { estimateMessagesTokens, estimateTokens } from "../lib/tokenEstimate.js";
import { scheduleSessionSummary } from "./sessionSummarySchedule.js";

const SYSTEM_PROMPT = `You are the Framer assistant for mountain bike prices, watches, builds, compatibility, geometry, and this app's catalog.

## Hard rules
- Never ask the user for a Product/Listing/Watch UUID. Every tool that takes an id also accepts brand/model text — use that instead.
- Never tell the user to look something up themselves.
- Never guess, estimate, or recall a price, spec, or compatibility verdict. No data means you say there is no data.
- On any bike/parts/price/compatibility/geometry question, call a tool before your first reply. Answering from memory is not an option.

## Tool routing
- "what fits my bike" / "parts for my build" → findCompatibleProducts (forBrand, forModel, slot). Stems, bars, grips → slot: "cockpit".
- "is A compatible with B" → checkCompatibility (brand/model form, no ids needed).
- "how much is X" → searchProducts, then getProductListings for every retailer's price, then getPriceHistory for trends. listWatches for the user's own watches, listRetailers for "which shops".
- specs, geometry, setup steps → searchReference (bike_specs, manufacturer_specs, technical_reference), then fetchReferencePage on the best 1–3 URLs. Cite source name + URL.
- MTB term definitions → getHandbookEntry before explaining the term yourself.
- Still stuck after ~3 page fetches → enqueueResearch and tell them to watch Tasks on their Profile.

## Ambiguity
Some words mean two different things in MTB (the classic case: "stem" = handlebar stem vs. tubeless valve stem). When a term is genuinely ambiguous and changes which tool you'd call, stop and call askClarifyingQuestion with 2–4 concrete options — once, and that ends your turn. Never interrogate the user in prose instead. If the answer only *might* change (frame size, model year, wheel config, budget, use-case) and listWatches/searchProducts/this conversation can't resolve it either, ask the same way. Otherwise state your assumption in one clause and proceed.

## Tone
- In scope, data in hand: dry and clipped. At most one short aside, then the answer — numbers, product names, retailers, citation. No performing reluctance, no editorializing about the question.
- Off-topic (not bikes/parts/prices/builds/this app): this is the one place to be sarcastic — one dismissive line, redirect, stop.
- In scope but truly no data after real lookups: dry and blunt about exactly what's missing. Still never "go look it up yourself".

Examples (adapt, don't copy):
- "Cockpit slot, 35mm clamp. Raceface Aeffect R 40mm — $64 (Jenson), OneUp 35 50mm — $79 (Backcountry). Both pass bar-clamp and steerer checks. [bikespecs.com/rm-altitude-2022]"
- "Not a bike question. Ask about parts, prices, or builds, or go bother someone else."
- "Nothing in the catalog or reference sources for that frame/year combo. No data, no guess."

## Delivering answers
Do the lookups first, then reply. The answer is complete, accurate, and cited. Never fabricate prices, geometry, compatibility, or product data.`;

const MAX_TOOL_ITERATIONS = 10;

const TOOL_BUDGET_EXHAUSTED_NUDGE =
  "Tool budget exhausted. Answer the user now from the results above, in the dry default tone. Do not request more tools.";

const EMPTY_ANSWER_FALLBACK =
  "Ran the lookups this catalog and reference sources support and still came up empty. Ask something narrower.";

/**
 * Nudges a first-turn reply that skipped tools entirely. Gives the model an
 * off-ramp so genuinely off-topic messages still get answered in character
 * on retry instead of being forced into a pointless tool call.
 */
const NO_TOOL_CALL_NUDGE =
  "You answered without looking anything up. If this is a bike, parts, price, compatibility, geometry, or catalog question, call the right tool now — findCompatibleProducts/checkCompatibility for fit, searchProducts for price, searchReference for specs. Never ask the user for an id. If it is genuinely off-topic, answer in character now.";

const SESSION_SELECT = `select cs.*, ${summaryStatusSql("cs")} as summary_status from chat_sessions cs`;

export class ChatContextFullError extends Error {
  constructor(message = "context_full") {
    super(message);
    this.name = "ChatContextFullError";
  }
}

export type ToolCallRecord = { id: string; name: string; args: Record<string, unknown> };

export type ChatSseEvent =
  | { event: "text-delta"; data: { delta: string } }
  | { event: "tool-call"; data: { messageId: string; toolName: string; toolArgs: Record<string, unknown> } }
  | { event: "message-done"; data: { message: ReturnType<typeof mapChatMessage> } }
  | {
      event: "clarification";
      data: { messageId: string; question: string; options?: string[]; allowFreeText: boolean };
    }
  | { event: "session-update"; data: { session: ReturnType<typeof mapChatSession> } }
  | { event: "error"; data: { error: string } }
  | { event: "done"; data: Record<string, never> };

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
    "select * from chat_messages where session_id = $1 order by created_at asc, rowid asc",
    [sessionId]
  );
  return rows;
}

function parseToolCallsColumn(raw: unknown): ToolCallRecord[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    if (!Array.isArray(parsed)) return undefined;
    const calls = parsed.filter(
      (call): call is ToolCallRecord =>
        !!call && typeof call === "object" && typeof (call as ToolCallRecord).id === "string" && typeof (call as ToolCallRecord).name === "string"
    );
    return calls.length > 0 ? calls.map((call) => ({ id: call.id, name: call.name, args: call.args ?? {} })) : undefined;
  } catch {
    return undefined;
  }
}

/** Turns a persisted chat_messages row back into the shape the provider expects. */
export function rowToProviderMessage(row: Record<string, unknown>): ProviderChatMessage {
  if (row.role === "tool") {
    return {
      role: "tool",
      content:
        typeof row.tool_result === "string"
          ? row.tool_result
          : JSON.stringify(row.tool_result ?? row.content ?? ""),
      toolCallId: typeof row.id === "string" ? row.id : undefined,
    };
  }
  const message: ProviderChatMessage = {
    role: row.role as ProviderChatMessage["role"],
    content: String(row.content ?? ""),
  };
  if (row.role === "assistant") {
    const toolCalls = parseToolCallsColumn(row.tool_calls);
    if (toolCalls) message.toolCalls = toolCalls;
  }
  return message;
}

/**
 * Makes a replayed transcript acceptable to strict OpenAI-compatible servers:
 * every tool message must follow an assistant message that declared its id,
 * and every declared tool call must have a result. Rows written before
 * tool_calls were persisted are orphans and are dropped.
 */
export function sanitizeHistory(messages: ProviderChatMessage[]): ProviderChatMessage[] {
  const out: ProviderChatMessage[] = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;

    if (message.role === "tool") {
      let cursor = out.length - 1;
      while (cursor >= 0 && out[cursor]!.role === "tool") cursor--;
      const anchor = out[cursor];
      const declared =
        anchor?.role === "assistant" && anchor.toolCalls?.some((call) => call.id === message.toolCallId);
      const duplicate = out
        .slice(cursor + 1)
        .some((prior) => prior.role === "tool" && prior.toolCallId === message.toolCallId);
      if (declared && !duplicate) out.push(message);
      continue;
    }

    if (message.role === "assistant") {
      if (message.toolCalls?.length) {
        const following = new Set<string>();
        for (let ahead = index + 1; ahead < messages.length && messages[ahead]!.role === "tool"; ahead++) {
          const id = messages[ahead]!.toolCallId;
          if (id) following.add(id);
        }
        const kept = message.toolCalls.filter((call) => following.has(call.id));
        if (kept.length > 0) {
          out.push({ ...message, toolCalls: kept });
          continue;
        }
        if (!message.content.trim()) continue;
        out.push({ role: "assistant", content: message.content });
        continue;
      }
      if (!message.content.trim()) continue;
    }

    out.push(message);
  }
  return out;
}

/** Caps what the model sees from one tool result; the full result is still persisted. */
export function truncateToolResultForModel(json: string, maxChars: number): string {
  if (!Number.isFinite(maxChars) || maxChars <= 0 || json.length <= maxChars) return json;
  const dropped = json.length - maxChars;
  return `${json.slice(0, maxChars)}\n…[truncated ${dropped} chars; narrow the query or use limit/since]`;
}

function normalizeClarificationOptions(options: string[] | undefined): string[] | undefined {
  if (!options) return undefined;
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const option of options) {
    const trimmed = option.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
  }
  return cleaned.length >= 2 ? cleaned.slice(0, 4) : undefined;
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
    toolCalls?: ToolCallRecord[] | null;
    tokenCount?: number;
    id?: string;
  }
) {
  const messageId = input.id ?? newId();
  const toolCallsJson = input.toolCalls && input.toolCalls.length > 0 ? JSON.stringify(input.toolCalls) : null;
  const tokenCount =
    input.tokenCount ??
    estimateTokens(input.content) +
      (input.toolArgs ? estimateTokens(JSON.stringify(input.toolArgs)) : 0) +
      (input.toolResult !== undefined ? estimateTokens(JSON.stringify(input.toolResult)) : 0) +
      (toolCallsJson ? estimateTokens(toolCallsJson) : 0);

  const { rows } = await client.query(
    `insert into chat_messages (
       id, session_id, role, content, tool_name, tool_args, tool_result, tool_calls, token_count
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning *`,
    [
      messageId,
      input.sessionId,
      input.role,
      input.content,
      input.toolName ?? null,
      input.toolArgs ? JSON.stringify(input.toolArgs) : null,
      input.toolResult !== undefined ? JSON.stringify(input.toolResult) : null,
      toolCallsJson,
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

function parseJsonColumn(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
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
        toolArgs: parseJsonColumn(row.tool_args) as Record<string, unknown> | undefined,
        toolResult: parseJsonColumn(row.tool_result),
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

interface ModelTurn {
  text: string;
  toolCalls: { name: string; args: Record<string, unknown> }[];
  usage: { promptTokens: number; completionTokens: number } | null;
}

/**
 * Streams one provider call, forwarding text as SSE deltas and collecting
 * tool calls. When `bufferText` is set, text deltas are accumulated but not
 * forwarded — the caller decides whether to flush or discard them once the
 * full turn (and whether it made any tool calls) is known.
 */
async function* streamModelTurn(
  provider: InferenceProvider,
  messages: ProviderChatMessage[],
  tools: ChatTool[],
  options?: { bufferText?: boolean }
): AsyncGenerator<ChatSseEvent, ModelTurn> {
  let text = "";
  const toolCalls: ModelTurn["toolCalls"] = [];
  let usage: ModelTurn["usage"] = null;

  for await (const event of provider.chat(messages, tools)) {
    if (event.type === "text-delta") {
      text += event.delta;
      if (!options?.bufferText) {
        yield { event: "text-delta", data: { delta: event.delta } };
      }
    } else if (event.type === "tool-call") {
      toolCalls.push({ name: event.name, args: event.args ?? {} });
    } else if (event.type === "usage") {
      usage = { promptTokens: event.promptTokens, completionTokens: event.completionTokens };
    }
  }

  return { text, toolCalls, usage };
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
  let turnUsage = { promptTokens: 0, completionTokens: 0 };

  let providerMessages: ProviderChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...sanitizeHistory(historyRows.map(rowToProviderMessage)),
    { role: "user", content: userText },
  ];

  try {
    let finalText = "";
    let exhausted = false;
    let clarificationSent = false;
    let noToolCallRetryUsed = false;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      // The first attempt at a turn is buffered: if the model skips every
      // tool and just answers, that answer never reaches the user. We nudge
      // once and let it retry — off-topic replies still land in character,
      // in-scope ones now have to go do the lookup first.
      const buffered = iteration === 0 && !noToolCallRetryUsed;
      const turn = buffered
        ? yield* streamModelTurn(provider, providerMessages, CHAT_TOOLS, { bufferText: true })
        : yield* streamModelTurn(provider, providerMessages, CHAT_TOOLS);
      if (turn.usage) turnUsage = turn.usage;

      if (buffered && turn.toolCalls.length === 0) {
        noToolCallRetryUsed = true;
        providerMessages = [...providerMessages, { role: "system", content: NO_TOOL_CALL_NUDGE }];
        iteration--; // retry replaces this attempt, doesn't spend a tool-budget slot
        continue;
      }

      if (buffered && turn.text) {
        yield { event: "text-delta", data: { delta: turn.text } };
      }

      if (turn.toolCalls.length === 0) {
        finalText = turn.text;
        break;
      }

      // Provider-issued tool call ids are not unique across iterations or
      // turns, so every tool call gets a fresh id that doubles as the
      // persisted tool row's primary key.
      const remapped: ToolCallRecord[] = turn.toolCalls.map((call) => ({
        id: newId(),
        name: call.name,
        args: call.args,
      }));

      let clarification: { call: ToolCallRecord; question: string; options?: string[]; allowFreeText: boolean } | null =
        null;
      const lookups: ToolCallRecord[] = [];
      for (const call of remapped) {
        if (call.name === CLARIFYING_QUESTION_TOOL_NAME) {
          const parsed = ClarificationSchema.safeParse(call.args);
          if (parsed.success) {
            if (clarification) {
              console.warn("[chat] dropping extra clarification in the same turn");
            } else {
              clarification = {
                call,
                question: parsed.data.question,
                options: normalizeClarificationOptions(parsed.data.options),
                allowFreeText: parsed.data.allowFreeText,
              };
            }
            continue;
          }
        }
        lookups.push(call);
      }

      if (lookups.length > 0) {
        providerMessages = [
          ...providerMessages,
          { role: "assistant", content: turn.text, toolCalls: lookups },
        ];
        const assistantRow = await persistMessage(dbClient, {
          sessionId,
          role: "assistant",
          content: turn.text,
          toolCalls: lookups,
        });
        yield { event: "message-done", data: { message: mapChatMessage(assistantRow) } };

        for (const call of lookups) {
          let toolResult: unknown;
          try {
            toolResult = await executeChatTool(call.name, call.args, { sessionId });
          } catch (err) {
            toolResult = { error: err instanceof Error ? err.message : "tool failed" };
          }

          const resultJson = JSON.stringify(toolResult ?? null);
          providerMessages = [
            ...providerMessages,
            {
              role: "tool",
              content: truncateToolResultForModel(resultJson, config.chatToolResultMaxChars),
              toolCallId: call.id,
            },
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
      } else if (turn.text.trim()) {
        providerMessages = [...providerMessages, { role: "assistant", content: turn.text }];
        const assistantRow = await persistMessage(dbClient, {
          sessionId,
          role: "assistant",
          content: turn.text,
        });
        yield { event: "message-done", data: { message: mapChatMessage(assistantRow) } };
      }

      if (clarification) {
        const clarificationRow = await persistMessage(dbClient, {
          sessionId,
          role: "assistant",
          content: clarification.question,
          toolName: CLARIFYING_QUESTION_TOOL_NAME,
          toolArgs: {
            question: clarification.question,
            options: clarification.options ?? null,
            allowFreeText: clarification.allowFreeText,
          },
        });
        yield {
          event: "clarification",
          data: {
            messageId: clarificationRow.id as string,
            question: clarification.question,
            options: clarification.options,
            allowFreeText: clarification.allowFreeText,
          },
        };
        yield { event: "message-done", data: { message: mapChatMessage(clarificationRow) } };
        clarificationSent = true;
        finalText = clarification.question;
        break;
      }

      if (iteration === MAX_TOOL_ITERATIONS - 1) {
        exhausted = true;
      }
    }

    if (!clarificationSent) {
      if (exhausted || !finalText.trim()) {
        const fallback = yield* streamModelTurn(
          provider,
          [...providerMessages, { role: "system", content: TOOL_BUDGET_EXHAUSTED_NUDGE }],
          []
        );
        if (fallback.usage) turnUsage = fallback.usage;
        finalText = fallback.text;
      }

      if (!finalText.trim()) {
        finalText = EMPTY_ANSWER_FALLBACK;
        yield { event: "text-delta", data: { delta: finalText } };
      }

      const assistantRow = await persistMessage(dbClient, {
        sessionId,
        role: "assistant",
        content: finalText,
        tokenCount: turnUsage.completionTokens > 0 ? turnUsage.completionTokens : undefined,
      });
      providerMessages = [...providerMessages, { role: "assistant", content: finalText }];
      yield { event: "message-done", data: { message: mapChatMessage(assistantRow) } };
    }

    if (isFirstExchange) {
      void maybeAutoTitleSession(sessionId, userText, finalText, String(session.title_source ?? "auto"));
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

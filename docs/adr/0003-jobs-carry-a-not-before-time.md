# 3. Jobs carry a not-before time

## Status

Accepted

## Context

Session Summaries are rebuilt by background Jobs once an Assistant Session has been quiet for several minutes. The naive trigger is "enqueue when a Message is persisted," but that would re-summarize on every turn of an active conversation, wasting the single local inference slot.

Three ways to hold work back until idleness:

1. **Periodic scan** — a timer queries Sessions whose `updated_at` is older than N minutes and enqueues Jobs. Simple, but it is a poller: exactly what the Sweep glossary entry rules out as a general scheduler, and it adds wakeups even when nothing is stale.
2. **In-memory debounce** — a `setTimeout` per Session, reset on each Message. Cheapest to write, lost on restart, and invisible to the Tasks tab until the timer fires.
3. **Durable time gate on the Job** — persist a queued Job at Message time with `not_before = now + N minutes`; each new Message pushes `not_before` forward. The Runner's existing claim loop picks it up once the gate passes. Survives restarts with no separate scheduler.

The Watch Sweep already wants per-source scheduling ("a placeholder for per-source scheduling, not a general scheduler"). A time gate on Jobs is that primitive without introducing a cron layer.

## Decision

Add a nullable `not_before` column to `jobs`. A Job in `queued` status is claimable only when `not_before` is null or `not_before <= now`, in addition to existing dependency and lease rules.

Session Summary scheduling uses this gate: each persisted Message upserts one queued `SummarizeChatSession` Job for that Session, setting `not_before` to five minutes from now (configurable via `CHAT_SUMMARY_IDLE_MINUTES`). Repeated Messages on the same Session update the existing Job's `not_before` rather than inserting duplicates.

Boot-time reconcile schedules any Session with unsummarized Messages and no pending Job, using `not_before = datetime(updated_at, idle window)` so Sessions that went quiet before the process started become claimable immediately if the window has already elapsed.

`trySummarizeSweep` is removed. `FRAMER_SWEEP_ENABLED` applies only to the Watch price refresh Sweep.

## Consequences

- No new daemon or poll interval for summarization. The integrated Runner's existing ~2s claim loop is sufficient once the gate opens.
- Restart-safe debounce: a Session that goes quiet while the API is down still has a queued Job waiting in SQLite.
- The claim query gains one predicate; all Job kinds can use `not_before` later (e.g. migrating the Watch Sweep off its standing query).
- Cost: one migration, upsert logic at Message persist time, and boot reconcile for Sessions that predate the feature or lost an enqueue mid-crash.
- Jobs with a future `not_before` appear in the Tasks tab as queued but unclaimable — correct, but worth knowing when debugging "why isn't the runner picking this up?"

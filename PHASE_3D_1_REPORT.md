# Phase 3D.1 — Conversation & Context Intelligence: Final Report

**Date:** 2026-08-20
**Status:** COMPLETE — all 464 tests pass (415 baseline + 49 new), `tsc -b` clean, production build clean.
**No Phase 3D.2 work was started (as instructed).**

---

## 1. Objective

Phase 3D.1 adds a deterministic, session-only conversational-context layer to
Finova's analyst agent. The agent can now remember instruments across turns,
resolve pronouns and role references, detect user corrections, keep a comparison
"alive" across turns, understand relative time phrases, and surface ambiguity —
all without inventing facts, without an intent router, and without anything
leaving the browser session.

## 2. What was delivered

- A new `src/analyst/conversation/` module (10 files): types, bounded state,
  session, entity memory, reference resolution, temporal detection, correction
  detection, comparison continuity, summarization, and context-payload builder.
- Orchestrator integration: the turn is resolved before the agent loop, the
  context payload is injected as a system message, tool evidence is attributed
  to canonical entity ids, and the turn is recorded back after the response.
- Engine integration: `resetAgentConversation()` and
  `suggestConversationFollowUps()` exported and wired into the React hook.
- 49 new tests (TEST 1–12 + 5 GOLDEN scenarios + security + engine wiring),
  covering determinism, bounds, purity, provenance, honesty and integration.
- README section documenting the phase and its design rules.

## 3. Why deterministic

Every conversational feature in this phase is a pure, rule-based computation
over (text, state, clock). There is no LLM call in the conversation layer. The
LLM remains the semantic reasoner and the only thing that decides tool usage.
This keeps the layer testable (fixed-clock fixtures), cheap, and safe.

## 4. Architecture

```
user text
   │
   ▼
resolve(text, now)  ── pure ──►  TurnResolution
   │                                  │ payload (context message)
   │                                  │ references (confidence + reason)
   │                                  │ corrections / comparison / temporal
   ▼                                  ▼
orchestrator  ──►  system message  ──►  agent loop (LLM + tools)
   │
   ▼
conversation.update(resolution, {response, evidence, sources, now})  ── mutates
   │
   ├─ recordTurn      (topics, summaries, findings, evidence, sources, metadata)
   ├─ mergeEntityMemory (active/recent entities, bounded)
   └─ recordCorrections (walk-back mapping with turn provenance)
```

## 5. Module layout

| File | Responsibility |
|---|---|
| `types.ts` | All interfaces + `DEFAULT_CONVERSATION_CONFIG` |
| `state.ts` | State factory, bounded push helpers, freshness classification, `recordTurn` |
| `session.ts` | `createConversationSession()` — the public session façade |
| `entities.ts` | `extractExplicitEntities` (mention order), `resolveEntityId`, `mergeEntityMemory`, display names |
| `references.ts` | `resolveReferences` (pronouns, roles, comparisons), `detectCorrections`, `extractComparisonDimensions` |
| `temporal.ts` | `detectTemporalReference` (relative periods, weekdays, moments) |
| `summarization.ts` | Response / findings / evidence / source summaries |
| `contextBuilder.ts` | `buildContextPayload` (bounded, header, provenance) + `suggestFollowUps` |
| `resolution.ts` | `resolveTurn` — orchestrates corrections → explicit → references → temporal → comparison → clarification |
| `index.ts` | Barrel exports (browser-safe) |

## 6. Session semantics

- `resolve(text, now)` is **pure**: it never mutates state, so it can be called
  repeatedly (tests verify equality of two identical calls).
- `update(resolution, input)` **mutates**: records the turn, merges entities,
  records corrections, updates timestamps.
- `reset()` clears all memory.
- A session is created with `createConversationSession(config?, now?)`; the
  clock is injected (deterministic in tests, `Date.now()` in production).

## 7. Bounded memory (no unbounded growth)

| Memory | Cap (default) | Eviction |
|---|---|---|
| Active entities | 8 | overflow demotes to recent |
| Recent entities | 3 | overflow drops |
| Prior summaries | 8 | FIFO |
| Findings | 12 | FIFO |
| Tool evidence | 12 | FIFO |
| Sources | 12 | FIFO |
| Corrections | 20 | FIFO |
| Context payload | 16,000 chars | hard slice + explicit `…[context truncated]` marker |
| Unresolved references | 10 | FIFO |

All caps are configurable via `ConversationConfig`.

## 8. Entity memory

- `extractExplicitEntities` uses the existing entity resolution
  (instruments + stocks + alias names) and sorts matches by **first-mention
  position** in the text, so "compare TCS and Infosys" yields `[TCS, INFY]`.
- The first entity of a turn becomes **primary** (the conversation topic);
  the rest are **context**.
- Previously active entities **stay active** until the cap is reached; only
  overflow demotes to recent (a real bug found and fixed during testing:
  new mentions were demoting old actives on every turn).
- Every entity carries `firstSeenTurn`, `lastSeenTurn`, `retrievedAt` and a
  freshness label.

## 9. Reference resolution (pronouns, roles, comparisons)

`resolveReferences(text, state)` matches, in order:

1. **Comparison references** — "which one", "the stronger one", "both of them",
   "each of them", "the other one" → resolve against `activeComparison` members
   (first member primary).
2. **Singular pronouns** — `it`, `this`, `that` → primary entity; confidence
   drops from high to medium as the active set grows.
3. **Plural pronouns** — `they`, `them`, `these`, `those` → all active entities.
4. **Role references** — "the index", "the market", "the sector", "the stock",
   "the instrument" → best-matching active entity by type (low confidence,
   never a silent guess).

Every reference carries a human-readable reason and a confidence
(high 0.9 / medium 0.6 / low 0.3 / unresolved 0).

## 10. Corrections (walk-backs)

- `detectCorrections` triggers on phrase patterns (`i meant`, `actually`,
  `no,`, `but`, `not ... — ...`).
- Position-aware: the entity appearing after "meant"/"but" is the corrected
  target; the previous focus is the other mention, else the active topic.
- "Actually, I meant TCS, not NIFTY" → corrected `TCS`, previous `nifty-50`.
- Corrections are stored as explicit mappings (`TCS → INFY`, turn N) and
  rendered into the context payload so the model sees the walk-back; the
  conversation layer never silently re-interprets the user's words.

## 11. Comparison continuity

- `detectComparison`: a compare phrase (`compare/versus/vs/between ...`)
  **plus ≥ 2 explicit entities** starts a new active comparison with its
  extracted dimensions (e.g. "momentum").
- "Which one is stronger?" (no compare word, comparison-kind reference)
  **continues** the active pair instead of creating a new one.
- The payload carries `Active comparison: Nifty 50 vs Bank Nifty
  (dimensions: momentum) (started turn 1)`.
- Honest limitation: "TCS and Infosys" alone (no compare word, no active
  comparison) does NOT fabricate a comparison — entities are remembered, the
  model decides the tool call.

## 12. Temporal context

- `detectTemporalReference` normalizes relative phrases only:
  today / yesterday / this week / this month / this quarter / over the last
  few days / last week / last month / last quarter / weekdays (with
  "this week" vs "next week" by day-of-week comparison) / "right now" moments.
- **No absolute dates are invented** — a phrase without a deterministic
  mapping stays unmatched (verified by test).
- Fixture verified against the real calendar: `1720000000000` is a
  **Wednesday** (2024-07-03), so Monday → "this week", Saturday → "next week".

## 13. Clarification (never a silent guess)

- References with confidence below the threshold (default 0.5) set
  `needsClarification` and are recorded in `state.unresolvedReferences`.
- The payload renders them under `Ambiguity — resolve before acting` and the
  interpretation line marks them `— unresolved`.
- Example: after "Why is NIFTY weak?", "Is the sector leading?" flags
  "the sector" as unresolved instead of guessing.

## 14. Context payload

- Exact header: `CONVERSATION CONTEXT (session-only memory — reference it,
  but never present it as fresh tool evidence)` — the model is explicitly
  told not to present memory as fresh evidence.
- Sections: Last answer, Active topic, Active entities, Active comparison,
  Prior summaries, Recent important findings, Latest tool evidence (with
  "already gathered — reuse before rerunning tools"), Recent web sources,
  User corrections, This turn's interpretation, Ambiguity, Temporal context.
- Every entry carries turn provenance and a freshness label.
- The whole payload (header included) is hard-capped at `maxContextChars`.

## 15. Orchestrator integration

- `OrchestratorDeps.conversation?: ConversationSession`.
- Before the loop: `turn = conversation.resolve(input.text, toolContext.now)`;
  the payload is injected as a system message after `buildContextNote`, before
  the user message.
- The agent loop is unchanged; it exits through a **single finalize path**
  (validated final response or synthesis), after which
  `conversation.update(turn, { response, evidence, sources, now })` records
  the turn.
- Tool evidence is attributed to entity ids: `GatheredEvidence` now carries
  the resolved entity (`evidenceEntity(name, normalizeArgs)`), e.g. a
  `getTechnicalAnalysis` result is tagged `nifty-50`.

## 16. Engine integration

- `AgentEngineOptions.conversation?: ConversationSession | null` — when null,
  conversation memory is fully disabled (verified by test).
- Default: a fresh internal session per engine, kept in a `WeakMap`.
- `resetAgentConversation(engine?)` — exported and called by the UI reset.
- `suggestConversationFollowUps(engine?)` — returns conversation-derived
  follow-up chips (empty state → honest `[]`).
- The fallback path also records the turn into the session.

## 17. UI integration

- `useAnalyst`: `reset()` now also resets the conversation session.
- `suggestions` = conversation chips first, then engine suggestions, capped at
  6, recomputed per message change.

## 18. Configuration

`ConversationConfig` (applied via `AgentConfig.conversation` or
`createConversationSession`):

- `maxActiveEntities` 8, `maxRecentEntities` 3, `maxSummaries` 8,
  `maxConversationFindings` 12, `maxToolEvidence` 12, `maxSources` 12,
  `maxCorrections` 20, `maxUnresolvedReferences` 10, `maxContextChars` 16000.
- `referenceConfidenceThreshold` 0.5.
- Freshness policy: `marketDataTtlMs` 15 min, `evidenceTtlMs` 60 min,
  `summaryTtlMs` 60 min; levels fresh ≤ ttl, recent ≤ ttl×6, stale ≤ ttl×24,
  expired beyond.

## 19. Honesty model

- Unknown references stay unresolved — never guessed.
- No absolute dates are fabricated from relative phrases.
- Memory is labeled session-only and never presented as fresh tool evidence.
- Corrections are explicit mappings, never silent re-interpretation.
- Payload truncation is explicit (`…[context truncated]`).
- Tests assert the payload contains exactly what memory holds
  (no `says`/`claimed` inventing, no fabricated timestamps).

## 20. Security

- `security.test.ts` statically verifies the conversation module never
  imports `server`, `apiBoundary`, `openaiCompatible`, `transport`, never
  touches `process.env` / `FINOVA_*`, never uses `localStorage` /
  `sessionStorage`, and the barrel never exports anything network-related
  or key-related. All state is in-memory, per-session.

## 21. Determinism

- Two identical `resolve` calls produce identical payloads (test).
- Fixed clock fixture (`NOW = 1720000000000`) across all conversation tests.
- The payload is a pure function of (state, resolution); freshness labels are
  derived from the injected clock, not from ambient time.

## 22. Test coverage (49 new tests)

- **TEST 1** — 60-turn session stays within every bound (entities, summaries,
  findings, evidence, sources, corrections).
- **TEST 2** — identical sessions produce identical states (determinism).
- **TEST 3** — repeated messages collapse to a single memory entry.
- **TEST 4** — explicit entities carry canonical ids + display names.
- **TEST 5** — active/recent entity overflow demotes, never grows unbounded.
- **TEST 6** — pronouns resolve to the active topic with honest confidence.
- **TEST 7** — comparison references resolve against the active pair.
- **TEST 8** — "Actually, I meant TCS" flips the topic (position-aware).
- **TEST 9** — unresolved references are flagged, never guessed (incl.
  custom threshold).
- **TEST 10** — temporal phrases map deterministically (weekdays verified
  against the real calendar).
- **TEST 11** — payload carries memory with provenance, no fabrication.
- **TEST 12** — passive-turn discovery: mentions in follow-up questions are
  remembered for later turns.
- **GOLDEN A** — single-instrument focus across turns, context reaches the
  model, evidence reused.
- **GOLDEN B** — comparison continuity: "Which one is stronger today?"
  keeps the pair and its dimensions.
- **GOLDEN C** — corrections switch the focus and reach the model.
- **GOLDEN D** — under-specified requests surface ambiguity, never a silent
  guess; the pair naming is remembered as entities.
- **GOLDEN E** — repeated questions reuse fresh evidence instead of
  rerunning tools.
- **Security** — 4 static-import checks (no server/network/secrets).
- **Engine wiring** — per-turn recording, evidence entity attribution, fallback
  recording, `conversation: null` disables, reset clears, suggestions empty.

## 23. Bugs found and fixed during the phase

1. `extractExplicitEntities` returned entities in alias-length order, not
   mention order → "compare TCS and Infosys" produced `[INFY, TCS]`. Fixed by
   sorting on first-mention position.
2. Entity memory demoted previously-active entities on every new mention.
   Fixed: actives stay active until the cap; only overflow demotes.
3. Temporal fixture day-of-week was wrong (`1720000000000` is Wednesday, not
   Friday) — the test fixture was corrected and verified against the calendar.
4. `detectCorrections` picked the last alias-sorted mention as "corrected"
   regardless of position → "I meant TCS, not NIFTY" misattributed. Fixed with
   position-aware "meant"/"but" anchoring.
5. Context payload cap did not include the header (payload exceeded
   `maxContextChars`). Fixed: the whole payload is capped.
6. `posOf` crash (matched alias missing after mention→entity mapping) — fixed
   by preserving the matched alias on the entity.
7. Fallback-path test stub returned a JSON string, not an `AnalystResponse` —
   corrected to parse the response object.
8. TEST 6 used a sentence with no pronoun ("the trend" contains no "it") —
   corrected to "Is it still bullish?".

## 24. Verification

```
npm test      → 464 tests, 464 pass, 0 fail
npx tsc -b    → clean
npm run build → vite production build clean (207 modules)
```

## 25. Non-goals (explicitly out of scope, as instructed)

- No intent router, no "if user says X → call tool Y" logic.
- No absolute-date parsing, no persistent/disk memory, no server-side state.
- No Phase 3D.2 work (prompt continuation, embeddings, RAG, cross-session
  memory, calendar-aware tool calls) was started.

## 26. Follow-ups for future phases (recorded, not implemented)

- Calendar-aware absolute date parsing (requires a `Calendar`-style tool).
- Cross-session memory (explicitly out of 3D.1's session-only design).
- Multi-user isolation (all state is per-session already; server-backed
  sessions would need explicit ownership).

**End of report.**
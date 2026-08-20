# Phase 3N — Natural Intelligence Overhaul

Date: 2026-08-20
Scope: the AI Analyst's conversational naturalness — prompts, response manner,
tool-selection heuristics, loading/status feedback and deterministic fallback
wording. Evidence honesty, provenance, structured-output validation and the
Phase 3D.1 conversation layer are unchanged.

Status: COMPLETE — 523 tests pass (501 baseline + 22 new), `tsc -b` clean,
production build clean.

---

## 1. Existing behavior (before this phase)

The analyst is a validated-LLM reasoning loop over deterministic Finova tools:

- `buildSystemPrompt` instructed the model on tools, evidence honesty,
  fact/inference/recommendation separation, conflicting evidence, clarification
  and the structured output schema.
- The orchestrator resolved each turn against session memory (Phase 3D.1),
  injected a bounded context payload, and fed tool results back in bounded
  rounds. The model decides tool usage dynamically.
- The UI awaited the full response (`useAnalyst.send`), showing a pending
  message with `AnalystThinking` cycling through a fixed generic list:
  "Reviewing market context…", "Comparing trends across sectors…", "Looking for
  patterns…", "Preparing analysis…" — regardless of the question.
- Deterministic fallbacks (LLM down / limits reached / follow-up answered from
  memory) produced valid structured responses but announced their own machinery
  ("I could not complete a full model-synthesized answer, so here is a
  deterministic read…", "The analyst tools could not run for this follow-up…").

## 2. Problems found

1. **No adaptive depth** — a one-line status question ("How is NIFTY doing?")
   was treated the same as a deep outlook question; the model got no signal
   about how much answer the question warrants.
2. **No natural-conduct instruction** — nothing told the model to open with the
   answer, avoid chatbot filler, reference prior turns like a colleague, or
   stop narrating tool runs. Nothing forbade canned closers ("Let me know if
   you have more questions!").
3. **No honest-uncertainty, challenge, corrections or opinion guidance** — the
   prompt never distinguished "I don't know" from "no data", never told the
   model to challenge a wrong premise with evidence, to acknowledge corrections
   once and move on, or to label opinions as inferences.
4. **No minimum-sufficient-investigation heuristic** — only "call only the
   tools that produce relevant evidence"; nothing told the model to reuse
   session evidence or to avoid a multi-tool investigation for a simple
   question.
5. **Generic loading statuses** — the UI spun the same four generic phrases for
   every question, so a news question showed "Comparing trends across
   sectors…". The statuses did not reflect the actual work.
6. **Robotic fallback wording** — deterministic fallbacks read like error
   messages ("I could not complete a full model-synthesized answer…") rather
   than like an analyst acknowledging limits.

## 3. Architecture changes

None of the seams changed. All changes are behaviour/prompt/UI-surface edits
inside the existing modules:

- `src/analyst/agent/understanding.ts` — new deterministic `depth` signal
  (`brief` / `standard` / `deep`) + exported `estimateDepth`.
- `src/analyst/agent/systemPrompt.ts` — natural-conduct overhaul (see §4).
- `src/analyst/agent/orchestrator.ts` — `buildContextNote` now passes the depth
  directive to the model each turn.
- `src/analyst/agent/synthesis.ts`, `conversationFallback.ts` — natural fallback
  wording (honesty preserved).
- `src/analyst/engine.ts` — `loadingStages(hint?)` becomes intent- and
  subject-aware (default list unchanged when no hint).
- `src/analyst/types.ts` — `ConversationMessage.stages?: string[]` for pending
  messages.
- `src/analyst/useAnalyst.ts` — computes the pending message's stage list from
  `understandTurn` + `findEntityMentions`.
- `src/components/analyst/AnalystThinking.tsx` + `src/pages/Analyst.tsx` —
  pending message renders its own stage-aware statuses.
- `src/analyst/agent/index.ts` — exports `estimateDepth` / `UnderstandingDepth`.
- `src/analyst/agent/__tests__/naturalness.test.ts` — new suite (22 tests).

The response schema, validator, conversation memory, tool registry and
evidence/provenance plumbing are untouched. Validation is NOT weakened
anywhere.

## 4. Prompt / behavior changes (`systemPrompt.ts`)

New instruction sections (schema and evidence rules unchanged):

- **ANSWER LIKE AN ANALYST, NOT A CHATBOT** — direct and specific; open with
  the answer; never narrate tool runs; never use chatbot filler; a banned-list
  is spelled out ("Sure!", "Absolutely!", "Great question!", "As an AI…",
  "Happy to help!", "Let me know if you have more questions!", "In
  conclusion…", …); end on substance, not an offer; refer to earlier turns the
  way a colleague would ("as we discussed"), never "according to the
  conversation context section".
- **ADAPT THE DEPTH** — brief / standard / deep guidance matching the depth the
  orchestrator computes; depth is about usefulness, never padding.
- **MINIMUM SUFFICIENT INVESTIGATION** — "Do I need this to answer?" before
  each tool call; reuse session evidence from the context; stop when the
  evidence is enough; "More tools is not a better answer".
- **HONEST UNCERTAINTY** — "I don't know" and "the data doesn't cover that" are
  acceptable; distinguish no-evidence from thin/contradictory evidence; never
  invent probabilities, targets or time horizons.
- **WHEN THE USER IS WRONG** — a premise the data contradicts is called out
  plainly with the evidence, respectfully and without flattery.
- **CORRECTIONS** — acknowledge once, adopt the correction, no over-apologizing,
  no re-litigating the mistake.
- Opinion requests get a labeled, evidence-based opinion as an inference —
  never fact, never certainty.
- Clarification is ONE natural, human line (partial=true), not a questionnaire.

## 5. Tool-use changes

Deterministic heuristics only — the LLM stays the primary reasoner:

- `understanding.depth` drives a directive in the per-turn context note
  (e.g. "Answer depth: brief — a direct, short answer; minimal structure."),
  which biases tool selection: brief questions should not trigger multi-tool
  investigations.
- The prompt now explicitly instructs reusing session evidence listed in the
  conversation payload before re-running identical tools (an intended Phase 3D
  capability the prompt previously did not leverage).
- No orchestrator-level tool restriction was added; the golden/scenario tests
  still exercise dynamic multi-tool selection unchanged.

## 6. Streaming / status changes

Full token streaming is not feasible for this architecture (the gateway
returns a complete LLM result per round, and tool rounds interleave); the
phase's fallback for that requirement was honoured instead:

- `loadingStages(hint?)` now returns intent-specific, subject-aware statuses:
  - explain: "Reading the tape for {subject}… → Checking the likely drivers… →
    Tying it to the evidence…"
  - news: "Scanning recent developments… → Validating sources… →
    Summarizing the news…"
  - compare / forecast / impact / technical / market-status: similar dedicated
    sequences.
  - subject labels are injected when known ("…for NIFTY 50").
  - no hint → the exact previous default list (backwards compatible).
- `useAnalyst` derives the stages from `understandTurn` on the question being
  asked, so the pending bubble describes what the analyst is actually doing
  (e.g. a news question no longer shows "Comparing trends across sectors…").
- `AnalystThinking` accepts the per-message `stages` and resets its stage index
  when they change.

## 7. Conversation improvements

- The model is told to reference earlier turns naturally ("as we discussed",
  "continuing from earlier") instead of quoting context sections.
- Corrections guidance (acknowledge once, move on) pairs with the existing
  Phase 3D.1 correction detection.
- The memory fallback (follow-ups answered from session evidence) reads like a
  person now: "I couldn't run the tools for this follow-up, so here's a recap
  of the evidence already gathered for X in this conversation." The honesty
  section ("No Finova tool in this session supports…") and the "evidence
  already gathered" label required by existing tests are preserved verbatim.
- Deterministic synthesis reads naturally: "Here's a straight read on X from
  the evidence gathered in this session." — no meta-machinery announcement,
  still `partial=true`, Low confidence and honest source sections.

## 8. Naturalness test results

New suite `src/analyst/agent/__tests__/naturalness.test.ts` — 22 tests, all
passing. Coverage:

| Category | Tests |
| --- | --- |
| Short questions → brief depth | N1, N3 (status/definition brief; explain/compare stay standard) |
| Deep questions → deep depth | N2, N22 (depth always one of brief/standard/deep) |
| Prompt mandates adaptive depth | N4 |
| Chatbot-filler ban | N5 (each banned phrase asserted present) |
| No tool narration / no canned templates | N6 (canned "if X then reply Y" count ≤ 2) |
| Natural cross-turn referencing | N7 |
| Honest uncertainty | N8 |
| Challenge the user | N9 |
| Corrections | N10 |
| Opinions as inferences | N11 |
| One natural clarification | N12, N15 (ambiguous pronoun) |
| Depth reaches the model via context note | N13 |
| Non-financial questions | N14 |
| Stage-aware, subject-aware, deterministic statuses | N16, N17 |
| Natural deterministic fallbacks | N18, N19 |
| Evidence/provenance guarantees intact | N20 |
| Minimum-sufficient investigation | N21 |

Full regression: 523/523 pass (501 before + 22 new), `tsc -b` clean, `npm run
build` clean.

## 9. Before / after examples

Representative prompts, captured before and after this phase (artifacts in
`C:\Users\Owner\AppData\Local\Temp\opencode\3n-before.txt` /
`3n-after.txt`):

**"How is NIFTY doing?"** — before: no depth signal, generic loading statuses.
After: `depth: brief`, context note "Answer depth: brief — a direct, short
answer; minimal structure", statuses "Checking the session… → Reading breadth
and leadership… → Preparing the read…".

**"What is the 5-year outlook for oil?"** — before: treated like any question.
After: `depth: deep`, `primary: brent`, guidance to weigh scenarios and
separate fact from inference.

**"Why is the market moving today?"** — before: same treatment as everything
else. After: `depth: standard` (a short "why" still gets a real explanation),
statuses "Reading the tape… → Checking the likely drivers… → Tying it to the
evidence…".

**"Compare TCS and Infosys"** — before: generic "Comparing trends across
sectors…" status. After: `depth: standard`, statuses "Pulling up the
comparison… → Scoring each side… → Framing the read…".

**Deterministic fallback summary** — before: "I could not complete a full
model-synthesized answer, so here is a deterministic read of the evidence
gathered for Nifty 50." After: "Here's a straight read on Nifty 50 from the
evidence gathered in this session."

**Memory follow-up** — before: title "Recalling the evidence for TCS", summary
"The analyst tools could not run for this follow-up…". After: title "What we
know so far about Tata Consultancy Services", summary "I couldn't run the
tools for this follow-up, so here's a recap of the evidence already gathered…".

**Loading statuses** — before: identical four generic phrases for every
question. After: intent- and subject-specific sequences; default list
unchanged when no hint is given.

## 10. Performance impact

- `understandTurn` already ran per turn; `estimateDepth` adds a constant-time
  length check. No measurable cost.
- `loadingStages(hint)` is a static lookup; the UI change adds one tiny string
  array per pending message.
- No change to the reasoning loop, tool calls, payload sizes or network
  traffic. Prompt size grew by ~1,400 characters (constant, not per-turn data).
- Production bundle size: unchanged in substance (build output 413 kB main JS,
  same order as baseline).

## 11. Bugs found / fixed

- `conversationFallback` used the phrase "The analyst tools could not run…"
  — robotic, and its title "Recalling the evidence for X" announced machinery;
  reworded while keeping the test-required "evidence already gathered" label.
- `synthesis` announced the fallback mechanism in the user-facing summary;
  reworded to "Here's a straight read…" (still `partial=true`, Low confidence).
- `loadingStages` was question-independent; fixed to be intent/subject-aware.
- No latent bugs were found in the reasoning loop, validator, tools or
  conversation memory during this phase.

## 12. Remaining weaknesses

- The depth signal guides but cannot force the LLM; a chatty model can still
  over-answer a brief question. Real-model acceptance testing with the app's
  provider is the remaining validation step.
- Full token streaming is not implemented (architecture returns whole LLM
  results per round); statuses are stage-aware but not live.
- "Minimum sufficient investigation" is prompt-level guidance; there is no
  deterministic guardrail capping tools per depth level (intentionally — tool
  autonomy is a Phase 3A design rule).
- Some canned phrases remain in the deterministic fallback follow-ups and
  suggestion chips (they are UI chips by design, not model speech).
- The naturalness suite asserts prompt content and deterministic behaviour —
  it cannot measure actual model prose; a manual before/after prompt run with
  the real provider is recommended.
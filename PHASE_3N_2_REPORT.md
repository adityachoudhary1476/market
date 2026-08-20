# Phase 3N.2 — Conversational Response Intelligence

Builds on Phase 3N (natural analyst voice) and Phase 3N.1 (live news) to make the
analyst's *responses* read like an analyst's answer — answer first, evidence
consolidated, contradictions surfaced, sources subordinate — instead of a dump
of internal tool/evidence machinery. Everything is enforced deterministically
in code; evidence honesty, provenance, validation, security and the news
architecture are unchanged.

---

## 1. Executive summary

Live runs ("source me some latest news for gold") rendered responses that
exposed internals: "Here's a straight read on Gold from the evidence gathered
in this session.", "searchNews — Evidence captured", "getMacroContext —
Evidence captured", a "Web sources" article dump, and repeated "Trend &
momentum / Analyst read" sections. This phase replaces that with answer-first,
consolidated synthesis:

- The summary now OPENS with the answer, built only from real tool output
  ("Gold (spot) is at $2,512, +0.22% on the day, based on the available market
  data.").
- Tool function names never appear in prose, headings or findings (unless the
  user explicitly asks which tools were used).
- Evidence is consolidated deterministically: exact duplicates are folded,
  repeated headings are disambiguated by instrument, empty sections are
  dropped, and genuine conflicts between evidence groups are surfaced — never
  averaged away.
- News stories render as short theme lines (outlet + headline + corroboration),
  never article dumps; sources stay attached as structured evidence for the UI,
  subordinate to the answer.

The deterministic seams are locked in by a new 26-test suite (RI1–RI26) plus
updated naturalness/web-search tests. **598 tests pass** (572 baseline + 26
new), `tsc -b` clean, production build clean.

## 2. Scope and non-goals

**In scope** — the response layer: deterministic synthesis (`synthesis.ts`),
a new deterministic `responseIntelligence` module, system-prompt conduct
additions, and a post-validation hygiene pass on LLM finals.

**Explicitly NOT changed** — news infrastructure (`websearch/`), conversation
architecture, provider protocol (unless a regression was found — it was not),
tool semantics, evidence honesty, provenance rules, response/validation
contracts, security boundaries, Phase 3D/3D.1/3N/3N.1 behavior.

## 3. Audit — where the tool-dump comes from (Causes A–H)

The symptoms trace to two paths:

- **A. Deterministic synthesis** (`synthesis.ts`) — the main culprit in the
  gold run: the summary was a meta-announcement ("Here's a straight read…"),
  non-special-cased tool results got a raw `metadata.tool` heading with an
  "Evidence captured" placeholder, unavailable results got `${tool} —
  unavailable` headings, findings were titled by tool name, web sources were
  dumped as title+URL bullets, and recommendations/follow-ups referenced
  machinery ("The exact figures live in the individual tool results.") or were
  static and off-subject ("Why is NIFTY moving?" for a gold question).
- **B. LLM path** — the prompt fed tool results back per-call with nothing
  forbidding per-tool section repetition ("Trend & momentum / Analyst read"
  twice), raw tool names in prose, or duplicated headings, metrics and
  caveats.

## 4. Design principles

- Enforce deterministically in code wherever possible (tool-name suppression,
  consolidation, section hygiene, repetition detection, conflict detection) —
  NOT by another giant prompt and NOT a giant decision tree.
- Preserve every fact: consolidation only folds byte-identical duplicates;
  near-duplicates are disambiguated (instrument-suffixed headings), never
  merged blindly.
- Never weaken honesty: `partial=true`, confidence, provenance, required test
  phrases ("evidence already gathered", "No Finova tool in this session
  supports") are preserved.

## 5. The `responseIntelligence` module (new)

`src/analyst/agent/responseIntelligence.ts` — pure, deterministic helpers:

- `SUPPRESSED_TOOL_NAMES` + `containsToolName` / `firstToolName` /
  `toolNamesInText` — whole-word detection of the eight evidence-gathering
  tools.
- `naturalHeadingForTool` — the ONLY place tool names become analyst
  vocabulary ("getTechnicalAnalysis" → "Technical picture", "searchNews" →
  "News", …).
- `sanitizeToolNames` — scrubs tool names out of untrusted/verbose text (e.g.
  metadata warnings) so machinery never leaks into prose.
- Section hygiene: `isExactDuplicateSection`, `dedupeSections` (fold exact
  dupes, first wins), `hasRepeatedHeadings`, `dropEmptySections`,
  `repeatedCaveats`.
- Conflict detection: `directionalSign`, `directionalGroupOf`,
  `detectConflicts` — opposite signals (bull vs bear) across evidence groups
  surface as honest conflict notes; 'mixed' never counts as a side; nothing is
  averaged.
- News themes: `newsThemes` / `themeLines` — compressed citation lines (outlet:
  headline, "reported by N outlets"), no URLs, no invented dates.
- Answer compression: `buildAnswerFirstSummary` — the substance-first opening
  line built only from real tool output, with an honest qualitative fallback
  when no numbers exist.
- `refineResponse` — the deterministic, non-destructive hygiene pass over a
  FINAL response (rename tool-name headings, drop empties, fold exact dupes).
  Idempotent; returns the identical object when nothing needs fixing.

## 6. Deterministic synthesis refactor (`synthesis.ts`)

- Summary via `buildAnswerFirstSummary` — answers first, never announces the
  session.
- Tool results render through `naturalHeadingForTool`; the "Evidence captured"
  placeholder and raw tool-name headings are gone. Unavailable results become
  "Data unavailable" with a sanitized reason.
- `searchNews` → "News" theme lines; `searchWeb` → "Web evidence" compressed
  citations; `getMacroContext` → "Macro context" levels; the rest keep their
  substance sections.
- `buildSections` consolidates: disambiguates repeated repeatable headings by
  instrument, folds exact duplicates, drops empty sections.
- Conflicts from `detectConflicts` add a "Conflicting evidence" section.
- Web sources are compressed; a "Sources" section appears ONLY for sources not
  already cited in News/Web evidence (no duplicate facts across sections).
- Findings use natural titles; recommendations are substantive (warning note,
  conflict guidance, or a direction-confirmation watch) or omitted; follow-ups
  are subject-relevant.

## 7. System-prompt additions

- Tool-name suppression (the only exception: the user explicitly asks which
  tools were used).
- "Open with the direct answer… the summary is the answer; sections and
  findings carry the support."
- New "CONSOLIDATE, DO NOT REPEAT" block: one fact in one place, no section per
  tool result, no repeated headings (name the instrument when a section must
  cover more than one), no repeated caveats, no empty sections.
- Extended "CONFLICTING EVIDENCE": prefer the freshest and most relevant
  evidence and say so; never average conflicting signals; never hide a split.
- LIVE NEWS: "Synthesize stories into themes" (story, who reports it, how
  widely corroborated) — never article-by-article.
- All existing naturalness-tested phrasing (N-tests) is preserved verbatim.

## 8. Orchestrator refinement pass

`runAgentSession` now applies `refineResponse` to every validated LLM final
(after `attachSources`), so even a model that writes a "searchNews" heading or
duplicates a section is corrected deterministically after validation. The pass
is non-destructive and idempotent; it can never weaken the structured-output
contract.

## 9. UI verification

`AnalystResponseCard` already renders answer-first: title + summary at the top,
then metrics, sections, findings, and the SourceList at the bottom (subordinate
to the answer). No changes were required; the structured `sources` field still
feeds the SourceList with freshness/corroboration badges.

## 10. Tool-name suppression

Eight tools are suppressed in normal prose. Deterministic whole-word matching
(no substring false positives: "technical analysis" prose is fine,
"getTechnicalAnalysis" is not). Provenance paths that must name tools are
deliberately exempt: the conversation-memory fallback and "which tool showed
that?" answers — there the tool name IS the answer.

## 11. Evidence consolidation

Exact duplicates are folded (first wins) — never content-blind merges.
Near-duplicates with different content are disambiguated by instrument
("Trend & momentum — sensex"). Empty sections are dropped. Repeated headings
and repeated caveats are detected and reported by the deterministic module.

## 12. Contradiction handling

`detectConflicts` compares directional signals (technical picture, confluence,
market regime, breadth, macro) across results. Bull-vs-bear pairs produce an
honest "the evidence is split" note; the prompt tells the model to prefer the
freshest/most relevant evidence and say so, and never to average conflicting
signals. The deterministic path surfaces the conflict as its own section.

## 13. News synthesis

`themeLines` renders real items as "outlet: headline — reported by N outlets"
(≤3 stories), reusing the 3N.1 corroboration/freshness signals. The prompt
adds the theme-level instruction. No URLs, no invented dates, no article
dumps.

## 14. Answer compression — before/after targets

**Gold news (deterministic path), before:**
> Here's a straight read on Gold from the evidence gathered in this session.
> **searchNews** — Evidence captured (see summary below).
> **getMacroContext** — Evidence captured (see summary below).
> **Web sources**: [title — URL] × N

**Gold news (deterministic path), after (live smoke run):**
> **Summary:** Gold (spot) is at $2,512, +0.22% on the day, based on the
> available market data.
> **News:** reuters.com: Gold steadies near record as traders weigh Fed rate
> path — reported by 2 outlets · metalsdaily.com: Central bank gold buying
> underpins demand, analysts say · kitco.com: Gold outlook: safe-haven demand
> remains firm
> **Macro context:** Gold (spot): $2,512 (+0.22%)
> (Sources stay attached for the UI SourceList; no tool names anywhere.)

**NIFTY bullish, after:**
> **Summary:** Nifty 50's overall trend is up (strength 0.8), trading at
> 24385 (+0.40% on the day), based on the available market data.
> **Trend & momentum / Confluence / Breadth** — one section each, agreeing;
> **Recommendation:** "Watch whether momentum confirms the up trend before
> drawing firm conclusions."

**NIFTY conflicting, after:**
> A "Conflicting evidence" section: "the technical picture reads bullish while
> the confluence reads bearish — the evidence is split, not unanimous."

## 15. Natural analyst voice — fallback wording

"Here's a straight read on X from the evidence gathered in this session." is
replaced by the answer-first opening ("…based on the available market data."),
matching the required natural-but-honest example. `partial=true`, confidence
and the required test phrases ("evidence already gathered", "No Finova tool in
this session supports") are preserved verbatim.

## 16. Follow-up restraint

The deterministic synthesis follow-ups are now subject-relevant ("What's the
technical outlook for Gold?", "What are the key levels for Gold?") instead of
the hard-coded "Why is NIFTY moving?" The prompt's at-most-one-follow-up rule
(from 3N.1) is untouched.

## 17. Dynamic formatting

Preserved from 3N/3N.1: sections/tables only when they organize the answer.
The deterministic path now only emits sections with real content and no
duplication.

## 18. Fallback behavior preservation

The fallback chain is untouched: provider-down before evidence → conversation
→ subject → localAnalystEngine; evidence gathered but validation exhausted →
`synthesizeResponse`. All existing fallback tests pass unchanged.

## 19. Test suite — `responseIntelligence.test.ts` (RI1–RI26)

26 deterministic tests covering: suppression list completeness (RI1), whole-word
matching (RI2), name discovery (RI3), natural-heading translation (RI4), exact
duplicate detection/folding (RI5), repeated-heading detection (RI6), empty
section dropping (RI7), repeated caveats (RI8), directional signs (RI9),
per-group extraction (RI10), shapeless/unavailable results (RI11), conflict
detection (RI12), agreeing/mixed non-conflicts (RI13), news theme compression
(RI14), URL/date honesty (RI15), technical answer-first summary (RI16), macro
level summary (RI17), qualitative honesty (RI18), no-evidence honesty (RI19),
no-tool-names-in-summary (RI20), heading renaming (RI21), fold-vs-keep (RI22),
empty-drop preservation (RI23), determinism/idempotence (RI24), outside-section
preservation (RI25), clean-response no-op (RI26).

## 20. Intentionally-updated tests

Per the phase rules, only intentionally-changed behavior was updated:

- `naturalness.test.ts` **N18** — now asserts the answer-first summary
  ("available market data"), and that no tool name appears in the summary or
  section headings (was: asserts "Here's a straight read").
- `webSearch.test.ts` — the synthesized-fallback test now asserts the "Web
  evidence" section with compressed citations (was: "Web sources" + URL dump).

All other tests pass unchanged.

## 21. Regression

Full suite: **598 pass** (572 baseline + 26 new), 0 failures. `npx tsc -b`
clean. `npm run build` clean. No existing guarantee weakened.

## 22. Bugs found / fixed

- Fixed during increment 1: the refine pass returned the original object on a
  length-only no-op check, discarding renames — now compares sections properly.
- Live run (see §25): the round-2 provider rejection is **Gemini account
  quota** (raw upstream: `rate-limit`, "quota exceeded for metric:
  generativelanguage.googleapis.com"), NOT a protocol defect. The round-2
  payload (assistant `tool_calls` + tool messages) is accepted by Gemini.
- Known follow-up (out of 3N.2 scope, logged): the gateway can map an upstream
  4xx quota error to 502 `provider-error` instead of 429 `rate-limit`, so the
  client retries as `unavailable`. Not a 3N.2 regression.

## 23. Security

No changes to the security boundaries. Search/news output remains untrusted
(no instruction-following from sources); `sanitizeToolNames` only replaces
known tool-name tokens in already-safe prose; secrets are never logged or
printed; the gateway sanitization (redacted server messages) is untouched.

## 24. Performance

No extra LLM rounds. All new behavior is deterministic O(n) work over the
already-gathered results/response. No new network, no new storage.

## 25. Real-model acceptance matrix

| Row | Check | Status |
| --- | --- | --- |
| A | Round-1 LLM call reaches the provider | PASS (live) |
| B | Tool calls echoed + executed; evidence gathered | PASS (live, gold) |
| C | Round-2 payload accepted by the provider (protocol fix) | PASS (live probe) |
| D | Round-2 completes to a validated LLM final | BLOCKED by Gemini account quota (intermittent `rate-limit`; environment issue) |
| E | LLM final refined deterministically (no tool names / dupes) | PASS (unit + orchestrator tests) |
| F | Deterministic fallback after provider failure reads answer-first | PASS (live smoke + N18) |
| G | News renders as themes, not dumps | PASS (live smoke + RI14/15) |
| H | Conflicts surfaced, never averaged | PASS (RI12/13 + smoke) |
| I | Sources subordinate to the answer | PASS (UI + synthesis) |
| J | No tool names in any normal prose | PASS (RI2/3/20 + N18) |
| K | Required honesty phrases preserved | PASS (N19, D/E fallback tests) |
| L | Full live browser session end-to-end | PENDING user run (needs provider quota headroom) |

Verification tooling used: `live-3n2-check.ts` (real gateway + real Tavily +
real Gemini), `probe-round2.ts` (raw upstream error classification),
`smoke-gold-synthesis.ts` / `smoke-nifty-synthesis.ts` (deterministic paths).

## 26. File manifest

- `src/analyst/agent/responseIntelligence.ts` — NEW: deterministic module
  (§5).
- `src/analyst/agent/synthesis.ts` — refactored (§6).
- `src/analyst/agent/systemPrompt.ts` — additions (§7).
- `src/analyst/agent/orchestrator.ts` — refine pass on LLM finals (§8).
- `src/analyst/agent/__tests__/responseIntelligence.test.ts` — NEW: RI1–RI26.
- `src/analyst/agent/__tests__/naturalness.test.ts` — N18 updated (§20).
- `src/analyst/agent/__tests__/webSearch.test.ts` — synthesis-fallback test
  updated (§20).
- `README.md` — Phase 3N.2 section added.

**Verification:** `npm test` → 598/598 · `npx tsc -b` → clean · `npm run build`
→ clean.
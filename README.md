# Finova Markets — Phase 0

Premium frontend foundation for **Finova Markets**, an AI-powered market
intelligence platform. This phase delivers a polished, production-quality
homepage and a reusable UI/component foundation — intentionally with **no
backend, auth, payments, real APIs or AI integration**. Those arrive in later
phases.

> **Understand the market. Don't just watch it.**

## Tech stack

- **React 18** + **TypeScript** (strict)
- **Vite 5** for dev server and build
- **Tailwind CSS 3.4** with a custom design-token theme
- **React Router 6** for routing
- **Inline SVG** charts (sparklines + candles) — **no chart library**
- **Google Fonts**: Fraunces (display serif), Public Sans (UI/body),
  JetBrains Mono (data)
- Zero runtime UI dependencies beyond React + Router

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
npm run lint     # tsc --noEmit (type check only)
```

## Design system

The visual language lives in `tailwind.config.js` and `src/index.css`.

### Palette

| Token         | Value      | Usage                          |
| ------------- | ---------- | ------------------------------ |
| `forest-800`  | `#123B2C`  | Primary dark green / brand     |
| `terracotta`  | `#C4622D`  | Accent / CTAs / AI highlights  |
| `cream-100`   | `#F5EFE2`  | Warm page background           |
| `ink-800`     | `#2b2b27`  | Primary text (deep charcoal)   |
| `gain`        | `#2f7d52`  | Semantic positive (used sparely) |
| `loss`        | `#b3433a`  | Semantic negative (used sparely) |

Red/green is reserved strictly for semantic market gains/losses.

### Typography

- **Display/headings:** Fraunces (serif, optical sizing) — set as the default
  font for `h1–h4`.
- **UI/body:** Public Sans.
- **Data/numbers:** tabular numerals via the `.tabular` utility, JetBrains Mono
  where a monospace feel suits.

Type scale uses `clamp()`-based `display-xl/lg/md` sizes for fluid headings.

### Key utility classes

- `.container-page` — max-width 1240px, responsive horizontal padding
- `.eyebrow` — uppercase label with terracotta rule
- `.card-surface` — shared card treatment (border, soft shadow, rounded)
- `.reveal` + `.is-visible` — scroll-reveal (wired by `useReveal`)
- `.tabular` — tabular-nums
- `.bg-grid` / `.bg-dots` — subtle background patterns

## Project structure

```
.
├── index.html                 # SEO meta, OG/Twitter tags, font loading
├── public/
│   ├── favicon.svg
│   ├── og-image.svg
│   └── robots.txt
├── src/
│   ├── main.tsx               # React entry
│   ├── App.tsx                # Router + app shell (Navbar/Footer)
│   ├── index.css              # Tailwind + base styles + utilities
│   ├── vite-env.d.ts
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.tsx     # Sticky, compact-on-scroll, mobile menu
│   │   │   └── Footer.tsx
│   │   ├── ui/                # Reusable primitives
│   │   │   ├── Button.tsx
│   │   │   ├── Icon.tsx       # Inline SVG icon set
│   │   │   ├── Logo.tsx
│   │   │   ├── Sparkline.tsx  # Smooth SVG sparkline
│   │   │   └── CandleChart.tsx
│   │   ├── Hero.tsx
│   │   ├── MarketTicker.tsx
│   │   ├── MarketOverview.tsx
│   │   ├── MarketCard.tsx
│   │   ├── SectorPerformance.tsx
│   │   ├── MarketBreadth.tsx
│   │   ├── AIAnalystPreview.tsx
│   │   ├── IntelligenceGrid.tsx
│   │   ├── IntelligenceCard.tsx
│   │   ├── StockPreview.tsx
│   │   ├── GlobalMarkets.tsx
│   │   ├── AlertPreview.tsx
│   │   ├── Trust.tsx
│   │   └── CTA.tsx
│   ├── pages/
│   │   ├── Home.tsx           # Assembles all homepage sections
│   │   └── Placeholder.tsx    # Shared "coming later" route page
│   ├── data/                  # ← MOCK DATA LAYER (replace with APIs)
│   │   ├── generators.ts      # Deterministic spark/candle generators
│   │   ├── mockMarkets.ts
│   │   ├── mockStocks.ts
│   │   ├── mockSectors.ts
│   │   ├── mockNews.ts
│   │   ├── mockAlerts.ts
│   │   └── mockAI.ts
│   ├── config/
│   │   └── nav.ts             # Primary + company nav links
│   ├── hooks/
│   │   ├── useReveal.ts       # IntersectionObserver scroll reveal
│   │   └── useScrolled.ts
│   ├── lib/
│   │   └── format.ts          # INR/USD/Pct formatters + cn()
│   └── types/
│       └── index.ts           # Shared domain types
```

## Routes

| Route         | Status (Phase 0)                              |
| ------------- | --------------------------------------------- |
| `/`           | Full homepage                                 |
| `/markets`    | Placeholder (reserved for next phase)         |
| `/research`   | Placeholder                                   |
| `/watchlist`  | Placeholder                                   |
| `/news`       | Placeholder                                   |
| `/analyst`    | Placeholder                                   |
| `/about`, `/contact`, `/privacy`, `/terms` | Placeholder / 404 |

Placeholders share the `Navbar` so navigation always works.

## Replacing mock data with real APIs

The data layer is deliberately isolated so components never import directly
from a transport. Each `mock*.ts` file exports typed arrays/objects that
conform to `src/types`. To integrate a real API in a later phase:

1. Create a service module (e.g. `src/services/marketData.ts`) that returns
   `Promise<MarketIndex[]>` etc., matching the existing types.
2. Add a data-fetching hook (e.g. `useMarketIndices()`) using whatever cache
   library the team chooses (TanStack Query, SWR, RTK Query, etc.).
3. Swap the static import for the hook inside each section component. No
   presentational changes needed — components already consume typed data.

Domain types to honor: `MarketIndex`, `Sector`, `MarketBreadth`,
`StockSnapshot`, `NewsItem`, `MarketAlert`, `MacroIndicator`, `AIMessage`,
`AIEvidence`, `IntelligenceFeature`.

## Accessibility

- Semantic landmarks (`header`, `nav`, `main`, `footer`, `section`,
  `article`).
- Skip-to-content link.
- Visible brand-aligned focus rings on all interactive elements.
- ARIA labels on icon-only buttons, `aria-expanded`/`aria-controls` on the
  mobile menu, `role="tablist"` on stock tabs.
- Decorative SVGs use `aria-hidden`; meaningful charts include `role="img"`
  with descriptive labels.
- Color contrasts meet WCAG AA against cream/white.
- `prefers-reduced-motion` disables animations/transitions globally.

## Performance & responsive

- Manual chunk splitting for `react`/`react-dom`/`react-router-dom`.
- No image assets (logos and charts are SVG/CSS); fonts are preconnected.
- Tested layouts at 1440/1280/1024/768/390/375. Mobile uses re-flowed
  layouts, not scaled-down desktop ones.
- Ticker uses `transform: translateX` for GPU-friendly animation and pauses on
  hover; edge masks prevent overflow.

## Product principles enforced

The interface communicates **DATA → CONTEXT → ANALYSIS → DECISION SUPPORT**.
It deliberately does **not** promise returns, "AI picks", or predictions. AI
is framed as evidence-based explanation with explicit confidence and
uncertainty.

---

© Finova. Market data shown is fictional/demo and for educational purposes only.

---

## Phase 3B — Live LLM gateway (Analyst API)

The Analyst UI reasons through a **secure server-side LLM gateway**. The
browser NEVER holds an LLM API key.

```
User → Analyst UI → agentAnalystEngine → createApiBoundaryProvider()
   → FINOVA_ANALYST_API_URL → Analyst API gateway (server)
   → createOpenAICompatibleProvider (server-side credentials)
   → LLM → dynamic Finova tools → structured AnalystResponse → Analyst UI
```

### Architecture

| Layer | Where | Files |
| --- | --- | --- |
| Analyst engine + orchestrator | browser | `src/analyst/agent/*` (Phase 3A, unchanged) |
| Browser boundary provider | browser | `createApiBoundaryProvider` in `src/analyst/agent/openaiCompatible.ts` |
| Wire contract | shared | `src/analyst/api/contract.ts` |
| Gateway (validation, limits, provider wiring) | server | `src/analyst/server/gateway.ts` |
| HTTP framing (CORS, body cap, rate limit, deadline) | server | `src/analyst/server/http.ts` |
| Server env (credentials) | server | `src/analyst/server/env.ts` |
| Local dev server | server | `src/analyst/server/server.ts` (`npm run server`) |
| Serverless entry | server | `src/analyst/server/handler.ts` |

The gateway reuses the Phase 3A `createOpenAICompatibleProvider` — the same
provider abstraction, instantiated server-side with server-only credentials.

### Local development

```bash
# Terminal 1 — the gateway (reads SERVER-ONLY env vars)
$env:FINOVA_LLM_PROVIDER='openai-compatible'   # PowerShell; export in bash/zsh
$env:FINOVA_LLM_API_KEY='sk-...'               # SERVER-ONLY
$env:FINOVA_LLM_MODEL='gpt-4o-mini'
$env:FINOVA_LLM_BASE_URL='https://api.openai.com/v1'
npm run server                                 # http://localhost:8787/api/analyze

# Terminal 2 — the frontend (reads the CLIENT-SAFE var)
$env:FINOVA_ANALYST_API_URL='http://localhost:8787/api/analyze'
npm run dev
```

`npm run server` also auto-loads a root `.env` file (Node's
`--env-file-if-exists`, server process only — never Vite/browser code), so you
can keep the `FINOVA_LLM_*` variables in `.env` instead of exporting them per
shell. Real shell exports always win over `.env` values.

**No API key?** Leave `FINOVA_LLM_API_KEY` (and/or
`FINOVA_ANALYST_API_URL`) unset. The app runs the deterministic offline demo,
never crashes and never calls a provider. All tests are mocked — no real API
is ever required.

### Environment variables

| Variable | Category | Used by | Purpose |
| --- | --- | --- | --- |
| `FINOVA_ANALYST_API_URL` | CLIENT-SAFE | Vite build | Public gateway URL; inlined into the bundle |
| `FINOVA_LLM_PROVIDER` | SERVER-ONLY | gateway | Provider seam (`openai-compatible`) |
| `FINOVA_LLM_API_KEY` | SERVER-ONLY SECRET | gateway | Provider API key |
| `FINOVA_LLM_MODEL` | SERVER-ONLY | gateway | Model name |
| `FINOVA_LLM_BASE_URL` | SERVER-ONLY | gateway | OpenAI-compatible base URL |
| `FINOVA_LLM_TIMEOUT_MS` | SERVER-ONLY | gateway | Upstream timeout (default 30000) |
| `FINOVA_ANALYST_PORT` | SERVER-ONLY | gateway | Dev port (default 8787) |
| `FINOVA_GATEWAY_RATE_LIMIT` | SERVER-ONLY | gateway | Per-IP req/min (default 60, 0 disables) |
| `FINOVA_GATEWAY_CORS_ORIGIN` | SERVER-ONLY | gateway | CORS origin (default `*`) |
| `FINOVA_EIA_API_KEY` | SERVER-ONLY OPTIONAL | market-data gateway | Optional free EIA Open Data key for daily Brent/WTI; without it petroleum data remains unavailable/demo-labelled |

Vite exposes exactly one Finova variable to the browser
(`FINOVA_ANALYST_API_URL`, via `envPrefix` in `vite.config.ts`). Every
`FINOVA_LLM_*` variable is unreachable from client code by construction, and
the automated security tests (`src/analyst/server/__tests__/security.test.ts`)
build the production bundle with a fake secret and verify it never appears.

### Deployment

1. **Frontend** — build with `FINOVA_ANALYST_API_URL` set to the deployed
   gateway URL, host `dist/` as static files (Netlify, Vercel, etc.).
2. **Gateway** — deploy `src/analyst/server/handler.ts` as a Node serverless
   function (Vercel-style `(req, res)` signature), or run
   `npm run server` on any Node host. Set the `FINOVA_LLM_*` variables in the
   platform's secret store — never in frontend env or the repository.
3. Prefer the platform's own rate limiting for production; the built-in
   in-memory limiter is per-process and suitable for single instances.

### Security model

- API keys exist only in the server runtime; the browser only knows the
  public gateway URL.
- The gateway validates request size, question length, history size, tool
  catalog and tool names (restricted to the registered Finova registry).
- Provider errors are mapped to fixed, sanitized messages — keys, headers,
  stack traces and internal paths never reach the client.
- Tool execution stays client-side against the deterministic Phase 2E
  registry (Phase 3A bounded orchestration remains authoritative); the
  gateway independently rejects any non-registry tool call from the model.
- Limits: 256 KB body, 48 messages, 8 KB question, 20 tool definitions,
  16 tool calls per response, 8 KB per argument object, 45 s deadline.

---

## Phase 3C.1 — Web search evidence layer

The Analyst agent can consult **current web context** (news, events,
announcements) through a bounded, honest search pipeline. The browser never
holds a search API key: searches run through the same server-side gateway as
the LLM, and every result is normalized, deduplicated and budgeted before it
becomes evidence.

```
LLM → searchWeb tool → browser orchestrator → WebSearchTransport
   → POST /api/search → server provider (Tavily / Brave)
   → normalization / dedupe / evidence budget / cache
   → validated WebSearchResult evidence → orchestrator
   → LLM synthesis → AnalystResponse + sources
```

### Supported providers

| Provider | Endpoint | When to use |
| --- | --- | --- |
| **Tavily** | `https://api.tavily.com/search` | General market/news research; `published_date` and `include_domains` support |
| **Brave Search** | `https://api.search.brave.com/res/v1/web/search` | Alternative index; `freshness` window derived from `recencyDays` |

Select the provider with `FINOVA_WEB_SEARCH_PROVIDER` and supply its API key
in `FINOVA_WEB_SEARCH_API_KEY`.

### Environment variables

| Variable | Category | Used by | Purpose |
| --- | --- | --- | --- |
| `FINOVA_ANALYST_API_URL` | CLIENT-SAFE | Vite build | Public gateway URL; the ONLY Finova variable the browser sees |
| `FINOVA_WEB_SEARCH_PROVIDER` | SERVER-ONLY | gateway | Provider seam (`tavily` or `brave`, default `tavily`) |
| `FINOVA_WEB_SEARCH_API_KEY` | SERVER-ONLY SECRET | gateway | Provider API key — never a `VITE_` var, never in the bundle |
| `FINOVA_WEB_SEARCH_BASE_URL` | SERVER-ONLY | gateway | Optional provider endpoint override (self-hosted) |
| `FINOVA_WEB_SEARCH_TIMEOUT_MS` | SERVER-ONLY | gateway | Provider call timeout (default 15000, max 60000) |
| `FINOVA_WEB_SEARCH_CACHE_TTL_MS` | SERVER-ONLY | gateway | Response cache TTL (default 300000 ms) |
| `FINOVA_WEB_SEARCH_CACHE_MAX` | SERVER-ONLY | gateway | Response cache capacity (default 100, LRU) |

**All `FINOVA_WEB_SEARCH_*` variables are SERVER-ONLY.** They must never use
a `VITE_` prefix and are unreachable from client code by construction
(`vite.config.ts` exposes exactly one Finova variable:
`FINOVA_ANALYST_API_URL`). The security tests build the production bundle with
a fake search key and verify it never appears.

### Local development

```bash
# Terminal 1 — the gateway (SERVER-ONLY web search vars)
$env:FINOVA_LLM_API_KEY='sk-...'                # LLM key (Phase 3B)
$env:FINOVA_WEB_SEARCH_PROVIDER='tavily'
$env:FINOVA_WEB_SEARCH_API_KEY='tvly-...'       # SERVER-ONLY
npm run server                                  # http://localhost:8787/api/analyze + /api/search

# Terminal 2 — the frontend
$env:FINOVA_ANALYST_API_URL='http://localhost:8787/api/analyze'
npm run dev
```

**No search key?** Leave `FINOVA_WEB_SEARCH_API_KEY` unset. `searchWeb`
reports `available=false` ("not configured") and the agent answers from
Finova's deterministic tools — it never simulates a search.

### Search limits (approved, enforced on both sides)

| Limit | Value |
| --- | --- |
| Web searches per session | 4 |
| Results per search | 8 (default 5) |
| Query length | 400 characters |
| Recency window | 3650 days (1 optional filter) |
| Domain filters | 1 |
| Snippet length | 500 characters |
| Evidence budget per search | 12,000 characters |
| Client transport timeout | 30 s |
| Provider timeout | 15 s (one transient retry) |
| Server cache | 300 s TTL, 100 entries |

Finova's existing **13-tool registry remains authoritative** — `searchWeb` is
a bounded 14th capability offered only when the session actually has a search
gateway, and it still counts against the session's tool-call budget.

### Honesty model

- `searchWeb` returns **only real, validated sources** — title, URL, snippet,
  and a publication date **only when the provider actually supplied one**
  (`publishedAt: null` never becomes a guessed date).
- There is **no arbitrary URL fetching**: search results are snippets from
  the provider; nothing ever fetches or executes the cited URLs.
- Snippets are **evidence, not automatically truth**. The model is instructed
  to quote only what a snippet actually says, and important claims should be
  cross-checked.
- Provider failures (unavailable, timeout, rate limit, bad key) map to
  **sanitized errors** — the agent reports the failure honestly and answers
  from available Finova evidence; it never fabricates web claims or sources.
- Conflicting sources are represented as disagreement, never silently
  resolved into a fake conclusion.

### Security model

- `FINOVA_WEB_SEARCH_API_KEY` exists only in the server runtime; the browser
  sends only `{ query, maxResults, recencyDays, domainFilter }` to
  `/api/search` (same CORS/rate-limit/body-cap/deadline protections as
  `/api/analyze`).
- Provider modules (`src/analyst/websearch/server/*`,
  `src/analyst/websearch/providers/*`) are unreachable from the browser entry
  graph — verified by the security tests.
- Provider error text is redacted server-side; the client only ever sees the
  fixed sanitized `{ code, message }` shapes.

No Phase 3C.2 functionality (URL fetching, news feeds, scraping, embeddings,
RAG) is included in this phase.

---

## Phase 3D.1 — Conversation & context intelligence

A deterministic, session-only conversational-context layer (`src/analyst/conversation/`)
that lets the analyst agent carry context across turns without storing anything
on disk or inventing facts.

### What it does

- **Entities** — instruments mentioned by the user are remembered with canonical
  ids (`nifty-50`, `TCS`, ...), display names and freshness labels. The latest
  mention becomes the conversation topic.
- **References** — pronouns ("it", "this", "they"), role phrases ("the index",
  "the sector") and comparison references ("which one", "the stronger one")
  resolve against the active memory with a confidence level
  (high / medium / low / unresolved).
- **Corrections** — "Actually, I meant Infosys" is detected deterministically and
  recorded as an explicit walk-back (`TCS → INFY`), never silently re-interpreted.
- **Comparison continuity** — "Compare NIFTY 50 and Bank Nifty" then "Which one
  is stronger?" keeps the active pair and its dimensions across turns.
- **Temporal context** — relative time phrases ("this week", "last few days",
  "yesterday", weekdays) are normalized against the analyst clock.
- **Clarification** — references that cannot be resolved with confidence are
  surfaced as `needsClarification` instead of being guessed.
- **Bounded context** — everything is capped (max 8 active entities, 3 recent,
  12 findings, 12 sources, 12 evidence results, `maxContextChars` payload cap)
  with FIFO eviction; the payload explicitly states it is session-only memory,
  never fresh tool evidence.

### Design rules

- The conversation layer is **context infrastructure only**: it extracts,
  remembers, resolves and summarizes. The LLM remains the semantic reasoner —
  there is no intent router and no "if user says X → call tool Y" logic.
- Nothing is fabricated: unknown references stay unresolved, no absolute
  dates are invented, and the user's message text is never rewritten.
- `resolve(text, now)` is pure; `update(resolution, input)` mutates the session.
  Every turn is recorded (response summary, evidence, sources, corrections)
  with turn provenance and freshness.

### Wiring

- The orchestrator resolves the turn before the agent loop and injects the
  context as a system message; after the response, the turn is recorded back.
- Tool evidence is attributed to the resolved entity id (e.g. a
  `getTechnicalAnalysis` result for `nifty-50`), so later turns can reuse
  fresh evidence instead of rerunning tools.
- `resetAgentConversation()` (called by the UI reset) clears the session;
  `suggestConversationFollowUps()` feeds the suggestion chips.
- All conversation state is per-session and in-memory only. Nothing crosses
  the server boundary, no secrets, no network — verified by security tests.

---

## Phase 3N — Natural Intelligence Overhaul

Makes the analyst answer like an analyst in a conversation, not like a chatbot
filling a template — without touching evidence honesty, provenance or
validation. See `PHASE_3N_REPORT.md` for the full evaluation.

- **Adaptive depth** — the UNDERSTAND stage estimates each question's depth
  (`brief` / `standard` / `deep`); the orchestrator passes it to the model so
  "How is NIFTY doing?" gets a short answer and an outlook question gets
  structured depth.
- **Natural conduct instructions** — the system prompt now bans chatbot filler
  and tool-run narration, opens with the answer, references prior turns like a
  colleague, allows honest "I don't know", challenges wrong premises with
  evidence, acknowledges corrections once, and labels opinions as inferences.
- **Minimum sufficient investigation** — prompt-level heuristic to reuse
  session evidence and avoid multi-tool investigations for simple questions
  (the LLM stays the primary reasoner; no hard tool caps).
- **Stage-aware loading statuses** — `loadingStages(hint?)` returns
  intent- and subject-specific statuses (e.g. "Checking the likely drivers…");
  the pending message in the analyst UI shows them.
- **Natural fallbacks** — deterministic synthesis and memory-recall answers
  read naturally and honestly, opening with the answer rather than announcing
  their own machinery (Phase 3N.2), while keeping their honesty labels
  (`partial`, "evidence already gathered", the Finova-tool honesty limit).
- **Regression** — 523 tests pass (22 new naturalness tests), `tsc -b` clean,
  production build clean.

---

## Phase 3N.1 — Natural Analyst V2 + Live Intelligence

Builds on Phase 3N with two upgrades — a more natural analyst, and live news as
a first-class, evidence-producing capability. Evidence honesty, provenance and
validation are unchanged. See `PHASE_3N_1_REPORT.md` for the full evaluation.

- **Natural Analyst V2** — the prompt now also demands answer compression,
  a natural reaction to what the user said (agree where you agree, differ
  plainly where you differ), dynamic formatting (sections/tables only when they
  organize the answer), at most one genuinely useful follow-up per answer, and
  "stable knowledge vs fresh data" tool restraint.
- **Live news (`searchNews`)** — a new tool that reuses the Phase 3C.1 search
  gateway. The model names a subject; the deterministic news layer builds the
  query, then adds honesty signals on top of the same validated provider
  output: a freshness tier (`breaking`/`today`/`recent`/`older`) derived only
  from real publication dates, a source-quality tier (curated major outlets),
  story clustering with corroboration counts ("multiple outlets report"), and
  relevance filtering that never empties the answer.
- **News memory** — the conversation layer remembers the session's news stories
  (bounded, deduped, freshness-labeled) and surfaces a "Recent news" section in
  the LLM context, so follow-ups reuse fresh news instead of re-searching.
- **Sources in the UI** — every cited source now renders in the response card
  with its outlet, freshness badge, corroboration count and publication date.
- **Live-news conduct in the prompt** — reported vs confirmed, "never claim a
  story is verified just because it is reported", no article dumps, an honest
  minimum-useful answer when there is no coverage, and search output treated as
  untrusted data (prompt-injection defence).
- **Regression** — 561 tests pass (523 baseline + 38 new), `tsc -b` clean,
  production build clean.

---

## Phase 3N.2 — Conversational Response Intelligence

Builds on Phase 3N and Phase 3N.1 so the analyst's *responses* read like an
analyst's answer — answer first, evidence consolidated, contradictions
surfaced, sources subordinate — instead of a dump of internal tool/evidence
machinery. Evidence honesty, provenance, validation and the news architecture
are unchanged. See `PHASE_3N_2_REPORT.md` for the full evaluation.

- **Answer-first synthesis** — the summary opens with the answer, built only
  from real tool output ("Gold (spot) is at $2,512, +0.22% on the day, based
  on the available market data."), never a meta-announcement about the session.
- **Tool-name suppression** — searchNews, searchWeb, getMacroContext,
  getTechnicalAnalysis, getConfluence, getMarketSnapshot, getMarketBreadth and
  getHistoricalValidation never appear in normal prose, headings or findings
  (the exception: the user explicitly asks which tools were used).
- **Deterministic consolidation** — exact-duplicate sections are folded,
  repeated headings are disambiguated by instrument, empty sections are
  dropped, and repeated metrics/caveats are detected — never merging content
  blindly.
- **Contradictions surfaced, never averaged** — opposite signals across
  evidence groups render as an honest "the evidence is split" section; the
  prompt tells the model to prefer the freshest/most relevant evidence and say
  so.
- **News as themes, not dumps** — stories render as short citation lines
  (outlet: headline, "reported by N outlets"); sources stay attached as
  structured evidence for the UI, subordinate to the answer.
- **Deterministic in code, not a bigger prompt** — a new
  `responseIntelligence` module enforces the seams; a post-validation hygiene
  pass refines every LLM final.
- **Regression** — 598 tests pass (572 baseline + 26 new RI tests), `tsc -b`
  clean, production build clean.

---

© Finova. Market data shown is fictional/demo and for educational purposes only.

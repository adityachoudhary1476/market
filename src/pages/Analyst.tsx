import { useEffect, useMemo, useRef, useState } from 'react'
import { useAnalyst } from '@/analyst/useAnalyst'
import { InsightCard } from '@/components/analyst/InsightCard'
import { AnalystResponseCard } from '@/components/analyst/AnalystResponseCard'
import { AnalystThinking } from '@/components/analyst/AnalystThinking'
import {
  IconBrain,
  IconSend,
  IconArrowRight,
  IconBolt,
  IconScale,
  IconCompass,
  IconTarget,
  IconRefresh,
  IconSearch,
  IconCalendar,
} from '@/components/ui/Icon'
import { usePageMeta } from '@/hooks/usePageMeta'
import { cn } from '@/lib/format'

const MODES = [
  { id: 'analyze', label: 'Analyze', prompt: 'What is happening in the market today?', icon: IconCompass, desc: 'Find patterns and explain what is moving' },
  { id: 'plan', label: 'Plan', prompt: 'Build me a plan for today’s session', icon: IconTarget, desc: 'Turn a goal into an actionable plan' },
  { id: 'compare', label: 'Compare', prompt: 'Compare sectors today', icon: IconScale, desc: 'Compare sectors, indices, or performance' },
  { id: 'explain', label: 'Explain', prompt: 'Why is the market moving today?', icon: IconBrain, desc: 'Explain why a metric changed' },
  { id: 'detect', label: 'Detect', prompt: 'Find unusual activity in the market', icon: IconBolt, desc: 'Find anomalies, risks, and unusual volume' },
  { id: 'next', label: 'What next?', prompt: 'What should I do next?', icon: IconArrowRight, desc: 'Get one prioritized next action' },
] as const

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning.'
  if (h < 17) return 'Good afternoon.'
  return 'Good evening.'
}

export default function Analyst() {
  usePageMeta(
    'Finova Markets — AI Analyst',
    'An intelligent layer over the market: patterns, explanations, comparisons and next actions, grounded in real data.',
  )
  const { context, insights, suggestions, messages, loading, error, send, reset, retry } = useAnalyst()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const hasConversation = messages.length > 0

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const submit = (text?: string) => {
    const q = (text ?? input).trim()
    if (!q || loading) return
    setInput('')
    send(q)
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const regimeLabel = useMemo(
    () => context.regime.replace('-', ' '),
    [context.regime],
  )

  return (
    <div className="bg-ivory-100 pt-24 sm:pt-28">
      <div className="container-page pb-28">
        {/* Header */}
        <header className="flex flex-col gap-4 border-b border-obsidian-900/[0.07] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-obsidian-800 text-gold-300">
                <IconBrain size={18} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-widest2 text-gold-700">
                AI Analyst
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gain-soft px-2 py-0.5 text-[10px] font-semibold text-gain">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-gain" />
                Analyst ready
              </span>
            </div>
            <h1 className="mt-3 font-display text-display-md font-semibold text-obsidian-900">
              Your intelligent layer for the market
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-stone-600 sm:text-base">
              Patterns, explanations and next actions — grounded in the market
              data on this platform, not guesswork.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-obsidian-900/[0.07] bg-white/70 px-4 py-2.5 text-right">
              <div className="text-[9px] font-bold uppercase tracking-widest2 text-stone-400">Session regime</div>
              <div className="mt-0.5 font-display text-sm font-semibold capitalize text-obsidian-900">{regimeLabel}</div>
            </div>
            {hasConversation && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-full border border-obsidian-900/15 px-3 py-2 text-xs font-semibold text-stone-700 transition-colors hover:border-obsidian-800/40 hover:text-obsidian-900"
              >
                <IconRefresh size={13} />
                New analysis
              </button>
            )}
          </div>
        </header>

        {/* Conversation OR dashboard */}
        {hasConversation ? (
          <div ref={scrollRef} className="mt-8 max-w-3xl space-y-6">
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-obsidian-800 px-4 py-3 text-sm text-ivory-50 shadow-soft">
                    {m.text}
                  </div>
                </div>
              ) : m.pending ? (
                <AnalystThinking key={m.id} stages={m.stages} />
              ) : m.response ? (
                <AnalystResponseCard key={m.id} response={m.response} />
              ) : null,
            )}

            {error && (
              <div className="rounded-2xl border border-loss/30 bg-loss-soft/60 p-4">
                <p className="text-sm font-medium text-loss">{error}</p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-loss px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <IconRefresh size={12} /> Try again
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-8">
            {/* Greeting + insights */}
            <section aria-labelledby="greeting">
              <h2 id="greeting" className="font-display text-2xl font-semibold text-obsidian-900 sm:text-3xl">
                {greeting()}
              </h2>
              <p className="mt-1 text-stone-600">Here’s what I noticed in today’s session.</p>
            </section>

            <section aria-labelledby="insights" className="mt-6">
              <div className="mb-3 flex items-center gap-2">
                <h3 id="insights" className="text-[11px] font-bold uppercase tracking-widest2 text-stone-500">
                  What I noticed
                </h3>
                <span className="h-px flex-1 bg-obsidian-900/[0.07]" />
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {insights.map((ins) => (
                  <InsightCard key={ins.id} insight={ins} onAction={submit} />
                ))}
              </div>
            </section>

            {/* Analysis modes */}
            <section aria-labelledby="modes" className="mt-12">
              <h3 id="modes" className="mb-3 text-[11px] font-bold uppercase tracking-widest2 text-stone-500">
                Analysis modes
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {MODES.map((m) => {
                  const Icon = m.icon
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => submit(m.prompt)}
                      className="group flex items-start gap-3 rounded-2xl border border-obsidian-900/[0.08] bg-white/70 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-gold-500/40 hover:shadow-card"
                    >
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-obsidian-800/[0.06] text-obsidian-800 transition-colors group-hover:bg-gold-500/15 group-hover:text-gold-700">
                        <Icon size={19} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-obsidian-900">{m.label}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-stone-500">{m.desc}</span>
                      </span>
                      <IconArrowRight size={15} className="ml-auto mt-1 shrink-0 text-stone-300 transition-all group-hover:translate-x-0.5 group-hover:text-gold-600" />
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Signature quick actions */}
            <section aria-labelledby="signature" className="mt-12 grid gap-4 md:grid-cols-3">
              {[
                { title: 'Daily briefing', desc: 'The five things that matter today.', prompt: "Give me today's briefing", icon: IconCalendar },
                { title: 'What am I missing?', desc: 'Things beneath the headline index.', prompt: 'What am I missing?', icon: IconSearch },
                { title: 'What should I do next?', desc: 'One prioritized action, not fifteen.', prompt: 'What should I do next?', icon: IconTarget },
              ].map((q) => {
                const Icon = q.icon
                return (
                  <button
                    key={q.title}
                    type="button"
                    onClick={() => submit(q.prompt)}
                    className="group relative overflow-hidden rounded-2xl border border-obsidian-900/[0.08] bg-obsidian-900 p-6 text-left text-ivory-50 transition-all hover:-translate-y-0.5 hover:shadow-card"
                  >
                    <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gold-500/15 blur-2xl" />
                    <Icon size={20} className="text-gold-300" />
                    <h4 className="mt-3 font-display text-lg font-semibold">{q.title}</h4>
                    <p className="mt-1 text-sm text-ivory-100/70">{q.desc}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-gold-300">
                      Run analysis
                      <IconArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                )
              })}
            </section>
          </div>
        )}

        {/* Composer */}
        <div className="sticky bottom-4 z-30 mt-10">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-2xl border border-obsidian-900/[0.1] bg-white/90 p-2.5 shadow-card backdrop-blur-md">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  rows={1}
                  placeholder="Ask your analyst anything…  (e.g. Why is NIFTY moving?)"
                  className="max-h-36 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-obsidian-900 placeholder:text-stone-400 focus:outline-none"
                  aria-label="Ask the analyst"
                />
                <button
                  type="button"
                  onClick={() => submit()}
                  disabled={!input.trim() || loading}
                  aria-label="Send"
                  className={cn(
                    'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all',
                    input.trim() && !loading
                      ? 'bg-obsidian-800 text-ivory-50 hover:bg-obsidian-900'
                      : 'cursor-not-allowed bg-stone-100 text-stone-400',
                  )}
                >
                  <IconSend size={17} className={cn(loading && 'animate-pulse')} />
                </button>
              </div>

              {/* Suggested questions */}
              {!hasConversation && (
                <div className="flex flex-wrap gap-1.5 px-1.5 pb-1 pt-1">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => submit(s)}
                      className="rounded-full border border-obsidian-900/[0.08] bg-ivory-50 px-2.5 py-1 text-[11px] font-medium text-stone-600 transition-colors hover:border-gold-500/40 hover:text-obsidian-900"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-2 text-center text-[10px] text-stone-400">
              Analysis is derived from market data on this platform and is for
              informational purposes only — not investment advice.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

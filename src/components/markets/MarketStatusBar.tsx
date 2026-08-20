import type { MarketStatusData } from '@/types'
import { formatNumber, cn } from '@/lib/format'

interface MarketStatusBarProps {
  status: MarketStatusData
}

function Pill({
  label,
  children,
  tone = 'neutral',
}: {
  label: string
  children: React.ReactNode
  tone?: 'positive' | 'negative' | 'neutral'
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-gain'
      : tone === 'negative'
        ? 'text-loss'
        : 'text-obsidian-800'
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5 sm:px-5">
      <span className="text-[9px] font-semibold uppercase tracking-widest2 text-stone-400">
        {label}
      </span>
      <span className={cn('text-sm font-semibold tabular', toneClass)}>{children}</span>
    </div>
  )
}

export function MarketStatusBar({ status }: MarketStatusBarProps) {
  const ratio = status.advancing / Math.max(1, status.declining)
  const fiiTone = status.fii === 'Positive' ? 'positive' : status.fii === 'Negative' ? 'negative' : 'neutral'
  const diiTone = status.dii === 'Positive' ? 'positive' : status.dii === 'Negative' ? 'negative' : 'neutral'

  return (
    <div className="card-surface overflow-x-auto">
      <div className="flex min-w-max divide-x divide-obsidian-900/[0.07]">
        <Pill label="NSE" tone={status.nse === 'Open' ? 'positive' : 'neutral'}>
          {status.nse}
        </Pill>
        <Pill label="BSE" tone={status.bse === 'Open' ? 'positive' : 'neutral'}>
          {status.bse}
        </Pill>
        <Pill label="Market Breadth">
          <span className="text-gain">{formatNumber(status.advancing)}</span>
          <span className="text-stone-300"> / </span>
          <span className="text-loss">{formatNumber(status.declining)}</span>
          <span className="text-stone-300"> / </span>
          <span className="text-stone-500">{status.unchanged}</span>
        </Pill>
        <Pill label="Advance / Decline" tone={ratio >= 1 ? 'positive' : 'negative'}>
          {ratio.toFixed(2)}
        </Pill>
        <Pill label="FII" tone={fiiTone}>
          {status.fii}
        </Pill>
        <Pill label="DII" tone={diiTone}>
          {status.dii}
        </Pill>
        <Pill label="Volatility" tone="neutral">
          {status.volatility}
        </Pill>
      </div>
    </div>
  )
}

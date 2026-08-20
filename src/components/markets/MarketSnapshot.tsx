import type { MarketSnapshotData } from '@/types'
import { cn } from '@/lib/format'

interface Props {
  snapshot: MarketSnapshotData
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm text-stone-600">{label}</span>
      <span className="text-sm font-semibold text-obsidian-900">{children}</span>
    </div>
  )
}

function sentimentTone(s: MarketSnapshotData['sentiment']) {
  if (s === 'Bullish') return 'bg-gain-soft text-gain'
  if (s === 'Cautious') return 'bg-loss-soft text-loss'
  return 'bg-stone-100 text-stone-700'
}

function flowTone(f: MarketSnapshotData['fii']) {
  if (f === 'Positive') return 'text-gain'
  if (f === 'Negative') return 'text-loss'
  return 'text-stone-600'
}

export function MarketSnapshot({ snapshot }: Props) {
  return (
    <div className="card-surface flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-obsidian-900">
          Market Snapshot
        </h2>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider',
            sentimentTone(snapshot.sentiment),
          )}
        >
          {snapshot.sentiment}
        </span>
      </div>

      <div className="mt-2 divide-y divide-obsidian-900/[0.06]">
        <Row label="Breadth">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-20 overflow-hidden rounded-full bg-stone-100">
              <span
                className="block h-full rounded-full bg-gain"
                style={{ width: `${snapshot.breadthPct}%` }}
              />
            </span>
            {snapshot.breadthPct}% adv.
          </span>
        </Row>
        <Row label="Volatility">{snapshot.volatility}</Row>
        <Row label="Volume">{snapshot.volume}</Row>
        <Row label="FII activity">
          <span className={flowTone(snapshot.fii)}>{snapshot.fii}</span>
        </Row>
        <Row label="DII activity">
          <span className={flowTone(snapshot.dii)}>{snapshot.dii}</span>
        </Row>
        <Row label="Global cues">{snapshot.globalCues}</Row>
      </div>

      <p className="mt-auto pt-4 text-[11px] italic leading-relaxed text-stone-400">
        Snapshot reflects current market conditions and is not a forecast.
      </p>
    </div>
  )
}

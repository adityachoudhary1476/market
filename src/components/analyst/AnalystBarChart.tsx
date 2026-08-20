import { useMemo } from 'react'
import type { AnalystChart } from '@/analyst/types'
import { cn } from '@/lib/format'

interface Props {
  chart: AnalystChart
  className?: string
}

export function AnalystBarChart({ chart, className }: Props) {
  const { bars, max, min, width, height, padY } = useMemo(() => {
    const values = chart.points.map((p) => p.value)
    const dataMax = Math.max(...values, 0)
    const dataMin = Math.min(...values, 0)
    const w = 520
    const h = 150
    const pY = 14
    const span = dataMax - dataMin || 1
    const n = chart.points.length
    const gap = 10
    const barW = n > 1 ? (w - gap * (n - 1)) / n : w * 0.4
    const baseline = h - pY - ((0 - dataMin) / span) * (h - pY * 2)

    const bars = chart.points.map((p, i) => {
      const x = i * (barW + gap)
      const y = h - pY - ((p.value - dataMin) / span) * (h - pY * 2)
      const positive = p.value >= 0
      const top = Math.min(y, baseline)
      const bh = Math.abs(y - baseline)
      return { x, y: top, h: bh, w: barW, positive, label: p.label, value: p.value }
    })
    return { bars, max: dataMax, min: dataMin, width: w, height: h, padY: pY }
  }, [chart])

  return (
    <div className={cn('rounded-xl border border-obsidian-900/[0.07] bg-white/60 p-4', className)}>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-widest2 text-stone-500">
          {chart.title}
        </h4>
        {chart.unit && <span className="text-[10px] text-stone-400">{chart.unit}</span>}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={chart.title}>
        {/* zero baseline */}
        {min < 0 && max > 0 && (
          <line x1="0" x2={width} y1={height - padY - ((0 - min) / (max - min || 1)) * (height - padY * 2)} y2={height - padY - ((0 - min) / (max - min || 1)) * (height - padY * 2)} stroke="rgba(11,12,11,0.18)" strokeDasharray="3 3" />
        )}
        {bars.map((b, i) => (
          <g key={i}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={Math.max(1, b.h)}
              rx="2"
              fill={b.positive ? '#3D7A52' : '#A85043'}
              opacity={0.85}
            >
              <animate attributeName="height" from="0" to={Math.max(1, b.h)} dur="0.5s" begin={`${i * 40}ms`} fill="freeze" />
              <animate attributeName="y" from={height - padY} to={b.y} dur="0.5s" begin={`${i * 40}ms`} fill="freeze" />
            </rect>
            <text x={b.x + b.w / 2} y={height - 2} textAnchor="middle" fontSize="9" fill="#8C887E">
              {b.label.length > 8 ? b.label.slice(0, 7) + '…' : b.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

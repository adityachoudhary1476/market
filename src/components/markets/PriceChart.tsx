import { useMemo, useRef, useState, useCallback } from 'react'
import type { IndexSeries } from '@/types'
import { useElementWidth } from '@/hooks/useElementWidth'
import { smoothPath, scaleLinear, niceBounds } from '@/lib/chartPath'
import { formatINR, formatCompactIN, formatIST, formatShortDate, cn } from '@/lib/format'

interface PriceChartProps {
  series: IndexSeries
  height?: number
  className?: string
  showVolume?: boolean
}

const UP = '#3D7A52'
const DOWN = '#A85043'
const GRID = 'rgba(11,12,11,0.08)'
const LABEL = '#8C887E'

export function PriceChart({ series, height = 320, className, showVolume = true }: PriceChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const up = series.trend !== 'down'
  const stroke = up ? UP : DOWN

  const layout = useMemo(() => {
    if (width === 0) return null
    const hasVol = showVolume && series.points.some((p) => p.volume != null)
    const padL = 8
    const padR = 8
    const padT = 18
    const priceH = hasVol ? height * 0.72 : height - padT - 24
    const volTop = padT + priceH + 14
    const volH = hasVol ? height - volTop - 22 : 0

    const innerW = Math.max(10, width - padL - padR)
    const n = series.points.length
    const stepX = n > 1 ? innerW / (n - 1) : innerW
    const x = (i: number) => padL + i * stepX

    const values = series.points.map((p) => p.v)
    const [lo, hi] = niceBounds(Math.min(...values), Math.max(...values), 0.08)
    const yPrice = scaleLinear([lo, hi], [padT + priceH, padT])

    const line = smoothPath(series.points.map((p, i) => ({ x: x(i), y: yPrice(p.v) })))
    const area = `${line} L ${x(n - 1).toFixed(2)} ${(padT + priceH).toFixed(2)} L ${x(0).toFixed(2)} ${(padT + priceH).toFixed(2)} Z`

    const volumes = series.points.map((p) => p.volume ?? 0)
    const maxVol = Math.max(...volumes, 1)

    // 4 horizontal grid lines + labels
    const gridLines = Array.from({ length: 4 }, (_, i) => {
      const t = i / 3
      const y = padT + t * priceH
      const val = hi - t * (hi - lo)
      return { y, val }
    })

    // x-axis labels: show 4–5 evenly-spaced labels that the data already provides
    const labelCount = width < 480 ? 3 : 5
    const step = Math.max(1, Math.floor(n / labelCount))
    const xLabels: { x: number; label: string }[] = []
    for (let i = 0; i < n; i += step) xLabels.push({ x: x(i), label: series.points[i].label })

    return {
      hasVol,
      width,
      height,
      padL,
      padR,
      padT,
      priceH,
      volTop,
      volH,
      innerW,
      n,
      x,
      yPrice,
      line,
      area,
      maxVol,
      gridLines,
      xLabels,
      stroke,
    }
  }, [width, height, series, showVolume, stroke])

  const handleMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!layout || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const rel = e.clientX - rect.left - layout.padL
      const i = Math.round(rel / (layout.innerW / Math.max(1, layout.n - 1)))
      setHover(Math.max(0, Math.min(layout.n - 1, i)))
    },
    [layout],
  )

  const point = hover != null && layout ? series.points[hover] : null
  const hoverX = hover != null && layout ? layout.x(hover) : 0
  const hoverY = hover != null && layout ? layout.yPrice(series.points[hover].v) : 0
  const isIntraday = series.timeframe === '1D'

  return (
    <div ref={ref} className={cn('relative w-full', className)} style={{ minHeight: height }}>
      {!layout && <div style={{ height }} aria-hidden />}

      {layout && (
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="overflow-visible touch-pan-y"
          role="img"
          aria-label={`${series.symbol} price chart for the ${series.timeframe} timeframe, currently ${formatINR(series.current)}`}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`pc-grad-${series.symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={layout.stroke} stopOpacity="0.16" />
              <stop offset="100%" stopColor={layout.stroke} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* horizontal grid + y labels */}
          {layout.gridLines.map((g, i) => (
            <g key={i}>
              <line x1={layout.padL} x2={layout.width - layout.padR} y1={g.y} y2={g.y} stroke={GRID} strokeDasharray="3 4" />
              <text x={layout.width - layout.padR} y={g.y - 4} textAnchor="end" fontSize="10" fill={LABEL}>
                {formatINR(g.val, 0)}
              </text>
            </g>
          ))}

          {/* area + line */}
          <path d={layout.area} fill={`url(#pc-grad-${series.symbol})`} />
          <path
            d={layout.line}
            fill="none"
            stroke={layout.stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* last-point marker */}
          <circle
            cx={layout.x(layout.n - 1)}
            cy={layout.yPrice(series.points[layout.n - 1].v)}
            r="3.5"
            fill={layout.stroke}
            stroke="#fff"
            strokeWidth="1.5"
          />

          {/* volume histogram */}
          {layout.hasVol &&
            series.points.map((p, i) => {
              const vol = p.volume ?? 0
              const h = (vol / layout.maxVol) * layout.volH
              const barUp =
                i === 0 || p.v >= series.points[i - 1].v
              return (
                <rect
                  key={i}
                  x={layout.x(i) - Math.max(1, layout.innerW / layout.n) * 0.35}
                  y={layout.volTop + layout.volH - h}
                  width={Math.max(1.5, (layout.innerW / layout.n) * 0.7)}
                  height={Math.max(1, h)}
                  rx="1"
                  fill={barUp ? UP : DOWN}
                  opacity={hover === i ? 0.55 : 0.22}
                />
              )
            })}

          {/* x labels */}
          {layout.xLabels.map((l, i) => (
            <text key={i} x={l.x} y={layout.height - 6} textAnchor="middle" fontSize="10" fill={LABEL}>
              {l.label}
            </text>
          ))}

          {/* hover crosshair + point */}
          {point && (
            <g pointerEvents="none">
              <line
                x1={hoverX}
                x2={hoverX}
                y1={layout.padT}
                y2={layout.hasVol ? layout.volTop + layout.volH : layout.height - 22}
                stroke={layout.stroke}
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.6"
              />
              <circle cx={hoverX} cy={hoverY} r="4.5" fill={layout.stroke} stroke="#fff" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}

      {/* Tooltip (HTML for crisp text / easy layout) */}
      {point && layout && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-obsidian-900/10 bg-white px-3 py-2 text-left shadow-card"
          style={{
            left: Math.min(Math.max(hoverX, 80), layout.width - 80),
            top: Math.max(hoverY - 12, 8),
          }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">
            {isIntraday ? formatIST(point.t) : formatShortDate(point.t)}
          </div>
          <div className="mt-0.5 font-display text-base font-semibold tabular text-obsidian-900">
            ₹{formatINR(point.v)}
          </div>
          {point.volume != null && (
            <div className="text-[10px] tabular text-stone-500">
              Vol {formatCompactIN(point.volume)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

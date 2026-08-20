import { useMemo } from 'react'
import { cn } from '@/lib/format'
import type { Trend } from '@/types'

interface SparklineProps {
  data: number[]
  trend?: Trend
  width?: number
  height?: number
  className?: string
  strokeWidth?: number
  filled?: boolean
  animate?: boolean
}

const strokeFor = (trend?: Trend) => {
  if (trend === 'down') return '#A85043'
  if (trend === 'flat') return '#A7A398'
  return '#3D7A52'
}

/**
 * Lightweight inline SVG sparkline. No chart library — computes a smooth
 * path and (optionally) a gradient area fill. Honors reduced motion via CSS.
 */
export function Sparkline({
  data,
  trend = 'up',
  width = 120,
  height = 36,
  className,
  strokeWidth = 1.75,
  filled = true,
  animate = true,
}: SparklineProps) {
  const { line, area, lastX, lastY } = useMemo(() => {
    if (data.length === 0) return { line: '', area: '', lastX: 0, lastY: 0 }
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const pad = 2
    const w = width
    const h = height - pad * 2
    const stepX = data.length > 1 ? w / (data.length - 1) : w

    const points = data.map((d, i) => {
      const x = i * stepX
      const y = pad + h - ((d - min) / range) * h
      return [x, y] as const
    })

    // Smooth Catmull-Rom -> cubic bezier
    let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] ?? points[i]
      const p1 = points[i]
      const p2 = points[i + 1]
      const p3 = points[i + 2] ?? p2
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6
      d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
    }

    const last = points[points.length - 1]
    const areaPath = `${d} L ${last[0].toFixed(2)} ${height} L 0 ${height} Z`
    return { line: d, area: areaPath, lastX: last[0], lastY: last[1] }
  }, [data, width, height])

  const stroke = strokeFor(trend)
  const gradId = useMemo(() => `spark-${Math.random().toString(36).slice(2, 9)}`, [])
  const len = Math.round(width * 1.2)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      role="img"
      aria-label={`${trend === 'up' ? 'Rising' : trend === 'down' ? 'Falling' : 'Flat'} trend sparkline`}
    >
      {filled && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradId})`} />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={
          animate
            ? ({
                strokeDasharray: len,
                strokeDashoffset: len,
                animation: 'draw-line 1.6s 0.1s ease-out forwards',
                ['--len' as string]: len,
              } as React.CSSProperties)
            : undefined
        }
      />
      <circle cx={lastX} cy={lastY} r={2.4} fill={stroke} />
    </svg>
  )
}

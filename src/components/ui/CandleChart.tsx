import { useMemo } from 'react'
import type { Trend } from '@/types'

interface CandleChartProps {
  candles: [number, number, number, number][]
  width?: number
  height?: number
  trend?: Trend
  className?: string
}

const UP = '#3D7A52'
const DOWN = '#A85043'

/**
 * Compact OHLC candle chart rendered as inline SVG. Used in the stock research
 * preview. Avoids external chart libraries to keep the bundle tiny.
 */
export function CandleChart({
  candles,
  width = 560,
  height = 220,
  trend = 'up',
  className,
}: CandleChartProps) {
  const { body, high, low, padX, padY, cw } = useMemo(() => {
    const highs = candles.map((c) => c[1])
    const lows = candles.map((c) => c[2])
    const max = Math.max(...highs)
    const min = Math.min(...lows)
    const range = max - min || 1
    const padX = 6
    const padY = 14
    const innerW = width - padX * 2
    const innerH = height - padY * 2
    const cw = innerW / candles.length
    const y = (v: number) => padY + innerH - ((v - min) / range) * innerH
    return {
      body: candles.map((c, i) => {
        const [o, h, l, cl] = c
        const up = cl >= o
        const x = padX + i * cw + cw * 0.2
        const w = cw * 0.6
        const yTop = y(Math.max(o, cl))
        const yBot = y(Math.min(o, cl))
        return {
          x,
          w,
          yTop,
          yBot: Math.max(yBot, yTop + 1),
          hx: x + w / 2,
          hy1: y(h),
          hy2: y(l),
          up,
        }
      }),
      high: max,
      low: min,
      padX,
      padY,
      cw,
    }
  }, [candles, width, height])

  // subtle price guide lines
  const guides = useMemo(() => {
    const lines: number[] = []
    for (let i = 1; i <= 3; i++) lines.push(low + ((high - low) * i) / 4)
    return lines
  }, [high, low])

  const yFor = (v: number) => {
    const range = high - low || 1
    const innerH = height - padY * 2
    return padY + innerH - ((v - low) / range) * innerH
  }

  const lineColor = trend === 'down' ? DOWN : UP

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      role="img"
      aria-label="Intraday price candle chart"
    >
      {guides.map((g, i) => (
        <line
          key={i}
          x1={padX}
          x2={width - padX}
          y1={yFor(g)}
          y2={yFor(g)}
          stroke="rgba(18,59,44,0.08)"
          strokeDasharray="3 4"
        />
      ))}
      {body.map((c, i) => (
        <g key={i}>
          <line
            x1={c.hx}
            x2={c.hx}
            y1={c.hy1}
            y2={c.hy2}
            stroke={c.up ? UP : DOWN}
            strokeWidth="1"
            opacity="0.7"
          />
          <rect
            x={c.x}
            y={c.yTop}
            width={c.w}
            height={Math.max(1.5, c.yBot - c.yTop)}
            fill={c.up ? UP : DOWN}
            rx="1"
          >
            <animate
              attributeName="height"
              from="0"
              to={Math.max(1.5, c.yBot - c.yTop)}
              dur="0.5s"
              begin={`${i * 18}ms`}
              fill="freeze"
              calcMode="spline"
              keySplines="0.22 1 0.36 1"
            />
            <animate
              attributeName="y"
              from={c.yBot}
              to={c.yTop}
              dur="0.5s"
              begin={`${i * 18}ms`}
              fill="freeze"
              calcMode="spline"
              keySplines="0.22 1 0.36 1"
            />
          </rect>
        </g>
      ))}
      {/* close-price trend line */}
      <path
        d={candles
          .map((c, i) => {
            const x = padX + i * cw + cw / 2
            const y = yFor(c[3])
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
          })
          .join(' ')}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.4"
        strokeOpacity="0.55"
        strokeLinecap="round"
      />
    </svg>
  )
}

// Small helpers for building smooth SVG paths from numeric series.

export interface SizedPoint {
  x: number
  y: number
}

/** Build a smooth (Catmull-Rom -> cubic bezier) SVG path through points. */
export function smoothPath(points: SizedPoint[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}

/** Linear scale factory: maps [dMin,dMax] to [rMax,rMin] (screen y is inverted). */
export function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0 || 1
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0)
}

/** "Nice" rounded axis bounds so price labels don't look arbitrary. */
export function niceBounds(min: number, max: number, pad = 0.06): [number, number] {
  const span = max - min || Math.abs(max) * 0.02 || 1
  const lower = min - span * pad
  const upper = max + span * pad
  return [lower, upper]
}

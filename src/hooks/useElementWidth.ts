import { useEffect, useRef, useState } from 'react'

/**
 * Measures an element's width via ResizeObserver. Returns a ref to attach and
 * the current pixel width (0 until measured). Used for responsive SVG charts.
 */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (typeof w === 'number') setWidth(Math.round(w))
    })
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  return { ref, width } as const
}

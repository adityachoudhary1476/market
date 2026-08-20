import { useEffect } from 'react'

/**
 * Imperatively sets document.title and meta description for a route.
 * Kept dependency-free; the homepage's static tags in index.html remain the
 * defaults and are restored on unmount.
 */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    const prevTitle = document.title
    document.title = title

    let descEl: HTMLMetaElement | null = null
    let prevDesc = ''
    if (description) {
      descEl =
        document.querySelector<HTMLMetaElement>('meta[name="description"]') ??
        null
      if (descEl) {
        prevDesc = descEl.getAttribute('content') ?? ''
        descEl.setAttribute('content', description)
      }
    }

    return () => {
      document.title = prevTitle
      if (descEl && prevDesc) descEl.setAttribute('content', prevDesc)
    }
  }, [title, description])
}

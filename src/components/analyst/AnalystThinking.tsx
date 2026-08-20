import { useEffect, useState } from 'react'
import { IconBrain } from '@/components/ui/Icon'
import { loadingStages } from '@/analyst/engine'

export function AnalystThinking({ stages }: { stages?: string[] }) {
  const defaultStages = loadingStages()
  const active = stages && stages.length > 0 ? stages : defaultStages
  const [i, setI] = useState(0)

  useEffect(() => {
    setI(0)
    const id = window.setInterval(() => {
      setI((v) => (v < active.length - 1 ? v + 1 : v))
    }, 550)
    return () => window.clearInterval(id)
  }, [active.length])

  return (
    <div className="flex gap-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-obsidian-800 text-gold-300">
        <IconBrain size={18} className="animate-pulse" />
      </span>
      <div className="rounded-2xl rounded-tl-sm border border-obsidian-900/[0.08] bg-white/70 px-4 py-3.5">
        <div className="flex items-center gap-2 text-sm font-medium text-obsidian-900">
          <span className="flex gap-1">
            {[0, 1, 2].map((d) => (
              <span
                key={d}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold-500"
                style={{ animationDelay: `${d * 140}ms`, animationDuration: '0.9s' }}
              />
            ))}
          </span>
          <span className="text-stone-500">{active[i]}</span>
        </div>
      </div>
    </div>
  )
}

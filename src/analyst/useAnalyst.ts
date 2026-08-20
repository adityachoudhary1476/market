import { useCallback, useMemo, useRef, useState } from 'react'
import type { AnalystContext, AnalystResponse, ConversationMessage } from './types'
import { agentAnalystEngine, resetAgentConversation, suggestConversationFollowUps, understandTurn, findEntityMentions } from './agent'
import { buildAnalystContext } from './buildContext'
import { loadingStages } from './engine'

const MAX_HISTORY = 20

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function useAnalyst() {
  const engine = agentAnalystEngine
  const context: AnalystContext = useMemo(() => buildAnalystContext(), [])
  const insights = useMemo(() => engine.insights(context), [engine, context])

  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<{ cancelled: boolean } | null>(null)

  // Phase 3D.1 — conversation-aware suggestions: memory-derived chips first,
  // then the deterministic engine suggestions. Recomputed each turn.
  const suggestions = useMemo(() => {
    const base = engine.suggest(context)
    const conv = suggestConversationFollowUps(engine)
    return conv.length > 0 ? [...conv, ...base].slice(0, 6) : base
  }, [engine, context, messages])

  const send = useCallback(
    async (text: string) => {
      const q = text.trim()
      if (!q || loading) return

      setError(null)
      const userMsg: ConversationMessage = {
        id: uid('u'),
        role: 'user',
        text: q,
        createdAt: new Date().toISOString(),
      }
      // Phase 3N — derive stage-aware loading statuses from the question so
      // the pending message describes what the analyst is actually doing.
      const understanding = understandTurn(q)
      const entityMention = findEntityMentions(q)[0]
      const subject = understanding.primary?.subject.label ?? entityMention?.displayName
      const pendingMsg: ConversationMessage = {
        id: uid('p'),
        role: 'analyst',
        text: '',
        pending: true,
        stages: loadingStages({ intent: understanding.intent, subject }),
        createdAt: new Date().toISOString(),
      }
      setMessages((m) => [...m, userMsg, pendingMsg].slice(-MAX_HISTORY))
      setLoading(true)
      const token = { cancelled: false }
      abortRef.current = token

      try {
        const history = messages
          .filter((m) => m.response)
          .slice(-6)
          .map((m) => m.response!)
        const response: AnalystResponse = await engine.generate({
          text: q,
          context,
          history,
        })
        if (token.cancelled) return
        setMessages((m) =>
          m
            .map((msg) =>
              msg.id === pendingMsg.id
                ? { ...msg, pending: false, text: response.summary ?? response.title, response }
                : msg,
            )
            .slice(-MAX_HISTORY),
        )
      } catch {
        if (token.cancelled) return
        setMessages((m) => m.filter((msg) => msg.id !== pendingMsg.id))
        setError('I couldn’t complete that analysis right now. Please try again.')
      } finally {
        if (!token.cancelled) setLoading(false)
      }
    },
    [loading, engine, context, messages],
  )

  const reset = useCallback(() => {
    abortRef.current?.cancelled && (abortRef.current.cancelled = true)
    // Phase 3D.1 — "New analysis" clears conversation memory too: a fresh
    // session inherits nothing.
    resetAgentConversation(engine)
    setMessages([])
    setError(null)
    setLoading(false)
  }, [engine])

  const retry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (lastUser) {
      setMessages((m) => m.slice(0, m.lastIndexOf(lastUser)))
      send(lastUser.text)
    }
  }, [messages, send])

  return {
    context,
    insights,
    suggestions,
    messages,
    loading,
    error,
    send,
    reset,
    retry,
  }
}

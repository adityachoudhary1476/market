// ---------------------------------------------------------------------------
// Phase 3D.1 — Conversation & Context Intelligence: session
//
// The session is the single handle the orchestrator and engine use. It owns
// the bounded ConversationState, resolves each user turn (pure) and records
// completed turns (mutating) — corrections, entity memory, temporal/comparison
// context, summaries, findings, tool evidence and sources. `reset` clears
// everything: a fresh session inherits nothing.
// ---------------------------------------------------------------------------

import type {
  ConversationConfig,
  ConversationSession,
  ConversationState,
  ConversationUpdateInput,
  TurnResolution,
} from './types'
import { DEFAULT_CONVERSATION_CONFIG } from './types'
import { createConversationState, recordCorrections, recordTurn, resetConversationState } from './state'
import { mergeEntityMemory } from './entities'
import { resolveTurn } from './resolution'

export function createConversationSession(
  config: Partial<ConversationConfig> = {},
  now: number = Date.now(),
): ConversationSession {
  const full: ConversationConfig = { ...DEFAULT_CONVERSATION_CONFIG, ...config }
  const state: ConversationState = createConversationState(now)

  return {
    get state(): ConversationState {
      return state
    },
    config: full,

    resolve(text: string, turnNow: number): TurnResolution {
      return resolveTurn(text, state, { now: turnNow, config: full })
    },

    update(resolution: TurnResolution, input: ConversationUpdateInput): void {
      recordTurn(state, full, resolution, input)
      mergeEntityMemory(state, full, resolution.interpretation.entities, state.turnCount, input.now)
      recordCorrections(state, full, resolution.corrections, state.turnCount)
    },

    reset(): void {
      resetConversationState(state, Date.now())
    },
  }
}
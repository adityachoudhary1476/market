// ---------------------------------------------------------------------------
// Phase 3B — Analyst API gateway: local dev / self-hosted server
//
// Run:  node --import tsx src/analyst/server/server.ts   (or: npm run server)
//
// Reads the SERVER-ONLY FINOVA_LLM_* environment variables and serves the
// gateway at:
//
//   POST http://localhost:8787/api/analyze
//
// The browser reaches it via FINOVA_ANALYST_API_URL (client-safe variable).
// ---------------------------------------------------------------------------

import http from 'node:http'
import { resolveServerEnv } from './env'
import { resolveSearchEnv } from '../websearch/server/env'
import { routeRequest } from './http'

const env = resolveServerEnv(process.env)
const searchEnv = resolveSearchEnv(process.env)

const server = http.createServer((req, res) => {
  void routeRequest(req, res, { env, searchEnv })
})

const port = env?.port ?? 8787
server.listen(port, () => {
  const model = env ? env.model : '(not configured)'
  // Dev-safe banner: provider/model only — never the API key.
  // eslint-disable-next-line no-console
  console.log(`[finova-gateway] listening on http://localhost:${port}/api/analyze and /api/search`)
  // eslint-disable-next-line no-console
  console.log(`[finova-gateway] llm provider: ${env?.provider ?? 'none'} · model: ${model}`)
  // eslint-disable-next-line no-console
  console.log(`[finova-gateway] search provider: ${searchEnv?.provider ?? 'none'}`)
  if (!env) {
    // eslint-disable-next-line no-console
    console.log('[finova-gateway] FINOVA_LLM_API_KEY is not set — /api/analyze will answer 503 provider-not-configured.')
  }
  if (!searchEnv) {
    // eslint-disable-next-line no-console
    console.log('[finova-gateway] no FINOVA_WEB_SEARCH_API_KEY is set — /api/search will answer 503 provider-not-configured.')
  }
})

server.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[finova-gateway] server error:', err.message)
  process.exitCode = 1
})
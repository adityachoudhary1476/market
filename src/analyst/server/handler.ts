// ---------------------------------------------------------------------------
// Phase 3B — Analyst API gateway: serverless function entry
//
// Deploy this file as a Node serverless function (Vercel-style signature:
// `export default async function handler(req, res)`). The function reads the
// SERVER-ONLY FINOVA_LLM_* environment variables from the platform's secret
// store and serves the same gateway as server.ts.
//
//   Vercel:            src/analyst/server/handler.ts as a Node function
//   Netlify:           wire this file as the function handler
//   Any Node runtime:  `node --import tsx src/analyst/server/server.ts`
//
// The frontend build must set FINOVA_ANALYST_API_URL to the deployed
// function's public URL (client-safe, build-time variable).
// ---------------------------------------------------------------------------

import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolveServerEnv } from './env'
import { resolveSearchEnv } from '../websearch/server/env'
import { routeRequest } from './http'

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const env = resolveServerEnv(process.env)
  const searchEnv = resolveSearchEnv(process.env)
  await routeRequest(req, res, { env, searchEnv })
}
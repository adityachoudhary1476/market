// ---------------------------------------------------------------------------
// Phase 3B — automated security checks
//
// These tests are the "bundle must never contain server secrets" guarantee.
// They are NOT manual inspection:
//
//   1. Static import-graph scan — server-only code is unreachable from the
//      browser entry (src/main.tsx) by construction.
//   2. Barrel audit — the agent barrel never re-exports server-only modules.
//   3. Vite envPrefix audit — the ONLY FINOVA variable exposed to the browser
//      is FINOVA_ANALYST_API_URL (a public endpoint, not a secret).
//   4. Real production build with a fake secret injected, then a scan of the
//      emitted bundle: the secret, the secret variable name, the server-side
//      provider and server paths must never appear; the client-safe endpoint
//      MUST appear.
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import viteConfig from '../../../../vite.config'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SRC = join(ROOT, 'src')

// --- helpers ----------------------------------------------------------------

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(js|mjs|cjs|html)$/.test(entry.name)) out.push(full)
  }
  return out
}

function resolveSpec(fromFile: string, spec: string): string | null {
  const candidates: string[] = []
  if (spec.startsWith('@/')) {
    candidates.push(join(SRC, spec.slice(2)))
  } else if (spec.startsWith('.')) {
    candidates.push(join(dirname(fromFile), spec))
  } else {
    return null // bare package import — never inside src/
  }
  const withExtensions: string[] = []
  for (const base of candidates) {
    withExtensions.push(base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}/index.ts`, `${base}/index.tsx`)
  }
  for (const c of withExtensions) {
    if (existsSync(c) && /\.(ts|tsx)$/.test(c)) return c
  }
  return null
}

function reachableFrom(entry: string): string[] {
  const seen = new Set<string>()
  const queue = [entry]
  const out: string[] = []
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    out.push(file)
    const content = readFileSync(file, 'utf8')
    for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec = match[1] ?? match[2] ?? match[3]
      if (!spec) continue
      const resolved = resolveSpec(file, spec)
      if (resolved) queue.push(resolved)
    }
  }
  return out
}

// --- checks -----------------------------------------------------------------

test('server-only code is unreachable from the browser entry', () => {
  const reachable = reachableFrom(join(SRC, 'main.tsx'))
  // Phase 3B LLM gateway + Phase 3C.1 web-search server layer. The web-search
  // markers matter as much as the LLM ones: providers hold the API key, the
  // search gateway env is where FINOVA_WEB_SEARCH_API_KEY is read.
  // Forward-slash markers: `rel` is normalized, join() would emit backslashes
  // on Windows and silently never match.
  // NOTE: `websearch/cache.ts` is deliberately NOT a marker anymore — the
  // retrieval-cost optimization phase made it shared client/server
  // infrastructure (session-level evidence cache in the browser, response
  // cache in the gateway). It is secret-free by construction (imports only
  // ./types and ./limits); the key-holding providers and gateway env remain
  // unreachable.
  const serverMarkers = [
    'analyst/server',
    'websearch/server',
    'websearch/providers',
  ]
  for (const file of reachable) {
    const rel = relative(SRC, file).replace(/\\/g, '/')
    for (const marker of serverMarkers) {
      assert.ok(
        !rel.includes(marker),
        `server-only module ${rel} must not be reachable from the browser entry graph (marker: ${marker})`,
      )
    }
  }
  assert.ok(reachable.length > 20, 'the scan actually traversed the app graph')
})

test('the agent barrel never re-exports server-only modules', () => {
  const barrel = readFileSync(join(SRC, 'analyst', 'agent', 'index.ts'), 'utf8')
  const serverImports = barrel.match(/from\s+['"][^'"]*server[^'"]*['"]/g) ?? []
  assert.deepEqual(serverImports, [], 'agent barrel must not import from the server layer')
  const exportLines = barrel.split('\n').filter((l) => /^\s*export/.test(l)).join('\n')
  assert.ok(
    !exportLines.includes('createOpenAICompatibleProvider'),
    'the key-holding provider is never exported to the browser',
  )
})

test('vite envPrefix exposes exactly one FINOVA variable (the public endpoint)', async () => {
  const resolved = typeof viteConfig === 'function' ? await (viteConfig as (env: { command: string; mode: string }) => unknown)({ command: 'build', mode: 'production' }) : viteConfig
  const cfg = resolved as { envPrefix?: string | string[] }
  const prefixes = typeof cfg.envPrefix === 'string' ? [cfg.envPrefix] : (cfg.envPrefix ?? [])
  assert.ok(prefixes.includes('FINOVA_ANALYST_API_URL'), 'the client-safe endpoint variable must be exposed')
  for (const prefix of prefixes) {
    if (typeof prefix === 'string' && prefix.startsWith('FINOVA')) {
      assert.equal(prefix, 'FINOVA_ANALYST_API_URL', 'no other FINOVA_* variable may be exposed to the browser')
    }
  }
})

test('production bundle contains the client endpoint but never server secrets or server code', { timeout: 180_000 }, async () => {
  const SECRET = 'security-test-secret-3b'
  const SEARCH_SECRET = 'security-test-secret-3c-search'
  const ENDPOINT = 'https://analyst.invalid.test/api/analyze'
  const OUT = join(ROOT, 'dist-security-test')

  const prevKey = process.env.FINOVA_LLM_API_KEY
  const prevSearchKey = process.env.FINOVA_WEB_SEARCH_API_KEY
  const prevUrl = process.env.FINOVA_ANALYST_API_URL
  process.env.FINOVA_LLM_API_KEY = SECRET
  process.env.FINOVA_WEB_SEARCH_API_KEY = SEARCH_SECRET
  process.env.FINOVA_ANALYST_API_URL = ENDPOINT
  try {
    await build({ logLevel: 'error', build: { outDir: OUT, emptyOutDir: true } })
    const files = walk(OUT)
    assert.ok(files.length > 0, 'the build produced output')
    const all = files.map((f) => readFileSync(f, 'utf8')).join('\n')

    assert.ok(all.includes(ENDPOINT), 'the client-safe endpoint must be inlined into the bundle')
    // Regression: env reads must go through Vite's static `import.meta.env`
    // replacement. If a reader aliases `import.meta` first (e.g.
    // `const meta = import.meta; meta.env`), Vite leaves the access untouched,
    // the browser sees `undefined`, and the app silently falls back to the
    // demo provider. A raw `import.meta.env` in the emitted bundle proves such
    // an access survived the build.
    assert.ok(!all.includes('import.meta.env'), 'every import.meta.env access must be statically replaced by Vite')
    assert.ok(!all.includes(SECRET), 'the server API key must never appear in the bundle')
    assert.ok(!all.includes(SEARCH_SECRET), 'the web search API key must never appear in the bundle')
    assert.ok(!all.includes('FINOVA_LLM_API_KEY'), 'the secret variable name must never appear in the bundle')
    assert.ok(!all.includes('FINOVA_LLM_MODEL'), 'server-only configuration must never appear in the bundle')
    assert.ok(!all.includes('FINOVA_WEB_SEARCH_API_KEY'), 'the web search secret variable name must never appear in the bundle')
    assert.ok(!all.includes('FINOVA_WEB_SEARCH_PROVIDER'), 'web search server configuration must never appear in the bundle')
    assert.ok(!all.includes('createOpenAICompatibleProvider'), 'the key-holding provider must be tree-shaken out of the bundle')
    assert.ok(!all.includes('src/analyst/server'), 'server source paths must never appear in the bundle')
    assert.ok(!all.includes('websearch/server'), 'web search gateway source paths must never appear in the bundle')
  } finally {
    rmSync(OUT, { recursive: true, force: true })
    if (prevKey === undefined) delete process.env.FINOVA_LLM_API_KEY
    else process.env.FINOVA_LLM_API_KEY = prevKey
    if (prevSearchKey === undefined) delete process.env.FINOVA_WEB_SEARCH_API_KEY
    else process.env.FINOVA_WEB_SEARCH_API_KEY = prevSearchKey
    if (prevUrl === undefined) delete process.env.FINOVA_ANALYST_API_URL
    else process.env.FINOVA_ANALYST_API_URL = prevUrl
  }
})
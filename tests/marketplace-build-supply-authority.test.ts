/**
 * MARKETPLACE STATIC-BUILD SUPPLY AUTHORITY.
 *
 * Incident this locks down: the GitHub Build step only received the anon key,
 * `public.gigs` is not anon-readable, so build-time enumeration silently saw
 * ZERO rows — the landing baked false-empty while `/gigs/<slug>` 404ed
 * (`dynamicParams = false` + no build-time slugs).
 *
 * These are source + behavior contracts:
 *   · the Build step receives the server-only service-role secrets (never as
 *     NEXT_PUBLIC_*, never echoed);
 *   · gig/provider static param enumeration asserts genuine service-role
 *     authority BEFORE querying and refuses an empty estate;
 *   · landing/hub/category-count/sitemap fail closed during
 *     `phase-production-build` while keeping their runtime fail-soft paths;
 *   · the static cache gate additionally proves a real gig-detail cache
 *     entry exists (generic glob, no hardcoded slug);
 *   · OpenNext's read-only static-assets incremental cache / Free-plan
 *     architecture is unchanged (no R2/D1/DO/queue/limits, no ISR regression).
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  MARKETPLACE_PRODUCTION_BUILD_PHASE,
  assertMarketplaceBuildEstateNonEmpty,
  assertMarketplaceBuildServiceRoleAuthority,
  assertMarketplaceEstateNonEmpty,
  assertMarketplaceServiceRoleAuthority,
  isMarketplaceProductionBuild,
} from '@/lib/marketplaceBuildAuthority'
import { resolveSupabaseKey } from '@/lib/supabaseKey'

const root = process.cwd()
const readRepo = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8')

const workflow = readRepo('.github/workflows/deploy.yml')
const openNextConfig = readRepo('open-next.config.ts')
const wrangler = readRepo('wrangler.toml')
const gigDetail = readRepo('app/marketplace/gigs/[slug]/page.tsx')
const providerDetail = readRepo('app/marketplace/providers/[id]/page.tsx')
const landing = readRepo('app/marketplace/PublicMarketplaceLanding.tsx')
const gigsHub = readRepo('app/marketplace/gigs/page.tsx')
const categoryCounts = readRepo('lib/marketplaceCategoryCounts.ts')
const sitemap = readRepo('app/sitemap.ts')

/** Workflow step slice: `- name: <name>` up to the next step at the same indent. */
function stepByName(source: string, name: string): string {
  const marker = `- name: ${name}`
  const start = source.indexOf(marker)
  if (start === -1) throw new Error(`missing workflow step: ${name}`)
  const next = source.indexOf('\n      - name:', start + marker.length)
  return source.slice(start, next === -1 ? undefined : next)
}

/** Strip YAML comment lines so prose cannot satisfy an executable contract. */
function stripComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
}

/** Strip `//` + block comments from TypeScript sources. */
function stripCodeComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/**
 * Source slice helper: returns the body of the first function whose signature
 * contains `signature`, using brace matching so assertions are scoped to that
 * function instead of the whole file.
 */
function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  if (start < 0) throw new Error(`missing signature: ${signature}`)
  let angles = 0
  let open = -1
  for (let i = source.indexOf('(', start); i >= 0 && i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '<') angles += 1
    else if (ch === '>') angles -= 1
    else if (ch === '{' && angles <= 0) {
      open = i
      break
    }
  }
  if (open < 0) throw new Error(`missing body: ${signature}`)
  let depth = 0
  for (let j = open; j < source.length; j += 1) {
    if (source[j] === '{') depth += 1
    else if (source[j] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open, j + 1)
    }
  }
  throw new Error(`unterminated body: ${signature}`)
}

/* ── Behavior: the authority helper itself ─────────────────────────────── */

const AUTH_ENV_KEYS = [
  'NEXT_PHASE',
  'SUPABASE_SERVICE_ROLE_JWT',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const
type AuthEnvKey = (typeof AUTH_ENV_KEYS)[number]

let savedEnv: Record<AuthEnvKey, string | undefined>

function setAuthEnv(values: Partial<Record<AuthEnvKey, string | undefined>>) {
  for (const key of AUTH_ENV_KEYS) {
    if (key in values) continue
    delete process.env[key]
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function base64url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Minimal decodable legacy-eyJ Supabase-style key with a real `role` claim. */
function legacyJwt(role: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({ iss: 'supabase', ref: 'test', role, iat: 1, exp: 9999999999 }),
  )
  return `${header}.${payload}.test-signature`
}

const ANON_JWT = legacyJwt('anon')
const SERVICE_ROLE_JWT = legacyJwt('service_role')

beforeEach(() => {
  savedEnv = {} as Record<AuthEnvKey, string | undefined>
  for (const key of AUTH_ENV_KEYS) savedEnv[key] = process.env[key]
})

afterEach(() => {
  for (const key of AUTH_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

describe('lib/marketplaceBuildAuthority — genuine service-role authority', () => {
  it('detects exactly the production build phase', () => {
    setAuthEnv({ NEXT_PHASE: undefined })
    expect(isMarketplaceProductionBuild()).toBe(false)

    setAuthEnv({ NEXT_PHASE: 'phase-production-server' })
    expect(isMarketplaceProductionBuild()).toBe(false)

    setAuthEnv({ NEXT_PHASE: MARKETPLACE_PRODUCTION_BUILD_PHASE })
    expect(isMarketplaceProductionBuild()).toBe(true)
  })

  it('fails closed at build time when only the anon key is available', () => {
    setAuthEnv({
      NEXT_PHASE: MARKETPLACE_PRODUCTION_BUILD_PHASE,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_JWT,
    })

    // Unconditional (generateStaticParams) and build-only callers both refuse
    // to enumerate through an anonymous-scoped client.
    expect(() => assertMarketplaceServiceRoleAuthority('unit')).toThrow(/service-role/)
    expect(() => assertMarketplaceBuildServiceRoleAuthority('unit')).toThrow(/service-role/)
  })

  it('preserves runtime fail-soft behavior outside the build phase', () => {
    setAuthEnv({ NEXT_PHASE: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_JWT })

    expect(() => assertMarketplaceBuildServiceRoleAuthority('unit')).not.toThrow()
    expect(() => assertMarketplaceBuildEstateNonEmpty('unit', 0, 'gigs')).not.toThrow()
  })

  it('accepts a genuine legacy service-role JWT and rejects other JWT roles', () => {
    setAuthEnv({
      NEXT_PHASE: MARKETPLACE_PRODUCTION_BUILD_PHASE,
      SUPABASE_SERVICE_ROLE_JWT: SERVICE_ROLE_JWT,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_JWT,
    })
    expect(() => assertMarketplaceBuildServiceRoleAuthority('unit')).not.toThrow()

    // The format is a valid eyJ… key, but the role claim is the anon role:
    // "genuine" service-role authority is not satisfied by format alone.
    setAuthEnv({ SUPABASE_SERVICE_ROLE_JWT: ANON_JWT })
    expect(() => assertMarketplaceServiceRoleAuthority('unit')).toThrow(/role is "anon"/)
  })

  it('treats a blank SUPABASE_SERVICE_ROLE_JWT (unset GitHub secret) as absent', () => {
    // GitHub Actions defines an empty string for unset secrets: it must not
    // shadow a usable legacy SUPABASE_SERVICE_ROLE_KEY and downgrade the
    // build to the anon role.
    setAuthEnv({
      NEXT_PHASE: MARKETPLACE_PRODUCTION_BUILD_PHASE,
      SUPABASE_SERVICE_ROLE_JWT: '',
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_JWT,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_JWT,
    })

    expect(resolveSupabaseKey()).toBe(SERVICE_ROLE_JWT)
    expect(() => assertMarketplaceBuildServiceRoleAuthority('unit')).not.toThrow()
  })

  it('never leaks key material in its failure messages', () => {
    setAuthEnv({
      NEXT_PHASE: MARKETPLACE_PRODUCTION_BUILD_PHASE,
      SUPABASE_SERVICE_ROLE_JWT: ANON_JWT,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_JWT,
    })

    let message = ''
    try {
      assertMarketplaceServiceRoleAuthority('unit-scope')
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    expect(message).toContain('unit-scope')
    expect(message).not.toContain(ANON_JWT)
    expect(message).not.toContain(SERVICE_ROLE_JWT)
  })

  it('fails a non-empty estate assertion on zero / non-finite counts', () => {
    expect(() => assertMarketplaceEstateNonEmpty('unit', 0, 'active gigs')).toThrow(
      /zero active gigs/,
    )
    expect(() => assertMarketplaceEstateNonEmpty('unit', Number.NaN, 'active gigs')).toThrow()
    expect(() => assertMarketplaceEstateNonEmpty('unit', 217, 'active gigs')).not.toThrow()
  })
})

/* ── Build step secrets ─────────────────────────────────────────────────── */

describe('deploy.yml Build step — server-only service-role credentials', () => {
  const buildStep = stripComments(stepByName(workflow, 'Build (Next + OpenNext)'))

  it('exposes both service-role secrets from the repo secret store', () => {
    expect(buildStep).toContain(
      'SUPABASE_SERVICE_ROLE_JWT: ${{ secrets.SUPABASE_SERVICE_ROLE_JWT }}',
    )
    expect(buildStep).toContain(
      'SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}',
    )
  })

  it('never exposes service-role material as NEXT_PUBLIC', () => {
    expect(buildStep).not.toMatch(/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/)
    const publicSupabaseKeys = [...buildStep.matchAll(/^\s*(NEXT_PUBLIC_SUPABASE[A-Z0-9_]*):/gm)].map(
      (match) => match[1],
    )
    expect(publicSupabaseKeys).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ])
  })

  it('never echoes a service-role value and still runs the real build', () => {
    expect(buildStep).not.toMatch(/echo[^\n]*SUPABASE_SERVICE_ROLE/)
    expect(buildStep).toContain('run: npm run build')
  })
})

/* ── generateStaticParams: unconditional authority + non-empty estate ───── */

describe('/gigs/[slug] — static-param enumeration asserts authority first', () => {
  const body = functionBody(gigDetail, 'export async function generateStaticParams')

  it('keeps dynamicParams=false (missing build-time slugs are hard 404s)', () => {
    expect(gigDetail).toContain('export const dynamicParams = false')
    expect(body).toContain('createSupabaseAdminClient()')
  })

  it('asserts genuine service-role authority BEFORE querying', () => {
    const guardIdx = body.indexOf('assertMarketplaceServiceRoleAuthority(')
    const clientIdx = body.indexOf('createSupabaseAdminClient()')

    expect(guardIdx).toBeGreaterThan(-1)
    expect(clientIdx).toBeGreaterThan(guardIdx)
    // Unconditional: this is build enumeration, not a runtime-reused path.
    expect(body).not.toContain('assertMarketplaceBuildServiceRoleAuthority')
    expect(body).not.toContain('isMarketplaceProductionBuild')
  })

  it('fails on an empty active gig estate instead of shrinking the index', () => {
    expect(body).toContain('assertMarketplaceEstateNonEmpty(')
    expect(body).toContain('activeGigs.length')
    expect(body).toContain('active provider-backed gig rows')
  })
})

describe('/providers/[id] — static-param enumeration asserts authority first', () => {
  const body = functionBody(providerDetail, 'export async function generateStaticParams')

  it('keeps dynamicParams=false (missing build-time tokens are hard 404s)', () => {
    expect(providerDetail).toContain('export const dynamicParams = false')
    expect(body).toContain('createSupabaseAdminClient()')
  })

  it('asserts genuine service-role authority BEFORE querying', () => {
    const guardIdx = body.indexOf('assertMarketplaceServiceRoleAuthority(')
    const clientIdx = body.indexOf('createSupabaseAdminClient()')

    expect(guardIdx).toBeGreaterThan(-1)
    expect(clientIdx).toBeGreaterThan(guardIdx)
    expect(body).not.toContain('assertMarketplaceBuildServiceRoleAuthority')
    expect(body).not.toContain('isMarketplaceProductionBuild')
  })

  it('fails on an empty provider token estate', () => {
    expect(body).toContain('assertMarketplaceEstateNonEmpty(')
    expect(body).toContain('tokens.size')
    expect(body).toContain('provider tokens')
  })
})

/* ── Build-only guards on paths shared with the Worker ──────────────────── */

describe('build-only service-role / supply guards', () => {
  it('landing requires build authority and throws on query error + empty inventory', () => {
    expect(landing).toContain('assertMarketplaceBuildServiceRoleAuthority(')
    expect(landing).toContain('assertMarketplaceBuildEstateNonEmpty(')
    expect(landing).toMatch(/if \(inventoryRes\.error\)/)
    expect(landing).toMatch(/if \(isMarketplaceProductionBuild\(\)\)[\s\S]{0,300}throw new Error/)
    // Runtime fail-soft behavior is preserved: the fallback shell is still
    // returned when the DB client cannot be created outside the build.
    expect(landing).toMatch(/if \(!fresh\) return fallbackLandingData\(\)/)
  })

  it('gigs hub requires build authority and throws on query error + empty directory', () => {
    expect(gigsHub).toContain('assertMarketplaceBuildServiceRoleAuthority(')
    expect(gigsHub).toContain('assertMarketplaceBuildEstateNonEmpty(')
    expect(gigsHub).toMatch(/if \(error\)[\s\S]{0,400}isMarketplaceProductionBuild\(\)/)
    // Runtime fail-soft path (never persists a failed query as empty) stays.
    expect(gigsHub).toContain('if (!fresh) return []')
  })

  it('category counts requires build authority and throws on query error, but allows a true 0', () => {
    expect(categoryCounts).toContain('assertMarketplaceBuildServiceRoleAuthority(')
    expect(categoryCounts).toMatch(/if \(error\)[\s\S]{0,400}isMarketplaceProductionBuild\(\)/)
    // Some categories can truthfully have no supply — no non-empty assertion.
    expect(categoryCounts).not.toContain('assertMarketplaceEstateNonEmpty')
    expect(categoryCounts).not.toContain('assertMarketplaceBuildEstateNonEmpty')
    // Runtime contract unchanged: 0 on failure, failure never cached.
    expect(categoryCounts).toMatch(/if \(fresh == null\) return 0/)
  })

  it('sitemap requires build authority, throws on every silent-drop query error and needs gig URLs', () => {
    expect(sitemap).toContain('assertMarketplaceBuildServiceRoleAuthority(')
    expect(sitemap).toContain('assertMarketplaceBuildEstateNonEmpty(')
    expect(sitemap).toMatch(/if \(gigError\)/)
    expect(sitemap).toMatch(/if \(attorneyError\)/)
    expect(sitemap).toMatch(/if \(consultantError\)/)
    expect(sitemap).toMatch(/catch \(error\)[\s\S]{0,400}isMarketplaceProductionBuild\(\)/)
    // Runtime fallback outside the build stays: verified static hubs survive
    // a DB outage instead of failing the route.
    expect(sitemap).toContain('categoriesWithSupply = new Set<string>()')
  })
})

/* ── Static cache gate ──────────────────────────────────────────────────── */

describe('deploy.yml static cache verification — gig-detail estate', () => {
  const cacheStep = stripComments(
    stepByName(workflow, 'Populate static incremental cache (local copy, no network)'),
  )

  it('keeps every existing critical Marketplace prerender cache check', () => {
    for (const key of [
      'marketplace',
      'marketplace/gigs',
      'marketplace/categories',
      'marketplace/providers',
      'shop',
    ]) {
      expect(cacheStep).toContain(key)
    }
    expect(cacheStep).toContain('.open-next/assets/cdn-cgi/_next_cache/${BUILD_ID}/${cache_key}.cache')
    expect(cacheStep).toContain('Missing required prerender cache asset')
  })

  it('fails closed unless a real gig-detail cache file exists beneath ${BUILD_ID}/marketplace/gigs/', () => {
    expect(cacheStep).toContain('${BUILD_ID}/marketplace/gigs')
    expect(cacheStep).toContain('GIG_DETAIL_CACHE_DIR')
    expect(cacheStep).toContain('find "$GIG_DETAIL_CACHE_DIR" -type f -name \'*.cache\'')
    expect(cacheStep).toContain('GIG_DETAIL_CACHE_COUNT')
    expect(cacheStep).toMatch(/test "\$GIG_DETAIL_CACHE_COUNT" -gt 0/)
    expect(cacheStep).toContain('exit 1')
  })

  it('checks generically instead of hardcoding a single gig slug', () => {
    expect(cacheStep).not.toMatch(/marketplace\/gigs\/[a-zA-Z0-9_-]+\.cache/)
  })
})

/* ── Architecture unchanged (PR244/PR245 preserved) ─────────────────────── */

describe('OpenNext static-assets incremental cache / Free-plan architecture unchanged', () => {
  const openNextCode = stripCodeComments(openNextConfig)
  const wranglerCode = stripComments(wrangler)

  it('keeps the official read-only static-assets cache + cache interception', () => {
    expect(openNextCode).toContain(
      "import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache'",
    )
    expect(openNextCode).toMatch(/incrementalCache:\s*staticAssetsIncrementalCache/)
    expect(openNextCode).toMatch(/enableCacheInterception:\s*true/)
  })

  it('adds no R2 / D1 / DO / queue / KV incremental-cache adapter', () => {
    expect(openNextCode).not.toMatch(
      /tagCache|queue|r2IncrementalCache|d1NextTagCache|shardedD1TagCache|doQueue|kvIncrementalCache/,
    )
    expect(wranglerCode).not.toMatch(/^\s*\[\[r2_buckets\]\]\s*$/m)
    expect(wranglerCode).not.toMatch(/^\s*\[\[durable_objects\.bindings\]\]\s*$/m)
    expect(wranglerCode).not.toMatch(/^\s*\[\[queues\.(consumers|producers)\]\]\s*$/m)
    expect(wranglerCode).not.toMatch(/^\s*\[limits\]\s*$/m)
    expect(wranglerCode).not.toMatch(/^\s*cpu_ms\s*=/m)
  })

  it('keeps the static estate static: no force-dynamic / ISR regression', () => {
    for (const source of [gigDetail, providerDetail, landing, gigsHub]) {
      expect(source).not.toMatch(/export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/)
      expect(source).not.toMatch(/^\s*export\s+const\s+revalidate\b/m)
    }
    expect(sitemap).toContain("export const dynamic = 'force-static'")
    expect(sitemap).toContain('export const revalidate = false')
    expect(sitemap).not.toContain("export const dynamic = 'force-dynamic'")
    expect(gigDetail).toContain('export const dynamicParams = false')
    expect(providerDetail).toContain('export const dynamicParams = false')
  })

  it('keeps the GitHub-only raw-deploy flow (no direct OpenNext publish path)', () => {
    const workflowCode = stripComments(workflow)
    expect(workflowCode).toContain('npm run populate:static-incremental-cache')
    expect(workflowCode).toContain('npm run deploy')
    expect(workflowCode).not.toMatch(/opennextjs-cloudflare\s+(deploy|populate)/)
  })
})

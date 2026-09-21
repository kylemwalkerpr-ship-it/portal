#!/usr/bin/env node
/**
 * Fail-closed check that the portal auth-lane documents ship as PRERENDERED
 * shells in the read-only Workers Static Assets incremental cache.
 *
 * Why this exists (MARKET-PORTAL-AUTH-HANDOFF-1102 R2): the Cloudflare 1102
 * ("Worker exceeded resource limits") class is the `/sign-in/**` + `/sign-up/**`
 * documents being rendered per request. Live capture on 2026-09-21:
 *
 *   GET https://portal.yousafeconsultancy.com/sign-in/student
 *     200 · `cache-control: private, no-cache, no-store` · NO `x-opennext-cache`
 *     (a fresh Next.js render) interleaved with
 *     503 · `error code: 1102` (cf-ray a3e83a202c58724a, a3e82e157a81724b) and
 *     500 · `Internal Server Error` (cf-ray a3e82e17aba2724d)
 *   GET https://portal.yousafeconsultancy.com/
 *     200 · `x-opennext-cache: HIT` · `s-maxage=31536000` (cache-served, never
 *     failed) — the same treatment these lanes must have.
 *
 * The fix keeps `app/sign-in/[[...rest]]/page.tsx` and
 * `app/sign-up/[[...rest]]/page.tsx` build-static (`force-static` +
 * `generateStaticParams`, no request-time API) and publishes one document per
 * lane root. The portal-host-scoped `beforeFiles` rewrites in next.config.ts —
 * generated from the lane list in lib/portalAuthLaneShell.ts — serve those
 * documents for the lane roots and for every Clerk sub-screen underneath them;
 * middleware.ts and clerkMiddleware still see the ORIGINAL request path (Next
 * runs Proxy/middleware before `beforeFiles`), so no auth decision moves. A
 * deploy that lost any of those documents — or that let a page regrow
 * `headers()`, `translateBatch()` or `auth()` — would silently put the lanes
 * back on the per-request render path and reintroduce the 1102s.
 *
 * This gate therefore fails closed when:
 *   1. the lane manifest (lib/portalAuthLaneShells.json) is unreadable, or a
 *      page source regained request-time work / lost `force-static` /
 *      `generateStaticParams`;
 *   2. the published cache directory for the build is missing or empty;
 *   3. any lane document is absent from the published cache — verified BOTH by
 *      the derived `<path>.cache` key and by the document text read out of the
 *      real page/client sources, so an empty or foreign payload cannot pass;
 *   4. the build's prerender manifest exists and does not list a lane route
 *      (a dynamic lane can never be listed).
 *
 * Local filesystem only: no network, no Cloudflare API, no credentials.
 *
 * Usage:
 *   node scripts/verify-portal-auth-lane-static-cache.mjs
 *   node scripts/verify-portal-auth-lane-static-cache.mjs \
 *     --build-id build-abc --assets .open-next/assets/cdn-cgi/_next_cache
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const DEFAULT_BUILD_ID_FILE = join('.next', 'BUILD_ID')
const DEFAULT_ASSETS_DIR = join('.open-next', 'assets', 'cdn-cgi', '_next_cache')
const DEFAULT_PRERENDER_MANIFEST = join('.next', 'prerender-manifest.json')
const DEFAULT_NEXT_APP_DIR = join('.next', 'server', 'app')

/** Repository root, derived from this script's location (source files only). */
const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

/**
 * Auth documents, with the source file that owns their request-time contract
 * and the client that renders the shell copy used as the payload marker.
 * Resolved against `sourcesRoot` so the contract can be exercised against
 * fixtures (`--sources-root`) as well as this repository.
 */
function laneFamilies(sourcesRoot) {
  return [
    {
      family: 'sign-in',
      pageFile: join(sourcesRoot, 'app', 'sign-in', '[[...rest]]', 'page.tsx'),
      clientFile: join(sourcesRoot, 'app', 'sign-in', '[[...rest]]', 'SignInClient.tsx'),
    },
    {
      family: 'sign-up',
      pageFile: join(sourcesRoot, 'app', 'sign-up', '[[...rest]]', 'page.tsx'),
      clientFile: join(sourcesRoot, 'app', 'sign-up', '[[...rest]]', 'SignUpClient.tsx'),
    },
  ]
}

const USAGE = `Usage: node scripts/verify-portal-auth-lane-static-cache.mjs [options]

Verifies that every portal auth-lane document is prerendered and published in
the read-only static-assets incremental cache (cdn-cgi/_next_cache).

Options:
  --build-id <id>          Build id directory inside the cache (default: .next/BUILD_ID)
  --assets <dir>           Published cache root (default: ${DEFAULT_ASSETS_DIR})
  --lane-manifest <file>   Lane manifest (default: lib/portalAuthLaneShells.json at the repo root)
  --next-app-dir <dir>     Next app output dir, reported as classification evidence (default: ${DEFAULT_NEXT_APP_DIR})
  --prerender-manifest <file>  Next prerender manifest (default: ${DEFAULT_PRERENDER_MANIFEST})
  --sources-root <dir>     Root the lane manifest, pages and clients are read from (default: this repo)
  -h, --help               Show this help
`

function parseArgs(argv) {
  const parsed = {
    buildId: undefined,
    assets: DEFAULT_ASSETS_DIR,
    laneManifest: undefined,
    nextAppDir: DEFAULT_NEXT_APP_DIR,
    prerenderManifest: DEFAULT_PRERENDER_MANIFEST,
    sourcesRoot: REPO_ROOT,
    help: false,
  }

  const readValue = (flag) => {
    const next = argv.shift()
    if (next === undefined || next === '') throw new Error(`${flag} requires a value`)
    return next
  }

  while (argv.length > 0) {
    const arg = argv.shift()
    if (arg === '-h' || arg === '--help') {
      parsed.help = true
    } else if (arg === '--build-id') {
      parsed.buildId = readValue(arg)
    } else if (arg.startsWith('--build-id=')) {
      parsed.buildId = arg.slice('--build-id='.length)
    } else if (arg === '--assets') {
      parsed.assets = readValue(arg)
    } else if (arg.startsWith('--assets=')) {
      parsed.assets = arg.slice('--assets='.length)
    } else if (arg === '--lane-manifest') {
      parsed.laneManifest = readValue(arg)
    } else if (arg.startsWith('--lane-manifest=')) {
      parsed.laneManifest = arg.slice('--lane-manifest='.length)
    } else if (arg === '--next-app-dir') {
      parsed.nextAppDir = readValue(arg)
    } else if (arg.startsWith('--next-app-dir=')) {
      parsed.nextAppDir = arg.slice('--next-app-dir='.length)
    } else if (arg === '--sources-root') {
      parsed.sourcesRoot = readValue(arg)
    } else if (arg.startsWith('--sources-root=')) {
      parsed.sourcesRoot = arg.slice('--sources-root='.length)
    } else if (arg === '--prerender-manifest') {
      parsed.prerenderManifest = readValue(arg)
    } else if (arg.startsWith('--prerender-manifest=')) {
      parsed.prerenderManifest = arg.slice('--prerender-manifest='.length)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return parsed
}

function fail(message) {
  console.error(`[portal-auth-lane-static-cache] ERROR: ${message}`)
  process.exit(1)
}

function info(message) {
  console.log(`[portal-auth-lane-static-cache] ${message}`)
}

function warn(message) {
  console.warn(`[portal-auth-lane-static-cache] WARNING: ${message}`)
}

/** Every file beneath `dir`, recursive, deterministic order. */
function listFiles(dir) {
  const files = []
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )
    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) stack.push(fullPath)
      else if (entry.isFile()) files.push(fullPath)
    }
  }
  return files
}

/** `<key>` for a published `<key>.cache` file, relative to the build dir. */
function cacheKeyFor(buildDir, file) {
  const relativePath = relative(buildDir, file)
  return relativePath.endsWith('.cache') ? relativePath.slice(0, -'.cache'.length) : relativePath
}

/** Cache payload bytes; gzip payloads are inflated before matching. */
function readPayload(file) {
  const buffer = readFileSync(file)
  if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      return gunzipSync(buffer)
    } catch {
      return buffer
    }
  }
  return buffer
}

/** React escapes these characters when it renders text into HTML. */
function escapeHtmlText(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function markerVariants(marker) {
  const variants = [marker]
  const escaped = escapeHtmlText(marker)
  if (escaped !== marker) variants.push(escaped)
  return variants.map((value) => Buffer.from(value, 'utf8'))
}

/** The shell copy rendered by the lane's client component. */
function extractLaneMarker(clientFile) {
  if (!existsSync(clientFile)) return null
  const source = readFileSync(clientFile, 'utf8')
  const match = source.match(/<AuthShell[\s\S]{0,600}?title="([^"]+)"/)
  if (!match) return null
  const marker = match[1].trim()
  return marker.length >= 20 ? marker : null
}

/** The lane roots exactly as lib/portalAuthLaneShell.ts derives them. */
function readLaneManifest(laneManifestFile, laneFamiliesList) {
  if (!existsSync(laneManifestFile)) {
    fail(
      `lane manifest not found: ${relative(process.cwd(), laneManifestFile)}. The portal auth-lane ` +
        'shell paths (prerender enumeration, the next.config.ts beforeFiles mapping and this gate) ' +
        'all read it, so a missing manifest means the lanes are unverified.',
    )
  }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(laneManifestFile, 'utf8'))
  } catch (error) {
    fail(`lane manifest is not valid JSON: ${error instanceof Error ? error.message : error}`)
  }
  const lanes = {}
  for (const { family } of laneFamiliesList) {
    const roots = parsed?.[family]
    if (!Array.isArray(roots) || roots.length === 0 || roots.some((lane) => typeof lane !== 'string' || !lane)) {
      fail(`lane manifest has no usable "${family}" lane list: ${relative(process.cwd(), laneManifestFile)}`)
    }
    if (roots[0] !== 'student') {
      fail(
        `lane manifest "${family}" must start with the canonical "student" lane (the fallback every ` +
          `unknown segment maps to); got "${roots[0]}".`,
      )
    }
    lanes[family] = roots
  }
  return lanes
}

/**
 * Source contract: an auth-lane page must stay build-static. Any request-time
 * API here re-arms the 1102 class for the whole lane family.
 */
function assertStaticPageSources(laneFamiliesList) {
  const forbidden = [
    { pattern: /from\s+['"]next\/headers['"]/, label: "import from 'next/headers'" },
    { pattern: /\bawait\s+headers\s*\(/, label: 'await headers()' },
    { pattern: /\btranslateBatch\s*\(/, label: 'translateBatch()' },
    { pattern: /\bawait\s+auth\s*\(/, label: 'await auth()' },
    { pattern: /\bfrom\s+['"]@clerk\/nextjs\/server['"]/, label: "import from '@clerk/nextjs/server'" },
  ]
  for (const { family, pageFile } of laneFamiliesList) {
    if (!existsSync(pageFile)) fail(`auth-lane page is missing: ${relative(process.cwd(), pageFile)}`)
    const source = readFileSync(pageFile, 'utf8')
    for (const { pattern, label } of forbidden) {
      if (pattern.test(source)) {
        fail(
          `${relative(process.cwd(), pageFile)} regained request-time server work (${label}). ` +
            'The auth-lane documents must stay build-static or the lanes go back to a per-request ' +
            'render on the Workers Free CPU budget (Cloudflare 1102).',
        )
      }
    }
    if (!/export\s+const\s+dynamic\s*=\s*['"]force-static['"]/.test(source)) {
      fail(
        `${relative(process.cwd(), pageFile)} no longer pins \`export const dynamic = 'force-static'\`. ` +
          'Without it the /' + family + ' lanes can silently return to per-request rendering.',
      )
    }
    if (!/export\s+const\s+dynamicParams\s*=\s*false/.test(source)) {
      fail(
        `${relative(process.cwd(), pageFile)} no longer pins \`export const dynamicParams = false\`. ` +
          'Without it any lane path that escapes the next.config.ts beforeFiles mapping (built from ' +
          'lib/portalAuthLaneShell.ts) falls back to an on-demand render instead of a cheap 404.',
      )
    }
    if (!/export\s+function\s+generateStaticParams\s*\(/.test(source)) {
      fail(
        `${relative(process.cwd(), pageFile)} lost generateStaticParams(): a dynamic route with ` +
          '`force-static` and no enumerated params is not prerendered (Next build marks it static ' +
          'with zero paths), so no lane document would be published.',
      )
    }
    if (!/portalAuthLaneRoots\s*\(/.test(source)) {
      fail(
        `${relative(process.cwd(), pageFile)} no longer enumerates lanes from ` +
          'lib/portalAuthLaneShell.ts — the prerender list and the next.config.ts beforeFiles ' +
          'mapping would drift.',
      )
    }
  }
}

/** Informational: what the Next build emitted for the lane paths. */
function reportBuildClassification(nextAppDir, requiredPaths) {
  if (!existsSync(nextAppDir)) {
    warn(
      `${relative(process.cwd(), nextAppDir)} is missing — Next emitted no app output, so the ` +
        'classified build output could not be inspected.',
    )
    return
  }
  const emitted = []
  const missing = []
  for (const shellPath of requiredPaths) {
    const rel = shellPath.replace(/^\//, '')
    const htmlFile = join(nextAppDir, `${rel}.html`)
    if (existsSync(htmlFile) && statSync(htmlFile).isFile()) emitted.push(rel)
    else missing.push(rel)
  }
  info(
    `build classification: ${emitted.length}/${requiredPaths.length} auth-lane documents prerendered` +
      (emitted.length > 0 ? ` (${emitted.slice(0, 8).join(', ')}${emitted.length > 8 ? ', …' : ''})` : ''),
  )
  if (missing.length > 0) {
    warn(
      `no prerender HTML for: ${missing.join(', ')} — the published-cache proof below is ` +
        'authoritative (the cache is derived from this build), but this usually means a lane ' +
        'stopped being enumerated.',
    )
  }
}

/** Informational + fail-closed when the manifest exists and omits a lane. */
function assertPrerenderManifest(manifestFile, requiredPaths) {
  if (!existsSync(manifestFile)) {
    warn(
      `${relative(process.cwd(), manifestFile)} is missing — skipping the prerender-manifest listing ` +
        'check (the published-cache proof is authoritative).',
    )
    return
  }
  let routes
  try {
    routes = JSON.parse(readFileSync(manifestFile, 'utf8'))?.routes
  } catch (error) {
    warn(
      `${relative(process.cwd(), manifestFile)} is not parseable (${error instanceof Error ? error.message : error}) ` +
        '— skipping the listing check.',
    )
    return
  }
  if (!routes || typeof routes !== 'object' || Object.keys(routes).length === 0) {
    warn(`${relative(process.cwd(), manifestFile)} lists no routes — skipping the listing check.`)
    return
  }
  const listed = new Set(Object.keys(routes))
  const unlisted = requiredPaths.filter((shellPath) => !listed.has(shellPath))
  const listsAnyLane = [...listed].some(
    (route) => route === '/sign-in' || route.startsWith('/sign-in/') || route === '/sign-up' || route.startsWith('/sign-up/'),
  )
  if (unlisted.length > 0 && listsAnyLane) {
    fail(
      `the prerender manifest does not list every auth-lane document: ${unlisted.join(', ')}. ` +
        'A lane route that is not prerendered can only be answered by a per-request render ' +
        '(Cloudflare 1102).',
    )
  }
  if (!listsAnyLane) {
    warn(
      `${relative(process.cwd(), manifestFile)} lists no auth-lane route at all — skipping the ` +
        'listing check (the published-cache proof is authoritative).',
    )
    return
  }
  info(`prerender manifest lists all ${requiredPaths.length} auth-lane documents.`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(USAGE)
    return
  }

  const sourcesRoot = resolve(args.sourcesRoot)
  const laneFamiliesList = laneFamilies(sourcesRoot)
  const laneManifestFile = resolve(
    args.laneManifest ?? join(sourcesRoot, 'lib', 'portalAuthLaneShells.json'),
  )

  assertStaticPageSources(laneFamiliesList)

  const lanes = readLaneManifest(laneManifestFile, laneFamiliesList)
  const requiredPaths = []
  for (const { family } of laneFamiliesList) {
    requiredPaths.push(`/${family}`)
    for (const lane of lanes[family]) requiredPaths.push(`/${family}/${lane}`)
  }

  const assets = resolve(args.assets)
  let buildId = (args.buildId ?? '').trim()
  if (!buildId) {
    const buildIdFile = resolve(DEFAULT_BUILD_ID_FILE)
    if (!existsSync(buildIdFile)) {
      fail(
        `build id not found: ${relative(process.cwd(), buildIdFile)} is missing. ` +
          'Run the Next/OpenNext build before verifying the static incremental cache.',
      )
    }
    buildId = readFileSync(buildIdFile, 'utf8').trim()
  }
  if (!buildId) fail('build id is empty — refusing to verify an unidentified build.')

  const buildDir = join(assets, buildId)
  if (!existsSync(buildDir) || !statSync(buildDir).isDirectory()) {
    fail(
      `published static incremental cache directory is missing: ${relative(process.cwd(), buildDir)}. ` +
        'Run `npm run populate:static-incremental-cache` after the build.',
    )
  }

  const cacheFiles = listFiles(buildDir)
  if (cacheFiles.length === 0) {
    fail(
      `published static incremental cache for build ${buildId} is empty: ` +
        `${relative(process.cwd(), buildDir)} contains no cache entries.`,
    )
  }
  const publishedKeys = new Set(cacheFiles.map((file) => cacheKeyFor(buildDir, file)))

  reportBuildClassification(resolve(args.nextAppDir), requiredPaths)
  assertPrerenderManifest(resolve(args.prerenderManifest), requiredPaths)

  const markers = new Map()
  for (const { family, clientFile } of laneFamiliesList) {
    const marker = extractLaneMarker(clientFile)
    if (!marker) {
      fail(
        `could not read the lane shell copy from ${relative(process.cwd(), clientFile)}; the gate ` +
          'refuses to verify a document it cannot identify.',
      )
    }
    markers.set(family, marker)
  }

  const resolvedKeys = []
  for (const { family } of laneFamiliesList) {
    const variants = markerVariants(markers.get(family))
    const familyPaths = [`/${family}`, ...lanes[family].map((lane) => `/${family}/${lane}`)]
    for (const shellPath of familyPaths) {
      const rel = shellPath.replace(/^\//, '')
      const candidates = [`${rel}`, `${rel}/index`]
      const existing = candidates.filter((key) => publishedKeys.has(key))
      if (existing.length === 0) {
        const keys = [...publishedKeys].sort()
        fail(
          `the ${family} document "${shellPath}" is not published in the static incremental cache for ` +
            `build ${buildId}. Looked for ${candidates.map((key) => `${key}.cache`).join(' or ')}. ` +
            `Published keys: ${keys.slice(0, 40).join(', ')}${keys.length > 40 ? ` … (${keys.length} total)` : ''}. ` +
            'Without it the lane falls back to a per-request render (Cloudflare 1102).',
        )
      }
      const withMarker = existing.find((key) =>
        variants.some((variant) => readPayload(join(buildDir, `${key}.cache`)).includes(variant)),
      )
      if (!withMarker) {
        fail(
          `${existing.map((key) => `${key}.cache`).join(', ')} exist(s) for "${shellPath}" but none ` +
            'contains the lane shell copy rendered by its client component — the entry is empty or ' +
            'belongs to another document.',
        )
      }
      resolvedKeys.push({ shellPath, key: withMarker })
    }
  }

  for (const { shellPath, key } of resolvedKeys) {
    info(`auth-lane document "${shellPath}" published as "${key}.cache" (document text verified).`)
  }
  info(
    `verified ${resolvedKeys.length} auth-lane documents for build ${buildId} ` +
      `(${cacheFiles.length} published cache entries).`,
  )
}

try {
  main()
} catch (error) {
  console.error(
    `[portal-auth-lane-static-cache] ERROR: ${error instanceof Error ? error.message : error}`,
  )
  console.error(USAGE)
  process.exit(1)
}

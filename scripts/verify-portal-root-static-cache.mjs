#!/usr/bin/env node
/**
 * Fail-closed check that the portal root document ships in the read-only
 * Workers Static Assets incremental cache.
 *
 * Why this exists: portal.yousafeconsultancy.com/ is the Cloudflare 1102
 * ("Worker exceeded CPU time limit") route on the Workers Free plan. The fix
 * mirrors the market host — keep the anonymous public document off the Clerk
 * CPU path (lib/portalMiddlewareBypass.ts) and let OpenNext cache interception
 * serve the prerendered HTML from `cdn-cgi/_next_cache` — and that only works
 * while app/page.tsx stays build-static and its prerender cache entry is
 * published inside the Worker's static assets. A deploy whose published cache
 * has no portal root document would silently re-enter the Next.js server on
 * every anonymous `/` request.
 *
 * The cache key is DISCOVERED from the build, never guessed:
 *   1. the key OpenNext derives for a build-static page mirrors that page's
 *      prerender output (marketplace.html -> marketplace.cache,
 *      marketplace/gigs.html -> marketplace/gigs.cache — the keys the deploy
 *      step already requires). The root document is Next's `index.html`, so
 *      `<BUILD_ID>/index.cache` is checked first;
 *   2. independently, the portal root copy is read out of app/page.tsx and
 *      every published cache payload is scanned for it (plain or gzip), so a
 *      differently-named root entry still passes — and is printed so it can be
 *      pinned in .github/workflows/deploy.yml once a green run has proven it.
 *
 * Local filesystem only: no network, no Cloudflare API, no credentials.
 *
 * Usage:
 *   node scripts/verify-portal-root-static-cache.mjs
 *   node scripts/verify-portal-root-static-cache.mjs \
 *     --build-id build-abc \
 *     --assets .open-next/assets/cdn-cgi/_next_cache \
 *     --root-file app/page.tsx
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const DEFAULT_BUILD_ID_FILE = join('.next', 'BUILD_ID')
const DEFAULT_ASSETS_DIR = join('.open-next', 'assets', 'cdn-cgi', '_next_cache')
const DEFAULT_NEXT_ROOT_OUTPUT = join('.next', 'server', 'app', 'index.html')

/**
 * Repository root, derived from this script's location. The portal root page is
 * a repository source file (not a build artifact), so its default path does not
 * depend on the directory the verifier is invoked from.
 */
const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const DEFAULT_ROOT_FILE = join(REPO_ROOT, 'app', 'page.tsx')

/**
 * Derived root key. OpenNext publishes build-static pages as `<key>.cache`
 * where `<key>` is the page's prerender output path relative to
 * `.next/server/app` with `.html` stripped. The root route's output is
 * `index.html`, hence `index` (step 2 in the header re-discovers the entry by
 * content if a future OpenNext release names it differently).
 */
const DERIVED_ROOT_CACHE_KEY = 'index'

const USAGE = `Usage: node scripts/verify-portal-root-static-cache.mjs [options]

Verifies that the portal root document is published in the read-only
static-assets incremental cache (cdn-cgi/_next_cache). Fails closed when the
portal root was not prerendered or its cache entry is missing.

Options:
  --build-id <id>      Build id directory inside the cache (default: .next/BUILD_ID)
  --assets <dir>       Published cache root (default: ${DEFAULT_ASSETS_DIR})
  --root-file <file>   Source of the portal root document copy (default: app/page.tsx at the repo root)
  -h, --help           Show this help
`

function parseArgs(argv) {
  const parsed = {
    buildId: undefined,
    assets: DEFAULT_ASSETS_DIR,
    rootFile: DEFAULT_ROOT_FILE,
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
    } else if (arg === '--root-file') {
      parsed.rootFile = readValue(arg)
    } else if (arg.startsWith('--root-file=')) {
      parsed.rootFile = arg.slice('--root-file='.length)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return parsed
}

function fail(message) {
  console.error(`[portal-root-static-cache] ERROR: ${message}`)
  process.exit(1)
}

function info(message) {
  console.log(`[portal-root-static-cache] ${message}`)
}

function warn(message) {
  console.warn(`[portal-root-static-cache] WARNING: ${message}`)
}

/**
 * The portal root document copy, read from the real page source so the gate
 * cannot drift from the shipped document. Returns null when the source no
 * longer carries a usable `<SeoIntroBlock title="...">`.
 */
function extractRootMarker(rootFile) {
  if (!existsSync(rootFile)) return null
  const source = readFileSync(rootFile, 'utf8')
  const match = source.match(/<SeoIntroBlock[\s\S]*?title="([^"]+)"/)
  if (!match) return null
  const marker = match[1].trim()
  return marker.length >= 24 ? marker : null
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

/**
 * Cache payload bytes. The published entries are static assets, so they are
 * read verbatim; a gzip-compressed payload (magic 0x1f 0x8b) is inflated
 * before matching so the gate does not depend on the adapter's encoding.
 */
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

function payloadHasMarker(payload, variants) {
  return variants.some((variant) => payload.includes(variant))
}

/** `<key>` for a published `<key>.cache` file, relative to the build dir. */
function cacheKeyFor(buildDir, file) {
  const relativePath = relative(buildDir, file)
  return relativePath.endsWith('.cache') ? relativePath.slice(0, -'.cache'.length) : relativePath
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(USAGE)
    return
  }

  const assets = resolve(args.assets)
  const rootFile = resolve(args.rootFile)

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

  const marker = extractRootMarker(rootFile)
  if (!marker) {
    warn(
      `could not read a portal root marker from ${relative(process.cwd(), rootFile)}; ` +
        'falling back to the derived cache key only.',
    )
  }
  const variants = marker ? markerVariants(marker) : []

  const nextRootOutputPath = resolve(DEFAULT_NEXT_ROOT_OUTPUT)
  const nextRootOutputExists = existsSync(nextRootOutputPath)

  const derivedFile = join(buildDir, `${DERIVED_ROOT_CACHE_KEY}.cache`)
  let resolved = null
  if (existsSync(derivedFile) && statSync(derivedFile).isFile()) {
    const payload = readPayload(derivedFile)
    const markerFound = variants.length > 0 && payloadHasMarker(payload, variants)
    resolved = { key: DERIVED_ROOT_CACHE_KEY, proof: 'derived-key', markerFound }
    if (variants.length > 0 && !markerFound) {
      warn(
        `${DERIVED_ROOT_CACHE_KEY}.cache does not contain the portal root document text read from ` +
          `${relative(process.cwd(), rootFile)}; accepting the derived key.`,
      )
    }
  }

  for (const file of cacheFiles) {
    if (resolved) break
    if (file === derivedFile) continue
    if (variants.length === 0) break
    if (!payloadHasMarker(readPayload(file), variants)) continue
    resolved = { key: cacheKeyFor(buildDir, file), proof: 'document-marker', file }
  }

  if (!resolved) {
    const keys = cacheFiles.map((file) => cacheKeyFor(buildDir, file)).sort()
    fail(
      `the portal root document is not published in the static incremental cache for build ${buildId}. ` +
        `Checked the derived key ${DERIVED_ROOT_CACHE_KEY}.cache and scanned every published payload ` +
        `for the portal root copy read from ${relative(process.cwd(), rootFile)}. ` +
        `Next root prerender output ${relative(process.cwd(), nextRootOutputPath)}: ` +
        `${nextRootOutputExists ? 'present' : 'MISSING — the portal root may have become dynamic'}. ` +
        `Published keys: ${keys.slice(0, 40).join(', ')}${keys.length > 40 ? ` … (${keys.length} total)` : ''}. ` +
        'The portal root must stay build-static (app/page.tsx) so cache interception can serve it; ' +
        'if the document IS published under a key not covered here, pin that key in ' +
        '.github/workflows/deploy.yml and update this script.',
    )
  }

  if (!nextRootOutputExists) {
    warn(
      `${relative(process.cwd(), nextRootOutputPath)} is missing — Next did not emit a root prerender ` +
        'output. The published cache entry above is accepted, but the portal root may have stopped ' +
        'being build-static.',
    )
  }

  if (resolved.proof === 'document-marker') {
    info(
      `portal root document discovered under "${resolved.key}.cache" (not the derived ` +
        `"${DERIVED_ROOT_CACHE_KEY}.cache") for build ${buildId} — pin "${resolved.key}" in ` +
        '.github/workflows/deploy.yml.',
    )
  } else {
    info(
      `portal root document published as "${resolved.key}.cache" for build ${buildId}` +
        (resolved.markerFound ? ' (document text verified).' : '.'),
    )
  }
  info(`published ${cacheFiles.length} cache entries for build ${buildId}.`)
}

try {
  main()
} catch (error) {
  console.error(
    `[portal-root-static-cache] ERROR: ${error instanceof Error ? error.message : error}`,
  )
  console.error(USAGE)
  process.exit(1)
}

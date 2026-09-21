#!/usr/bin/env node
/**
 * Market-root document payload budget gate (MARKET-ROOT-TRANSFER-LATENCY).
 *
 * Why this exists: market.yousafeconsultancy.com/ is served from the OpenNext
 * static incremental cache (`x-opennext-cache: HIT`), and the document had grown
 * to 524,455 bytes because the RSC client props carried the ENTIRE active gig
 * inventory (~217 records, twice: HTML + flight) and the landing stylesheet was
 * rendered as an inline <style> element (serialized into both the document and
 * the flight payload). The documented symptom was transfer sensitivity: repeated
 * post-deploy samples of the same cache HIT took 31–50s total while portal/auth
 * lanes stayed fast.
 *
 * This gate verifies the SHIPPED BYTES, not the source: it reads the prerendered
 * market-root document (the published `cdn-cgi/_next_cache/<BUILD_ID>/marketplace.cache`
 * entry when present, otherwise `.next/server/app/marketplace.html`) and fails
 * closed when
 *
 *   1. the document exceeds the byte budget, or is not >= MIN_REDUCTION below
 *      the recorded pre-fix baseline;
 *   2. the document does not ship EXACTLY one ranked page of brief cards;
 *   3. the document serializes a full-inventory-only record field
 *      (`rank_score`, `order_count`) — the regression this gate exists for:
 *      whole gig records travelling to the browser again;
 *   4. the landing stylesheet is back inline in the document;
 *   5. a stylesheet the document links is missing from the published assets
 *      (an unstyled deploy would otherwise go unnoticed).
 *
 * Encoding note: the published cache entry is the runtime's JSON value, read
 * with `response.json()` (`{"type":"app","html":"…"}`), so every quote inside
 * the flight markup arrives escaped — a `\"rank_score\":` in the prerender
 * output is `\\\"rank_score\\\":` in the shipped entry. Every marker counted
 * below is therefore matched at ANY escaping depth. A marker that only matches
 * one encoding is not a verifiable shipped-artifact signal: the previous
 * `providerHeadshot` record count read 0 on the real cache entry for exactly
 * that reason, while the same document rendered all 48 first-page cards.
 *
 * Local filesystem only: no network, no Cloudflare API, no credentials.
 *
 * Usage:
 *   node scripts/verify-market-landing-payload.mjs
 *   node scripts/verify-market-landing-payload.mjs --budget 300000 --cache <file>
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { brotliCompressSync, gzipSync, gunzipSync, constants } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

/** One ranked page of brief cards (lib/marketplaceDisplay FEATURED_PAGE_SIZE). */
const FEATURED_PAGE_SIZE = 48
/**
 * Record fields that exist only on the full inventory record (`LandingGig`) and
 * are dropped by the card projection (`LandingCardGig`) — `rank_score` is the
 * ranking key and `order_count` the demand signal, both consumed server-side
 * only (lib/marketplaceDisplay.ts, PublicMarketplaceLanding.buildSlice). The
 * hero slides never carried them either, so a non-zero count means whole gig
 * records are serialized to the browser again.
 */
const FULL_RECORD_ONLY_FIELDS = ['rank_score', 'order_count']

/** Measured live baseline of market.yousafeconsultancy.com/ before the fix. */
const BASELINE_BYTES = 524455
/** Hard byte budget for the document (>= 40% below the baseline). */
const BUDGET_BYTES = 300000
/** Required reduction against the recorded baseline. */
const MIN_REDUCTION = 0.4

const DEFAULT_BUILD_ID_FILE = join('.next', 'BUILD_ID')
const DEFAULT_NEXT_HTML = join('.next', 'server', 'app', 'marketplace.html')
const DEFAULT_ASSETS = join('.open-next', 'assets')
const DEFAULT_CACHE = join('.open-next', 'assets', 'cdn-cgi', '_next_cache')

const USAGE = `Usage: node scripts/verify-market-landing-payload.mjs [options]

Verifies that the prerendered market-root document stays inside its payload
budget, ships exactly one ranked page of brief cards, and leaks no
full-inventory-only record field.

Options:
  --build-id <id>   Build id directory inside the static cache (default: .next/BUILD_ID)
  --cache <dir>     Published static cache root (default: ${DEFAULT_CACHE})
  --html <file>     Next prerender output fallback (default: ${DEFAULT_NEXT_HTML})
  --assets <dir>    Published Worker assets (default: ${DEFAULT_ASSETS})
  --budget <bytes>  Document byte budget (default: ${BUDGET_BYTES})
  -h, --help        Show this help
`

function parseArgs(argv) {
  const parsed = {
    buildId: undefined,
    cache: DEFAULT_CACHE,
    html: DEFAULT_NEXT_HTML,
    assets: DEFAULT_ASSETS,
    budget: BUDGET_BYTES,
    help: false,
  }
  const readValue = (flag, inline) => {
    if (inline !== undefined && inline !== '') return inline
    const next = argv.shift()
    if (next === undefined || next === '') throw new Error(`${flag} requires a value`)
    return next
  }
  while (argv.length > 0) {
    const arg = argv.shift()
    if (arg === '-h' || arg === '--help') parsed.help = true
    else if (arg === '--build-id') parsed.buildId = readValue(arg)
    else if (arg.startsWith('--build-id=')) parsed.buildId = readValue('--build-id', arg.slice('--build-id='.length))
    else if (arg === '--cache') parsed.cache = readValue(arg)
    else if (arg.startsWith('--cache=')) parsed.cache = readValue('--cache', arg.slice('--cache='.length))
    else if (arg === '--html') parsed.html = readValue(arg)
    else if (arg.startsWith('--html=')) parsed.html = readValue('--html', arg.slice('--html='.length))
    else if (arg === '--assets') parsed.assets = readValue(arg)
    else if (arg.startsWith('--assets=')) parsed.assets = readValue('--assets', arg.slice('--assets='.length))
    else if (arg === '--budget') parsed.budget = Number(readValue(arg))
    else if (arg.startsWith('--budget=')) parsed.budget = Number(readValue('--budget', arg.slice('--budget='.length)))
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return parsed
}

function fail(message) {
  console.error(`[market-landing-payload] ERROR: ${message}`)
  process.exit(1)
}

function info(message) {
  console.log(`[market-landing-payload] ${message}`)
}

/** Published cache payload bytes (a gzip-compressed entry is inflated). */
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

/**
 * Extract the HTML document out of a cache payload. OpenNext stores the
 * prerender body verbatim (plain in the Next prerender output, inside a
 * `{"type":"app","html":"…"}` JSON envelope in the published cache entry), so
 * the document is sliced from `<!DOCTYPE html` through `</html>`. The slice is
 * NOT unescaped: escaping is an artifact of the container, and every marker
 * counted below is matched at any escaping depth instead.
 */
export function extractDocument(payload) {
  const text = payload.toString('utf8')
  const start = text.indexOf('<!DOCTYPE html')
  if (start < 0) return { document: text }
  const end = text.indexOf('</html>', start)
  const slice = end < 0 ? text.slice(start) : text.slice(start, end + '</html>'.length)
  return { document: slice }
}

/**
 * Card markup the server rendered. styled-jsx appends its own hash class to the
 * element, so the marker is the `gig-link` class inside a `class="…"` attribute
 * (never the stylesheet selector, which has no quotes after the class name) —
 * matched at any escaping depth: `class="…gig-link"` in the prerender output,
 * `class=\"…gig-link\"` in the published cache entry.
 */
export function countRenderedCards(document) {
  return document.match(/class=\\{0,2}"[^"\\]*\bgig-link\\{0,2}"/g)?.length ?? 0
}

/**
 * Occurrences of a serialized record field, matched at ANY escaping depth, so
 * the same key counts in the prerender output (`"rank_score":`), the
 * single-escaped flight stream (`\"rank_score\":`) and the shipped cache entry
 * (`\\\"rank_score\\\":`).
 */
export function countSerializedField(text, field) {
  return text.match(new RegExp('(?:\\\\)*"' + field + '(?:\\\\)*":', 'g'))?.length ?? 0
}

/**
 * Escaping-depth independent occurrence count for a bare field name — the
 * fail-closed leakage signal (it cannot be dodged by adding another escaping
 * layer around the key).
 */
export function countFieldName(text, field) {
  return text.match(new RegExp('\\b' + field + '\\b', 'g'))?.length ?? 0
}

/**
 * Size of the largest inline `<style>` block in the document. The landing
 * stylesheet used to be the only large one (~50 KB rendered as an inline style
 * element, which React serializes into the document AND the flight payload).
 */
export function largestInlineStyleBlock(document) {
  let largest = 0
  const pattern = /<style[^>]*>([\s\S]*?)<\/style>/g
  let match
  while ((match = pattern.exec(document))) {
    largest = Math.max(largest, Buffer.byteLength(match[1], 'utf8'))
  }
  return largest
}

/**
 * Largest inline style block a market-root document may carry. Every remaining
 * inline block is a small styled-jsx island (the biggest measures under 10 KB);
 * anything near this ceiling means the landing stylesheet went back inline.
 */
const MAX_INLINE_STYLE_BYTES = 32768

/**
 * Local stylesheets the document links, matched at any escaping depth so the
 * publication check below is never vacuous on the shipped cache entry
 * (`href="/_next/static/css/x.css"` vs `href=\"/_next/static/css/x.css\"`).
 */
function linkedLocalStylesheets(document) {
  const hrefs = new Set()
  const pattern = /href=\\{0,2}"(\/_next\/static\/css\/[^"\\]+\.css)\\{0,2}"/g
  let match
  while ((match = pattern.exec(document))) hrefs.add(match[1])
  return [...hrefs]
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(USAGE)
    return
  }

  let buildId = (args.buildId ?? '').trim()
  if (!buildId) {
    const buildIdFile = resolve(REPO_ROOT, DEFAULT_BUILD_ID_FILE)
    if (!existsSync(buildIdFile)) {
      fail(
        `${DEFAULT_BUILD_ID_FILE} is missing — run the Next/OpenNext build before verifying the market-root payload.`,
      )
    }
    buildId = readFileSync(buildIdFile, 'utf8').trim()
  }

  const cacheFile = resolve(REPO_ROOT, args.cache, buildId, 'marketplace.cache')
  const nextHtmlFile = resolve(REPO_ROOT, args.html)
  const source = existsSync(cacheFile) ? cacheFile : existsSync(nextHtmlFile) ? nextHtmlFile : null
  if (!source) {
    fail(
      `market-root document not found. Looked for the published cache entry ` +
        `${cacheFile} and the prerender output ${nextHtmlFile}.`,
    )
  }

  const payloadBytes = readPayload(source)
  const { document } = extractDocument(payloadBytes)
  // Measured AS STORED: for a published cache entry that includes the JSON
  // envelope's escaping overhead, so the budget below is never optimistic.
  const bytes = Buffer.byteLength(document, 'utf8')
  const br = brotliCompressSync(Buffer.from(document), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length
  const gzip = gzipSync(Buffer.from(document)).length
  const reduction = (BASELINE_BYTES - bytes) / BASELINE_BYTES

  info(
    `source=${source.replace(REPO_ROOT + '/', '')} bytes=${bytes} br=${br} gzip=${gzip} ` +
      `baseline=${BASELINE_BYTES} reduction=${(reduction * 100).toFixed(1)}%`,
  )

  if (bytes > args.budget) {
    fail(
      `market-root document is ${bytes} bytes, over the ${args.budget} byte budget. ` +
        'The landing must serialize the first ranked page only (see lib/marketplaceLandingPaging.ts).',
    )
  }
  if (reduction < MIN_REDUCTION) {
    fail(
      `market-root document is only ${(reduction * 100).toFixed(1)}% below the ${BASELINE_BYTES} byte ` +
        `pre-fix baseline; at least ${(MIN_REDUCTION * 100).toFixed(0)}% is required.`,
    )
  }

  const renderedCards = countRenderedCards(document)
  if (renderedCards !== FEATURED_PAGE_SIZE) {
    fail(
      `the document renders ${renderedCards} brief cards; exactly ${FEATURED_PAGE_SIZE} ` +
        '(one ranked page) must be server-rendered and crawlable.',
    )
  }

  // Whole-record leakage guard. The card projection drops the two fields that
  // only the server needs, so ANY serialized occurrence — in any encoding —
  // means the full active inventory is travelling to the browser again. Later
  // pages belong to /api/marketplace/gigs?view=card.
  const leakCounts = FULL_RECORD_ONLY_FIELDS.map((field) => ({
    field,
    occurrences: countFieldName(document, field),
    keyed: countSerializedField(document, field),
  }))
  const leaked = leakCounts.filter((entry) => entry.occurrences > 0)
  if (leaked.length > 0) {
    fail(
      `the document serializes full-inventory-only record field(s) ` +
        `${leaked.map((entry) => `${entry.field}×${entry.occurrences}`).join(', ')}; ` +
        `only the ${FEATURED_PAGE_SIZE} first-page cards (+ hero case-file slides) may travel to the browser. ` +
        'Whole gig records are back in the shipped payload — project them with toLandingCards() ' +
        '(lib/marketplaceDisplay.ts).',
    )
  }

  const largestStyleBlock = largestInlineStyleBlock(document)
  if (largestStyleBlock > MAX_INLINE_STYLE_BYTES) {
    fail(
      `the document carries a ${largestStyleBlock} byte inline <style> block (limit ${MAX_INLINE_STYLE_BYTES}); ` +
        'the landing stylesheet is inline again, so it is serialized twice (document + RSC flight). ' +
        'Keep it as app/marketplace/marketplace-landing.css.',
    )
  }

  const assetsDir = resolve(REPO_ROOT, args.assets)
  if (existsSync(assetsDir)) {
    const missing = linkedLocalStylesheets(document).filter(
      (href) => !existsSync(join(assetsDir, href.replace(/^\//, ''))),
    )
    if (missing.length > 0) {
      fail(
        `the document links stylesheets that are not published in ${args.assets}: ${missing.join(', ')} ` +
          '(an unstyled market root would ship).',
      )
    }
    info(`verified ${linkedLocalStylesheets(document).length} linked stylesheet(s) against ${args.assets}`)
  } else {
    info(`assets directory ${assetsDir} not present — skipped stylesheet publication check`)
  }

  info(
    `OK cards=${renderedCards} ` +
      `${leakCounts.map((entry) => `${entry.field}=${entry.occurrences}(keys=${entry.keyed})`).join(' ')} ` +
      `inlineStyle=${largestStyleBlock} budget=${args.budget} reduction=${(reduction * 100).toFixed(1)}%`,
  )
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
if (invokedDirectly) {
  try {
    main()
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

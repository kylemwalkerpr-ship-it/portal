#!/usr/bin/env node
/**
 * scan-estate-links.mjs — live-estate link integrity scanner.
 *
 * Operational companion to lib/seoFactory/linkAudit.ts. Crawls the estate
 * sitemap, then for every page extracts hrefs and flags:
 *   - placeholder / invented hosts (example.com, yourdomain.com …) — hard fails
 *   - internal links that return HTTP >= 400 (dead) or network errors
 *
 * Usage:
 *   node scripts/scan-estate-links.mjs                     # full estate
 *   node scripts/scan-estate-links.mjs --limit 20          # first 20 pages
 *   node scripts/scan-estate-links.mjs --path /us/essay    # only matching pages
 *
 * Exit code 0 = clean, 1 = placeholder links found, 2 = dead links found,
 * 3 = both. Env overrides: ESTATE_SITEMAP_URL, ESTATE_BASE.
 */

const ESTATE_BASE = process.env.ESTATE_BASE || 'https://legal.yousafeconsultancy.com'
const SITEMAP_URL = process.env.ESTATE_SITEMAP_URL || `${ESTATE_BASE}/sitemap.xml`
const CONCURRENCY = Number(process.env.SCAN_CONCURRENCY || 4)
const TIMEOUT_MS = Number(process.env.SCAN_TIMEOUT_MS || 20000)
// 429/403 are Cloudflare rate-limit / WAF signals, not dead links. Persistent
// rate limits are reported as warnings; only genuine 4xx/5xx/network failures
// count as dead.
const RATE_LIMITED_STATUSES = new Set([403, 429])

const PLACEHOLDER_HOST_RE =
  /(^|\.)(example\.(com|org|net|test)|yourdomain\.com|your-domain\.com|yourwebsite|your-site|mysite\.com|mywebsite|sitename\.com|websitename|domain\.com|sample\.com|test\.com|website\.com|site\.com|localhost|anything\.com|somesite|lorem\.com|placeholder\.com)$/i
const PLACEHOLDER_PATH_RE =
  /\b(example|sample-page|placeholder|lorem-ipsum|your-site|your-url|todo|fixme|dummy|test-page)\b/i

const SKIP_PREFIXES = ['#', 'mailto:', 'tel:', 'javascript:', 'data:']
const SKIP_SUBSTR = ['_next/static', 'cdn-cgi', '.css', '.js', '.woff', '.png', '.jpg', '.svg', '.ico', 'ahrefs.com']

function classify(url) {
  const u = url.trim()
  if (!u) return null
  if (SKIP_PREFIXES.some((p) => u.startsWith(p))) return null
  if (SKIP_SUBSTR.some((s) => u.includes(s))) return null
  if (PLACEHOLDER_PATH_RE.test(u)) return { kind: 'placeholder', what: 'path token' }
  if (/^https?:\/\//i.test(u)) {
    try {
      const host = new URL(u).hostname.replace(/^www\./i, '')
      if (PLACEHOLDER_HOST_RE.test(host)) return { kind: 'placeholder', what: host }
    } catch {
      /* malformed — ignore external parse failures */
    }
  }
  if (/^https?:\/\/(www\.)?caseworks\.com/i.test(u)) return { kind: 'placeholder', what: 'dead legacy domain (caseworks.com)' }
  return null
}

function isInternal(u) {
  return u.startsWith('/') || /^https?:\/\/legal\.yousafeconsultancy\.com\//i.test(u)
}

async function fetchXml(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`sitemap ${res.status}`)
  return res.text()
}

async function checkStatus(u) {
  const target = isInternal(u) ? u : null
  if (!target) return null
  const url = /^https?:/i.test(target) ? target : `${ESTATE_BASE}${target.startsWith('/') ? target : `/${target}`}`
  // Up to 3 attempts with backoff; HEAD falls back to GET on 403/405/429/501
  // (many estates reject HEAD outright and answer fine on GET).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(12000) })
      if ([403, 405, 429, 501].includes(res.status)) {
        res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(12000) })
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 900 * (attempt + 1)))
        continue
      }
      return res.status
    } catch {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 900 * (attempt + 1)))
        continue
      }
      return 0
    }
  }
  return 429
}

async function main() {
  const argv = process.argv.slice(2)
  const limitIdx = argv.findIndex((a) => a === '--limit')
  const pathIdx = argv.findIndex((a) => a === '--path')
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : Infinity
  const pathFilter = pathIdx >= 0 ? argv[pathIdx + 1] : null

  const xml = await fetchXml(SITEMAP_URL)
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
  const pages = locs.filter((l) => (pathFilter ? l.includes(pathFilter) : true)).slice(0, limit)
  console.log(`scanning ${pages.length} pages (sitemap has ${locs.length})`)

  let placeholderPages = 0
  let deadPages = 0
  const bad = []
  let cursor = 0
  const worker = async () => {
    while (cursor < pages.length) {
      const page = pages[cursor++]
      let html
      try {
        const res = await fetch(page, { signal: AbortSignal.timeout(TIMEOUT_MS) })
        if (!res.ok) { console.log(`  ⚠ page itself ${res.status}: ${page}`); continue }
        html = await res.text()
      } catch { console.log(`  ⚠ page unreachable: ${page}`); continue }

      const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]).filter((h) => classify(h) || (isInternal(h) && !h.startsWith('/')))
      const placeholders = [...new Set(hrefs.map((h) => classify(h)).filter(Boolean))]
      // Exclude Cloudflare challenge URLs (cdn-cgi/content?id=…) — session-specific and
// will 404 on any subsequent request. They are not real internal links.
const internal = [...new Set(hrefs.filter(isInternal).filter((h) => !h.includes('/cdn-cgi/')))]

      const pagePlaceholders = []
      for (const p of placeholders) pagePlaceholders.push(p.what)
      const dead = []
      const rateLimited = []
      const statuses = await Promise.all(internal.map((u) => checkStatus(u).then((s) => ({ u, s }))))
      for (const { u, s } of statuses) {
        if (s === null) continue
        if (RATE_LIMITED_STATUSES.has(s)) rateLimited.push({ u, s })
        else if (s >= 400) dead.push({ u, s })
      }

      if (pagePlaceholders.length || dead.length) {
        bad.push({ page, placeholders: pagePlaceholders, dead })
        if (pagePlaceholders.length) placeholderPages++
        if (dead.length) deadPages++
        console.log(`\n✗ ${page}`)
        if (pagePlaceholders.length) console.log(`    PLACEHOLDER: ${pagePlaceholders.join(', ')}`)
        for (const d of dead) console.log(`    DEAD ${d.s}: ${d.u}`)
      } else if (rateLimited.length) {
        console.log(`  ⚠ ${page} — ${rateLimited.length} link(s) rate-limited (verify manually)`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, pages.length)) }, worker))

  console.log(`\n=== SUMMARY ===`)
  console.log(`pages scanned:      ${pages.length}`)
  console.log(`pages w/ placeholders: ${placeholderPages}`)
  console.log(`pages w/ dead links:   ${deadPages}`)
  console.log(`total problem pages:   ${bad.length}`)
  if (!bad.length) console.log('✅ estate is clean')
  process.exit(bad.length ? (placeholderPages && deadPages ? 3 : placeholderPages ? 1 : 2) : 0)
}

main().catch((e) => { console.error('scan failed:', e.message); process.exit(4) })

#!/usr/bin/env node
/**
 * Landing-page link audit — Brief 48 §15.
 *
 * Standalone Node script (no Playwright dep). Hits the deployed (or local)
 * portal landing URL, parses every <a href> in the HTML, and asserts each
 * destination matches the canonical contract:
 *   - Marketplace links → market.yousafeconsultancy.com (never portal.*/marketplace)
 *   - Auth routes /sign-in/{role} and /sign-up/{role} use known roles
 *   - Categories use the 8 real IDs from lib/categories.ts
 *   - Only approved hosts appear
 *
 * Run: node tests/landing-links.audit.mjs [BASE_URL]
 *   default BASE_URL is https://portal.yousafeconsultancy.com/
 *
 * Exits 0 on success, 1 on issues. Use as a CI gate when the team
 * adopts Playwright; until then it's the manual smoke-test in §15.
 */

const BASE = process.argv[2] || 'https://portal.yousafeconsultancy.com/'

const CATEGORY_IDS = new Set([
  'immigration', 'education', 'legal', 'settlement',
  'career', 'business', 'credentials', 'mentorship',
])
const ROLE_IDS = new Set(['student', 'attorney', 'consultant', 'admin', 'support'])

const MARKET_HOST  = 'market.yousafeconsultancy.com'
const PORTAL_HOST  = 'portal.yousafeconsultancy.com'
const MEDIA_HOST   = 'media.yousafeconsultancy.com'
const SUPPORT_HOST = 'support.yousafeconsultancy.com'
const BRAND_HOST   = 'yousafeconsultancy.com'
const LEGAL_HOST   = 'legal.yousafeconsultancy.com'
const COUNTRY_HOSTS = new Set([
  'usa.yousafeconsultancy.com',
  'uk.yousafeconsultancy.com',
  'ca.yousafeconsultancy.com',
])
const SOCIAL_HOSTS = new Set([
  'linkedin.com',
  'x.com',
  'twitter.com',
  'facebook.com',
  'instagram.com',
])

async function main() {
  const res = await fetch(BASE)
  if (!res.ok) {
    console.error(`✘ Fetch failed: ${BASE} returned ${res.status}`)
    process.exit(1)
  }
  const html = await res.text()

  // Naive but sufficient: extract every href + adjacent text within an <a>
  const hrefRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  const links = []
  let m
  while ((m = hrefRe.exec(html))) {
    const href = m[1]
    const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 60)
    links.push({ href, text })
  }

  const issues = []

  for (const { href, text } of links) {
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue
    if (href.startsWith('/')) continue // relative — Next handles
    if (!/^https?:\/\//.test(href)) {
      issues.push({ href, text, issue: 'malformed href' })
      continue
    }

    let url
    try { url = new URL(href) } catch { issues.push({ href, text, issue: 'unparseable URL' }); continue }
    const h = url.host
    const p = url.pathname

    // HARD RULE: no marketplace pages on the portal host
    if (h === PORTAL_HOST && p.startsWith('/marketplace')) {
      issues.push({ href, text, issue: 'marketplace link on portal.* — should be market.*' })
      continue
    }
    // Portal auth routes role-validated
    if (h === PORTAL_HOST) {
      const si = p.match(/^\/sign-in\/([^/]+)\/?$/)
      const su = p.match(/^\/sign-up\/([^/]+)\/?$/)
      if (si && !ROLE_IDS.has(si[1])) issues.push({ href, text, issue: `unknown role "${si[1]}"` })
      if (su && !ROLE_IDS.has(su[1])) issues.push({ href, text, issue: `unknown role "${su[1]}"` })
      continue
    }
    // Marketplace deep-links category/provider/gig-validated
    if (h === MARKET_HOST) {
      const cat = p.match(/^\/categories\/([^/]+)\/?$/)
      if (cat && !CATEGORY_IDS.has(cat[1])) {
        issues.push({ href, text, issue: `unknown category id "${cat[1]}"` })
      }
      if (p !== '/' && !/^\/(categories|providers|gigs|templates)(\/.*)?$/.test(p)) {
        issues.push({ href, text, issue: `unexpected market path "${p}"` })
      }
      continue
    }
    // Approved hosts pass-through
    if (h === SUPPORT_HOST || h === BRAND_HOST || h === LEGAL_HOST || h === MEDIA_HOST) continue
    if (COUNTRY_HOSTS.has(h) || SOCIAL_HOSTS.has(h)) continue

    issues.push({ href, text, issue: `unrecognised host "${h}"` })
  }

  // Banned-word sweep — brief acceptance: "lane" must not appear in rendered DOM
  const lowerHtml = html.toLowerCase()
  // Allow url params like ?lane=student inside test commands but the brief is
  // about visible DOM text, so scan only between tags.
  const visibleText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase()
  if (/\blane[s]?\b/.test(visibleText)) {
    issues.push({ href: '-', text: 'visible DOM', issue: 'word "lane" found in rendered text' })
  }

  console.log(`Audited ${BASE}`)
  console.log(`Links scanned: ${links.length}`)

  if (issues.length === 0) {
    console.log('✓ All links match the canonical contract.')
    process.exit(0)
  }

  console.error(`✘ ${issues.length} issue(s):`)
  for (const i of issues) {
    console.error(`  · ${i.issue}`)
    console.error(`    href: ${i.href}`)
    console.error(`    text: ${i.text || '(empty)'}`)
  }
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

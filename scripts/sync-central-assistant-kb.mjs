#!/usr/bin/env node

/**
 * Builds the public-network portion of the system-wide YQAA knowledge base.
 *
 * The approved knowledge estate is the deployed public surface of each sibling
 * repository, not raw private source code. We crawl every public sister-site
 * sitemap, attach repository provenance, validate required country/repo
 * coverage, and only then atomically replace the shared network snapshot.
 *
 * Private/authenticated portal pages are intentionally excluded. Live private
 * provider/gig context continues to come from Messenger's existing DB loader.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const OUTPUT = path.join(ROOT, 'content', 'messenger-kb', 'network-pages.json')
const COVERAGE_OUTPUT = path.join(ROOT, 'content', 'messenger-kb', 'network-coverage.json')
const MAX_PAGES_PER_SITE = Number(process.env.ASSISTANT_KB_MAX_PAGES_PER_SITE || 1200)
const MAX_PAGE_TEXT = Number(process.env.ASSISTANT_KB_MAX_PAGE_TEXT || 3200)
const CONCURRENCY = Math.max(1, Number(process.env.ASSISTANT_KB_CONCURRENCY || 6))
const TIMEOUT_MS = 20_000

const SITES = [
  { id: 'main', base: 'https://yousafeconsultancy.com', repo: 'kylemwalkerpr-ship-it/yousafe-consultancy', minPages: 1 },
  { id: 'usa', base: 'https://usa.yousafeconsultancy.com', repo: 'kylemwalkerpr-ship-it/yousafe-consultancy', minPages: 2 },
  { id: 'canada', base: 'https://ca.yousafeconsultancy.com', repo: 'kylemwalkerpr-ship-it/yousafe-consultancy', minPages: 2 },
  { id: 'uk', base: 'https://uk.yousafeconsultancy.com', repo: 'kylemwalkerpr-ship-it/yousafe-consultancy', minPages: 2 },
  {
    id: 'australia',
    base: 'https://au.yousafeconsultancy.com',
    repo: 'kylemwalkerpr-ship-it/yousafe-consultancy',
    minPages: 3,
    requiredTerms: ['australia', 'subclass 500'],
  },
  { id: 'caseworks', base: 'https://legal.yousafeconsultancy.com', repo: 'kylemwalkerpr-ship-it/caseworks', minPages: 1 },
  { id: 'market', base: 'https://market.yousafeconsultancy.com', repo: 'kylemwalkerpr-ship-it/portal', minPages: 1 },
  { id: 'support', base: 'https://support.yousafeconsultancy.com', repo: 'kylemwalkerpr-ship-it/support-saas', minPages: 1 },
]

const REQUIRED_REPOS = [
  'kylemwalkerpr-ship-it/portal',
  'kylemwalkerpr-ship-it/yousafe-consultancy',
  'kylemwalkerpr-ship-it/caseworks',
  'kylemwalkerpr-ship-it/support-saas',
]

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCodePoint(Number(n)) } catch { return ' ' }
    })
}

function htmlToText(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h1|h2|h3|h4|section|article|div)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function pageTitle(html, fallback) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return decodeEntities(match?.[1] || fallback).replace(/\s+/g, ' ').trim().slice(0, 240)
}

async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'YouSafeCentralAssistantKB/2.0', Accept: 'text/html,application/xml,text/xml;q=0.9,*/*;q=0.5' },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return { text: await res.text(), contentType: res.headers.get('content-type') || '' }
  } finally {
    clearTimeout(timer)
  }
}

function sitemapUrls(xml, base) {
  const urls = []
  const host = new URL(base).hostname
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi
  let match
  while ((match = re.exec(xml))) {
    try {
      const url = new URL(decodeEntities(match[1]))
      if (url.protocol === 'https:' && url.hostname === host) urls.push(url.toString())
    } catch {}
  }
  return [...new Set(urls)]
}

async function discoverPages(site) {
  const sitemapCandidates = [`${site.base}/sitemap.xml`, `${site.base}/sitemap_index.xml`]
  const pages = new Set([`${site.base}/`])
  const childSitemaps = []

  for (const candidate of sitemapCandidates) {
    try {
      const { text } = await fetchText(candidate)
      const found = sitemapUrls(text, site.base)
      for (const url of found) {
        if (/\.xml(?:\?|$)/i.test(url)) childSitemaps.push(url)
        else pages.add(url)
      }
      if (found.length) break
    } catch {}
  }

  for (const child of childSitemaps.slice(0, 40)) {
    try {
      const { text } = await fetchText(child)
      for (const url of sitemapUrls(text, site.base)) {
        if (!/\.xml(?:\?|$)/i.test(url)) pages.add(url)
      }
    } catch (err) {
      console.warn(`[assistant-kb] child sitemap failed ${child}: ${err.message}`)
    }
  }

  return [...pages].slice(0, MAX_PAGES_PER_SITE)
}

async function mapConcurrent(items, worker) {
  const out = new Array(items.length)
  let cursor = 0
  async function run() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      try { out[index] = await worker(items[index], index) } catch (err) { out[index] = { error: err } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length || 1) }, run))
  return out
}

async function crawlSite(site) {
  const urls = await discoverPages(site)
  console.log(`[assistant-kb] ${site.id}: ${urls.length} public URLs discovered`)
  const results = await mapConcurrent(urls, async (url) => {
    const { text: html, contentType } = await fetchText(url)
    if (!/html/i.test(contentType) && !/<html/i.test(html)) return null
    const body = htmlToText(html).slice(0, MAX_PAGE_TEXT)
    if (body.length < 80) return null
    const parsed = new URL(url)
    return {
      id: `network:${site.id}:${parsed.pathname}${parsed.search}`,
      title: pageTitle(html, parsed.pathname || site.id),
      repository: site.repo,
      site: site.id,
      sourceUrl: url,
      body: `Source repository: ${site.repo}\nSource site: ${site.base}\nSource URL: ${url}\n\n${body}`,
    }
  })
  const rows = []
  for (const result of results) {
    if (result && !result.error) rows.push(result)
    else if (result?.error) console.warn(`[assistant-kb] ${site.id}: ${result.error.message}`)
  }
  return rows
}

function validateSiteCoverage(site, rows) {
  const problems = []
  if (rows.length < site.minPages) {
    problems.push(`expected at least ${site.minPages} pages, got ${rows.length}`)
  }
  const haystack = rows.map((row) => `${row.title}\n${row.body}`).join('\n').toLowerCase()
  for (const term of site.requiredTerms || []) {
    if (!haystack.includes(String(term).toLowerCase())) {
      problems.push(`missing required evidence term: ${term}`)
    }
  }
  return problems
}

const all = []
const siteCoverage = []
const fatalProblems = []

for (const site of SITES) {
  let rows = []
  let crawlError = null
  try {
    rows = await crawlSite(site)
  } catch (err) {
    crawlError = err instanceof Error ? err.message : String(err)
    console.warn(`[assistant-kb] ${site.id} crawl failed: ${crawlError}`)
  }

  const problems = validateSiteCoverage(site, rows)
  if (crawlError && site.minPages > 0) problems.push(`crawl failed: ${crawlError}`)
  if (problems.length && site.minPages > 0) {
    for (const problem of problems) fatalProblems.push(`${site.id}: ${problem}`)
  }

  all.push(...rows)
  siteCoverage.push({
    id: site.id,
    repository: site.repo,
    base: site.base,
    records: rows.length,
    required: site.minPages > 0,
    problems,
  })
}

const repoCoverage = REQUIRED_REPOS.map((repository) => {
  const records = all.filter((row) => row.repository === repository).length
  const localCore = repository === 'kylemwalkerpr-ship-it/portal'
  if (records < 1 && !localCore) fatalProblems.push(`${repository}: no public knowledge records`)
  return { repository, records, localCore }
})

const coverageReport = {
  generatedAt: new Date().toISOString(),
  status: fatalProblems.length ? 'rejected' : 'healthy',
  requiredMarkets: ['United States', 'United Kingdom', 'Canada', 'Australia'],
  sites: siteCoverage,
  repositories: repoCoverage,
  problems: fatalProblems,
}

await fs.mkdir(path.dirname(OUTPUT), { recursive: true })
await fs.writeFile(COVERAGE_OUTPUT, `${JSON.stringify(coverageReport, null, 2)}\n`, 'utf8')

if (fatalProblems.length) {
  console.error('[assistant-kb] refusing to replace healthy snapshot because coverage validation failed:')
  for (const problem of fatalProblems) console.error(`- ${problem}`)
  process.exitCode = 1
} else {
  all.sort((a, b) => a.id.localeCompare(b.id))
  const tempOutput = `${OUTPUT}.tmp`
  await fs.writeFile(tempOutput, `${JSON.stringify(all, null, 2)}\n`, 'utf8')
  await fs.rename(tempOutput, OUTPUT)
  console.log(`[assistant-kb] wrote ${all.length} page records to ${path.relative(ROOT, OUTPUT)}`)
  console.log(`[assistant-kb] sibling-repo coverage healthy across ${REQUIRED_REPOS.length} repositories`)
}

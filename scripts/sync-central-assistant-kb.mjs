#!/usr/bin/env node

/**
 * Builds the public-network portion of the system-wide YouSafe Assistant KB.
 *
 * Source of truth is the published YouSafe sister-site network. We crawl each
 * public sitemap, extract readable page text, and write ranked-KB-compatible
 * JSON into content/messenger-kb/network-pages.json. Messenger and every site
 * assistant therefore consume the same centrally refreshed content.
 *
 * Private/authenticated portal pages are intentionally excluded. Live private
 * provider/gig context continues to come from Messenger's existing DB loader.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const OUTPUT = path.join(ROOT, 'content', 'messenger-kb', 'network-pages.json')
const MAX_PAGES_PER_SITE = Number(process.env.ASSISTANT_KB_MAX_PAGES_PER_SITE || 1200)
const MAX_PAGE_TEXT = Number(process.env.ASSISTANT_KB_MAX_PAGE_TEXT || 6000)
const CONCURRENCY = Math.max(1, Number(process.env.ASSISTANT_KB_CONCURRENCY || 6))
const TIMEOUT_MS = 20_000

const SITES = [
  { id: 'main', base: 'https://yousafeconsultancy.com' },
  { id: 'usa', base: 'https://usa.yousafeconsultancy.com' },
  { id: 'canada', base: 'https://ca.yousafeconsultancy.com' },
  { id: 'uk', base: 'https://uk.yousafeconsultancy.com' },
  { id: 'australia', base: 'https://au.yousafeconsultancy.com' },
  { id: 'caseworks', base: 'https://legal.yousafeconsultancy.com' },
  { id: 'market', base: 'https://market.yousafeconsultancy.com' },
  { id: 'checkout', base: 'https://checkout.yousafeconsultancy.com' },
  { id: 'support', base: 'https://support.yousafeconsultancy.com' },
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
      headers: { 'User-Agent': 'YouSafeCentralAssistantKB/1.0', Accept: 'text/html,application/xml,text/xml;q=0.9,*/*;q=0.5' },
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
      body: `Source site: ${site.base}\nSource URL: ${url}\n\n${body}`,
    }
  })
  const rows = []
  for (const result of results) {
    if (result && !result.error) rows.push(result)
    else if (result?.error) console.warn(`[assistant-kb] ${site.id}: ${result.error.message}`)
  }
  return rows
}

const all = []
for (const site of SITES) {
  try {
    all.push(...await crawlSite(site))
  } catch (err) {
    console.warn(`[assistant-kb] ${site.id} crawl failed: ${err.message}`)
  }
}

all.sort((a, b) => a.id.localeCompare(b.id))
await fs.mkdir(path.dirname(OUTPUT), { recursive: true })
await fs.writeFile(OUTPUT, `${JSON.stringify(all, null, 2)}\n`, 'utf8')
console.log(`[assistant-kb] wrote ${all.length} page records to ${path.relative(ROOT, OUTPUT)}`)

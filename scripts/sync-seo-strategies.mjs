#!/usr/bin/env node
/**
 * Sync SEO strategies corpus → public/seo-data (runtime assets, not Worker bundle).
 *
 * Source (default):
 *   ~/Documents/GitHub/SEO strategies
 *
 * Usage:
 *   node scripts/sync-seo-strategies.mjs
 *   SEO_STRATEGIES_DIR=/path/to/SEO\ strategies node scripts/sync-seo-strategies.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'public', 'seo-data')
const docsOut = join(outDir, 'strategies')
const sourceDir =
  process.env.SEO_STRATEGIES_DIR ||
  join(homedir(), 'Documents', 'GitHub', 'SEO strategies')

function ensureDir(p) {
  mkdirSync(p, { recursive: true })
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 0) + '\n', 'utf8')
  console.log('wrote', path.replace(root + '/', ''), Buffer.byteLength(JSON.stringify(data)))
}

function readText(path) {
  return readFileSync(path, 'utf8')
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean)
  if (!lines.length) return []
  const headers = splitCsvLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    if (!cols.length) continue
    const row = {}
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? ''
    })
    rows.push(row)
  }
  return rows
}

function splitCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"'
        i++
      } else inQ = !inQ
      continue
    }
    if (c === ',' && !inQ) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

function extractSections(md, maxChars = 12000) {
  const sections = []
  const parts = md.split(/\n(?=#{1,3}\s)/)
  for (const part of parts) {
    const m = part.match(/^(#{1,3})\s+(.+)\n([\s\S]*)$/)
    if (!m) continue
    const title = m[2].trim()
    let body = m[3].trim()
    if (body.length > 2500) body = body.slice(0, 2500) + '\n…'
    sections.push({ level: m[1].length, title, body })
  }
  // Prefer high-signal titles
  const priority = /ownership|standing|rule|policy|house|style|ymyl|host|repo|legal|regional|market|gsc|ctr|hub|from |university|index|canonical|blog|transaction/i
  sections.sort((a, b) => {
    const pa = priority.test(a.title) ? 0 : 1
    const pb = priority.test(b.title) ? 0 : 1
    return pa - pb
  })
  const picked = []
  let n = 0
  for (const s of sections) {
    const chunk = `## ${s.title}\n${s.body}`
    if (n + chunk.length > maxChars) break
    picked.push(s)
    n += chunk.length
  }
  return picked
}

function buildHouseStyle() {
  return {
    id: 'house-style',
    version: '2026-07-22',
    voice: 'calm, precise, practitioner-grade; second person (you); plain English',
    bannedWords: [
      'delve',
      'streamline',
      'game-changer',
      'revolutionize',
      'leverage',
      'robust',
      'seamless',
      'holistic',
      'bespoke',
      'unpack',
      'navigate the complexities',
    ],
    bannedPatterns: ["In today's fast-paced", 'It\'s not just X'],
    rules: [
      'ZERO outcome promises — no guarantees of visas, approvals, or timelines',
      'Cite official .gov/.edu sources with full https URLs (USCIS, IRCC, UKVI, Home Affairs)',
      'Procedural / YMYL content ships to legal (caseworks), not regional clones',
      'Geo from-country pages ship to regional /from/ and must link legal pillars',
      'Blog is news/summary only and must link the legal owner URL',
      'Transactional intents ship to market only when supply exists',
      'One primary intent → one indexable owner URL across the estate',
    ],
    structure: [
      'YAML front matter: title, description, primaryKeyword, robots, date',
      'TL;DR / In 60 seconds',
      '≥4 H2 sections with procedures, documents, risks',
      'FAQ (4–6) + FAQPage JSON-LD',
      'Article JSON-LD',
      'Sources list with official URLs',
      'Educational disclaimer (not legal advice)',
    ],
  }
}

function buildStandingRules() {
  return {
    id: 'standing-rules',
    source: 'OWNERSHIP_REGISTRY.md + SEO_DEEP_STRATEGY',
    rules: [
      {
        id: 'ymyl-legal',
        summary: 'Procedural / YMYL → legal (caseworks)',
        detail:
          'Regional pages hand off; they do not restate form-level law without citations and legal owner links.',
      },
      {
        id: 'geo-from',
        summary: 'Geo “from {country}” → regional /from/',
        detail: 'Must link to legal pillars; need ≥4 unique local facts or noindex.',
      },
      {
        id: 'university-one-graph',
        summary: 'University modifiers → one graph only',
        detail:
          'Default: usa/uk/ca/au universities/{slug} owns campus journey; legal /guide/*university* supports or consolidates.',
      },
      {
        id: 'blog-summary',
        summary: 'Blog → news/summary only',
        detail: 'Always links to legal canonical; max ~1200 words; no full procedure clone.',
      },
      {
        id: 'market-supply',
        summary: 'Transactional → market with supply',
        detail: 'supply_first / blocked_on_supply until category has real inventory (≥3 gigs).',
      },
      {
        id: 'hub-spoke',
        summary: 'Hubs own cluster nav; spokes own long-tail procedure',
        detail: 'Do not create sibling indexable URLs for the same primary keyword.',
      },
    ],
    hostRepo: {
      legal: 'caseworks',
      usa: 'yousafe-consultancy',
      uk: 'yousafe-consultancy',
      ca: 'yousafe-consultancy',
      au: 'yousafe-consultancy',
      apex: 'yousafe-consultancy',
      market: 'portal',
    },
  }
}

function syncOwnershipCsv(csvPath) {
  const rowsRaw = parseCsv(readText(csvPath))
  const rows = rowsRaw.map((r, i) => {
    const sup = r.supporting_urls || ''
    const supporting = sup.includes('|')
      ? sup.split('|').map((s) => s.trim()).filter(Boolean)
      : sup.split(',').map((s) => s.trim()).filter(Boolean)
    return {
      id: Number(r.id) || i + 1,
      primary_keyword: (r.primary_keyword || '').trim(),
      intent_class: (r.intent_class || '').trim(),
      owner_host: (r.owner_host || '').trim(),
      owner_url: (r.owner_url || '').trim(),
      supporting_urls: supporting.slice(0, 4),
      action: (r.action || '').trim(),
      market_destination: (r.market_destination || '').trim() || null,
      status: (r.status || '').trim(),
      notes: ((r.notes || '').trim()).slice(0, 200),
    }
  })
  const pack = {
    version: 'v1',
    updatedAt: new Date().toISOString(),
    source: 'SEO strategies/ownership-registry-v1.csv',
    rows,
  }
  writeJson(join(outDir, 'ownership-registry.json'), pack)
  writeJson(join(root, 'data', 'seo', 'ownership-registry.json'), pack)
  return rows.length
}

function syncUniversityMap(csvPath) {
  if (!existsSync(csvPath)) return 0
  const rows = parseCsv(readText(csvPath))
  // Keep compact fields only
  const slim = rows.slice(0, 500).map((r) => {
    const keys = Object.keys(r)
    const pick = {}
    for (const k of keys) {
      if (/slug|university|name|city|state|host|owner|url|region|country|campus/i.test(k)) {
        pick[k] = (r[k] || '').toString().slice(0, 200)
      }
    }
    return pick
  })
  writeJson(join(docsOut, 'university-dual-graph.json'), {
    updatedAt: new Date().toISOString(),
    source: 'dual-graph-university-map-v1.csv',
    count: slim.length,
    rows: slim,
  })
  return slim.length
}

function copyDoc(name, relOut) {
  const src = join(sourceDir, name)
  if (!existsSync(src)) {
    console.warn('skip missing', name)
    return null
  }
  const text = readText(src)
  const dest = join(docsOut, 'documents', relOut || name)
  ensureDir(dirname(dest))
  writeFileSync(dest, text, 'utf8')
  const sections = extractSections(text, name.includes('MASTER') ? 14000 : 10000)
  return {
    id: basename(name, '.md').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    title: name,
    path: `/seo-data/strategies/documents/${relOut || name}`,
    bytes: Buffer.byteLength(text),
    sections,
  }
}

function main() {
  if (!existsSync(sourceDir)) {
    // CI / machines without the local strategies folder still build if
    // public/seo-data was committed from a prior sync.
    const indexPath = join(docsOut, 'index.json')
    if (existsSync(indexPath) || existsSync(join(outDir, 'ownership-registry.json'))) {
      console.warn(
        'SEO strategies source not found at',
        sourceDir,
        '— keeping committed public/seo-data assets.',
      )
      process.exit(0)
    }
    console.error('SEO strategies directory not found:', sourceDir)
    process.exit(1)
  }
  console.log('Source:', sourceDir)
  ensureDir(docsOut)
  ensureDir(join(docsOut, 'documents'))
  ensureDir(join(root, 'data', 'seo'))

  const docs = []
  const docNames = [
    'OWNERSHIP_REGISTRY.md',
    'SEO_DEEP_STRATEGY_2026-07-14.md',
    'GSC_KEYWORD_EXPANSION_STRATEGY.md',
    'SEO_AUDIT_COMPLETE_2026-07-14.md',
    'SEO_Starter_Guide.md',
    'DUAL_GRAPH_UNIVERSITY_MAP.md',
    'SEO_MASTER_PLAN.md',
    'GPT_ESTATE_REGIONAL_GEO_AI_B2.md',
    'GPT_ESTATE_SEO_GUARD_SUITE_B3.md',
    'GPT_ESTATE_SITEMAP_ROBOTS_B1.md',
  ]

  for (const name of docNames) {
    const meta = copyDoc(name)
    if (meta) docs.push(meta)
  }

  // Also copy any other top-level strategy md/csv not already listed
  for (const ent of readdirSync(sourceDir)) {
    if (ent.startsWith('.') || ent === 'worktrees' || ent === '_pipeline') continue
    const full = join(sourceDir, ent)
    if (!statSync(full).isFile()) continue
    if (!/\.(md|csv)$/i.test(ent)) continue
    if (docNames.includes(ent) || ent === 'ownership-registry-v1.csv' || ent === 'dual-graph-university-map-v1.csv')
      continue
    // skip huge one-off ops notes if desired — still include under documents/extra
    const meta = copyDoc(ent, ent)
    if (meta) {
      meta.category = 'extra'
      docs.push(meta)
    }
  }

  const ownershipCount = existsSync(join(sourceDir, 'ownership-registry-v1.csv'))
    ? syncOwnershipCsv(join(sourceDir, 'ownership-registry-v1.csv'))
    : 0

  const uniCount = syncUniversityMap(join(sourceDir, 'dual-graph-university-map-v1.csv'))

  const standing = buildStandingRules()
  const house = buildHouseStyle()
  writeJson(join(docsOut, 'standing-rules.json'), standing)
  writeJson(join(docsOut, 'house-style.json'), house)

  // AI prompt pack: compact rules + top sections from deep strategy + GSC expansion
  const deep = docs.find((d) => d.title.includes('DEEP_STRATEGY'))
  const gsc = docs.find((d) => d.title.includes('GSC_KEYWORD'))
  const master = docs.find((d) => d.title.includes('MASTER_PLAN'))
  const promptPack = {
    updatedAt: new Date().toISOString(),
    standingRules: standing.rules.map((r) => r.summary + ' — ' + r.detail),
    houseStyle: house,
    hostRepo: standing.hostRepo,
    deepStrategyHighlights: (deep?.sections || []).slice(0, 12),
    gscExpansionHighlights: (gsc?.sections || []).slice(0, 10),
    masterPlanHighlights: (master?.sections || []).slice(0, 8),
  }
  writeJson(join(docsOut, 'prompt-pack.json'), promptPack)

  const index = {
    updatedAt: new Date().toISOString(),
    sourceDir: 'SEO strategies',
    ownershipRows: ownershipCount,
    universityRows: uniCount,
    documents: docs.map((d) => ({
      id: d.id,
      title: d.title,
      path: d.path,
      bytes: d.bytes,
      sectionCount: d.sections?.length || 0,
      category: d.category || 'core',
    })),
    packs: [
      { id: 'ownership-registry', path: '/seo-data/ownership-registry.json' },
      { id: 'standing-rules', path: '/seo-data/strategies/standing-rules.json' },
      { id: 'house-style', path: '/seo-data/strategies/house-style.json' },
      { id: 'prompt-pack', path: '/seo-data/strategies/prompt-pack.json' },
      { id: 'university-dual-graph', path: '/seo-data/strategies/university-dual-graph.json' },
      { id: 'gsc-snapshot', path: '/seo-data/snapshot.json' },
    ],
  }
  writeJson(join(docsOut, 'index.json'), index)

  console.log('\nSync complete.')
  console.log('  ownership rows:', ownershipCount)
  console.log('  university rows:', uniCount)
  console.log('  documents:', docs.length)
  console.log('  output:', docsOut)
}

main()

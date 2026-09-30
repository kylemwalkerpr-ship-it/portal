/**
 * Site-aware context pack for Messenger AI.
 *
 * Loads a curated KB from content/messenger-kb/, optionally ranks chunks
 * against the latest client message, and pulls live provider/gig rows from
 * Supabase for the conversation.
 */
import fs from 'fs'
import path from 'path'

export interface KnowledgeChunk {
  id: string
  title: string
  body: string
  source: string
  site?: string
  sourceUrl?: string
  repository?: string
  score?: number
}

export interface ProviderGigContext {
  providerBlock: string
  gigsBlock: string
  providerId?: string
  gigCount: number
}

export interface SiteKnowledgePack {
  systemAppendix: string
  chunks: KnowledgeChunk[]
  providerContext: ProviderGigContext | null
}

const KB_DIR_CANDIDATES = [
  path.join(process.cwd(), 'content', 'messenger-kb'),
  path.join(process.cwd(), 'docs', 'messenger-kb'),
]

/** In-process cache of curated KB files (mtime-insensitive for v1). */
let cachedChunks: KnowledgeChunk[] | null = null
let cachedCoreChunks: KnowledgeChunk[] | null = null

const CORE_FILES = new Set([
  'network-authority.md', 'brand-identity.md', 'platform.md',
  'offers-orders-escrow.md', 'policies-ymyl.md', 'faq.md',
])
const SITES = new Set(['main', 'usa', 'canada', 'uk', 'australia', 'caseworks', 'market', 'support'])
const REPOSITORY_BY_SITE: Record<string, string> = {
  main: 'kylemwalkerpr-ship-it/yousafe-consultancy',
  usa: 'kylemwalkerpr-ship-it/yousafe-consultancy',
  canada: 'kylemwalkerpr-ship-it/yousafe-consultancy',
  uk: 'kylemwalkerpr-ship-it/yousafe-consultancy',
  australia: 'kylemwalkerpr-ship-it/yousafe-consultancy',
  caseworks: 'kylemwalkerpr-ship-it/caseworks',
  market: 'kylemwalkerpr-ship-it/portal',
  support: 'kylemwalkerpr-ship-it/support-saas',
}
const SITE_BY_HOST: Record<string, string> = {
  'yousafeconsultancy.com': 'main', 'www.yousafeconsultancy.com': 'main',
  'usa.yousafeconsultancy.com': 'usa', 'ca.yousafeconsultancy.com': 'canada',
  'uk.yousafeconsultancy.com': 'uk', 'au.yousafeconsultancy.com': 'australia',
  'legal.yousafeconsultancy.com': 'caseworks', 'market.yousafeconsultancy.com': 'market',
  'portal.yousafeconsultancy.com': 'market', 'support.yousafeconsultancy.com': 'support',
}

export function knowledgeSiteForHost(hostname?: string | null): string | null {
  return SITE_BY_HOST[String(hostname || '').toLowerCase().replace(/:\d+$/, '')] || null
}

export function explicitKnowledgeSites(query: string): string[] {
  const q = String(query || '')
  const found: string[] = []
  const rules: Array<[string, RegExp]> = [
    ['australia', /\b(australia|australian|subclass\s*(?:500|485))\b/i],
    ['canada', /\b(canada|canadian|ircc|pgwp)\b/i],
    ['uk', /\b(united kingdom|britain|british|ukvi|\buk\b)\b/i],
    ['usa', /\b(united states|america|american|uscis|\busa\b|\bu\.?s\.?\b|f-?1\s+visa)\b/i],
  ]
  for (const [site, pattern] of rules) if (pattern.test(q)) found.push(site)
  return found
}

function trustedSourceUrl(value: unknown, site: unknown): string | undefined {
  if (typeof value !== 'string' || typeof site !== 'string' || !SITES.has(site)) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || knowledgeSiteForHost(url.hostname) !== site) return undefined
    const host = url.hostname.toLowerCase()
    // Public catalog content lives on Market. Never ingest authenticated portal
    // pages or private listing/order routes from either Marketplace host.
    if (host === 'portal.yousafeconsultancy.com') return undefined
    if (site === 'market' && /^\/(?:dashboard|orders|messages|inbox|wallet|account|checkout|settings)(?:\/|$)/i.test(url.pathname)) return undefined
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch { return undefined }
}

function splitMarkdownSections(raw: string, fileId: string, source: string): KnowledgeChunk[] {
  const text = String(raw || '').trim()
  if (!text) return []
  const parts = text.split(/\n(?=#{1,3}\s+)/)
  const out: KnowledgeChunk[] = []
  parts.forEach((part, i) => {
    const trimmed = part.trim()
    if (!trimmed) return
    const titleMatch = trimmed.match(/^#{1,3}\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1].trim() : `${fileId}-${i + 1}`
    out.push({
      id: `${fileId}#${i}`,
      title,
      body: trimmed.slice(0, 4000),
      source,
    })
  })
  return out.length ? out : [{ id: fileId, title: fileId, body: text.slice(0, 4000), source }]
}

/**
 * Load curated site KB from disk. Safe for Workers / Next: missing dir → [].
 * Exported for unit tests.
 */
export function loadCuratedKbChunks(dirOverride?: string, coreOnly = false): KnowledgeChunk[] {
  if (!dirOverride && coreOnly && cachedCoreChunks) return cachedCoreChunks
  if (!dirOverride && !coreOnly && cachedChunks) return cachedChunks
  const dirs = dirOverride ? [dirOverride] : KB_DIR_CANDIDATES
  const chunks: KnowledgeChunk[] = []
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue
      const files = fs
        .readdirSync(dir)
        .filter((f) => coreOnly ? CORE_FILES.has(f) : /\.(md|txt|json)$/i.test(f))
        .sort()
      for (const file of files) {
        const full = path.join(dir, file)
        const raw = fs.readFileSync(full, 'utf8')
        if (/\.json$/i.test(file)) {
          try {
            const parsed = JSON.parse(raw) as Array<{ id?: string; title?: string; body?: string; site?: string; repository?: string; sourceUrl?: string }>
            if (Array.isArray(parsed)) {
              for (const row of parsed) {
                if (!row?.body) continue
                const sourceUrl = trustedSourceUrl(row.sourceUrl, row.site)
                if (!sourceUrl || row.repository !== REPOSITORY_BY_SITE[row.site]) continue
                chunks.push({
                  id: String(row.id || `${file}-${chunks.length}`).slice(0, 240),
                  title: String(row.title || file).slice(0, 240),
                  body: String(row.body).slice(0, 4000),
                  source: sourceUrl,
                  site: row.site,
                  sourceUrl,
                  repository: row.repository.slice(0, 200),
                })
              }
            }
          } catch {
            /* skip malformed json */
          }
          continue
        }
        const fileId = file.replace(/\.(md|txt)$/i, '')
        chunks.push(...splitMarkdownSections(raw, fileId, `content/messenger-kb/${file}`))
      }
      if (chunks.length) break
    } catch (err) {
      console.warn(
        '[messengerSiteKnowledge] KB load failed',
        dir,
        err instanceof Error ? err.message : err,
      )
    }
  }
  if (!dirOverride) {
    if (coreOnly) cachedCoreChunks = chunks
    else cachedChunks = chunks
  }
  return chunks
}

/** Reset in-process KB cache (tests). */
export function resetMessengerKbCache(): void {
  cachedChunks = null
  cachedCoreChunks = null
}

export function loadCuratedCoreKbChunks(dirOverride?: string): KnowledgeChunk[] {
  return loadCuratedKbChunks(dirOverride, true)
}

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'is', 'are', 'was', 'were',
  'i', 'you', 'we', 'my', 'your', 'this', 'that', 'it', 'with', 'at', 'be', 'as', 'from',
  'have', 'has', 'had', 'do', 'does', 'did', 'can', 'will', 'just', 'me', 'im', "i'm",
])

export function tokenizeQuery(q: string): string[] {
  return String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
}

/** Simple keyword relevance — no embeddings required for v1. */
export function rankChunks(chunks: KnowledgeChunk[], query: string, limit = 6): KnowledgeChunk[] {
  const tokens = tokenizeQuery(query)
  if (!chunks.length) return []
  if (!tokens.length) {
    // Prefer platform + escrow + faq when query is empty / tiny.
    const preferred = ['brand-identity', 'platform', 'offers-orders', 'faq', 'policies']
    return [...chunks]
      .sort((a, b) => {
        const ai = preferred.findIndex((p) => a.id.startsWith(p) || a.source.includes(p))
        const bi = preferred.findIndex((p) => b.id.startsWith(p) || b.source.includes(p))
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      })
      .slice(0, limit)
      .map((c) => ({ ...c, score: 0 }))
  }
  const scored = chunks.map((c) => {
    const hay = `${c.title}\n${c.body}`.toLowerCase()
    let score = 0
    for (const t of tokens) {
      if (hay.includes(t)) score += t.length > 5 ? 2 : 1
      if (c.title.toLowerCase().includes(t)) score += 2
    }
    // Light boosts for always-useful safety docs.
    if (/brand|identity|escrow|offer|payment|ymyl|policy|platform/i.test(c.id + c.title)) score += 0.5
    return { ...c, score }
  })
  scored.sort((a, b) => (b.score || 0) - (a.score || 0))
  const top: KnowledgeChunk[] = scored.filter((c) => (c.score || 0) > 0).slice(0, limit)
  // Always include at least a core pack so the model stays site-aware.
  if (top.length < 3) {
    const core = rankChunks(chunks, '', Math.max(limit, 4))
    const seen = new Set(top.map((c) => c.id))
    for (const c of core) {
      if (seen.has(c.id)) continue
      top.push({ ...c, score: c.score ?? 0 })
      if (top.length >= limit) break
    }
  }
  return top.slice(0, limit)
}

const DEEP_QUERY_RE = /\b(visa|immigration|study permit|student visa|f-?1|pgwp|work permit|sponsorship|sponsor|refusal|appeal|asylum|removal|deport|citizenship|green card|permanent residence|subclass\s*\d+|genuine student|admission|university|college|statement of purpose|\bsop\b|credential|wes\b|resume|cv\b|job search|housing|tenant|tenancy|landlord|deposit|legal|lawyer|attorney|court|deadline|canada|australia|united kingdom|\buk\b|united states|\busa?\b|price|pricing|cost|package|service|caseworks|marketplace|support)\b/i

export function shouldUseDeepNetworkKnowledge(query: string): boolean {
  const q = String(query || '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (!q || /^(hi|hello|hey|hiya|good (morning|afternoon|evening)|thanks|thank you)[!.?\s]*$/.test(q)) return false
  if (/\b(who are you|what is yousafe|tell me about (?:yousafe|this company)|about yousafe consultancy|how does yousafe work)\b/.test(q)) return false
  return DEEP_QUERY_RE.test(q)
}

/** Shared public YQAA corpus selection. Origin affinity only breaks ties; explicit destinations rank first. */
export function selectYqaaKnowledge(opts: {
  query: string
  deep: boolean
  hostname?: string | null
  pageContext?: string | null
  limit?: number
  kbDir?: string
}): KnowledgeChunk[] {
  const pool = opts.deep ? loadCuratedKbChunks(opts.kbDir) : loadCuratedCoreKbChunks(opts.kbDir)
  const requestedSites = explicitKnowledgeSites(opts.query)
  const originSite = knowledgeSiteForHost(opts.hostname)
  const pageTokens = tokenizeQuery(String(opts.pageContext || '').slice(0, 1200)).slice(0, 12)
  const limit = Math.max(1, Math.min(12, opts.limit || 8))
  const ranked = rankChunks(pool, opts.query, Math.min(pool.length, limit * 3))
  const scored = ranked.map((chunk, index) => {
    let score = chunk.score || 0
    if (chunk.site && requestedSites.includes(chunk.site)) score += 18
    if (!requestedSites.length && chunk.site && chunk.site === originSite) score += 3
    if (pageTokens.length) {
      const haystack = `${chunk.title}\n${chunk.body}`.toLowerCase()
      score += Math.min(4, pageTokens.filter((token) => haystack.includes(token)).length * 0.5)
    }
    if (!chunk.site) score += 2 // canonical network-wide core material
    return { ...chunk, score, _explicitJurisdiction: Boolean(chunk.site && requestedSites.includes(chunk.site)), _index: index }
  })
  scored.sort((a, b) => Number(b._explicitJurisdiction) - Number(a._explicitJurisdiction) || (b.score || 0) - (a.score || 0) || a._index - b._index)
  const picked = scored.slice(0, limit).map(({ _explicitJurisdiction: _ignoredJurisdiction, _index: _ignoredIndex, ...chunk }) => chunk)
  const canonical = pool.filter((chunk) => /network-authority/i.test(chunk.id + chunk.source))
  for (const chunk of canonical) {
    if (!picked.some((item) => item.id === chunk.id)) {
      if (requestedSites.length && picked.length >= limit && picked.some((item) => item.site && requestedSites.includes(item.site))) continue
      if (picked.length >= limit) picked.pop()
      picked.push({ ...chunk, score: (chunk.score || 0) + 1 })
    }
  }
  return picked.slice(0, limit)
}

function clip(s: unknown, n: number): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n)
}

/**
 * Pull live provider profile + active gigs for the conversation provider.
 */
export async function loadProviderGigContext(
  db: any,
  provider: { id: string; role?: string; full_name?: string | null; email?: string | null },
): Promise<ProviderGigContext> {
  const role = String(provider.role || '').toLowerCase()
  const lines: string[] = [
    `Provider id: ${provider.id}`,
    `Name: ${provider.full_name || provider.email || 'YouSafe provider'}`,
    `Role: ${role || 'unknown'}`,
  ]

  try {
    if (role === 'attorney') {
      const { data } = await db
        .from('attorneys')
        .select(
          'tagline, bio, intro, jurisdictions, practice_areas, specialties, languages, years_experience, offers_free_consult, starting_price, available',
        )
        .eq('profile_id', provider.id)
        .maybeSingle()
      if (data) {
        if (data.tagline) lines.push(`Tagline: ${clip(data.tagline, 200)}`)
        if (data.intro) lines.push(`Intro: ${clip(data.intro, 400)}`)
        if (data.bio) lines.push(`Bio: ${clip(data.bio, 600)}`)
        if (data.jurisdictions) lines.push(`Jurisdictions: ${clip(JSON.stringify(data.jurisdictions), 240)}`)
        if (data.practice_areas) lines.push(`Practice areas: ${clip(JSON.stringify(data.practice_areas), 240)}`)
        if (data.specialties) lines.push(`Specialties: ${clip(JSON.stringify(data.specialties), 240)}`)
        if (data.languages) lines.push(`Languages: ${clip(JSON.stringify(data.languages), 160)}`)
        if (data.years_experience != null) lines.push(`Years experience: ${data.years_experience}`)
        if (data.starting_price != null) lines.push(`Starting price (cents): ${data.starting_price}`)
        if (data.offers_free_consult != null) lines.push(`Offers free consult: ${Boolean(data.offers_free_consult)}`)
        if (data.available != null) lines.push(`Available: ${Boolean(data.available)}`)
      }
    } else if (role === 'consultant') {
      const { data } = await db
        .from('consultants')
        .select(
          'tagline, bio, intro, specialties, languages, years_experience, offers_free_consult, starting_price, available, subjects, industries',
        )
        .eq('profile_id', provider.id)
        .maybeSingle()
      if (data) {
        if (data.tagline) lines.push(`Tagline: ${clip(data.tagline, 200)}`)
        if (data.intro) lines.push(`Intro: ${clip(data.intro, 400)}`)
        if (data.bio) lines.push(`Bio: ${clip(data.bio, 600)}`)
        if (data.specialties) lines.push(`Specialties: ${clip(JSON.stringify(data.specialties), 240)}`)
        if (data.subjects) lines.push(`Subjects: ${clip(JSON.stringify(data.subjects), 200)}`)
        if (data.industries) lines.push(`Industries: ${clip(JSON.stringify(data.industries), 200)}`)
        if (data.languages) lines.push(`Languages: ${clip(JSON.stringify(data.languages), 160)}`)
        if (data.years_experience != null) lines.push(`Years experience: ${data.years_experience}`)
        if (data.starting_price != null) lines.push(`Starting price (cents): ${data.starting_price}`)
        if (data.offers_free_consult != null) lines.push(`Offers free consult: ${Boolean(data.offers_free_consult)}`)
        if (data.available != null) lines.push(`Available: ${Boolean(data.available)}`)
      }
    }
  } catch (err) {
    console.warn(
      '[messengerSiteKnowledge] provider profile load failed',
      err instanceof Error ? err.message : err,
    )
  }

  const gigLines: string[] = []
  try {
    const { data: gigs } = await db
      .from('gigs')
      .select('id, slug, title, pitch, description, starting_price, status, jurisdiction, provider_type')
      .eq('provider_id', provider.id)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })
      .limit(8)
    for (const g of gigs || []) {
      gigLines.push(
        [
          `- [${g.status}] ${clip(g.title, 120)} (id=${g.id}${g.slug ? ` slug=${g.slug}` : ''})`,
          g.starting_price != null ? `  starting_price_cents=${g.starting_price}` : null,
          g.jurisdiction ? `  jurisdiction=${clip(g.jurisdiction, 80)}` : null,
          g.pitch || g.description
            ? `  summary: ${clip(g.pitch || g.description, 280)}`
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
      )
    }
  } catch (err) {
    console.warn(
      '[messengerSiteKnowledge] gigs load failed',
      err instanceof Error ? err.message : err,
    )
  }

  return {
    providerBlock: lines.join('\n'),
    gigsBlock: gigLines.length ? gigLines.join('\n') : '(no active/listed gigs for this provider)',
    providerId: provider.id,
    gigCount: gigLines.length,
  }
}

function formatChunks(chunks: KnowledgeChunk[]): string {
  return chunks
    .map((c, i) => `### [${i + 1}] ${c.title} (${c.source})\n${c.body}`)
    .join('\n\n')
}

/**
 * Build the system-prompt appendix + structured pack for one reply turn.
 */
export async function buildMessengerSiteKnowledge(opts: {
  db?: any
  provider?: { id: string; role?: string; full_name?: string | null; email?: string | null } | null
  latestUserMessage?: string
  kbDir?: string
}): Promise<SiteKnowledgePack> {
  const all = loadCuratedKbChunks(opts.kbDir)
  const ranked = rankChunks(all, opts.latestUserMessage || '', 6)

  let providerContext: ProviderGigContext | null = null
  if (opts.db && opts.provider?.id) {
    providerContext = await loadProviderGigContext(opts.db, opts.provider)
  }

  // Always pin brand-identity so the model keeps the YQAA persona even on tiny queries.
  const brand = all.filter((c) => /brand-identity/i.test(c.id) || /brand-identity/i.test(c.source))
  const merged: KnowledgeChunk[] = []
  const seen = new Set<string>()
  for (const c of [...brand, ...(ranked.length ? ranked : all.slice(0, 5))]) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    merged.push(c)
  }

  const parts: string[] = [
    '## YQAA — YOUSAFE QUICK ASSISTANCE AGENT',
    'You are YQAA, the disclosed AI-powered assistance agent for YouSafe.',
    'In this DM you help the client connect with the live provider below. Stay in YQAA voice; never impersonate the provider.',
    'Never call yourself Yara, YouSafe Assistant, YouSafe AI, SuperGrok, or Grok in visitor-facing copy.',
    '',
    '## SITE KNOWLEDGE (authoritative for product / marketplace questions)',
    'Answer from this knowledge when relevant. Do not invent legal outcomes, bar numbers, prices, fee math, URLs, service availability, or policy exceptions.',
    'If the answer is not in site knowledge or the provider/gig context below, say you are unsure and escalate rather than guessing.',
    '',
    formatChunks(merged.slice(0, 8)),
  ]

  if (providerContext) {
    parts.push(
      '',
      '## THIS CONVERSATION — PROVIDER PROFILE (live)',
      providerContext.providerBlock,
      '',
      '## THIS PROVIDER — GIGS (live)',
      providerContext.gigsBlock,
    )
  }

  const systemAppendix = parts.join('\n').slice(0, 14_000)
  return {
    systemAppendix,
    chunks: merged.slice(0, 8),
    providerContext,
  }
}

/** True when curated KB yielded at least one chunk (for health / tests). */
export function hasNonEmptySiteKnowledge(kbDir?: string): boolean {
  return loadCuratedKbChunks(kbDir).length > 0
}

/**
 * Cite real marketplace attorneys / consultants on YMYL pages.
 *
 * Providers agreed at signup that their public profile, credentials, and
 * service pages may be referenced. The engine must pick people whose
 * expertise and jurisdiction actually match the article — never invent a
 * byline, bar number, or marketplace URL.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'
import { resolveAttorneyCredential } from '@/lib/attorneyCredential'
import { ymylAuthorRequired, type AuthorPack } from './authorPack'

export type ProviderRole = 'attorney' | 'consultant'

export type ProviderServicePage = {
  title: string
  url: string
  match: string
}

export type CitableProvider = {
  profileId: string
  role: ProviderRole
  name: string
  username: string | null
  credentialType: string | null
  barNumber: string | null
  showBarNumber: boolean
  barState: string | null
  yearsExperience: number | null
  tagline: string | null
  practiceAreas: string[]
  specialties: string[]
  jurisdictions: string[]
  profileUrl: string
  gigs: Array<{ slug: string; title: string; category: string | null; jurisdiction: string | null }>
}

export type CitedProvider = CitableProvider & {
  score: number
  matchReasons: string[]
  servicePages: ProviderServicePage[]
  credentialLine: string
  experienceScope: string
}

export type CitedProviderPublic = {
  name: string
  role: ProviderRole
  credentialLine: string
  experienceScope: string
  profileUrl: string
  servicePages: ProviderServicePage[]
  matchReasons: string[]
}

export type MarketplaceServiceLink = {
  label: string
  url: string
  role: string
  placement: string
  reason: string
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'our',
  'are', 'was', 'were', 'been', 'have', 'has', 'not', 'but', 'how', 'what',
  'when', 'who', 'why', 'into', 'onto', 'about', 'after', 'before', 'over',
  'under', 'than', 'then', 'them', 'they', 'their', 'its', 'his', 'her',
  'a', 'an', 'of', 'to', 'in', 'on', 'or', 'by', 'at', 'as', 'is', 'be',
  'guide', 'page', 'help', 'need', 'get',
])

const REGION_ALIASES: Record<string, string[]> = {
  us: ['us', 'usa', 'united states', 'america', 'american', 'uscis'],
  uk: ['uk', 'gb', 'united kingdom', 'britain', 'british', 'england', 'home office', 'ukvi'],
  ca: ['ca', 'canada', 'canadian', 'ircc', 'cic'],
  au: ['au', 'australia', 'australian', 'home affairs', 'immiaccount'],
}

const STUDY_HINT = /\b(study|student|university|college|sop|admissions?|ielts|toefl|cas|i-20|coe)\b/i
const MARKET_HOST = 'market.yousafeconsultancy.com'

export function normalizeStringList(value: unknown): string[] {
  if (value == null) return []
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeStringList(item))
  }
  const raw = String(value).trim()
  if (!raw) return []
  if ((raw.startsWith('[') && raw.endsWith(']')) || (raw.startsWith('{') && raw.endsWith('}'))) {
    try {
      return normalizeStringList(JSON.parse(raw))
    } catch {
      /* fall through */
    }
  }
  return raw
    .split(/[,;/|]+/)
    .map((part) => part.replace(/^["'\s]+|["'\s]+$/g, '').trim())
    .filter(Boolean)
}

export function tokenize(...parts: Array<string | null | undefined>): string[] {
  const bag = new Set<string>()
  for (const part of parts) {
    const text = String(part || '').toLowerCase()
    for (const chunk of text.split(/\s+/)) {
      const collapsed = chunk.replace(/[^a-z0-9]+/g, '')
      if (collapsed.length >= 3 && !STOP.has(collapsed)) bag.add(collapsed)
    }
    for (const word of text.split(/[^a-z0-9]+/)) {
      if (word.length < 2 || STOP.has(word)) continue
      bag.add(word)
    }
  }
  return [...bag]
}

/** Query tokens that hit the provider field tokens, including visa/visas-style prefixes. */
export function overlappingTokens(queryTokens: string[], fieldTokens: string[]): string[] {
  const field = new Set(fieldTokens)
  const hits: string[] = []
  for (const token of queryTokens) {
    if (field.has(token)) {
      hits.push(token)
      continue
    }
    if (token.length < 4) continue
    for (const other of field) {
      if (other.length < 4) continue
      if (other.startsWith(token) || token.startsWith(other)) {
        hits.push(token)
        break
      }
    }
  }
  return hits
}

function regionKey(region: string | null | undefined): string {
  return String(region || '').trim().toLowerCase().slice(0, 2)
}

function regionTokens(region: string | null | undefined): string[] {
  const key = regionKey(region)
  return REGION_ALIASES[key] || (key ? [key] : [])
}

function jurisdictionMatches(jurisdictions: string[], region: string | null | undefined): boolean {
  const aliases = regionTokens(region)
  if (!aliases.length || !jurisdictions.length) return false
  const hay = jurisdictions.join(' ').toLowerCase()
  return aliases.some((alias) => hay.includes(alias))
}

export function credentialLineFor(provider: Pick<CitableProvider, 'role' | 'credentialType' | 'barNumber' | 'showBarNumber' | 'barState'>): string {
  const type = String(provider.credentialType || '').trim()
  const fallback = provider.role === 'attorney' ? 'Licensed attorney' : 'Verified consultant'
  const base = type || fallback
  const state = String(provider.barState || '').trim()
  const bar = provider.showBarNumber && String(provider.barNumber || '').trim()
  const bits = [base]
  if (state) bits.push(state)
  if (bar) bits.push(`bar ${bar}`)
  return bits.join(' · ')
}

export function experienceScopeFor(provider: CitableProvider): string {
  const years = Number(provider.yearsExperience || 0)
  const areas = [...provider.practiceAreas, ...provider.specialties].slice(0, 6)
  const jx = provider.jurisdictions.slice(0, 4)
  const parts: string[] = []
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'} of practice`)
  if (areas.length) parts.push(areas.join(', '))
  if (jx.length) parts.push(jx.join(', '))
  if (provider.tagline) parts.push(provider.tagline.trim())
  return parts.join(' · ').slice(0, 280) || (provider.role === 'attorney' ? 'Licensed legal practice' : 'Verified advisory practice')
}

export function providerProfileUrl(provider: Pick<CitableProvider, 'username' | 'profileId'>): string {
  return getMarketplaceCanonicalUrl(`/marketplace/providers/${provider.username || provider.profileId}/`)
}

export function providerGigUrl(slug: string): string {
  return getMarketplaceCanonicalUrl(`/marketplace/gigs/${slug}/`)
}

export function isMarketplaceServiceUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    const path = new URL(url).pathname.toLowerCase()
    if (host !== MARKET_HOST) return false
    return /^\/(providers|gigs)\//.test(path) || /^\/marketplace\/(providers|gigs)\//.test(path)
  } catch {
    return false
  }
}

export function authorPackFromProvider(cited: CitedProvider): AuthorPack {
  return {
    name: cited.name,
    credential: cited.credentialLine,
    experienceScope: cited.experienceScope,
    reviewedBy: cited.name,
    lastReviewed: new Date().toISOString().slice(0, 10),
    experienceBeats: [],
    marketplaceUrl: cited.profileUrl,
    providerType: cited.role,
    servicePages: cited.servicePages,
  }
}

export function marketplaceServiceLinks(cited: CitedProvider[]): MarketplaceServiceLink[] {
  const out: MarketplaceServiceLink[] = []
  const seen = new Set<string>()
  const push = (label: string, url: string, reason: string) => {
    const key = url.replace(/\/+$/, '').toLowerCase()
    if (!url || seen.has(key)) return
    seen.add(key)
    out.push({
      label,
      url,
      role: 'marketplace-service',
      placement: 'Need professional help / About the author',
      reason,
    })
  }
  for (const person of cited) {
    push(`${person.name} on YouSafe Marketplace`, person.profileUrl, `YMYL citation of ${person.role} matching this topic`)
    for (const page of person.servicePages.slice(0, 2)) {
      push(page.title, page.url, page.match)
    }
  }
  return out
}

export function mergeMarketplaceServiceLinks<T extends { url: string; label?: string }>(
  existing: T[],
  links: MarketplaceServiceLink[],
): T[] {
  const seen = new Set(existing.map((item) => String(item.url || '').replace(/\/+$/, '').toLowerCase()).filter(Boolean))
  const extra: T[] = []
  for (const link of links) {
    const key = link.url.replace(/\/+$/, '').toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    extra.push({
      ...(link as unknown as T),
      label: link.label,
      url: link.url,
    })
  }
  return existing.concat(extra)
}

export function citedProvidersPublic(cited: CitedProvider[]): CitedProviderPublic[] {
  return cited.map((person) => ({
    name: person.name,
    role: person.role,
    credentialLine: person.credentialLine,
    experienceScope: person.experienceScope,
    profileUrl: person.profileUrl,
    servicePages: person.servicePages,
    matchReasons: person.matchReasons,
  }))
}

export function citedProvidersPromptBlock(cited: CitedProvider[]): string {
  if (!cited.length) {
    return [
      'YMYL AUTHOR: no matching marketplace attorney/consultant was found for this topic and region.',
      'Do not invent a named author, bar number, testimonial, or marketplace URL.',
    ].join('\n')
  }
  const lines = [
    'YMYL AUTHOR / MARKETPLACE CITATION (mandatory — these people consented at signup to be cited).',
    'Pick the FIRST person as the named author/reviewer. Cite only their recorded credential and field.',
    'YAML `author` MUST be this person\'s name — never invent YouSafe Editorial Team.',
    'You MUST include each listed marketplace URL verbatim as a markdown link in the body (author byline and/or “Need professional help”).',
    'Do not invent additional people, bar numbers, case results, or service pages.',
    '',
  ]
  cited.forEach((person, i) => {
    lines.push(
      `${i + 1}. ${person.name} — ${person.credentialLine}`,
      `   Role: ${person.role} · ${person.experienceScope}`,
      `   Why this article: ${person.matchReasons.join('; ') || 'expertise overlap'}`,
      `   Profile: ${person.profileUrl}`,
    )
    for (const page of person.servicePages) {
      lines.push(`   Service: [${page.title}](${page.url}) — ${page.match}`)
    }
    lines.push('')
  })
  return lines.join('\n').trimEnd()
}

function servicePagesFor(provider: CitableProvider, queryTokens: string[]): ProviderServicePage[] {
  const ranked = [...provider.gigs].sort((a, b) => {
    const aHits = overlappingTokens(queryTokens, tokenize(a.title, a.category, a.jurisdiction)).length
    const bHits = overlappingTokens(queryTokens, tokenize(b.title, b.category, b.jurisdiction)).length
    return bHits - aHits
  })
  const pages: ProviderServicePage[] = ranked.slice(0, 3).map((gig) => ({
    title: gig.title,
    url: providerGigUrl(gig.slug),
    match: gig.category ? `${gig.category} service` : 'marketplace service matching this topic',
  }))
  if (!pages.length) {
    pages.push({
      title: `${provider.name} marketplace profile`,
      url: provider.profileUrl,
      match: 'public provider profile',
    })
  }
  return pages
}

export function matchProvidersToTopic(
  providers: CitableProvider[],
  opts: { region?: string; topic?: string; primaryKeyword?: string; contentType?: string; limit?: number },
): CitedProvider[] {
  const region = opts.region || ''
  const topic = String(opts.topic || '')
  const keyword = String(opts.primaryKeyword || topic)
  const queryTokens = tokenize(topic, keyword)
  const ymyl = ymylAuthorRequired(String(opts.contentType || ''), true)
  const studyTopic = STUDY_HINT.test(`${topic} ${keyword}`)
  const scored: CitedProvider[] = []

  for (const provider of providers) {
    if (!provider.name.trim()) continue
    let score = 0
    const reasons: string[] = []
    let expertiseHit = false
    let jurisdictionHit = false

    if (jurisdictionMatches(provider.jurisdictions, region)) {
      score += 8
      jurisdictionHit = true
      reasons.push(`practises in ${regionKey(region).toUpperCase() || 'this region'}`)
    } else if (provider.gigs.some((g) => g.jurisdiction && regionKey(g.jurisdiction) === regionKey(region))) {
      score += 6
      jurisdictionHit = true
      reasons.push('active service listed for this jurisdiction')
    } else if (provider.jurisdictions.length) {
      score -= 4
    }

    const fieldTokens = tokenize(
      ...provider.practiceAreas,
      ...provider.specialties,
      provider.tagline,
      ...provider.gigs.map((g) => `${g.title} ${g.category || ''}`),
    )
    const overlap = overlappingTokens(queryTokens, fieldTokens)
    if (overlap.length) {
      expertiseHit = true
      score += Math.min(12, overlap.length * 3)
      reasons.push(`expertise overlap: ${overlap.slice(0, 6).join(', ')}`)
    }

    if (provider.credentialType || provider.role === 'attorney') {
      score += 2
      reasons.push('credential on file')
    }
    if ((provider.yearsExperience || 0) >= 3) score += 1
    if (provider.gigs.length) score += 2

    if (ymyl && provider.role === 'attorney') {
      score += 3
      reasons.push('attorney for YMYL legal content')
    }
    if (studyTopic && provider.role === 'consultant') {
      score += 3
      reasons.push('admissions consultant for study topic')
    }

    scored.push({
      ...provider,
      score,
      matchReasons: reasons,
      servicePages: servicePagesFor(provider, queryTokens),
      credentialLine: credentialLineFor(provider),
      experienceScope: experienceScopeFor(provider),
      expertiseHit,
      jurisdictionHit,
    } as CitedProvider & { expertiseHit: boolean; jurisdictionHit: boolean })
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

  const matched = scored.filter((person) => {
    const flags = person as CitedProvider & { expertiseHit?: boolean; jurisdictionHit?: boolean }
    return Boolean(flags.expertiseHit || flags.jurisdictionHit) && person.score >= 5
  })

  const limit = opts.limit ?? 3
  let picked = matched.slice(0, limit)

  // YMYL still needs a real named practitioner. If no expertise/jurisdiction
  // hit cleared the floor, cite the best licensed marketplace attorney (or
  // consultant on a study topic) rather than inventing an editorial team.
  if (!picked.length && ymyl) {
    const fallbackPool = scored.filter((person) => {
      if (person.score < 0) return false
      if (studyTopic) return person.role === 'consultant' || person.role === 'attorney'
      return person.role === 'attorney'
    })
    picked = fallbackPool.slice(0, 1).map((person) => ({
      ...person,
      matchReasons: [...person.matchReasons, 'YMYL fallback: licensed marketplace provider'],
    }))
  }

  return picked.map((person) => {
    const { expertiseHit: _e, jurisdictionHit: _j, ...rest } = person as CitedProvider & {
      expertiseHit?: boolean
      jurisdictionHit?: boolean
    }
    return rest
  })
}

type SupaLike = { from: (table: string) => any }

export async function loadCitableProviders(db: SupaLike): Promise<CitableProvider[]> {
  const { data: profiles } = await db
    .from('profiles')
    .select('id, full_name, username, status, is_hidden, role')
    .eq('status', 'active')
    .or('is_hidden.is.null,is_hidden.eq.false')
    .in('role', ['attorney', 'consultant'])
  const profileRows = (profiles || []) as Array<{
    id: string
    full_name?: string | null
    username?: string | null
    role?: string | null
  }>
  if (!profileRows.length) return []
  const profileById = new Map(profileRows.map((p) => [p.id, p]))
  const ids = profileRows.map((p) => p.id)

  const [attRes, consRes, gigRes] = await Promise.all([
    db
      .from('attorneys')
      .select('profile_id, tagline, practice_areas, specialties, jurisdictions, years_experience, credential_type, bar_number, show_bar_number, bar_state')
      .in('profile_id', ids),
    db
      .from('consultants')
      .select('profile_id, tagline, specialties, subjects, industries, years_experience')
      .in('profile_id', ids),
    db
      .from('gigs')
      .select('provider_id, slug, title, category, jurisdiction, status')
      .in('provider_id', ids)
      .eq('status', 'active'),
  ])

  const gigsByProvider = new Map<string, CitableProvider['gigs']>()
  for (const raw of (gigRes.data || []) as Array<{ provider_id?: string; slug?: string; title?: string; category?: string | null; jurisdiction?: string | null }>) {
    const pid = String(raw.provider_id || '')
    if (!pid || !raw.slug || !raw.title) continue
    const list = gigsByProvider.get(pid) || []
    list.push({
      slug: String(raw.slug),
      title: String(raw.title),
      category: raw.category ? String(raw.category) : null,
      jurisdiction: raw.jurisdiction ? String(raw.jurisdiction) : null,
    })
    gigsByProvider.set(pid, list)
  }

  const out: CitableProvider[] = []

  for (const row of (attRes.data || []) as Array<Record<string, unknown>>) {
    const profileId = String(row.profile_id || '')
    const profile = profileById.get(profileId)
    if (!profile?.full_name) continue
    let cred = {
      credential_type: (row.credential_type as string | null) ?? null,
      bar_number: (row.bar_number as string | null) ?? null,
      show_bar_number: (row.show_bar_number as boolean | null) ?? true,
      bar_state: (row.bar_state as string | null) ?? null,
    }
    if (!cred.credential_type) {
      cred = await resolveAttorneyCredential(db as any, profileId).catch(() => cred)
    }
    const seed: CitableProvider = {
      profileId,
      role: 'attorney',
      name: String(profile.full_name).trim(),
      username: profile.username ? String(profile.username).trim().toLowerCase() : null,
      credentialType: cred.credential_type || (row.credential_type as string | null) || null,
      barNumber: cred.bar_number || (row.bar_number as string | null) || null,
      showBarNumber: cred.show_bar_number !== false,
      barState: cred.bar_state || (row.bar_state as string | null) || null,
      yearsExperience: Number(row.years_experience || 0) || null,
      tagline: row.tagline ? String(row.tagline) : null,
      practiceAreas: normalizeStringList(row.practice_areas),
      specialties: normalizeStringList(row.specialties),
      jurisdictions: normalizeStringList(row.jurisdictions),
      profileUrl: '',
      gigs: gigsByProvider.get(profileId) || [],
    }
    seed.profileUrl = providerProfileUrl(seed)
    out.push(seed)
  }

  for (const row of (consRes.data || []) as Array<Record<string, unknown>>) {
    const profileId = String(row.profile_id || '')
    if (out.some((p) => p.profileId === profileId)) continue
    const profile = profileById.get(profileId)
    if (!profile?.full_name) continue
    const gigs = gigsByProvider.get(profileId) || []
    const seed: CitableProvider = {
      profileId,
      role: 'consultant',
      name: String(profile.full_name).trim(),
      username: profile.username ? String(profile.username).trim().toLowerCase() : null,
      credentialType: 'Verified consultant',
      barNumber: null,
      showBarNumber: false,
      barState: null,
      yearsExperience: Number(row.years_experience || 0) || null,
      tagline: row.tagline ? String(row.tagline) : null,
      practiceAreas: [...normalizeStringList(row.subjects), ...normalizeStringList(row.industries)],
      specialties: normalizeStringList(row.specialties),
      jurisdictions: [...new Set(gigs.map((g) => g.jurisdiction).filter((j): j is string => Boolean(j)))],
      profileUrl: '',
      gigs,
    }
    seed.profileUrl = providerProfileUrl(seed)
    out.push(seed)
  }

  return out
}

export async function resolveProviderAuthors(opts: {
  region?: string
  topic?: string
  primaryKeyword?: string
  contentType?: string
  db?: SupaLike
}): Promise<{ author: AuthorPack | null; cited: CitedProvider[]; links: MarketplaceServiceLink[] }> {
  try {
    const db = opts.db || createSupabaseAdminClient()
    const providers = await loadCitableProviders(db)
    const cited = matchProvidersToTopic(providers, opts)
    const author = cited[0] ? authorPackFromProvider(cited[0]) : null
    return { author, cited, links: marketplaceServiceLinks(cited) }
  } catch (err) {
    console.warn('[providerAuthors] lookup skipped:', String((err as Error)?.message || err).slice(0, 180))
    return { author: null, cited: [], links: [] }
  }
}

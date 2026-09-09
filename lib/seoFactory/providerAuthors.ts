/**
 * Cite real marketplace attorneys / consultants on YMYL pages.
 *
 * Providers agreed at signup that their public profile, credentials, and
 * service pages may be referenced. The engine must pick people whose
 * expertise and jurisdiction actually match the article — never invent a
 * byline, bar number, or marketplace URL.
 *
 * Matching is deliberately lossy on purpose: a 1:1 specialty hit is best,
 * but when the panel has no exact specialist the engine triangulates to
 * the nearest related marketplace field (same subcategory → same parent
 * category → sibling field in the immigrant life-cycle) rather than
 * emitting "no matching provider". Empty citations are reserved for
 * unclassifiable non-YMYL topics with no in-region overlap at all.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'
import { resolveAttorneyCredential, type CredentialPair } from '@/lib/attorneyCredential'
import { CATEGORIES } from '@/lib/categories'
import { LIFECYCLE_STAGES } from '@/lib/seoEngine/ontology'
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

export type TopicField = {
  categoryId: string
  subcategoryId: string | null
  label: string
  score: number
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

/** Parent category → sibling categories that still count as nearest-related. */
const RELATED_CATEGORIES: Record<string, string[]> = {
  immigration: ['legal', 'education', 'credentials', 'academic-writing'],
  education: ['academic-writing', 'immigration', 'mentorship', 'credentials'],
  'academic-writing': ['education', 'mentorship', 'immigration'],
  legal: ['immigration', 'business', 'credentials'],
  settlement: ['career', 'credentials', 'immigration'],
  career: ['settlement', 'business', 'education', 'immigration'],
  business: ['legal', 'career', 'credentials'],
  credentials: ['immigration', 'education', 'legal'],
  mentorship: ['education', 'career', 'academic-writing'],
}

/** Subcategory → nearest siblings (same journey stage, not the same form). */
const RELATED_SUBCATEGORIES: Record<string, string[]> = {
  'study-permits': ['university-admissions', 'sop-writing', 'application-essays', 'test-prep', 'graduate-school', 'scholarships', 'student-mentorship'],
  'university-admissions': ['study-permits', 'sop-writing', 'application-essays', 'test-prep', 'graduate-school'],
  'sop-writing': ['university-admissions', 'application-essays', 'study-permits', 'graduate-school'],
  'application-essays': ['sop-writing', 'university-admissions', 'scholarship-essays'],
  'work-permits': ['job-search', 'resume-cv', 'career-coaching', 'internships', 'linkedin', 'business-formation'],
  'job-search': ['work-permits', 'resume-cv', 'linkedin', 'career-coaching'],
  'resume-cv': ['job-search', 'linkedin', 'work-permits'],
  'pr-immigration': ['citizenship', 'credential-assessment', 'legal-consultation'],
  citizenship: ['pr-immigration', 'legal-consultation', 'document-prep'],
  'family-sponsorship': ['visitor-visas', 'legal-consultation', 'document-prep'],
  'visitor-visas': ['family-sponsorship', 'daily-life'],
  housing: ['daily-life', 'banking-finance', 'healthcare', 'cultural-integration'],
  'daily-life': ['housing', 'banking-finance', 'healthcare', 'cultural-integration'],
  'banking-finance': ['housing', 'daily-life', 'healthcare'],
  'document-prep': ['attorney-review', 'legal-consultation', 'family-sponsorship', 'work-permits', 'study-permits'],
  'attorney-review': ['legal-consultation', 'document-prep'],
  'legal-consultation': ['attorney-review', 'document-prep', 'pr-immigration', 'family-sponsorship'],
  'tax-advisory': ['finance-accounting', 'business-consulting', 'compliance'],
}

/**
 * Form-codes and journey phrases the taxonomy keywords miss. These are how
 * "I-130 affidavit of support" resolves to family-sponsorship even when no
 * provider listed that exact form number.
 */
const FIELD_HINTS: Array<{ categoryId: string; subcategoryId: string; pattern: RegExp }> = [
  { categoryId: 'immigration', subcategoryId: 'family-sponsorship', pattern: /\b(i-?130|i-?485|i-?864|i-?129f|k-?1|cr-?1|ir-?1|spouse visa|partner visa|family petition|affidavit of support|fianc[eé]|marriage (green )?card|parent(s)? (to|visa)|sibling (petition|green card)|appendix fm)\b/i },
  { categoryId: 'immigration', subcategoryId: 'work-permits', pattern: /\b(h-?1b|l-?1[ab]?|o-?1|tn\b|e-?3|opt|stem opt|cpt|lmia|skilled worker|graduate route|pgwp|subclass 482|subclass 189|subclass 190|work (visa|permit)|specialty occupation|sponsor(ship)? jobs?)\b/i },
  { categoryId: 'immigration', subcategoryId: 'study-permits', pattern: /\b(f-?1|m-?1|j-?1|i-?20|sevis|cas\b|coe\b|dli|study (permit|visa)|student (visa|route)|subclass 500|sevp)\b/i },
  { categoryId: 'immigration', subcategoryId: 'visitor-visas', pattern: /\b(b-?1|b-?2|b1\/b2|trv|visitor visa|tourist visa|super visa|esta\b|short-stay)\b/i },
  { categoryId: 'immigration', subcategoryId: 'pr-immigration', pattern: /\b(green card|permanent residenc|express entry|pnp\b|crs\b|ilr\b|indefinite leave|i-?485|adjustment of status|subclass 189|points test)\b/i },
  { categoryId: 'immigration', subcategoryId: 'citizenship', pattern: /\b(naturali[sz]ation|n-?400|citizenship test|life in the uk test|dual citizenship|oath ceremony)\b/i },
  { categoryId: 'education', subcategoryId: 'university-admissions', pattern: /\b(university admissions?|college applications?|common app|undergraduate admissions?)\b/i },
  { categoryId: 'academic-writing', subcategoryId: 'sop-writing', pattern: /\b(sop|statement of purpose|letter of intent|study plan|personal statement)\b/i },
  { categoryId: 'settlement', subcategoryId: 'housing', pattern: /\b(rent(al|ing)?|apartment|tenancy|tenant|lease|housing|accommodation|right to rent)\b/i },
  { categoryId: 'settlement', subcategoryId: 'banking-finance', pattern: /\b(bank account|social security number|\bssn\b|\bsin\b|national insurance|tax file number|\btfn\b|itin\b)\b/i },
  { categoryId: 'settlement', subcategoryId: 'healthcare', pattern: /\b(health (insurance|card)|medicare|medicaid|\bnhs\b|\bgp\b registration|ohip)\b/i },
  { categoryId: 'career', subcategoryId: 'resume-cv', pattern: /\b(resume|cv\b|curriculum vitae|linkedin)\b/i },
  { categoryId: 'career', subcategoryId: 'job-search', pattern: /\b(job search|job offer|interview prep|employer sponsorship)\b/i },
  { categoryId: 'legal', subcategoryId: 'legal-consultation', pattern: /\b(immigration lawyer|immigration attorney|legal (advice|consult)|case evaluation)\b/i },
  { categoryId: 'credentials', subcategoryId: 'credential-assessment', pattern: /\b(credential (assessment|evaluation)|wes\b|icas|nzqa|skills assessment)\b/i },
]

const ONTOLOGY_SERVICE_TO_FIELD: Record<string, { categoryId: string; subcategoryId: string | null }> = {
  visa: { categoryId: 'immigration', subcategoryId: null },
  consultation: { categoryId: 'legal', subcategoryId: 'legal-consultation' },
  'study-permits': { categoryId: 'immigration', subcategoryId: 'study-permits' },
  academic: { categoryId: 'education', subcategoryId: null },
  'work-permits': { categoryId: 'immigration', subcategoryId: 'work-permits' },
  career: { categoryId: 'career', subcategoryId: null },
  business: { categoryId: 'business', subcategoryId: null },
  settlement: { categoryId: 'settlement', subcategoryId: null },
  immigration: { categoryId: 'immigration', subcategoryId: null },
  'legal-consultation': { categoryId: 'legal', subcategoryId: 'legal-consultation' },
  credentials: { categoryId: 'credentials', subcategoryId: null },
}

const US_STATE_NAMES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
  'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa',
  'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan',
  'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
  'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina',
  'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island',
  'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont',
  'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming',
  'district of columbia', 'puerto rico', 'washington dc',
]
const US_STATE_CODES = [
  'al', 'ak', 'az', 'ar', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id', 'il', 'in', 'ia',
  'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh',
  'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx',
  'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy', 'dc', 'pr',
]
const CA_PROVINCE_NAMES = [
  'ontario', 'quebec', 'british columbia', 'alberta', 'manitoba', 'saskatchewan',
  'nova scotia', 'new brunswick', 'newfoundland', 'newfoundland and labrador',
  'prince edward island', 'northwest territories', 'yukon', 'nunavut',
]
const CA_PROVINCE_CODES = ['on', 'bc', 'ab', 'qc', 'mb', 'sk', 'ns', 'nb', 'nl', 'pe', 'yt', 'nu']
const UK_PLACE_NAMES = [
  'england', 'wales', 'scotland', 'northern ireland', 'england & wales', 'england and wales',
]
const AU_PLACE_NAMES = [
  'new south wales', 'victoria', 'queensland', 'western australia', 'south australia',
  'tasmania', 'australian capital territory', 'northern territory',
]
const AU_PLACE_CODES = ['nsw', 'vic', 'qld', 'tas', 'act']

const PLACE_NAME_TO_REGION: Record<string, string> = {}
function indexPlaces(region: string, names: string[]) {
  for (const name of names) PLACE_NAME_TO_REGION[name.toLowerCase()] = region
}
indexPlaces('us', [
  ...REGION_ALIASES.us.filter((a) => a !== 'us'),
  ...US_STATE_NAMES,
  'united states of america',
])
indexPlaces('uk', [
  ...REGION_ALIASES.uk.filter((a) => a !== 'uk' && a !== 'gb'),
  ...UK_PLACE_NAMES,
])
indexPlaces('ca', [
  ...REGION_ALIASES.ca.filter((a) => a !== 'ca'),
  ...CA_PROVINCE_NAMES,
])
indexPlaces('au', [
  ...REGION_ALIASES.au.filter((a) => a !== 'au'),
  ...AU_PLACE_NAMES,
])

const PLACE_CODE_TO_REGION: Record<string, string> = {
  us: 'us', usa: 'us',
  uk: 'uk', gb: 'uk', gbr: 'uk',
  au: 'au', aus: 'au',
  ew: 'uk',
}
for (const code of US_STATE_CODES) PLACE_CODE_TO_REGION[code] = 'us'
for (const code of CA_PROVINCE_CODES) PLACE_CODE_TO_REGION[code] = 'ca'
for (const code of AU_PLACE_CODES) PLACE_CODE_TO_REGION[code] = 'au'
PLACE_CODE_TO_REGION.sra = 'uk'

const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]))
const SUB_PARENT = new Map<string, string>()
for (const cat of CATEGORIES) {
  for (const sub of cat.subcategories) SUB_PARENT.set(sub.id, cat.id)
}

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
    for (const match of text.matchAll(/\b([a-z]{1,3}-?\d{1,4}[a-z]?)\b/g)) {
      const collapsed = match[1].replace(/[^a-z0-9]+/g, '')
      if (collapsed.length >= 2) bag.add(collapsed)
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

function splitPlaceItems(value: string): string[] {
  return value
    .split(/[,;/|]+/)
    .map((part) => part.replace(/^["'\s]+|["'\s]+$/g, '').trim())
    .filter(Boolean)
}

function lookupPlaceName(raw: string): string | null {
  const lower = raw.toLowerCase().trim()
  if (!lower) return null
  if (PLACE_NAME_TO_REGION[lower]) return PLACE_NAME_TO_REGION[lower]
  const stripped = lower.replace(/[^a-z0-9& ]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (PLACE_NAME_TO_REGION[stripped]) return PLACE_NAME_TO_REGION[stripped]
  return null
}

/**
 * Map a stored jurisdiction / bar_state item onto us|uk|ca|au.
 * Attorney intake stores "NY, NJ, CT" and "England & Wales", not "US".
 * Two-letter `ca` is Canada as a country code and California as a bar_state.
 */
export function regionFromPlace(raw: string, opts?: { barState?: boolean; siblings?: string[] }): string | null {
  const item = String(raw || '').trim()
  if (!item) return null
  const named = lookupPlaceName(item)
  if (named) return named
  const compact = item.toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (compact === 'ew' || compact === 'englandwales') return 'uk'
  if (compact === 'ca') {
    if (opts?.barState) return 'us'
    const siblings = (opts?.siblings || []).map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ''))
    if (siblings.some((s) => s !== 'ca' && US_STATE_CODES.includes(s))) return 'us'
    return 'ca'
  }
  if (compact.length <= 3 && PLACE_CODE_TO_REGION[compact]) return PLACE_CODE_TO_REGION[compact]
  return null
}

export function providerRegionKeys(provider: Pick<CitableProvider, 'jurisdictions' | 'barState' | 'gigs'>): Set<string> {
  const keys = new Set<string>()
  const items = provider.jurisdictions.flatMap((value) => splitPlaceItems(value))
  for (const item of items) {
    const key = regionFromPlace(item, { siblings: items })
    if (key) keys.add(key)
  }
  if (provider.barState) {
    const key = regionFromPlace(provider.barState, { barState: true, siblings: items })
    if (key) keys.add(key)
  }
  for (const gig of provider.gigs) {
    const jx = regionKey(gig.jurisdiction)
    if (jx) keys.add(jx)
  }
  return keys
}

function jurisdictionMatches(provider: Pick<CitableProvider, 'jurisdictions' | 'barState' | 'gigs'>, region: string | null | undefined): boolean {
  const want = regionKey(region)
  if (!want) return false
  return providerRegionKeys(provider).has(want)
}

function categoryLabel(categoryId: string, subcategoryId: string | null): string {
  const cat = CATEGORY_BY_ID.get(categoryId)
  if (!cat) return subcategoryId || categoryId
  if (!subcategoryId) return cat.name
  const sub = cat.subcategories.find((s) => s.id === subcategoryId)
  return sub ? `${cat.name} → ${sub.name}` : cat.name
}

function bumpField(bag: Map<string, TopicField>, categoryId: string, subcategoryId: string | null, points: number) {
  if (!CATEGORY_BY_ID.has(categoryId) && !SUB_PARENT.has(categoryId)) return
  const parent = SUB_PARENT.get(categoryId)
  const cat = parent || categoryId
  const sub = parent ? categoryId : subcategoryId
  const key = `${cat}::${sub || ''}`
  const prev = bag.get(key)
  const nextScore = (prev?.score || 0) + points
  bag.set(key, {
    categoryId: cat,
    subcategoryId: sub,
    label: categoryLabel(cat, sub),
    score: nextScore,
  })
}

function hayHasKeyword(hay: string, keyword: string): boolean {
  const kw = keyword.toLowerCase().trim()
  if (kw.length < 3) {
    return kw.length >= 2 && new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay)
  }
  return hay.includes(kw)
}

/** Map free text (topic, practice area, gig title) onto marketplace fields. */
export function classifyTopicFields(text: string): TopicField[] {
  const raw = String(text || '').trim()
  if (!raw) return []
  const hay = raw.toLowerCase()
  const tokens = new Set(tokenize(raw))
  const bag = new Map<string, TopicField>()

  for (const hint of FIELD_HINTS) {
    if (hint.pattern.test(raw)) bumpField(bag, hint.categoryId, hint.subcategoryId, 8)
  }

  for (const cat of CATEGORIES) {
    if (hayHasKeyword(hay, cat.name) || tokens.has(cat.id)) bumpField(bag, cat.id, null, 4)
    for (const sub of cat.subcategories) {
      let points = 0
      if (hayHasKeyword(hay, sub.name) || tokens.has(sub.id)) points += 5
      for (const kw of sub.keywords) {
        if (hayHasKeyword(hay, kw)) points += kw.length >= 6 ? 3 : 2
      }
      if (points) bumpField(bag, cat.id, sub.id, points)
    }
  }

  for (const stage of LIFECYCLE_STAGES) {
    let hit = 0
    for (const cell of Object.values(stage.countries)) {
      for (const seed of cell.seedKeywords) {
        if (hayHasKeyword(hay, seed) || overlappingTokens([...tokens], tokenize(seed)).length >= 2) hit += 1
      }
    }
    if (!hit) {
      const stageTokens = tokenize(stage.label, stage.short, stage.key)
      if (overlappingTokens([...tokens], stageTokens).length) hit = 1
    }
    if (!hit) continue
    const seenService = new Set<string>()
    for (const service of stage.services) {
      const mapped = ONTOLOGY_SERVICE_TO_FIELD[service]
      if (!mapped) continue
      const key = `${mapped.categoryId}::${mapped.subcategoryId || ''}`
      if (seenService.has(key)) continue
      seenService.add(key)
      bumpField(bag, mapped.categoryId, mapped.subcategoryId, mapped.subcategoryId ? 4 : 2)
    }
  }

  return [...bag.values()]
    .filter((field) => field.score >= 3)
    .sort((a, b) => {
      const aRank = a.score + (a.subcategoryId ? 5 : 0)
      const bRank = b.score + (b.subcategoryId ? 5 : 0)
      return bRank - aRank || b.score - a.score || a.label.localeCompare(b.label)
    })
    .slice(0, 5)
}

export function classifyProviderFields(provider: Pick<CitableProvider, 'practiceAreas' | 'specialties' | 'tagline' | 'gigs'>): TopicField[] {
  const blob = [
    ...provider.practiceAreas,
    ...provider.specialties,
    provider.tagline || '',
    ...provider.gigs.map((g) => `${g.title} ${g.category || ''}`),
  ].join(' · ')
  const fields = classifyTopicFields(blob)
  const bag = new Map(fields.map((f) => [`${f.categoryId}::${f.subcategoryId || ''}`, f]))
  for (const gig of provider.gigs) {
    const cat = String(gig.category || '').trim().toLowerCase()
    if (!cat) continue
    if (CATEGORY_BY_ID.has(cat)) bumpField(bag, cat, null, 6)
    else if (SUB_PARENT.has(cat)) bumpField(bag, SUB_PARENT.get(cat)!, cat, 6)
  }
  return [...bag.values()].sort((a, b) => b.score - a.score).slice(0, 6)
}

function relatedSub(a: string | null, b: string | null): boolean {
  if (!a || !b || a === b) return false
  return (RELATED_SUBCATEGORIES[a] || []).includes(b) || (RELATED_SUBCATEGORIES[b] || []).includes(a)
}

function relatedCat(a: string, b: string): boolean {
  if (a === b) return false
  return (RELATED_CATEGORIES[a] || []).includes(b) || (RELATED_CATEGORIES[b] || []).includes(a)
}

export function fieldRelatedness(topicFields: TopicField[], providerFields: TopicField[]): { score: number; reason: string; direct: boolean; related: boolean } {
  if (!topicFields.length || !providerFields.length) {
    return { score: 0, reason: '', direct: false, related: false }
  }
  let best = 0
  let reason = ''
  let direct = false
  let related = false
  for (const topic of topicFields) {
    for (const provider of providerFields) {
      if (topic.subcategoryId && provider.subcategoryId && topic.subcategoryId === provider.subcategoryId) {
        const score = 12
        if (score > best) {
          best = score
          reason = `same specialty: ${topic.label}`
          direct = true
        }
      } else if (topic.categoryId === provider.categoryId) {
        const score = 8
        if (score > best) {
          best = score
          reason = `same field: ${provider.label || topic.label}`
          direct = true
        }
      } else if (relatedSub(topic.subcategoryId, provider.subcategoryId)) {
        const score = 6
        if (score > best) {
          best = score
          reason = `nearest related specialty: ${provider.label} for ${topic.label}`
          related = true
        }
      } else if (relatedCat(topic.categoryId, provider.categoryId)) {
        const score = 4
        if (score > best) {
          best = score
          reason = `nearest related field: ${provider.label} for ${topic.label}`
          related = true
        }
      }
    }
  }
  return { score: best, reason, direct, related: related && !direct }
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
  const triangulated = cited.some((person) => person.matchReasons.some((r) => /nearest related|triangulat/i.test(r)))
  const lines = [
    'YMYL AUTHOR / MARKETPLACE CITATION (mandatory — these people consented at signup to be cited).',
    'Pick the FIRST person as the named author/reviewer. Cite only their recorded credential and field.',
    'YAML `author` MUST be this person\'s name — never invent YouSafe Editorial Team.',
    'You MUST include each listed marketplace URL verbatim as a markdown link in the body (author byline and/or “Need professional help”).',
    'Do not invent additional people, bar numbers, case results, or service pages.',
  ]
  if (triangulated) {
    lines.push('If “Why this article” says nearest related field, introduce them as a practitioner in that related field — do not claim they specialise in the exact form/visa unless their recorded specialties say so.')
  }
  lines.push('')
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

type ScoredProvider = CitedProvider & {
  expertiseHit: boolean
  jurisdictionHit: boolean
  fieldHit: boolean
  fieldRelatedHit: boolean
}

function stripScoreFlags(person: ScoredProvider): CitedProvider {
  const { expertiseHit: _e, jurisdictionHit: _j, fieldHit: _f, fieldRelatedHit: _r, ...rest } = person
  return rest
}

function withTriangulationReason(person: ScoredProvider, topicLabel: string): ScoredProvider {
  const already = person.matchReasons.some((r) => /nearest related|triangulat|same field|same specialty/i.test(r))
  if (already) return person
  return {
    ...person,
    matchReasons: [
      ...person.matchReasons,
      topicLabel
        ? `triangulated to nearest related field: ${topicLabel}`
        : 'triangulated to nearest available marketplace provider',
    ],
  }
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
  const topicFields = classifyTopicFields(`${topic} ${keyword}`)
  const topicLabel = topicFields[0]?.label || ''
  const limit = opts.limit ?? 3
  const scored: ScoredProvider[] = []

  for (const provider of providers) {
    if (!provider.name.trim()) continue
    let score = 0
    const reasons: string[] = []
    let expertiseHit = false
    let jurisdictionHit = false

    if (jurisdictionMatches(provider, region)) {
      score += 8
      jurisdictionHit = true
      reasons.push(`practises in ${regionKey(region).toUpperCase() || 'this region'}`)
    } else if (providerRegionKeys(provider).size) {
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

    const providerFields = classifyProviderFields(provider)
    const related = fieldRelatedness(topicFields, providerFields)
    if (related.score) {
      score += related.score
      reasons.push(related.reason)
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
      fieldHit: related.direct,
      fieldRelatedHit: related.related,
    })
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))

  const direct = scored.filter((person) => {
    if (person.score < 0 && !person.fieldHit && !person.expertiseHit) return false
    return person.expertiseHit || person.fieldHit || person.fieldRelatedHit
  })
  if (direct.length) return direct.slice(0, limit).map(stripScoreFlags)

  // Topic mapped to a marketplace field → always cite the nearest provider
  // rather than "no matching marketplace attorney/consultant".
  if (topicFields.length && scored.length) {
    const inRegion = scored.filter((person) => person.jurisdictionHit)
    const pool = (inRegion.length ? inRegion : scored.filter((person) => person.score >= 0))
    const fallback = (pool.length ? pool : scored).slice(0, limit).map((person) => withTriangulationReason(person, topicLabel))
    return fallback.map(stripScoreFlags)
  }

  // YMYL still needs a real named practitioner when the topic did not
  // classify. Prefer an in-region attorney (or consultant on a study topic).
  if (ymyl && scored.length) {
    const fallbackPool = scored.filter((person) => {
      if (person.score < 0 && !person.jurisdictionHit) return false
      if (studyTopic) return person.role === 'consultant' || person.role === 'attorney'
      return person.role === 'attorney'
    })
    const pool = fallbackPool.length ? fallbackPool : scored.filter((p) => p.score >= 0)
    if (pool.length) {
      return pool.slice(0, 1).map((person) => stripScoreFlags({
        ...person,
        matchReasons: [...person.matchReasons, 'YMYL fallback: licensed marketplace provider'],
      }))
    }
  }

  return []
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
    let cred: CredentialPair = {
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

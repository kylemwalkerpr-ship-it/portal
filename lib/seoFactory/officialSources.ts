/**
 * Crème-de-la-crème citation bank.
 *
 * External hrefs may only be formal authorities in the discipline:
 * immigration departments, government departments, official school pages,
 * and a tiny named set of intergovernmental / statutory bodies.
 * Blogs, news, consultants, social, Wikipedia, and invented .gov paths
 * are never allowlisted.
 *
 * Deep official URLs are preferred. Homepages are last-resort fallbacks
 * so a rotting deep link never ships. Every URL that leaves this module
 * is still live-checked by linkAudit before it reaches a brief or draft.
 */

export type SourceRegion = 'US' | 'UK' | 'CA' | 'AU' | 'ALL'

export type SourceTopic =
  | 'immigration'
  | 'study'
  | 'work'
  | 'housing'
  | 'health'
  | 'tax'
  | 'family'
  | 'citizenship'
  | 'travel'
  | 'education'
  | 'labor'
  | 'finance'

export interface OfficialSource {
  title: string
  url: string
  regions: SourceRegion[]
  topics: SourceTopic[]
}

export interface CitationContext {
  region?: string | null
  topic?: string | null
  keywords?: string[]
  body?: string | null
}

export const CURATED_OFFICIAL_SOURCES: OfficialSource[] = [
  // ── United States ────────────────────────────────────────────────────
  { title: 'USCIS — Students and Employment', url: 'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/students-and-employment', regions: ['US'], topics: ['immigration', 'study', 'work'] },
  { title: 'USCIS — Working in the United States', url: 'https://www.uscis.gov/working-in-the-united-states', regions: ['US'], topics: ['immigration', 'work'] },
  { title: 'USCIS — Family', url: 'https://www.uscis.gov/family', regions: ['US'], topics: ['immigration', 'family'] },
  { title: 'USCIS — Visit the United States', url: 'https://www.uscis.gov/visit-the-united-states', regions: ['US'], topics: ['immigration', 'travel'] },
  { title: 'USCIS — Green Card', url: 'https://www.uscis.gov/green-card', regions: ['US'], topics: ['immigration', 'citizenship'] },
  { title: 'USCIS — Forms', url: 'https://www.uscis.gov/forms', regions: ['US'], topics: ['immigration'] },
  { title: 'USCIS — I-765 Application for Employment Authorization', url: 'https://www.uscis.gov/i-765', regions: ['US'], topics: ['immigration', 'work', 'study'] },
  { title: 'USCIS home', url: 'https://www.uscis.gov/', regions: ['US'], topics: ['immigration'] },
  { title: 'Study in the States (DHS / SEVP)', url: 'https://studyinthestates.dhs.gov/', regions: ['US'], topics: ['study', 'immigration', 'education'] },
  { title: 'Travel.State.Gov — Student Visa', url: 'https://travel.state.gov/content/travel/en/us-visas/study.html', regions: ['US'], topics: ['immigration', 'study', 'travel'] },
  { title: 'Travel.State.Gov — Employment Visa', url: 'https://travel.state.gov/content/travel/en/us-visas/employment.html', regions: ['US'], topics: ['immigration', 'work'] },
  { title: 'Travel.State.Gov — Visitor Visa', url: 'https://travel.state.gov/content/travel/en/us-visas/tourism-visit.html', regions: ['US'], topics: ['immigration', 'travel'] },
  { title: 'ICE — SEVP', url: 'https://www.ice.gov/sevis', regions: ['US'], topics: ['study', 'immigration'] },
  { title: 'EducationUSA (U.S. Department of State)', url: 'https://educationusa.state.gov/', regions: ['US'], topics: ['study', 'education'] },
  { title: 'U.S. Department of Labor', url: 'https://www.dol.gov/', regions: ['US'], topics: ['labor', 'work'] },
  { title: 'DOL FLAG — Labor certification & LCA', url: 'https://flag.dol.gov/', regions: ['US'], topics: ['labor', 'work', 'immigration'] },
  { title: 'Federal Student Aid', url: 'https://studentaid.gov/', regions: ['US'], topics: ['education', 'finance', 'study'] },
  { title: 'U.S. Department of Education', url: 'https://www.ed.gov/', regions: ['US'], topics: ['education'] },
  { title: 'HUD — Housing', url: 'https://www.hud.gov/', regions: ['US'], topics: ['housing'] },
  { title: 'HUD — Rental assistance', url: 'https://www.hud.gov/topics/rental_assistance', regions: ['US'], topics: ['housing'] },
  { title: 'CFPB — Consumer finance', url: 'https://www.consumerfinance.gov/', regions: ['US'], topics: ['finance'] },
  { title: 'IRS', url: 'https://www.irs.gov/', regions: ['US'], topics: ['tax', 'finance'] },
  { title: 'Social Security Administration', url: 'https://www.ssa.gov/', regions: ['US'], topics: ['work', 'finance'] },
  { title: 'CDC', url: 'https://www.cdc.gov/', regions: ['US'], topics: ['health'] },
  { title: 'CBP', url: 'https://www.cbp.gov/', regions: ['US'], topics: ['immigration', 'travel'] },

  // ── United Kingdom ───────────────────────────────────────────────────
  { title: 'GOV.UK — Student visa', url: 'https://www.gov.uk/student-visa', regions: ['UK'], topics: ['immigration', 'study'] },
  { title: 'GOV.UK — Graduate visa', url: 'https://www.gov.uk/graduate-visa', regions: ['UK'], topics: ['immigration', 'study', 'work'] },
  { title: 'GOV.UK — Skilled Worker visa', url: 'https://www.gov.uk/skilled-worker-visa', regions: ['UK'], topics: ['immigration', 'work'] },
  { title: 'GOV.UK — Standard Visitor', url: 'https://www.gov.uk/standard-visitor', regions: ['UK'], topics: ['immigration', 'travel'] },
  { title: 'GOV.UK — Family visas', url: 'https://www.gov.uk/uk-family-visa', regions: ['UK'], topics: ['immigration', 'family'] },
  { title: 'GOV.UK — Immigration Rules', url: 'https://www.gov.uk/guidance/immigration-rules', regions: ['UK'], topics: ['immigration'] },
  { title: 'GOV.UK — Visas and immigration', url: 'https://www.gov.uk/browse/visas-immigration', regions: ['UK'], topics: ['immigration'] },
  { title: 'GOV.UK — Private renting', url: 'https://www.gov.uk/private-renting', regions: ['UK'], topics: ['housing'] },
  { title: 'GOV.UK — Housing and local services', url: 'https://www.gov.uk/browse/housing-local-services', regions: ['UK'], topics: ['housing'] },
  { title: 'GOV.UK — Using the NHS', url: 'https://www.gov.uk/using-the-nhs', regions: ['UK'], topics: ['health'] },
  { title: 'GOV.UK — Student finance', url: 'https://www.gov.uk/student-finance', regions: ['UK'], topics: ['education', 'finance', 'study'] },
  { title: 'GOV.UK — Working, jobs and pensions', url: 'https://www.gov.uk/browse/working', regions: ['UK'], topics: ['work', 'labor'] },
  { title: 'GOV.UK — Money and tax', url: 'https://www.gov.uk/browse/tax', regions: ['UK'], topics: ['tax', 'finance'] },
  { title: 'Office for Students', url: 'https://www.officeforstudents.org.uk/', regions: ['UK'], topics: ['education', 'study'] },
  { title: 'UKCISA — International student advice', url: 'https://www.ukcisa.org.uk/', regions: ['UK'], topics: ['study', 'immigration', 'education'] },

  // ── Canada ───────────────────────────────────────────────────────────
  { title: 'IRCC — Study permit', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada.html', regions: ['CA'], topics: ['immigration', 'study'] },
  { title: 'IRCC — Work after graduation (PGWP)', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation.html', regions: ['CA'], topics: ['immigration', 'study', 'work'] },
  { title: 'IRCC — Work in Canada', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada.html', regions: ['CA'], topics: ['immigration', 'work'] },
  { title: 'IRCC — Visit', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada.html', regions: ['CA'], topics: ['immigration', 'travel'] },
  { title: 'IRCC — Family sponsorship', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/family-sponsorship.html', regions: ['CA'], topics: ['immigration', 'family'] },
  { title: 'IRCC — Express Entry', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry.html', regions: ['CA'], topics: ['immigration', 'work'] },
  { title: 'IRCC home', url: 'https://www.canada.ca/en/immigration-refugees-citizenship.html', regions: ['CA'], topics: ['immigration'] },
  { title: 'Educanada — Study in Canada', url: 'https://www.educanada.ca/', regions: ['CA'], topics: ['study', 'education'] },
  { title: 'Canada — Housing benefits', url: 'https://www.canada.ca/en/services/benefits/housing.html', regions: ['CA'], topics: ['housing'] },
  { title: 'CMHC', url: 'https://www.cmhc-schl.gc.ca/', regions: ['CA'], topics: ['housing'] },
  { title: 'Canada Revenue Agency', url: 'https://www.canada.ca/en/revenue-agency.html', regions: ['CA'], topics: ['tax', 'finance'] },
  { title: 'Health Canada', url: 'https://www.canada.ca/en/health-canada.html', regions: ['CA'], topics: ['health'] },
  { title: 'Job Bank Canada', url: 'https://www.jobbank.gc.ca/', regions: ['CA'], topics: ['work', 'labor'] },

  // ── Australia ────────────────────────────────────────────────────────
  { title: 'Home Affairs — Student visa (subclass 500)', url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500', regions: ['AU'], topics: ['immigration', 'study'] },
  { title: 'Home Affairs — Temporary Graduate visa (485)', url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485', regions: ['AU'], topics: ['immigration', 'study', 'work'] },
  { title: 'Home Affairs — Skills in Demand (482)', url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/skills-in-demand-482', regions: ['AU'], topics: ['immigration', 'work'] },
  { title: 'Home Affairs — Visitor visa (600)', url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/visitor-600', regions: ['AU'], topics: ['immigration', 'travel'] },
  { title: 'Home Affairs — Partner visa', url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/partner-onshore', regions: ['AU'], topics: ['immigration', 'family'] },
  { title: 'Home Affairs — Immigration and citizenship', url: 'https://immi.homeaffairs.gov.au/', regions: ['AU'], topics: ['immigration', 'citizenship'] },
  { title: 'Study Australia', url: 'https://www.studyaustralia.gov.au/', regions: ['AU'], topics: ['study', 'education'] },
  { title: 'TEQSA', url: 'https://www.teqsa.gov.au/', regions: ['AU'], topics: ['education'] },
  { title: 'Australian Taxation Office', url: 'https://www.ato.gov.au/', regions: ['AU'], topics: ['tax', 'finance'] },
  { title: 'Fair Work Ombudsman', url: 'https://www.fairwork.gov.au/', regions: ['AU'], topics: ['labor', 'work'] },
  { title: 'Services Australia', url: 'https://www.servicesaustralia.gov.au/', regions: ['AU'], topics: ['health', 'finance'] },

  // ── Intergovernmental / statutory (all regions) ──────────────────────
  { title: 'International Organization for Migration', url: 'https://www.iom.int/', regions: ['ALL'], topics: ['immigration'] },
  { title: 'UNHCR', url: 'https://www.unhcr.org/', regions: ['ALL'], topics: ['immigration'] },
  { title: 'World Health Organization', url: 'https://www.who.int/', regions: ['ALL'], topics: ['health'] },
  { title: 'OECD — Education', url: 'https://www.oecd.org/', regions: ['ALL'], topics: ['education'] },
  { title: 'International Labour Organization', url: 'https://www.ilo.org/', regions: ['ALL'], topics: ['labor', 'work'] },
]

const TOPIC_SIGNALS: Array<{ topic: SourceTopic; re: RegExp }> = [
  { topic: 'housing', re: /\b(hous(?:e|ing)|rent(?:al|ing)?|landlord|tenant|accommodat|dorm(?:itory)?|apartment|lease|campus living|meal plan)\b/i },
  { topic: 'health', re: /\b(health|nhs|ohip|medicare|insurance|medical|gp|hospital|vaccine)\b/i },
  { topic: 'tax', re: /\b(tax(?:es|ation)?|irs|hmrc|cra|ato|itin|itin|gst|vat|national insurance)\b/i },
  { topic: 'finance', re: /\b(bank(?:ing|s)?|fafsa|student finance|tuition|fee(?:s)?|loan|credit|itin)\b/i },
  { topic: 'study', re: /\b(study(?:ing)?|student visa|international students?|university|college|sevis|sevp|i-20|cas|coe|f-?1|opt|cpt|pgwp|graduate route|subclass 500|stem opt)\b/i },
  { topic: 'work', re: /\b(work(?:ing|er)?|employ(?:ment|er)?|h-?1b|lca|perm|skilled worker|lmia|482|job|payroll|ssn|sin)\b/i },
  { topic: 'family', re: /\b(spouse|partner|dependent|family|parent|child|marriage|fianc[eé])\b/i },
  { topic: 'citizenship', re: /\b(citizen(?:ship)?|naturali[sz]|permanent resident|\bpr\b|ilr|green card|settlement)\b/i },
  { topic: 'travel', re: /\b(visit(?:or)?|tourist|esta|e\.?t\.?a|transit|entry)\b/i },
  { topic: 'education', re: /\b(education|school|admissions?|registrar|academic)\b/i },
  { topic: 'labor', re: /\b(labou?r|dol|fair work|minimum wage|workplace)\b/i },
  { topic: 'immigration', re: /\b(visa|immigr(?:ation|ate)|permit|uscis|ircc|ukvi|home affairs|i-765|i-129|i-485)\b/i },
]

const SPECIFIC_TOPICS: SourceTopic[] = ['housing', 'health', 'tax', 'finance']
const CORE_IMMIGRATION_TOPICS: SourceTopic[] = ['immigration', 'study', 'work', 'family', 'citizenship', 'travel']

export function sourcesForRegion(region?: string | null): OfficialSource[] {
  const key = normalizeRegion(region)
  const regional = CURATED_OFFICIAL_SOURCES.filter((s) => s.regions.includes(key) || s.regions.includes('ALL'))
  return regional.length ? regional : CURATED_OFFICIAL_SOURCES.filter((s) => s.regions.includes('US'))
}

export function inferSourceTopics(text: string): SourceTopic[] {
  const hay = String(text || '')
  if (!hay.trim()) return []
  const out: SourceTopic[] = []
  for (const { topic, re } of TOPIC_SIGNALS) {
    if (re.test(hay)) out.push(topic)
  }
  return out
}

export function contextTopics(ctx?: CitationContext | null): SourceTopic[] {
  if (!ctx) return []
  const blob = [ctx.topic, ...(ctx.keywords || []), ctx.body ? String(ctx.body).slice(0, 4000) : '']
    .filter(Boolean)
    .join(' ')
  return inferSourceTopics(blob)
}

function regionOfUrl(url: string): SourceRegion[] {
  const u = url.toLowerCase()
  if (/gov\.uk|ukcisa\.org\.uk|officeforstudents\.org\.uk|britishcouncil/.test(u)) return ['UK']
  if (/canada\.ca|gc\.ca|educanada\.ca|cmhc-schl/.test(u)) return ['CA']
  if (/homeaffairs|gov\.au|studyaustralia|teqsa|fairwork|ato\.gov/.test(u)) return ['AU']
  if (/uscis|state\.gov|dhs\.gov|ice\.gov|cbp\.gov|hud\.gov|irs\.gov|ed\.gov|dol\.gov|studentaid|consumerfinance|ssa\.gov|cdc\.gov/.test(u)) return ['US']
  return ['ALL']
}

function topicsOfUrl(url: string, title?: string): SourceTopic[] {
  const inferred = inferSourceTopics(`${title || ''} ${url}`)
  return inferred.length ? inferred : ['immigration']
}

export function findCuratedSource(url: string): OfficialSource | null {
  const key = normalizeOfficialUrl(url)
  if (!key) return null
  return CURATED_OFFICIAL_SOURCES.find((s) => normalizeOfficialUrl(s.url) === key) || null
}

export function scoreSourceRelevance(source: OfficialSource, ctx?: CitationContext | null): number {
  if (!ctx || (!ctx.topic && !ctx.keywords?.length && !ctx.body)) {
    return source.regions.includes('ALL') ? 2 : 4
  }
  const wantRegion = normalizeRegion(ctx.region)
  if (!source.regions.includes(wantRegion) && !source.regions.includes('ALL')) return 0

  let score = source.regions.includes(wantRegion) ? 4 : 1
  const want = contextTopics(ctx)
  if (!want.length) return score + 2

  const overlap = source.topics.filter((t) => want.includes(t))
  const wantSpecific = want.filter((t) => SPECIFIC_TOPICS.includes(t))
  const wantCore = want.filter((t) => CORE_IMMIGRATION_TOPICS.includes(t))

  if (wantSpecific.length && !wantCore.length) {
    const specificHit = source.topics.some((t) => wantSpecific.includes(t))
    if (!specificHit) return 0
  }

  const sourceIsSpecificOnly = source.topics.length > 0 && source.topics.every((t) => SPECIFIC_TOPICS.includes(t))
  if (sourceIsSpecificOnly && wantCore.length && !wantSpecific.length && !overlap.length) {
    return 0
  }

  if (overlap.length) score += overlap.length * 3
  else if (source.topics.includes('immigration') && wantCore.length) score += 1

  const hay = `${source.title} ${source.url}`.toLowerCase()
  const tokens = [ctx.topic, ...(ctx.keywords || [])]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4)
  for (const t of tokens) if (hay.includes(t)) score += 1
  return score
}

export function scoreUrlRelevance(url: string, ctx?: CitationContext | null, title?: string): number {
  const curated = findCuratedSource(url)
  if (curated) return scoreSourceRelevance(curated, ctx)
  return scoreSourceRelevance(
    { title: title || url, url, regions: regionOfUrl(url), topics: topicsOfUrl(url, title) },
    ctx,
  )
}

export const MIN_CITATION_RELEVANCE = 3

/** Immigration / education agencies on this estate — never “off-topic” in-region. */
const PRIMARY_DISCIPLINE_HOSTS = new Set([
  'uscis.gov',
  'studyinthestates.dhs.gov',
  'ice.gov',
  'cbp.gov',
  'dhs.gov',
  'travel.state.gov',
  'state.gov',
  'educationusa.state.gov',
  'gov.uk',
  'canada.ca',
  'ircc.canada.ca',
  'homeaffairs.gov.au',
  'immi.homeaffairs.gov.au',
  'studyaustralia.gov.au',
  'educanada.ca',
  'ukcisa.org.uk',
  'officeforstudents.org.uk',
  'iom.int',
  'unhcr.org',
])

export function citationRegionMatch(url: string, ctx?: CitationContext | null): boolean {
  if (!ctx?.region) return true
  const want = normalizeRegion(ctx.region)
  const curated = findCuratedSource(url)
  const regions = curated?.regions || regionOfUrl(url)
  return regions.includes(want) || regions.includes('ALL')
}

export function isPrimaryDisciplineAuthority(url: string): boolean {
  const host = hostnameOf(url)
  if (!host) return false
  const bare = bareHost(host)
  if (PRIMARY_DISCIPLINE_HOSTS.has(bare)) return true
  if (PRIMARY_DISCIPLINE_HOSTS.has(bare.split('.').slice(-2).join('.'))) return true
  if (isOfficialSchoolPage(url)) return true
  const curated = findCuratedSource(url)
  if (curated?.topics.some((t) => CORE_IMMIGRATION_TOPICS.includes(t) || t === 'education' || t === 'study')) {
    return true
  }
  return false
}

/**
 * Cream citations stay unless they are clearly the wrong region or a
 * specialist page (housing/tax/health) on an article that never touches that
 * topic. Same-region USCIS / IRCC / UKVI / Home Affairs / school pages always
 * pass — this is an immigration/student estate.
 */
export function isCitationRelevant(url: string, ctx?: CitationContext | null, title?: string): boolean {
  if (!ctx || (!ctx.topic && !ctx.keywords?.length && !ctx.body)) return true
  if (!citationRegionMatch(url, ctx)) return false
  if (isReputablePublication(url)) return true
  if (isContextualAuthority(url, ctx)) return true
  if (isPrimaryDisciplineAuthority(url)) return true
  return scoreUrlRelevance(url, ctx, title) >= MIN_CITATION_RELEVANCE
}

export function sourcesForBrief(ctx?: CitationContext | null): OfficialSource[] {
  const extra = disciplineSourcesForBrief(ctx)
  const extraUrls = new Set(extra.map((s) => s.url))
  const bank = [...extra, ...sourcesForRegion(ctx?.region)]
  const seen = new Set<string>()
  return bank
    .map((s) => ({ s, score: scoreSourceRelevance(s, ctx) + (extraUrls.has(s.url) ? 8 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s)
    .filter((s) => {
      const k = normalizeOfficialUrl(s.url)
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })
}

/** Hosts a reader can trust as a primary source (not a blog or competitor). */
const AUTHORITY_HOSTS = new Set([
  'uscis.gov',
  'studyinthestates.dhs.gov',
  'ice.gov',
  'cbp.gov',
  'dhs.gov',
  'travel.state.gov',
  'state.gov',
  'educationusa.state.gov',
  'gov.uk',
  'canada.ca',
  'ircc.canada.ca',
  'homeaffairs.gov.au',
  'immi.homeaffairs.gov.au',
  'studyaustralia.gov.au',
  'teqsa.gov.au',
  'ato.gov.au',
  'fairwork.gov.au',
  'servicesaustralia.gov.au',
  'dol.gov',
  'flag.dol.gov',
  'hud.gov',
  'ed.gov',
  'studentaid.gov',
  'irs.gov',
  'ssa.gov',
  'cdc.gov',
  'consumerfinance.gov',
  'cmhc-schl.gc.ca',
  'jobbank.gc.ca',
  'educanada.ca',
  'officeforstudents.org.uk',
  'ukcisa.org.uk',
  'iom.int',
  'unhcr.org',
  'who.int',
  'oecd.org',
  'ilo.org',
  'un.org',
  'europa.eu',
  'ec.europa.eu',
])

const GOV_SUFFIXES = ['.gov', '.gov.uk', '.gov.au', '.gc.ca', '.mil', '.govt.nz', '.gov.sg']
const SCHOOL_SUFFIXES = ['.edu', '.ac.uk', '.edu.au', '.ac.nz', '.edu.sg', '.ac.za']
const INSTITUTIONAL_ORG_SUFFIXES = ['.org', '.org.uk', '.org.au', '.org.nz', '.org.sg', '.int']

const LOW_VALUE_HOSTS = new Set([
  'bit.ly', 't.co', 'tinyurl.com', 'ow.ly', 'goo.gl', 'is.gd', 'buff.ly', 'cutt.ly', 'rebrand.ly', 'lnkd.in',
  'facebook.com', 'fb.com', 'instagram.com', 'tiktok.com', 'twitter.com', 'x.com', 'linkedin.com',
  'youtube.com', 'youtu.be', 'reddit.com', 'pinterest.com', 'medium.com', 'quora.com', 'substack.com',
  'wikipedia.org', 'wikidata.org', 'wikihow.com', 'britannica.com',
  'boundless.com', 'visajourney.com', 'immihelp.com', 'y-axis.com', 'idp.com', 'applyboard.com',
  'visaguide.world', 'settlein.com', 'lawdepot.com', 'nolo.com',
])

const LOW_VALUE_HOST_RE =
  /^(facebook|fb|instagram|tiktok|twitter|x|linkedin|youtube|youtu\.be|reddit|pinterest|medium|quora|substack|wikipedia)\./i

/** Named newsrooms and journals — cream when they are not already junk hosts. */
const REPUTABLE_PUBLICATION_HOSTS = new Set([
  'nytimes.com', 'washingtonpost.com', 'wsj.com', 'ft.com', 'economist.com',
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'theguardian.com',
  'bloomberg.com', 'npr.org', 'pbs.org', 'nbcnews.com', 'cbsnews.com',
  'abcnews.go.com', 'usatoday.com', 'latimes.com', 'chicagotribune.com',
  'theatlantic.com', 'newyorker.com', 'time.com', 'nature.com', 'science.org',
  'sciencemag.org', 'aljazeera.com', 'cbc.ca', 'abc.net.au', 'smh.com.au',
  'theglobeandmail.com', 'thestar.com', 'independent.co.uk', 'telegraph.co.uk',
  'politico.com', 'axios.com', 'propublica.org', 'theconversation.com',
])

export function isReputablePublication(url: string): boolean {
  if (isLowValueHost(url)) return false
  const host = hostnameOf(url)
  if (!host) return false
  const bare = bareHost(host)
  if (REPUTABLE_PUBLICATION_HOSTS.has(bare)) return true
  const parts = bare.split('.')
  for (let i = 0; i < parts.length - 1; i++) {
    if (REPUTABLE_PUBLICATION_HOSTS.has(parts.slice(i).join('.'))) return true
  }
  return false
}

const SCHOOL_JUNK_SUBHOST =
  /^(blog|blogs|news|magazine|newspaper|students|clubs|events|alumni-news|give|shop|store)$/i

const SCHOOL_JUNK_PATH = /\/(blog|blogs|news|opinion|newspaper|magazine|forum|forums)\b/i

export function hostnameOf(url: string): string | null {
  try {
    if (!/^https?:\/\//i.test(url.trim())) return null
    return new URL(url.trim()).hostname.toLowerCase()
  } catch {
    return null
  }
}

function bareHost(host: string): string {
  return host.replace(/^www\./, '')
}

export function isSchoolHost(url: string): boolean {
  const host = hostnameOf(url)
  if (!host) return false
  const bare = bareHost(host)
  return SCHOOL_SUFFIXES.some((sfx) => bare.endsWith(sfx))
}

/** Official university/school pages only — not campus blogs or student papers. */
export function isOfficialSchoolPage(url: string): boolean {
  if (!isSchoolHost(url)) return false
  const host = hostnameOf(url)
  if (!host) return false
  const bare = bareHost(host)
  const first = bare.split('.')[0]
  if (SCHOOL_JUNK_SUBHOST.test(first)) return false
  try {
    const path = new URL(url).pathname.toLowerCase()
    if (SCHOOL_JUNK_PATH.test(path)) return false
    if (/\/~/.test(path)) return false
  } catch {
    return false
  }
  return true
}

export function isAuthorityHost(url: string): boolean {
  const host = hostnameOf(url)
  if (!host) return false
  const bare = bareHost(host)
  if (AUTHORITY_HOSTS.has(bare) || AUTHORITY_HOSTS.has(host)) return true
  if (AUTHORITY_HOSTS.has(bare.split('.').slice(-2).join('.')) && GOV_SUFFIXES.some((sfx) => bare.endsWith(sfx))) {
    return true
  }
  if (GOV_SUFFIXES.some((sfx) => bare.endsWith(sfx))) return true
  if (SCHOOL_SUFFIXES.some((sfx) => bare.endsWith(sfx))) return isOfficialSchoolPage(url)
  return false
}

/** Known junk / non-reader-value hosts — never cite these. */
export function isLowValueHost(url: string): boolean {
  const host = hostnameOf(url)
  if (!host) return false
  const bare = bareHost(host)
  if (LOW_VALUE_HOSTS.has(bare)) return true
  for (const junk of LOW_VALUE_HOSTS) {
    if (bare.endsWith(`.${junk}`)) return true
  }
  if (LOW_VALUE_HOST_RE.test(bare + '.')) return true
  return false
}

/**
 * Professional boards, exam administrators, and statutory regulators.
 * A host is cream ONLY when the article or the URL itself is about that
 * discipline — NCSBN is an authority for NCLEX, not for F-1 visas.
 * Add rows here as new licensed professions appear in the estate; do not
 * special-case a single article.
 */
export const DISCIPLINE_AUTHORITIES: Array<OfficialSource & { match: RegExp }> = [
  // Nursing / NCLEX
  { title: 'NCSBN — NCLEX', url: 'https://www.ncsbn.org/exams/nclex', regions: ['US'], topics: ['education', 'study'], match: /\b(nclex|ncsbn|nursing licensure|rn exam|pn exam)\b/i },
  { title: 'NCSBN', url: 'https://www.ncsbn.org/', regions: ['US'], topics: ['education', 'study'], match: /\b(nclex|ncsbn|nursing licensure)\b/i },
  { title: 'Pearson VUE — NCLEX', url: 'https://www.pearsonvue.com/us/en/nclex.html', regions: ['US'], topics: ['education', 'study'], match: /\bnclex\b/i },
  { title: 'NCLEX.com (NCSBN)', url: 'https://www.nclex.com/', regions: ['US'], topics: ['education', 'study'], match: /\b(nclex|ncsbn)\b/i },
  { title: 'NMC — UK nursing register', url: 'https://www.nmc.org.uk/', regions: ['UK'], topics: ['education', 'work'], match: /\b(nmc|nursing and midwifery council)\b/i },
  { title: 'CNO — Ontario nursing', url: 'https://www.cno.org/', regions: ['CA'], topics: ['education', 'work'], match: /\b(cno|college of nurses of ontario)\b/i },
  { title: 'NNAS', url: 'https://www.nnas.ca/', regions: ['CA'], topics: ['education', 'work'], match: /\b(nnas|national nursing assessment)\b/i },
  { title: 'CGFNS / VisaScreen', url: 'https://www.cgfns.org/', regions: ['US'], topics: ['education', 'work'], match: /\b(cgfns|visa ?screen|ces report)\b/i },
  { title: 'AHPRA', url: 'https://www.ahpra.gov.au/', regions: ['AU'], topics: ['education', 'work'], match: /\b(ahpra|nursing and midwifery board of australia)\b/i },
  { title: 'ANMAC', url: 'https://www.anmac.org.au/', regions: ['AU'], topics: ['education', 'work'], match: /\banmac\b/i },
  // English-language tests
  { title: 'IELTS', url: 'https://ielts.org/', regions: ['ALL'], topics: ['education', 'study'], match: /\bielts\b/i },
  { title: 'British Council — IELTS', url: 'https://takeielts.britishcouncil.org/', regions: ['ALL'], topics: ['education', 'study'], match: /\bielts\b/i },
  { title: 'IDP IELTS', url: 'https://ielts.idp.com/', regions: ['ALL'], topics: ['education', 'study'], match: /\bielts\b/i },
  { title: 'ETS — TOEFL', url: 'https://www.ets.org/toefl.html', regions: ['ALL'], topics: ['education', 'study'], match: /\btoefl\b/i },
  { title: 'ETS — GRE', url: 'https://www.ets.org/gre.html', regions: ['ALL'], topics: ['education', 'study'], match: /\bgre\b/i },
  { title: 'PTE Academic', url: 'https://www.pearsonpte.com/', regions: ['ALL'], topics: ['education', 'study'], match: /\b(pte academic|pearson test of english|pte)\b/i },
  { title: 'OET', url: 'https://oet.com/', regions: ['ALL'], topics: ['education', 'study', 'health'], match: /\b(occupational english test|oet)\b/i },
  { title: 'CELPIP', url: 'https://www.celpip.ca/', regions: ['CA'], topics: ['education', 'study'], match: /\bcelpip\b/i },
  { title: 'Duolingo English Test', url: 'https://englishtest.duolingo.com/', regions: ['ALL'], topics: ['education', 'study'], match: /\b(duolingo english|duolingo test)\b/i },
  { title: 'Cambridge English', url: 'https://www.cambridgeenglish.org/', regions: ['ALL'], topics: ['education', 'study'], match: /\b(cambridge english|c1 advanced|b2 first)\b/i },
  // Medicine
  { title: 'GMC — UK medical register', url: 'https://www.gmc-uk.org/', regions: ['UK'], topics: ['education', 'work'], match: /\b(gmc|general medical council)\b/i },
  { title: 'PLAB / GMC tests', url: 'https://www.gmc-uk.org/registration-and-licensing/join-the-register/plab', regions: ['UK'], topics: ['education', 'work'], match: /\bplab\b/i },
  { title: 'NBME / USMLE', url: 'https://www.usmle.org/', regions: ['US'], topics: ['education', 'study'], match: /\b(usmle|nbme|step 1|step 2 ck)\b/i },
  { title: 'ECFMG / Intealth', url: 'https://www.ecfmg.org/', regions: ['US'], topics: ['education', 'work'], match: /\b(ecfmg|intealth)\b/i },
  { title: 'FSMB', url: 'https://www.fsmb.org/', regions: ['US'], topics: ['education', 'work'], match: /\b(fsmb|federation of state medical)\b/i },
  { title: 'Medical Council of Canada', url: 'https://mcc.ca/', regions: ['CA'], topics: ['education', 'work'], match: /\b(mccqe|medical council of canada)\b/i },
  { title: 'Australian Medical Council', url: 'https://www.amc.org.au/', regions: ['AU'], topics: ['education', 'work'], match: /\b(australian medical council|\bamc exam\b)\b/i },
  // Law
  { title: 'LSAC — LSAT', url: 'https://www.lsac.org/', regions: ['US'], topics: ['education', 'study'], match: /\b(lsat|lsac)\b/i },
  { title: 'NCBE — bar exam', url: 'https://www.ncbex.org/', regions: ['US'], topics: ['education', 'study'], match: /\b(bar exam|ube\b|ncbe|mpre)\b/i },
  { title: 'SRA', url: 'https://www.sra.org.uk/', regions: ['UK'], topics: ['education', 'work'], match: /\b(solicitors regulation|sra|sqe)\b/i },
  { title: 'Bar Standards Board', url: 'https://www.barstandardsboard.org.uk/', regions: ['UK'], topics: ['education', 'work'], match: /\b(bar standards|bar course|btpc)\b/i },
  { title: 'NCA Canada', url: 'https://nca.legal/', regions: ['CA'], topics: ['education', 'work'], match: /\b(national committee on accreditation|nca)\b/i },
  // Accounting / pharmacy / dental / engineering
  { title: 'AICPA', url: 'https://www.aicpa-cima.com/', regions: ['US'], topics: ['education', 'work'], match: /\b(cpa exam|aicpa|uniform cpa)\b/i },
  { title: 'CPA Australia', url: 'https://www.cpaaustralia.com.au/', regions: ['AU'], topics: ['education', 'work'], match: /\b(cpa australia)\b/i },
  { title: 'ACCA', url: 'https://www.accaglobal.com/', regions: ['ALL'], topics: ['education', 'work'], match: /\b(acca|association of chartered certified)\b/i },
  { title: 'NABP / NAPLEX', url: 'https://nabp.pharmacy/', regions: ['US'], topics: ['education', 'work'], match: /\b(nabp|naplex|mpje)\b/i },
  { title: 'GPhC', url: 'https://www.pharmacyregulation.org/', regions: ['UK'], topics: ['education', 'work'], match: /\b(gphc|pharmacy regulation|ospap)\b/i },
  { title: 'GDC', url: 'https://www.gdc-uk.org/', regions: ['UK'], topics: ['education', 'work'], match: /\b(general dental council|gdc|ore exam)\b/i },
  { title: 'NDEB', url: 'https://ndeb-bned.ca/', regions: ['CA'], topics: ['education', 'work'], match: /\b(ndeb|national dental examining)\b/i },
  { title: 'NCEES', url: 'https://ncees.org/', regions: ['US'], topics: ['education', 'work'], match: /\b(ncees|fe exam|pe exam)\b/i },
  { title: 'Engineers Australia', url: 'https://www.engineersaustralia.org.au/', regions: ['AU'], topics: ['education', 'work'], match: /\b(engineers australia|competency demonstration|cdr)\b/i },
  // Credential evaluation
  { title: 'NARIC / Ecctis', url: 'https://www.ecctis.com/', regions: ['UK'], topics: ['education'], match: /\b(uk naric|ecctis|statement of comparability)\b/i },
  { title: 'WES', url: 'https://www.wes.org/', regions: ['US', 'CA'], topics: ['education'], match: /\b(wes|world education services|credential evaluation)\b/i },
]

const CLAIM_STOP = new Set([
  'about', 'contact', 'public', 'files', 'exams', 'exam', 'test', 'plan', 'english', 'final',
  'official', 'guide', 'student', 'students', 'visa', 'application', 'requirements', 'international',
  'university', 'college', 'index', 'page', 'home', 'www', 'https', 'http', 'html', 'pdf', 'org',
  'com', 'net', 'document', 'download', 'resources', 'news', 'blog', 'prep', 'preparation', 'help',
  'complete', 'complete', 'with', 'from', 'this', 'that', 'your', 'their', 'have', 'will', 'into',
])

function hostMatchesAuthority(url: string, authorityUrl: string): boolean {
  const a = hostnameOf(url)
  const b = hostnameOf(authorityUrl)
  if (!a || !b) return false
  const left = bareHost(a)
  const right = bareHost(b)
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`)
}

export function citationBlob(ctx?: CitationContext | null, extra?: string): string {
  const body = String(ctx?.body || '')
    .slice(0, 4000)
    .replace(/https?:\/\/[^\s)<>\]"'`]+/gi, ' ')
  return [ctx?.topic, ...(ctx?.keywords || []), body, extra || '']
    .filter(Boolean)
    .join(' ')
}

/** Distinctive claim tokens — exam names, board acronyms — not generic SEO words. */
export function distinctiveClaimTokens(ctx?: CitationContext | null, extra?: string): string[] {
  const blob = citationBlob(ctx, extra).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ')
  const out: string[] = []
  const seen = new Set<string>()
  for (const w of blob.split(/\s+/)) {
    const t = w.replace(/^-+|-+$/g, '')
    if (t.length < 4 || CLAIM_STOP.has(t) || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

export function isInstitutionalHost(url: string): boolean {
  if (isLowValueHost(url)) return false
  const host = hostnameOf(url)
  if (!host) return false
  const bare = bareHost(host)
  if (GOV_SUFFIXES.some((sfx) => bare.endsWith(sfx))) return true
  if (SCHOOL_SUFFIXES.some((sfx) => bare.endsWith(sfx))) return isOfficialSchoolPage(url)
  if (!INSTITUTIONAL_ORG_SUFFIXES.some((sfx) => bare.endsWith(sfx))) return false
  const first = bare.split('.')[0]
  if (SCHOOL_JUNK_SUBHOST.test(first)) return false
  try {
    const path = new URL(url).pathname.toLowerCase()
    if (SCHOOL_JUNK_PATH.test(path)) return false
  } catch {
    return false
  }
  return true
}

/** Host is a listed exam/licensing/credential body. Not cream by itself. */
export function isKnownDisciplineHost(url: string): boolean {
  if (!url || isLowValueHost(url)) return false
  return DISCIPLINE_AUTHORITIES.some((row) => hostMatchesAuthority(url, row.url))
}

/**
 * Article claim from H1 / YAML title when a caller forgot to pass topic.
 * Later articles still resolve issuing-body links from the page itself.
 */
export function inferArticleClaim(content: string): string {
  const src = String(content || '')
  const md = src.match(/^#\s+(.+)$/m)
  if (md?.[1]) return md[1].replace(/[#*_`]/g, '').trim()
  const html = src.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
  if (html?.[1]) return html[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const fm = src.match(/^title:\s*["']?(.+?)["']?\s*$/m)
  if (fm?.[1]) return fm[1].trim()
  return ''
}

/**
 * True when this URL is the issuing body for the article/claim — not because
 * the host is famous, but because the page and the surrounding topic name
 * the same exam, licence, or statutory function.
 */
function stripLinkArtefacts(body: string | null | undefined, url?: string): string {
  let s = String(body || '')
  s = s.replace(/\[([^\]]*)\]\([^)]+\)/g, ' ')
  s = s.replace(/<a\s[^>]*>[\s\S]*?<\/a>/gi, ' ')
  s = s.replace(/https?:\/\/[^\s)<>\]"'`]+/gi, ' ')
  const host = url ? hostnameOf(url) : null
  if (host) {
    const brand = bareHost(host).split('.')[0]
    if (brand.length >= 3) s = s.replace(new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ')
  }
  return s
}

export function isContextualAuthority(url: string, ctx?: CitationContext | null): boolean {
  if (!url || isLowValueHost(url)) return false
  const article = citationBlob({ ...ctx, body: stripLinkArtefacts(ctx?.body, url) })
  if (!article.trim()) return false
  for (const row of DISCIPLINE_AUTHORITIES) {
    if (!hostMatchesAuthority(url, row.url)) continue
    if (row.match.test(article)) return true
  }
  if (!isInstitutionalHost(url)) return false
  const tokens = distinctiveClaimTokens({ topic: ctx?.topic, keywords: ctx?.keywords, region: ctx?.region })
  if (!tokens.length) return false
  const hay = `${hostnameOf(url) || ''} ${url}`.toLowerCase()
  return tokens.some((t) => t.length >= 4 && hay.includes(t))
}

export function disciplineSourcesForBrief(ctx?: CitationContext | null): OfficialSource[] {
  const blob = citationBlob(ctx)
  if (!blob.trim()) return []
  return DISCIPLINE_AUTHORITIES
    .filter((s) => s.match.test(blob))
    .map(({ match: _m, ...s }) => s)
}

/** Cream-of-the-crop predicate used from Research through ship. */
export function isCreamSource(url: string, ctx?: CitationContext | null): boolean {
  if (isLowValueHost(url)) return false
  if (isAuthorityHost(url)) return true
  if (isReputablePublication(url)) return true
  if (ctx && isContextualAuthority(url, ctx)) return true
  return false
}

export function claimIsLicensingExam(ctx?: CitationContext | null, extra?: string): boolean {
  const blob = citationBlob({ ...ctx, body: stripLinkArtefacts(ctx?.body) }, extra)
  if (!blob.trim()) return false
  return DISCIPLINE_AUTHORITIES.some((row) => row.match.test(blob))
}

/** Issuing-body and reputable-news hrefs must survive remediator + re-audit.
 *  Do not use isCreamSource here — that would freeze every .gov page in place,
 *  including HUD on an OPT article and a 404 USCIS path. */
export function shouldKeepExternalHref(url: string, ctx?: CitationContext | null): boolean {
  if (!url || isLowValueHost(url)) return false
  if (isReputablePublication(url)) return true
  if (isContextualAuthority(url, ctx)) return true
  if (isKnownDisciplineHost(url) && claimIsLicensingExam(ctx, inferArticleClaim(ctx?.body || ''))) return true
  return false
}

export function officialSourceLines(region?: string | null): string[] {
  return sourcesForRegion(region).map((s) => `${s.title} — ${s.url}`)
}

export function officialSourceLinesForBrief(ctx?: CitationContext | null, limit = 8): string[] {
  return sourcesForBrief(ctx)
    .slice(0, limit)
    .map((s) => `${s.title} — ${s.url}`)
}

function normalizeRegion(region?: string | null): SourceRegion {
  const key = String(region || 'US').toUpperCase().slice(0, 2)
  if (key === 'UK' || key === 'GB') return 'UK'
  if (key === 'CA') return 'CA'
  if (key === 'AU') return 'AU'
  return 'US'
}

function normalizeOfficialUrl(url: string): string {
  return String(url || '')
    .trim()
    .split('#')[0]
    .replace(/\/+$/, '')
    .toLowerCase()
}

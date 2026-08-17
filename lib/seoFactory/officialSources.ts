/**
 * Official citation bank for drafting.
 *
 * Models invent USCIS / GOV.UK / IRCC paths that 404. The brief, prompt,
 * scaffold, and ship gate may only emit URLs from this bank (or another
 * live-verified authority URL). Deep paths are preferred; homepages are
 * the last-resort fallback so a rotting deep link never ships.
 */

export interface OfficialSource {
  title: string
  url: string
  regions: Array<'US' | 'UK' | 'CA' | 'AU' | 'ALL'>
}

export const CURATED_OFFICIAL_SOURCES: OfficialSource[] = [
  // United States
  { title: 'USCIS — Students and Employment', url: 'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/students-and-employment', regions: ['US'] },
  { title: 'USCIS — Working in the United States', url: 'https://www.uscis.gov/working-in-the-united-states', regions: ['US'] },
  { title: 'USCIS home', url: 'https://www.uscis.gov/', regions: ['US'] },
  { title: 'Study in the States (DHS / SEVP)', url: 'https://studyinthestates.dhs.gov/', regions: ['US'] },
  { title: 'Travel.State.Gov — Student Visa', url: 'https://travel.state.gov/content/travel/en/us-visas/study.html', regions: ['US'] },
  { title: 'ICE — SEVP', url: 'https://www.ice.gov/sevis', regions: ['US'] },
  // United Kingdom
  { title: 'GOV.UK — Student visa', url: 'https://www.gov.uk/student-visa', regions: ['UK'] },
  { title: 'GOV.UK — Immigration Rules', url: 'https://www.gov.uk/guidance/immigration-rules', regions: ['UK'] },
  { title: 'GOV.UK — Visas and immigration', url: 'https://www.gov.uk/browse/visas-immigration', regions: ['UK'] },
  // Canada
  { title: 'IRCC — Study permit', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada.html', regions: ['CA'] },
  { title: 'IRCC — Work after graduation (PGWP)', url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation.html', regions: ['CA'] },
  { title: 'IRCC home', url: 'https://www.canada.ca/en/immigration-refugees-citizenship.html', regions: ['CA'] },
  // Australia
  { title: 'Home Affairs — Student visa (subclass 500)', url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500', regions: ['AU'] },
  { title: 'Home Affairs — Temporary Graduate visa (485)', url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485', regions: ['AU'] },
  { title: 'Home Affairs — Immigration and citizenship', url: 'https://immi.homeaffairs.gov.au/', regions: ['AU'] },
]

export function sourcesForRegion(region?: string | null): OfficialSource[] {
  const key = String(region || 'US').toUpperCase().slice(0, 2)
  const regional = CURATED_OFFICIAL_SOURCES.filter((s) => s.regions.includes(key as OfficialSource['regions'][number]) || s.regions.includes('ALL'))
  return regional.length ? regional : CURATED_OFFICIAL_SOURCES.filter((s) => s.regions.includes('US'))
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
  'gov.uk',
  'canada.ca',
  'ircc.canada.ca',
  'homeaffairs.gov.au',
  'immi.homeaffairs.gov.au',
])

const AUTHORITY_SUFFIXES = ['.gov', '.gov.uk', '.gov.au', '.gc.ca', '.mil', '.edu']

export function hostnameOf(url: string): string | null {
  try {
    if (!/^https?:\/\//i.test(url.trim())) return null
    return new URL(url.trim()).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function isAuthorityHost(url: string): boolean {
  const host = hostnameOf(url)
  if (!host) return false
  const bare = host.replace(/^www\./, '')
  if (AUTHORITY_HOSTS.has(bare) || AUTHORITY_HOSTS.has(host)) return true
  return AUTHORITY_SUFFIXES.some((sfx) => bare.endsWith(sfx))
}

/** Known junk / non-reader-value hosts — never cite these. */
export function isLowValueHost(url: string): boolean {
  const host = hostnameOf(url)
  if (!host) return false
  const bare = host.replace(/^www\./, '')
  if (
    /^(bit\.ly|t\.co|tinyurl\.com|ow\.ly|goo\.gl|is\.gd|buff\.ly|cutt\.ly|rebrand\.ly|lnkd\.in)$/i.test(bare)
  ) return true
  if (
    /^(facebook|fb|instagram|tiktok|twitter|x|linkedin|youtube|youtu\.be|reddit|pinterest|medium|quora|substack)\./i.test(bare + '.')
    || /^(facebook|instagram|tiktok|twitter|linkedin|youtube|reddit|medium|quora|substack)\.com$/.test(bare)
  ) return true
  return false
}

export function officialSourceLines(region?: string | null): string[] {
  return sourcesForRegion(region).map((s) => `${s.title} — ${s.url}`)
}

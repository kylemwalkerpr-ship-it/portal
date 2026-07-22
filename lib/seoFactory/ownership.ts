/**
 * Estate ownership resolver — enforces one primary intent → one indexable owner.
 * Source: SEO strategies/ownership-registry-v1.csv → data/seo/ownership-registry.json
 */

import registry from '@/data/seo/ownership-registry.json'

export type OwnerHost = 'legal' | 'usa' | 'ca' | 'uk' | 'au' | 'apex' | 'market'
export type IntentClass =
  | 'procedural'
  | 'checklist'
  | 'geo_modifier'
  | 'university_modifier'
  | 'comparison'
  | 'transactional'
  | 'brand'
  | 'news_summary'
  | 'hub'

export interface OwnershipRow {
  id: number
  primary_keyword: string
  intent_class: IntentClass | string
  owner_host: OwnerHost | string
  owner_url: string
  supporting_urls: string[]
  action: string
  market_destination: string | null
  status: string
  notes: string
}

export interface OwnerPlan {
  matched: OwnershipRow | null
  host: OwnerHost
  repo: 'caseworks' | 'yousafe-consultancy' | 'portal'
  /** Repo-relative file path to write */
  filePath: string
  /** Public URL after deploy */
  canonicalUrl: string
  indexable: boolean
  action: string
  warnings: string[]
  blockers: string[]
  ymy: boolean
}

const HOST_REPO: Record<string, OwnerPlan['repo']> = {
  legal: 'caseworks',
  apex: 'yousafe-consultancy',
  usa: 'yousafe-consultancy',
  uk: 'yousafe-consultancy',
  ca: 'yousafe-consultancy',
  au: 'yousafe-consultancy',
  market: 'portal',
}

const HOST_PUBLIC: Record<string, string> = {
  legal: 'https://legal.yousafeconsultancy.com',
  apex: 'https://yousafeconsultancy.com',
  usa: 'https://usa.yousafeconsultancy.com',
  uk: 'https://uk.yousafeconsultancy.com',
  ca: 'https://ca.yousafeconsultancy.com',
  au: 'https://au.yousafeconsultancy.com',
  market: 'https://market.yousafeconsultancy.com',
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function scoreMatch(keyword: string, primary: string): number {
  const a = normalize(keyword)
  const b = normalize(primary)
  if (!a || !b) return 0
  if (a === b) return 100
  if (a.includes(b) || b.includes(a)) return 80
  const aw = new Set(a.split(' ').filter((w) => w.length > 2))
  const bw = b.split(' ').filter((w) => w.length > 2)
  const overlap = bw.filter((w) => aw.has(w)).length
  if (overlap === 0) return 0
  return Math.round((overlap / Math.max(bw.length, 1)) * 60)
}

function defaultHostForContentType(
  contentType: string,
  region: string,
): OwnerHost {
  if (contentType === 'marketplace_gig') return 'market'
  if (contentType === 'regional_page' || contentType === 'regional_university' || contentType === 'regional_from') {
    const r = region.toLowerCase()
    if (r === 'us') return 'usa'
    if (r === 'uk') return 'uk'
    if (r === 'ca') return 'ca'
    if (r === 'au') return 'au'
    return 'apex'
  }
  if (contentType === 'blog_summary' || contentType === 'blog_post') return 'legal'
  // legal_guide, article, default
  return 'legal'
}

function pathForHost(
  host: OwnerHost,
  region: string,
  slug: string,
  contentType: string,
): { filePath: string; urlPath: string } {
  const reg = region.toLowerCase() === 'compare' ? 'us' : region.toLowerCase()

  if (host === 'legal') {
    if (contentType === 'blog_post' || contentType === 'blog_summary') {
      return {
        filePath: `app/blog/${slug}/page.tsx`,
        urlPath: `/blog/${slug}/`,
      }
    }
    // Procedural / pillar pages live under regional trees
    return {
      filePath: `app/${reg}/${slug}/page.tsx`,
      urlPath: `/${reg}/${slug}/`,
    }
  }

  if (host === 'market') {
    return {
      filePath: `catalogue/${slug}.mdx`,
      urlPath: `/marketplace/gigs/${slug}/`,
    }
  }

  // Regional apps (yousafe-consultancy monorepo)
  const app = host === 'apex' ? 'landing-page' : host === 'usa' ? 'usa' : host
  if (contentType === 'regional_from') {
    return {
      filePath: `${app}/content/from-${slug}.md`,
      urlPath: `/from/${slug}/`,
    }
  }
  if (contentType === 'regional_university') {
    return {
      filePath: `${app}/content/universities-${slug}.md`,
      urlPath: `/universities/${slug}/`,
    }
  }
  return {
    filePath: `${app}/content/${slug}.md`,
    urlPath: `/${slug}/`,
  }
}

export function resolveOwner(opts: {
  primaryKeyword: string
  contentType: string
  region: string
  slug?: string
  indexable?: boolean
}): OwnerPlan {
  const warnings: string[] = []
  const blockers: string[] = []
  const rows = (registry as { rows: OwnershipRow[] }).rows ?? []
  const keyword = opts.primaryKeyword || ''

  let best: { row: OwnershipRow; score: number } | null = null
  for (const row of rows) {
    const score = scoreMatch(keyword, row.primary_keyword)
    if (score < 40) continue
    if (!best || score > best.score) best = { row, score }
  }

  const matched = best?.row ?? null
  let host = (matched?.owner_host as OwnerHost) || defaultHostForContentType(opts.contentType, opts.region)
  if (!HOST_REPO[host]) host = 'legal'

  const slug = opts.slug || slugify(keyword || opts.contentType + '-' + Date.now())
  const { filePath, urlPath } = pathForHost(host, opts.region, slug, opts.contentType)
  const publicBase = HOST_PUBLIC[host] || HOST_PUBLIC.legal
  const canonicalUrl = matched?.owner_url || `${publicBase}${urlPath}`

  let indexable = opts.indexable ?? true
  let action = matched?.action || 'build'

  if (matched) {
    if (matched.action === 'noindex') {
      indexable = false
      warnings.push(`Registry action=noindex for "${matched.primary_keyword}"`)
    }
    if (matched.action === '301' || matched.action === 'merge') {
      blockers.push(
        `Registry says ${matched.action} for "${matched.primary_keyword}" → expand existing ${matched.owner_url}, do not create sibling`,
      )
    }
    if (matched.action === 'blocked_on_supply') {
      blockers.push(`blocked_on_supply: ${matched.notes || 'wait for market inventory'}`)
    }
    if (matched.status === 'needs_decision') {
      warnings.push(`Ownership needs_decision: ${matched.notes}`)
    }
    // Existing confirmed owner with keep — creating new indexable URL is cannibal risk
    if (matched.action === 'keep' && matched.status === 'confirmed' && best && best.score >= 80) {
      if (opts.contentType !== 'blog_summary') {
        blockers.push(
          `Strong match to existing owner "${matched.primary_keyword}" at ${matched.owner_url}. Expand that URL instead of shipping a new indexable page.`,
        )
      } else {
        warnings.push(`Blog summary must link to owner ${matched.owner_url}`)
        indexable = true // blog can be indexable as news_summary if distinct
      }
    }
  } else {
    warnings.push('No registry match — using default host routing; add a registry row after ship')
  }

  const ymy =
    host === 'legal' ||
    /visa|immigration|permit|asylum|green.?card|ilr|opt|i-20|uscis/i.test(keyword + opts.contentType)

  if (ymy && indexable) {
    warnings.push('YMYL legal content: prefer ship_mode=pr unless audit ≥ 80')
  }

  return {
    matched,
    host,
    repo: HOST_REPO[host],
    filePath,
    canonicalUrl,
    indexable,
    action,
    warnings,
    blockers,
    ymy,
  }
}

export function listRegistry(): OwnershipRow[] {
  return (registry as { rows: OwnershipRow[] }).rows ?? []
}

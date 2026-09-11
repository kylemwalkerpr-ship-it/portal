/// <reference types="jest" />

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Marketplace Search Intelligence contract', () => {
  const baseMigration = read('supabase/migrations/20260911_marketplace_search_intelligence.sql')
  const metricsMigration = read('supabase/migrations/20260911_marketplace_search_intelligence_metrics.sql')
  const migration = `${baseMigration}\n${metricsMigration}`
  const helper = read('lib/marketplaceSearchIntelligence.ts')
  const discovery = read('components/marketplace/GigDiscoveryPage.tsx')
  const smartSearch = read('components/marketplace/SmartSearchBox.tsx')
  const clickCapture = read('components/marketplace/MarketplaceSearchClickCapture.tsx')
  const detail = read('components/marketplace/GigDetailPage.tsx')
  const listingApi = read('app/api/marketplace/gigs/route.ts')
  const eventApi = read('app/api/marketplace/search-events/route.ts')
  const suggestionsApi = read('app/api/marketplace/search-suggestions/route.ts')
  const seoSuggestApi = read('app/api/seo-suggest/route.ts')
  const card = read('components/marketplace/MarketplaceHero.tsx')
  const layout = read('app/marketplace/layout.tsx')

  it('makes gig intent tags semantic canonical Marketplace links without regressing first paint', () => {
    expect(detail).toContain('initialGig?: any | null')
    expect(detail).toContain("import { GigDetailSkeleton } from './MarketplaceRouteSkeleton'")
    expect(clickCapture).toContain("import { usePathname } from 'next/navigation'")
    expect(clickCapture).toContain('const pathname = usePathname()')
    expect(clickCapture).toContain("const ENHANCED_TAG = 'data-marketplace-intent-tag'")
    expect(clickCapture).toContain("const anchor = document.createElement('a')")
    expect(clickCapture).toContain('anchor.href = `${base.href}?q=${encodeURIComponent(tag)}`')
    expect(clickCapture).toContain('span.parentNode.replaceChild(anchor, span)')
    expect(clickCapture).toContain('anchor.appendChild(span)')
    expect(clickCapture).toContain("anchor.setAttribute('aria-label', `Search Marketplace for ${tag}`)")
    expect(clickCapture).toContain("source: 'tag_click'")
    expect(clickCapture).toContain("destination.searchParams.get('q')")
    expect(clickCapture).toContain('}, [pathname])')
    expect(layout).toContain('<MarketplaceSearchClickCapture />')
  })

  it('does not count autocomplete keystrokes as Marketplace demand', () => {
    expect(smartSearch).toContain("fetch(`/api/marketplace/search-suggestions?q=${encodeURIComponent(value.trim())}`")
    expect(smartSearch).toContain("onChange={(e) => { onChange(e.target.value); setOpen(true) }}")
    expect(smartSearch).not.toMatch(/onChange=\{\(e\)[\s\S]*recordMarketplaceSearch/)
    expect(discovery).toContain("queueMarketplaceSearchExecution({ query, source: 'search_bar' })")
    expect(discovery).toContain('consumeMarketplaceSearchExecution({')
  })

  it('records executed searches after observed supply is known, including trustworthy zero-result searches', () => {
    expect(discovery).toContain('const resultTotal = data.total || data.gigs?.length || 0')
    expect(discovery).toContain('resultCount: resultTotal')
    expect(baseMigration).toContain("where event_type = 'search' and result_count = 0")
    expect(metricsMigration).toContain('count(*) filter (where result_count is not null)::bigint as measured_search_count')
    expect(metricsMigration).toContain('/ nullif(count(*) filter (where result_count is not null), 0)')
    expect(metricsMigration).toContain('s.measured_search_count')
  })

  it('preserves source and click attribution without allowing browser-declared conversions', () => {
    for (const source of ['search_bar', 'tag_click', 'suggestion_click', 'category', 'related_search']) {
      expect(eventApi).toContain(`'${source}'`)
    }
    expect(eventApi).toContain("if (eventType === 'gig_click')")
    expect(eventApi).toContain(".eq('event_type', 'search')")
    expect(eventApi).toContain('parent_search_event_id: parentId')
    expect(eventApi).toContain("return fail('Invalid Marketplace search event.', 422)")
    expect(card).toContain('onSearchClick?.(gig.id)')
    expect(discovery).toContain('recordMarketplaceGigClick({ searchEventId: activeSearchEventId, gigId })')
  })

  it('hardens the anonymous event collector without introducing user fingerprinting', () => {
    expect(eventApi).toContain("const origin = req.headers.get('origin')")
    expect(eventApi).toContain("return fail('Cross-origin search events are not accepted.', 403)")
    expect(eventApi).toContain('const UUID_RE =')
    expect(eventApi).toContain('function cleanUuid(value: unknown)')
    expect(eventApi).toContain('const parentId = cleanUuid(body.parent_search_event_id)')
    expect(eventApi).not.toContain('user-agent')
    expect(eventApi).not.toContain('x-forwarded-for')
    expect(eventApi).not.toContain('profileId')
  })

  it('keeps raw search intelligence private and uses privacy-preserving session correlation', () => {
    expect(baseMigration).toContain('alter table public.marketplace_search_events enable row level security;')
    expect(baseMigration).toContain('revoke all on table public.marketplace_search_events from public, anon, authenticated;')
    expect(baseMigration).toContain('grant select, insert, update, delete on table public.marketplace_search_events to service_role;')
    expect(migration).toContain('revoke all on table public.marketplace_search_intelligence from public, anon, authenticated;')
    expect(eventApi).toContain("await sha256(`yousafe-marketplace-search:${sessionId}`)")
  })

  it('uses deletion-safe attribution lifecycle semantics', () => {
    expect(baseMigration).toContain('gig_id uuid references public.gigs(id) on delete set null')
    expect(baseMigration).toContain('parent_search_event_id uuid references public.marketplace_search_events(id) on delete cascade')
    expect(baseMigration).toContain("event_type in ('gig_click', 'conversion') and parent_search_event_id is not null")
    expect(baseMigration).not.toContain("event_type in ('gig_click', 'conversion') and gig_id is not null and parent_search_event_id is not null")
  })

  it('normalizes equivalent variants and blocks credential-like private input at AI and database boundaries', () => {
    expect(helper).toContain(".replace(/\\b([a-z])[-\\s]?(\\d{1,3}[a-z]?)\\b/g, '$1$2')")
    expect(helper).toContain('rcic|cicc|marn|sra')
    expect(helper).toContain('/\\b\\d{5,}\\b/')
    expect(helper).toContain('if (LONG_IDENTIFIER.test(text)) return true')
    expect(seoSuggestApi).toContain("const value = field === 'tags' ? sanitizeMarketplaceTags(result.value) : result.value")
    expect(seoSuggestApi).toContain('The generated tags were not safe to use')
    expect(baseMigration).toContain('create or replace function public.marketplace_sanitize_tags(input_tags text[])')
    expect(baseMigration).toContain("clean_tag !~* '\\m[0-9]{5,}\\M'")
    expect(baseMigration).toContain('create or replace function public.marketplace_search_alias_text(input_text text)')
    expect(baseMigration).toContain("plainto_tsquery('simple', public.marketplace_search_alias_text(left(trim(p_query), 80)))")
    expect(baseMigration).toContain("public.marketplace_search_alias_text(array_to_string(new.tags, ' '))")
    expect(baseMigration).toContain('new.tags := public.marketplace_sanitize_tags(new.tags);')
    expect(baseMigration).toContain('where tags is distinct from public.marketplace_sanitize_tags(tags);')
  })

  it('gives deliberate intent tags meaningful search relevance without using demand volume as gig rank', () => {
    expect(baseMigration).toContain("setweight(to_tsvector('simple', coalesce(array_to_string(new.tags, ' '), '')), 'A')")
    expect(baseMigration).toContain('then 0.35 else 0 end')
    expect(baseMigration).toContain('order by text_rank desc, g.rank_score desc nulls last, g.id')
    expect(listingApi).toContain("db.rpc('marketplace_search_matches'")
    expect(listingApi).toContain('searchRankById')
    expect(listingApi).not.toMatch(/search_count[\s\S]*rank_score|rank_score[\s\S]*search_count/)
  })

  it('builds suggestions from categories, tags, gigs and sufficiently aggregated first-party queries', () => {
    expect(smartSearch).toContain('CATEGORIES')
    expect(smartSearch).toContain("row.kind === 'tag'")
    expect(smartSearch).toContain("row.kind === 'query'")
    expect(smartSearch).toContain("row.kind === 'gig'")
    expect(suggestionsApi).toContain("db.rpc('marketplace_search_suggestions'")
    expect(baseMigration).toContain('i.search_count >= 3')
    expect(baseMigration).toContain('i.unique_sessions >= 2')
    expect(baseMigration).toContain('coalesce(i.avg_result_count, 0) > 0')
  })

  it('protects demand quality against trivial repeat spam', () => {
    expect(eventApi).toContain('MAX_SEARCHES_PER_SESSION_PER_MINUTE = 12')
    expect(eventApi).toContain('const bucket = Math.floor(Date.now() / 60_000)')
    expect(baseMigration).toContain('dedupe_key text unique')
    expect(helper).toContain('if (/(.)\\1{6,}/i.test(raw)) return null')
  })

  it('computes CTR and conversion rate at the search level while retaining total engagement volume', () => {
    expect(migration).toContain("count(child.id) filter (where child.event_type = 'gig_click')::bigint as click_count")
    expect(migration).toContain("count(distinct parent.id) filter (where child.event_type = 'gig_click')::bigint as clicked_search_count")
    expect(migration).toContain('coalesce(e.clicked_search_count, 0)::numeric / nullif(s.search_count, 0)')
    expect(migration).toContain('coalesce(e.converted_search_count, 0)::numeric / nullif(s.search_count, 0)')
  })

  it('exposes future SEO inputs without hard-coding an opportunity formula', () => {
    for (const signal of [
      'search_count',
      'unique_sessions',
      'searches_7d',
      'searches_previous_7d',
      'last_searched_at',
      'click_count',
      'clicked_search_count',
      'ctr',
      'zero_result_rate',
      'search_to_conversion_rate',
      'avg_result_count',
      'measured_search_count',
    ]) {
      expect(migration).toContain(signal)
    }
    expect(migration.toLowerCase()).not.toContain('opportunity =')
  })
})

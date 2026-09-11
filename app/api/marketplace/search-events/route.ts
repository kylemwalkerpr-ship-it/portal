import { fail, ok } from '@/lib/apiEnvelope'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  sanitizeMarketplaceQuery,
  type MarketplaceSearchSource,
  type MarketplaceSuggestionType,
} from '@/lib/marketplaceSearchIntelligence'

const SEARCH_SOURCES = new Set<MarketplaceSearchSource>([
  'search_bar',
  'tag_click',
  'suggestion_click',
  'category',
  'related_search',
])
const SUGGESTION_TYPES = new Set<MarketplaceSuggestionType>(['tag', 'gig', 'category', 'query', 'recent'])
const MAX_SEARCHES_PER_SESSION_PER_MINUTE = 12
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type InsertResult = {
  id: string | null
  deduped: boolean
  error: { message?: string; code?: string } | null
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function cleanSessionId(value: unknown) {
  const sessionId = String(value ?? '').trim()
  if (!sessionId || sessionId.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(sessionId)) return null
  return sessionId
}

function cleanUuid(value: unknown) {
  const id = typeof value === 'string' ? value.trim() : ''
  return UUID_RE.test(id) ? id : null
}

function cleanFilters(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const input = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of ['category', 'country', 'provider_type', 'sort', 'min_price', 'max_price', 'min_rating', 'delivery_days']) {
    const item = input[key]
    if (typeof item === 'string') out[key] = item.slice(0, 80)
    else if (Array.isArray(item)) out[key] = item.filter((entry) => typeof entry === 'string').slice(0, 8).map((entry) => entry.slice(0, 80))
  }
  return out
}

async function insertWithDedupe(
  db: ReturnType<typeof createSupabaseAdminClient>,
  row: Record<string, unknown>,
): Promise<InsertResult> {
  const result = await db.from('marketplace_search_events').insert(row).select('id').single()
  if (!result.error && result.data?.id) {
    return { id: String(result.data.id), deduped: false, error: null }
  }
  if (result.error?.code !== '23505' || !row.dedupe_key) {
    return { id: null, deduped: false, error: result.error }
  }

  const existing = await db
    .from('marketplace_search_events')
    .select('id')
    .eq('dedupe_key', String(row.dedupe_key))
    .maybeSingle()
  return {
    id: existing.data?.id ? String(existing.data.id) : null,
    deduped: true,
    error: existing.error,
  }
}

export async function POST(req: Request) {
  // Anonymous Marketplace analytics still originate from our own browser UI.
  // Reject cross-site browser posts when Origin is available without storing
  // IP addresses, user agents, or any other fingerprinting signal.
  const origin = req.headers.get('origin')
  if (origin) {
    let requestOrigin = ''
    try { requestOrigin = new URL(req.url).origin } catch {}
    if (!requestOrigin || origin !== requestOrigin) return fail('Cross-origin search events are not accepted.', 403)
  }

  const body = await req.json().catch(() => ({}))
  const sessionId = cleanSessionId(body.session_id)
  if (!sessionId) return fail('A valid search session is required.', 422)

  const sessionHash = await sha256(`yousafe-marketplace-search:${sessionId}`)
  const eventType = String(body.event_type || '')
  const db = createSupabaseAdminClient()

  if (eventType === 'search') {
    const query = sanitizeMarketplaceQuery(body.query)
    if (!query) return fail('Search query is not eligible for analytics.', 422)

    const source = String(body.source || '') as MarketplaceSearchSource
    if (!SEARCH_SOURCES.has(source)) return fail('Invalid search source.', 422)

    const suggestionTypeRaw = body.suggestion_type == null ? null : String(body.suggestion_type)
    const suggestionType = suggestionTypeRaw && SUGGESTION_TYPES.has(suggestionTypeRaw as MarketplaceSuggestionType)
      ? suggestionTypeRaw
      : null
    if (suggestionTypeRaw && !suggestionType) return fail('Invalid suggestion type.', 422)

    const resultCount = body.result_count == null
      ? null
      : Math.min(100_000, Math.max(0, Math.floor(Number(body.result_count) || 0)))
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
    const recent = await db
      .from('marketplace_search_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'search')
      .eq('session_hash', sessionHash)
      .gte('created_at', oneMinuteAgo)
    if ((recent.count || 0) >= MAX_SEARCHES_PER_SESSION_PER_MINUTE) {
      return ok({ tracked: false, reason: 'rate_limited' })
    }

    const bucket = Math.floor(Date.now() / 60_000)
    const dedupeKey = await sha256([
      sessionHash,
      query.normalized,
      source,
      suggestionType || '',
      String(body.category_context || ''),
      String(bucket),
    ].join('|'))

    const searchRow = {
      event_type: 'search',
      raw_query: query.raw,
      normalized_query: query.normalized,
      source,
      suggestion_type: suggestionType,
      result_count: resultCount,
      category_context: body.category_context ? String(body.category_context).slice(0, 80) : null,
      filter_context: cleanFilters(body.filter_context),
      session_hash: sessionHash,
      dedupe_key: dedupeKey,
    }
    const inserted = await insertWithDedupe(db, searchRow)
    if (!inserted.id) return fail(inserted.error?.message || 'Could not record Marketplace search.', 500)

    const clickedGigRaw = typeof body.clicked_gig_id === 'string' ? body.clicked_gig_id.trim() : ''
    const clickedGigId = cleanUuid(clickedGigRaw)
    if (clickedGigRaw && !clickedGigId) return fail('Invalid gig id.', 422)
    if (clickedGigId && !inserted.deduped) {
      const clickDedupeKey = await sha256(`${sessionHash}|gig_click|${inserted.id}|${clickedGigId}`)
      await insertWithDedupe(db, {
        event_type: 'gig_click',
        raw_query: query.raw,
        normalized_query: query.normalized,
        source,
        suggestion_type: suggestionType,
        result_count: resultCount,
        category_context: searchRow.category_context,
        filter_context: searchRow.filter_context,
        session_hash: sessionHash,
        gig_id: clickedGigId,
        parent_search_event_id: inserted.id,
        dedupe_key: clickDedupeKey,
      })
    }

    return ok({ tracked: true, event_id: inserted.id, deduped: inserted.deduped })
  }

  if (eventType === 'gig_click') {
    const parentId = cleanUuid(body.parent_search_event_id)
    const gigId = cleanUuid(body.gig_id)
    if (!parentId || !gigId) return fail('Valid search attribution and gig id are required.', 422)

    const parent = await db
      .from('marketplace_search_events')
      .select('id, raw_query, normalized_query, source, suggestion_type, result_count, category_context, filter_context, session_hash')
      .eq('id', parentId)
      .eq('event_type', 'search')
      .maybeSingle()
    if (parent.error || !parent.data) return fail('Search attribution was not found.', 404)
    if (parent.data.session_hash !== sessionHash) return fail('Search attribution does not belong to this browser session.', 403)

    const dedupeKey = await sha256(`${sessionHash}|gig_click|${parentId}|${gigId}`)
    const inserted = await insertWithDedupe(db, {
      event_type: 'gig_click',
      raw_query: parent.data.raw_query,
      normalized_query: parent.data.normalized_query,
      source: parent.data.source,
      suggestion_type: parent.data.suggestion_type,
      result_count: parent.data.result_count,
      category_context: parent.data.category_context,
      filter_context: parent.data.filter_context || {},
      session_hash: sessionHash,
      gig_id: gigId,
      parent_search_event_id: parentId,
      dedupe_key: dedupeKey,
    })
    if (!inserted.id) return fail(inserted.error?.message || 'Could not record gig click.', 500)
    return ok({ tracked: true, event_id: inserted.id, deduped: inserted.deduped })
  }

  // Conversion is intentionally reserved for a trusted order/checkout hook.
  // The public browser collector cannot declare its own conversion.
  return fail('Invalid Marketplace search event.', 422)
}

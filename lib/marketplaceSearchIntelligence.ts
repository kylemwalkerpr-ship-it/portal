export type MarketplaceSearchSource =
  | 'search_bar'
  | 'tag_click'
  | 'suggestion_click'
  | 'category'
  | 'related_search'

export type MarketplaceSuggestionType = 'tag' | 'gig' | 'category' | 'query' | 'recent'

export interface PendingMarketplaceSearch {
  query: string
  source: MarketplaceSearchSource
  suggestionType?: MarketplaceSuggestionType
  categoryId?: string
  createdAt: number
}

const SEARCH_SESSION_KEY = 'ys.marketplaceSearchSession.v1'
const PENDING_SEARCH_KEY = 'ys.marketplacePendingSearch.v1'
const PENDING_TTL_MS = 30_000

const PRIVATE_QUERY_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\bhttps?:\/\//i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /(?:\+?\d[\s().-]*){8,}/,
]

const CREDENTIAL_WORDS = /\b(bar|licen[cs]e|registration|credential|roll|practi[cs]ing certificate|admission number)\b/i
const CREDENTIAL_ID = /(?:#|\bno\.?|\bnumber\b|\bid\b|\bidentifier\b)?\s*[A-Z]{0,5}[-\s]?\d{4,}\b/i
const LONG_IDENTIFIER = /\b[A-Z]{1,5}[-\s]?\d{5,}\b/i

export function normalizeMarketplaceQuery(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    // Treat common visa/form spellings as equivalents: H-1B/H1B, F-1/F1,
    // I-485/I485, N-400/N400, etc. This does not stem ordinary words.
    .replace(/\b([a-z])[-\s]?(\d{1,3}[a-z]?)\b/g, '$1$2')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function isPrivateMarketplaceIntent(value: unknown): boolean {
  const text = String(value ?? '').normalize('NFKC').trim()
  if (!text) return false
  if (PRIVATE_QUERY_PATTERNS.some((pattern) => pattern.test(text))) return true
  if (CREDENTIAL_WORDS.test(text) && CREDENTIAL_ID.test(text)) return true
  if (LONG_IDENTIFIER.test(text) && CREDENTIAL_WORDS.test(text)) return true
  return false
}

export function sanitizeMarketplaceQuery(value: unknown): { raw: string; normalized: string } | null {
  const raw = String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (raw.length < 2 || raw.length > 80) return null
  if (/(.)\1{6,}/i.test(raw)) return null
  if (isPrivateMarketplaceIntent(raw)) return null
  const normalized = normalizeMarketplaceQuery(raw)
  if (normalized.length < 2) return null
  return { raw, normalized }
}

export function sanitizeMarketplaceTags(input: unknown, max = 5): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const safe: string[] = []
  for (const value of input) {
    const tag = String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 60)
    const words = tag.split(/\s+/).filter(Boolean)
    const sanitized = sanitizeMarketplaceQuery(tag)
    if (!sanitized || words.length > 8) continue
    if (seen.has(sanitized.normalized)) continue
    seen.add(sanitized.normalized)
    safe.push(tag)
    if (safe.length >= max) break
  }
  return safe
}

function randomSessionToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

export function getMarketplaceSearchSessionId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const existing = window.sessionStorage.getItem(SEARCH_SESSION_KEY)
    if (existing) return existing
    const next = randomSessionToken()
    window.sessionStorage.setItem(SEARCH_SESSION_KEY, next)
    return next
  } catch {
    return null
  }
}

export function queueMarketplaceSearchExecution(input: Omit<PendingMarketplaceSearch, 'createdAt'>) {
  if (typeof window === 'undefined') return
  const sanitized = sanitizeMarketplaceQuery(input.query)
  if (!sanitized) return
  try {
    const pending: PendingMarketplaceSearch = {
      query: sanitized.raw,
      source: input.source,
      suggestionType: input.suggestionType,
      categoryId: input.categoryId,
      createdAt: Date.now(),
    }
    window.sessionStorage.setItem(PENDING_SEARCH_KEY, JSON.stringify(pending))
  } catch {}
}

export function consumeMarketplaceSearchExecution(input: { query?: string; categoryId?: string }): PendingMarketplaceSearch | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(PENDING_SEARCH_KEY)
    if (!raw) return null

    const pending = JSON.parse(raw) as PendingMarketplaceSearch
    if (!pending || Date.now() - Number(pending.createdAt || 0) > PENDING_TTL_MS) {
      window.sessionStorage.removeItem(PENDING_SEARCH_KEY)
      return null
    }

    const queryMatches = input.query
      ? normalizeMarketplaceQuery(input.query) === normalizeMarketplaceQuery(pending.query)
      : false
    const categoryMatches = Boolean(
      pending.suggestionType === 'category'
      && pending.categoryId
      && input.categoryId
      && pending.categoryId === input.categoryId,
    )
    if (!queryMatches && !categoryMatches) return null
    window.sessionStorage.removeItem(PENDING_SEARCH_KEY)
    return pending
  } catch {
    return null
  }
}

export async function recordMarketplaceSearch(input: {
  query: string
  source: MarketplaceSearchSource
  suggestionType?: MarketplaceSuggestionType
  resultCount: number | null
  categoryContext?: string
  filters?: Record<string, unknown>
  clickedGigId?: string
}): Promise<string | null> {
  const sessionId = getMarketplaceSearchSessionId()
  const sanitized = sanitizeMarketplaceQuery(input.query)
  if (!sessionId || !sanitized) return null
  try {
    const res = await fetch('/api/marketplace/search-events', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'search',
        query: sanitized.raw,
        source: input.source,
        suggestion_type: input.suggestionType ?? null,
        result_count: input.resultCount == null ? null : Math.max(0, Math.floor(Number(input.resultCount) || 0)),
        category_context: input.categoryContext || null,
        filter_context: input.filters || {},
        session_id: sessionId,
        clicked_gig_id: input.clickedGigId || null,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return null
    return body?.data?.event_id || null
  } catch {
    return null
  }
}

export async function recordMarketplaceGigClick(input: { searchEventId?: string | null; gigId: string }) {
  if (!input.searchEventId || !input.gigId) return
  const sessionId = getMarketplaceSearchSessionId()
  if (!sessionId) return
  try {
    await fetch('/api/marketplace/search-events', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'gig_click',
        parent_search_event_id: input.searchEventId,
        gig_id: input.gigId,
        session_id: sessionId,
      }),
    })
  } catch {}
}

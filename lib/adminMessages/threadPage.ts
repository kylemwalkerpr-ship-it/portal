/**
 * Admin Master Chats — bounded thread pagination helpers (tie-safe).
 *
 * The admin GET messages endpoint returns a bounded newest-first page with
 * a cursor for older-history pagination:
 *
 *   - DB query is `created_at DESC, id DESC` with `limit + 1` rows. The
 *     `+1` row proves older history exists (→ `has_older`).
 *   - The cursor is a COMPOSITE of `{ created_at, id }` (JSON) so messages
 *     sharing the exact boundary timestamp are never skipped: the next
 *     older page filters `created_at < c OR (created_at = c AND id < i)`,
 *     i.e. lexicographically-older-than on the stable (created_at, id) key.
 *   - All helpers are pure + deterministic so the paging contract is
 *     unit-testable without a DB, including equal-timestamp tie behavior.
 *
 * Cursor contract (must stay in sync with the UI + route):
 *   older_cursor = JSON.stringify({ c: <created_at>, i: <id> }) | null
 *   GET .../messages?before=<older_cursor>
 */

export const THREAD_PAGE_DEFAULT_LIMIT = 100
export const THREAD_PAGE_MAX_LIMIT = 200

export function parseThreadPageLimit(raw: string | null | undefined): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return THREAD_PAGE_DEFAULT_LIMIT
  return Math.min(THREAD_PAGE_MAX_LIMIT, Math.floor(n))
}

export interface RowKey {
  created_at: string | null | undefined
  id: string | null | undefined
}

export function keyOf(m: any): RowKey {
  return { created_at: m?.created_at, id: m?.id }
}

export interface ThreadPagePayload {
  messages: any[]
  has_older: boolean
  older_cursor: string | null
}

/** Composite cursor encoding — malformed/absent values decode to null. */
export function encodeCursor(createdAt: string | null | undefined, id: string | null | undefined): string | null {
  if (!createdAt || !id) return null
  return JSON.stringify({ c: createdAt, i: id })
}

export function parseCursor(raw: string | null | undefined): RowKey | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    if (
      typeof v?.c === 'string' && v.c && typeof v?.i === 'string' && v.i
      && !Number.isNaN(new Date(v.c).getTime())
    ) {
      return { created_at: v.c, id: v.i }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Stable older-than ordering on the (created_at, id) composite key. The
 * ISO strings are compared numerically so timestamp offset variants of the
 * same instant still order correctly; equal timestamps fall through to id.
 */
export function olderThanSlot(row: RowKey, boundary: RowKey): boolean {
  if (!row || !boundary || !row.created_at || !boundary.created_at) return false
  const a = new Date(row.created_at).getTime()
  const b = new Date(boundary.created_at).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return false
  if (a !== b) return a < b
  return String(row.id ?? '') < String(boundary.id ?? '')
}

/**
 * PostgREST `or(...)` filter string for "strictly older than cursor" on the
 * composite key — the query-side twin of olderThanSlot.
 */
export function cursorFilter(createdAt: string, id: string): string {
  return `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`
}

/**
 * Given the raw result of a `created_at desc, id desc, limit + 1` query,
 * produce the ascending display page plus the composite older cursor.
 */
export function buildThreadPage<T>(
  newestFirstRows: T[] | null | undefined,
  limit: number,
  rowKey: (row: T) => RowKey,
): ThreadPagePayload {
  const trimmed = newestFirstRows ?? []
  const hasOlder = trimmed.length > limit
  const pageRows = trimmed.slice(0, limit).reverse()
  const oldest = pageRows.length > 0 ? rowKey(pageRows[0]) : null
  return {
    messages: pageRows as any[],
    has_older: hasOlder,
    older_cursor:
      hasOlder && oldest?.created_at && oldest?.id
        ? encodeCursor(oldest.created_at, oldest.id)
        : null,
  }
}

/* ── Pagination state machine (exhaustion is tracked independently of the
      newest-page metadata so a silent refresh can never resurrect the
      "Load earlier" button after the full history was already fetched). ── */

export interface ThreadPageMeta {
  has_older: boolean
  older_cursor: string | null
  history_done: boolean
}

export const initialThreadPageMeta: ThreadPageMeta = {
  has_older: false,
  older_cursor: null,
  history_done: false,
}

/** Full (fresh) open of a thread — trust the newest-page metadata. */
export function applyFullMeta(page: ThreadPagePayload): ThreadPageMeta {
  return {
    has_older: !!page.has_older,
    older_cursor: page.has_older ? page.older_cursor : null,
    history_done: !page.has_older,
  }
}

/**
 * Silent refresh — merge newest page, but NEVER move the history cursor:
 * only the initial/full load establishes the cursor and older-page loads
 * advance it. Adopting the newest page's cursor here would regress the
 * cursor to a shallower boundary after older pages were loaded, causing the
 * next "Load earlier" to re-request already-fetched history. The exhausted
 * flag is also preserved so a poll can never resurrect the button.
 */
export function applyPollMeta(prev: ThreadPageMeta, page: ThreadPagePayload): ThreadPageMeta {
  if (prev.history_done) return prev
  return {
    has_older: prev.has_older || !!page.has_older,
    older_cursor: prev.older_cursor,
    history_done: prev.history_done,
  }
}

/** Older-history page loaded — advance the cursor + track exhaustion. */
export function applyOlderMeta(prev: ThreadPageMeta, page: ThreadPagePayload): ThreadPageMeta {
  return {
    has_older: !!page.has_older,
    older_cursor: page.has_older ? page.older_cursor : null,
    history_done: prev.history_done || !page.has_older,
  }
}

/**
 * Merge incoming page messages into what is already displayed, dedup by id,
 * and keep ascending chronological display order. Used by polls, older-page
 * prepends, AND send-appends so a message retrieved by a concurrent poll can
 * never render twice.
 */
export function mergeById(prev: any[] | null | undefined, incoming: any[] | null | undefined): any[] {
  const map = new Map<string, any>()
  for (const m of prev ?? []) if (m && m.id) map.set(m.id, m)
  for (const m of incoming ?? []) if (m && m.id) map.set(m.id, m)
  return Array.from(map.values()).sort((a, b) =>
    Number(new Date(a.created_at || 0)) - Number(new Date(b.created_at || 0)),
  )
}

/**
 * After a successful send, the stored draft for that thread should be
 * cleared ONLY when it still equals the text that was sent. If the user
 * wrote a NEWER draft while the send was in flight, it must survive.
 */
export function sentDraftClears(storedDraft: string | null | undefined, sentText: string): boolean {
  return !!storedDraft && storedDraft.trim() === sentText.trim()
}
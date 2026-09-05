/** Pure helpers for the Drafting-stage file vault (last N jobs by updated_at). */

export type VaultJobLike = {
  id: string
  title?: string | null
  updated_at?: string | null
  created_at?: string | null
}

/**
 * Return up to `limit` jobs sorted by updated_at descending (newest first).
 * Falls back to created_at when updated_at is missing. Stable by id on ties.
 */
export function lastUpdatedJobs<T extends VaultJobLike>(jobs: readonly T[], limit = 10): T[] {
  const n = Math.max(0, Math.floor(limit))
  if (!jobs?.length || n === 0) return []
  const scored = jobs.map((j, index) => {
    const raw = j.updated_at || j.created_at || ""
    const ts = Date.parse(raw)
    return { j, index, ts: Number.isFinite(ts) ? ts : 0 }
  })
  scored.sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts
    return String(a.j.id).localeCompare(String(b.j.id))
  })
  return scored.slice(0, n).map((s) => s.j)
}

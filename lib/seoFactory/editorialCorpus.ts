/*
 * Accepted-vs-rejected editorial corpus.
 *
 * The factory already persists final content_jobs.  We use recent merged rows
 * as a house-style distribution and only compliance-gate failures as negative
 * examples; provider/GitHub/deploy failures are deliberately excluded because
 * they say nothing about prose quality.
 *
 * Best-effort, read-only and cached.  Production must keep drafting when
 * Supabase is unavailable, the migration has not reached an environment, or
 * the corpus is still too small to learn from honestly.
 */

import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseKey } from '@/lib/supabaseKey'
import {
  buildEditorialCorpusProfile,
  type EditorialCorpusProfile,
} from './editorialNaturalness'

type CorpusRow = {
  content?: string | null
  content_type?: string | null
  status?: string | null
  last_failure_kind?: string | null
  updated_at?: string | null
}

type CacheEntry = {
  expiresAt: number
  profile: EditorialCorpusProfile | null
}

const CACHE_TTL_MS = 15 * 60_000
const CACHE = new Map<string, CacheEntry>()
const MIN_ACCEPTED = 4

function usableContent(row: CorpusRow): string | null {
  const text = typeof row.content === 'string' ? row.content.trim() : ''
  if (!text) return null
  const words = (text.match(/[A-Za-z][A-Za-z'-]*/g) || []).length
  return words >= 120 ? text : null
}

/** Pure helper so the accepted/rejected policy is regression-testable. */
export function buildEditorialCorpusFromRows(
  rows: CorpusRow[],
  contentType?: string,
): EditorialCorpusProfile | null {
  const type = String(contentType || '').toLowerCase().trim()
  const sameType = (row: CorpusRow) => !type || String(row.content_type || '').toLowerCase().trim() === type
  const accepted: string[] = []
  const rejected: string[] = []

  for (const row of rows || []) {
    if (!sameType(row)) continue
    const content = usableContent(row)
    if (!content) continue
    if (row.status === 'merged') {
      accepted.push(content)
      continue
    }
    if (row.status === 'failed' && row.last_failure_kind === 'compliance_gate') rejected.push(content)
  }
  if (accepted.length < MIN_ACCEPTED) return null
  return buildEditorialCorpusProfile({ accepted, rejected })
}

/**
 * Load the recent estate distribution for one content type. Never throws.
 * A single query supplies both classes so the cache cannot learn accepted and
 * rejected samples from different moments in the job table.
 */
export async function loadEditorialCorpusProfile(
  contentType: string,
  opts: { force?: boolean } = {},
): Promise<EditorialCorpusProfile | null> {
  const key = String(contentType || 'article').toLowerCase().trim() || 'article'
  const now = Date.now()
  const cached = CACHE.get(key)
  if (!opts.force && cached && cached.expiresAt > now) return cached.profile

  let profile: EditorialCorpusProfile | null = null
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const auth = resolveSupabaseKey()
    if (!url || !auth) {
      CACHE.set(key, { profile: null, expiresAt: now + CACHE_TTL_MS })
      return null
    }
    const supabase = createClient(url, auth, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await supabase
      .from('content_jobs')
      .select('content, content_type, status, last_failure_kind, updated_at')
      .in('status', ['merged', 'failed'])
      .not('content', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(120)

    if (!error && Array.isArray(data)) {
      const rows = data as CorpusRow[]
      profile = buildEditorialCorpusFromRows(rows, key)
      // Some older environments used aliases such as regional_page/article.
      // If the exact type is sparse, use the estate-wide accepted distribution
      // rather than pretending four same-type examples exist.
      if (!profile) profile = buildEditorialCorpusFromRows(rows)
    }
  } catch {
    profile = null
  }

  CACHE.set(key, { profile, expiresAt: now + CACHE_TTL_MS })
  return profile
}

export function resetEditorialCorpusCache(): void {
  CACHE.clear()
}

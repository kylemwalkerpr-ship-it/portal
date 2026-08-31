/**
 * snapshot-merge — regression test for the junk-starved live GSC fix.
 *
 * Live GSC for sc-domain:yousafeconsultancy.com is ~99% junk (quoted
 * university-PDF blobs); only 0-2 rows survive isJunkQuery on a typical day.
 * The old fallback only fired when live rows === 0, so 1-2 survivors starved
 * Discover (0 opportunities / 0 war-room plays).
 *
 * Proves:
 *   1. SNAPSHOT_MERGE_MIN_VIABLE is 5.
 *   2. mergeSnapshotIntoQueries dedupes by normalized term when live is thin
 *      (live row kept, snapshot duplicate dropped).
 *   3. A healthy live set (length >= 5) is returned UNTOUCHED (same reference).
 *   4. Merged queries feed scoreOpportunities({queries, limit:20}) yielding
 *      at least 3 opportunities — the starvation loop is broken end-to-end.
 */
import {
  SNAPSHOT_MERGE_MIN_VIABLE,
  mergeSnapshotIntoQueries,
  scoreOpportunities,
  type OpportunityQuery,
} from '../lib/seoFactory/opportunityEngine'

/** Clean, eligible GSC row (never junk-classified, never deep-tail). */
const q = (
  term: string,
  impressions: number,
  clicks: number,
  ctr: number,
  position: number,
): OpportunityQuery => ({ term, impressions, clicks, ctr, position })

describe('SNAPSHOT_MERGE_MIN_VIABLE', () => {
  it('is 5', () => {
    expect(SNAPSHOT_MERGE_MIN_VIABLE).toBe(5)
  })
})

describe('mergeSnapshotIntoQueries', () => {
  it('dedupes by normalized term when live is thin (live row kept, snapshot duplicate dropped)', () => {
    const live = [
      q('UK Student Visa Requirements', 900, 12, 0.013, 12),
      q('spouse visa financial requirement', 400, 5, 0.012, 18),
    ]
    const snapshot = [
      // Same term as live row #1, different case/whitespace — must be dropped.
      q('  uk student visa requirements ', 1500, 30, 0.02, 9),
      q('ielts ukvi band requirements', 700, 9, 0.013, 14),
      q('psw visa eligibility rules', 300, 4, 0.013, 19),
      q('student dependent visa rules', 260, 3, 0.012, 22),
    ]
    const merged = mergeSnapshotIntoQueries(live, snapshot)
    // 2 live rows + 3 unique snapshot rows; the duplicate never enters.
    expect(merged).toHaveLength(5)
    // Live rows are kept as-is (same objects, original casing untouched).
    expect(merged.slice(0, 2)).toEqual(live)
    // The snapshot duplicate is absent.
    const terms = merged.map((m) => m.term.trim().toLowerCase())
    expect(terms.filter((t) => t === 'uk student visa requirements')).toHaveLength(1)
    expect(terms).toContain('ielts ukvi band requirements')
    expect(terms).toContain('psw visa eligibility rules')
    expect(terms).toContain('student dependent visa rules')
  })

  it('returns a healthy live set UNTOUCHED (same reference)', () => {
    const live = [
      q('uk student visa requirements', 900, 12, 0.013, 12),
      q('spouse visa financial requirement', 400, 5, 0.012, 18),
      q('ielts ukvi band requirements', 700, 9, 0.013, 14),
      q('psw visa eligibility rules', 300, 4, 0.013, 19),
      q('student dependent visa rules', 260, 3, 0.012, 22),
    ]
    const snapshot = [
      q('stale snapshot row a', 5000, 80, 0.016, 6),
      q('stale snapshot row b', 4000, 70, 0.017, 7),
    ]
    expect(mergeSnapshotIntoQueries(live, snapshot)).toBe(live)
    expect(live).toHaveLength(5)
  })

  it('feeds scoreOpportunities with >= 3 opportunities after a thin-live merge', () => {
    const live = [
      q('uk student visa requirements', 900, 12, 0.013, 12),
      q('spouse visa financial requirement', 400, 5, 0.012, 18),
    ]
    const snapshot = [
      q('uk student visa requirements', 1500, 30, 0.02, 9),
      q('ielts ukvi band requirements', 700, 9, 0.013, 14),
      q('psw visa eligibility rules', 300, 4, 0.013, 19),
      q('student dependent visa rules', 260, 3, 0.012, 22),
      q('visa priority service processing time', 220, 2, 0.009, 24),
      q('brp replacement guidance', 150, 1, 0.007, 28),
    ]
    const merged = mergeSnapshotIntoQueries(live, snapshot)
    const { opportunities } = scoreOpportunities({ queries: merged, limit: 20 })
    expect(opportunities.length).toBeGreaterThanOrEqual(3)
  })
})

/**
 * Admin Master Chats — behavioral race-safety & pagination-state tests.
 *
 * Unlike the static-contract tests, these exercise the ACTUAL state machine
 * the component runs: the thread operation guard (session / primary-load
 * generations + overlap prevention) and the pagination store (dedup merge,
 * older-page advancement, exhaustion independence). Together they make the
 * reviewer's scenarios testable without a browser:
 *
 *   1. A slow initial fetch with a poll/focus event must NOT be invalidated
 *      by the poll, and must still populate the view.
 *   2. Switching A→B→A must discard the stale A response even though the
 *      active conversation id is identical again.
 *   3. Send appends must deduplicate against a concurrent poll's copy.
 *   4. A poll after the full history was loaded must not resurrect the
 *      bogus "Load earlier" button.
 *   5. Draft clearing must never wipe a newer draft written during a send.
 */
import {
  applyFullMeta,
  applyOlderMeta,
  applyPollMeta,
  mergeById,
  sentDraftClears,
} from '@/lib/adminMessages/threadPage'
import { createThreadGuard } from '@/lib/adminMessages/threadGuard'

const pg = (messages: any[], has_older: boolean, older_cursor: string | null) => ({
  messages,
  has_older,
  older_cursor,
})

describe('thread operation guard', () => {
  it('skips polls while a full fetch is in flight (no threadLoading stranding)', () => {
    const g = createThreadGuard()
    const full = g.begin('full')
    expect(full).not.toBeNull()
    expect(g.busy()).toBe(true)

    // Slow initial fetch (>8s): the poll/focus event fires → must SKIP, so
    // it can never advance the generation or invalidate the full load.
    const poll = g.begin('poll')
    expect(poll).toBeNull()

    // Full load finally completes — still the current primary op.
    expect(g.isCurrent(full!)).toBe(true)
    g.end(full)
    expect(g.busy()).toBe(false)
  })

  it('discards a stale A response after A→B→A even though the active id is A again', () => {
    const g = createThreadGuard()
    const a1 = g.begin('full')          // open A (session 1)
    expect(a1).not.toBeNull()

    g.switchSession()                   // open B
    const b = g.begin('full')
    g.switchSession()                   // back to A
    const a2 = g.begin('full')

    // Both stale A/B requests are rejected; only the fresh A request wins.
    expect(g.isCurrent(a1!)).toBe(false)
    expect(g.isCurrent(b!)).toBe(false)
    expect(g.isCurrent(a2!)).toBe(true)
  })

  it('polls never advance the primary generation; a newer full load supersedes them', () => {
    const g = createThreadGuard()
    const full = g.begin('full')!
    g.end(full)

    const poll = g.begin('poll')!       // after full completes
    expect(g.isCurrent(poll)).toBe(true) // poll founded on the same primary

    const full2 = g.begin('full')!      // retry/reopen
    expect(g.isCurrent(poll)).toBe(false) // superseded
    expect(g.isCurrent(full2)).toBe(true)
  })

  it('older-page loads share the primary generation and do not invalidate the owning full load', () => {
    const g = createThreadGuard()
    const full = g.begin('full')!
    const older = g.begin('older')!     // user taps "Load earlier" mid-flight

    expect(g.isCurrent(full)).toBe(true)
    expect(g.isCurrent(older)).toBe(true)

    // Owner completes → still current, may clear threadLoading.
    expect(g.isPrimary(full)).toBe(true)
    g.end(full)                          // full releases its slot
    expect(g.isCurrent(older)).toBe(true)
  })

  it('older loads can run while a poll is in flight but polls still skip', () => {
    const g = createThreadGuard()
    g.begin('older')
    expect(g.begin('poll')).toBeNull()  // overlap prevented
    expect(g.begin('older')).not.toBeNull() // history loads always permitted
  })
})

describe('thread pagination store', () => {
  it('dedups a send-append against a message a concurrent poll already fetched', () => {
    const m5 = { id: 'm5', created_at: '2026-09-05T10:00:00Z', body: 'five' }
    const m4 = { id: 'm4', created_at: '2026-09-05T09:00:00Z', body: 'four' }
    const polled = mergeById([m4], [m5])          // poll pulled m5 first
    const afterSend = mergeById(polled, [m5])     // send returns the same m5
    expect(afterSend.length).toBe(2)
    expect(afterSend.filter((m) => m.id === 'm5').length).toBe(1)
    expect(afterSend.map((m) => m.id)).toEqual(['m4', 'm5'])
  })

  it('keeps ascending order when older pages are prepended over polls', () => {
    const newest = [
      { id: 'c1', created_at: '2026-09-05T10:00:00Z' },
      { id: 'c2', created_at: '2026-09-05T11:00:00Z' },
    ]
    const older = [
      { id: 'a1', created_at: '2026-09-05T08:00:00Z' },
      { id: 'b1', created_at: '2026-09-05T09:00:00Z' },
    ]
    const m = mergeById(mergeById(newest, older), [{ id: 'b2', created_at: '2026-09-05T09:00:00Z' }])
    expect(m.map((x) => x.id)).toEqual(['a1', 'b1', 'b2', 'c1', 'c2'])
  })

  it('does NOT resurrect the Load-earlier button after history was exhausted', () => {
    const cursorA = '"{cA}"'
    let meta = applyFullMeta(pg([], true, cursorA))
    expect(meta).toEqual({ has_older: true, older_cursor: cursorA, history_done: false })

    const cursorB = '"{cB}"'
    meta = applyOlderMeta(meta, pg([], true, cursorB))   // advance once
    expect(meta.history_done).toBe(false)

    meta = applyOlderMeta(meta, pg([], false, null))      // last page
    expect(meta).toEqual({ has_older: false, older_cursor: null, history_done: true })

    // Newest page STILL reports has_older=true on the next poll → the store
    // must keep history exhausted; a poll cannot rebuild the button.
    const afterPoll = applyPollMeta(meta, pg([], true, cursorA))
    expect(afterPoll.history_done).toBe(true)
    expect(afterPoll.has_older).toBe(false)
    expect(afterPoll.older_cursor).toBeNull()
  })

  it('poll preserves the ADVANCED history cursor after older pages were loaded', () => {
    const outer = '"{c1-outer}"'
    const deep = '"{c2-deep}"'
    const deepest = '"{c3-deepest}"'

    // initial full load establishes the cursor
    let meta = applyFullMeta(pg([], true, outer))
    // older page loaded, more history remains → cursor advances
    meta = applyOlderMeta(meta, pg([], true, deep))
    expect(meta.older_cursor).toBe(deep)

    // poll (newest page) reports has_older with ITS OWN shallow cursor —
    // the poll must NOT regress the advanced history cursor.
    const shallowPollCursor = '"{fresh-shallow}"'
    meta = applyPollMeta(meta, pg([], true, shallowPollCursor))
    expect(meta.has_older).toBe(true)
    expect(meta.older_cursor).toBe(deep) // advanced cursor retained
    expect(meta.history_done).toBe(false)

    // next older load continues from the DEEP cursor, not the poll's shallow one
    meta = applyOlderMeta(meta, pg([], true, deepest))
    expect(meta.older_cursor).toBe(deepest)
  })

  it('poll preserves has_older/paginates normally while history remains unexhausted', () => {
    const cursor = '"{c}"'
    const meta = applyFullMeta(pg([], true, cursor)) // not exhausted
    const afterPoll = applyPollMeta(meta, pg([], true, cursor))
    expect(afterPoll).toEqual({ has_older: true, older_cursor: cursor, history_done: false })

    // A poll that reports NO older history still keeps prior pagination flags
    // so the cursor chain is not broken mid-walk.
    const noOlderPoll = applyPollMeta(meta, pg([], false, null))
    expect(noOlderPoll.has_older).toBe(true)
    expect(noOlderPoll.older_cursor).toBe(cursor)
  })

  it('fresh full-metadata marks a history-less thread as immediately exhausted', () => {
    // No older history from the very first page → nothing left to paginate.
    expect(applyFullMeta(pg([], false, null))).toEqual({
      has_older: false,
      older_cursor: null,
      history_done: true,
    })
  })
})

describe('draft clear decision', () => {
  it('clears only the exact sent text — a newer draft always survives', () => {
    expect(sentDraftClears('hello', 'hello')).toBe(true)
    expect(sentDraftClears('hello', 'nice')).toBe(false)   // user rewrote it
    expect(sentDraftClears(null, 'hello')).toBe(false)
    expect(sentDraftClears('', 'hello')).toBe(false)
    expect(sentDraftClears('hello ', 'hello')).toBe(true)  // whitespace-insensitive
  })
})
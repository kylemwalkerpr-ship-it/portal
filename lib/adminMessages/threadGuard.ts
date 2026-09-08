/**
 * Admin Master Chats — thread operation guard.
 *
 * Encodes the race-safety rules for asynchronous thread (and list) fetches
 * as a small pure state machine so the behavior is testable without React:
 *
 *   - SESSION: advances only when the user switches/reopens a thread
 *     (openThread / close / retry). Every request snapshots the session and
 *     is DISCARDED unless its session is still current AFTER the fetch body
 *     has been parsed — this is what makes `A → B → A` safe, where the
 *     active-id alone cannot distinguish a stale response for A from a fresh
 *     one (both have the same id).
 *   - PRIMARY: advances only on FULL (fresh-load) requests. A full load owns
 *     the `threadLoading` lifecycle; polls and older-page fetches never move
 *     it, so a slow initial fetch (>8s) can no longer be invalidated by a
 *     poll that would strand `threadLoading=true` forever.
 *   - OVERLAP: polls skip while ANY thread fetch is in flight, preventing
 *     request storms; full loads and user-initiated older-page loads are
 *     always permitted (they supersede safely via the session guard).
 */

export type ThreadOpKind = 'full' | 'older' | 'poll'

export interface GuardToken {
  session: number
  opSeq: number
}

export interface ThreadGuard {
  /** Snapshot the current session (call at request START, after switchSession). */
  session(): number
  /** Advance the session — call when switching/reopening a conversation. */
  switchSession(): void
  /**
   * Begin an operation; returns a token or null when the op must be skipped
   * (polls during any in-flight fetch). `full` advances the primary
   * generation so the most recent full load wins.
   */
  begin(kind: ThreadOpKind): GuardToken | null
  /** The operation is still the single latest FULL load (owns loading UI). */
  isPrimary(token: GuardToken): boolean
  /** The operation still belongs to the current session (not stale). */
  isSessionCurrent(token: GuardToken): boolean
  /** Session + primary checks combined — safe to write state. */
  isCurrent(token: GuardToken): boolean
  /** Release the in-flight slot (always call in finally). */
  end(token: GuardToken | null): void
  busy(): boolean
}

export function createThreadGuard(): ThreadGuard {
  let session = 0
  let primarySeq = 0
  let inFlight = 0

  return {
    session() {
      return session
    },
    switchSession() {
      session += 1
    },
    begin(kind) {
      if (kind === 'poll' && inFlight > 0) return null
      if (kind === 'full') primarySeq += 1
      inFlight += 1
      return { session, opSeq: primarySeq }
    },
    isPrimary(token) {
      return !!token && token.opSeq === primarySeq
    },
    isSessionCurrent(token) {
      return !!token && token.session === session
    },
    isCurrent(token) {
      return this.isSessionCurrent(token) && this.isPrimary(token)
    },
    end(token) {
      if (token && token.session === session && token.opSeq === primarySeq) {
        inFlight = Math.max(0, inFlight - 1)
        return
      }
      // A superseded token still releases its slot unless a newer operation
      // is already running on the current generation.
      if (inFlight > 0) inFlight -= 1
    },
    busy() {
      return inFlight > 0
    },
  }
}
/**
 * WhatsApp-style interactive back: from an open mobile chat, a rightward
 * swipe that starts on the left edge returns to the conversation list.
 *
 * Finger travels RIGHT (iOS / WhatsApp). The left-edge start keeps the
 * message list's vertical pan intact.
 */

export const SWIPE_BACK_EDGE_PX = 56
export const SWIPE_BACK_LOCK_PX = 12
export const SWIPE_BACK_MIN_COMMIT_PX = 72

export function isSwipeBackStart(offsetX: number): boolean {
  return offsetX >= 0 && offsetX <= SWIPE_BACK_EDGE_PX
}

/**
 * Decide whether a move should lock into a back-swipe.
 * `false` = still sampling; `true` = horizontal back; `'abort'` = let
 * vertical scroll / other gestures own the pointer.
 */
export function shouldLockSwipeBack(dx: number, dy: number): boolean | 'abort' {
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  if (adx < SWIPE_BACK_LOCK_PX && ady < SWIPE_BACK_LOCK_PX) return false
  if (dx < SWIPE_BACK_LOCK_PX || ady > adx) return 'abort'
  return true
}

export function shouldCommitSwipeBack(dx: number, vxPxPerMs: number, width: number): boolean {
  if (dx <= 0) return false
  const distance = Math.min(120, Math.max(SWIPE_BACK_MIN_COMMIT_PX, width * 0.28))
  if (dx >= distance) return true
  return vxPxPerMs > 0.55 && dx > 36
}

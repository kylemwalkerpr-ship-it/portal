/**
 * Approve → main confirmation must run in the same user-gesture turn as the
 * click. Chrome/Safari suppress window.confirm after an await (e.g. draft
 * save), which returns false with no dialog — an enabled button that appears
 * to no-op. Call this helper before any await; never after.
 */
export const APPROVE_MAIN_PROMPT =
  'Approve this content for main and trigger deployment?'

export function confirmApproveToMain(): boolean {
  if (typeof window === 'undefined') return true
  return window.confirm(APPROVE_MAIN_PROMPT)
}

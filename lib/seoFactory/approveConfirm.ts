/**
 * Approve → main confirmation must open in the same user-gesture turn as the
 * click. Native browser confirm dialogs are suppressed after an await and are
 * invisible to desktop automation. Use ApproveConfirmModal in the DOM instead
 * — open it synchronously on click, then approve on Confirm.
 */
export const APPROVE_MAIN_PROMPT =
  'Approve this content for main and trigger deployment?'

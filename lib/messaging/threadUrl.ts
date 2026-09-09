export const MESSENGER_MOBILE_MQ = '(max-width: 680px)'

export function isMessengerMobileViewport(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.matchMedia?.(MESSENGER_MOBILE_MQ)?.matches)
}

/**
 * Keep `?thread=` as a deep-link to an OPEN chat, not merely a selected row.
 * No-op when the URL is already correct so replaceState does not fight
 * in-app Back / list restore.
 */
export function writeMessengerThreadParam(id: string | null | undefined): void {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('thread', String(id))
    else url.searchParams.delete('thread')
    const next = `${url.pathname}${url.search}${url.hash}`
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (next === current) return
    window.history.replaceState({}, '', next)
  } catch {
    // Pane state remains authoritative if URL sync fails.
  }
}

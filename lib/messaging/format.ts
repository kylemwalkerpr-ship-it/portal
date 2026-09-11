/**
 * Coerce any accepted timestamp input to a valid Date. Returns null for
 * null/undefined/empty values, invalid strings (which `new Date` silently
 * turns into "Invalid Date"), or non-numeric/malformed offsets — callers
 * then render an empty label instead of "Invalid Date".
 */
export const toValidDate = (s: string | Date | null | undefined): Date | null => {
  if (s === null || s === undefined || s === '') return null
  const d = s instanceof Date ? s : new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

const DIFF_MIN = 60_000
const DIFF_HOUR = 3_600_000
const DIFF_DAY = 86_400_000
const DIFF_WEEK = 7 * DIFF_DAY
const DIFF_YEAR = 365 * DIFF_DAY

export const fmtRelative = (s: string | null | undefined): string => {
  const d = toValidDate(s)
  if (!d) return ''
  const diff = Date.now() - d.getTime()
  if (diff < DIFF_MIN) return 'now'
  if (diff < DIFF_HOUR) return `${Math.floor(diff / DIFF_MIN)}m`
  if (diff < DIFF_DAY) return `${Math.floor(diff / DIFF_HOUR)}h`
  if (diff < DIFF_WEEK) return `${Math.floor(diff / DIFF_DAY)}d`
  if (diff < DIFF_YEAR) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/**
 * Compact in-bubble timestamp. The conversation already renders date dividers,
 * so repeating the calendar date on every message adds noise. Match the
 * WhatsApp convention instead: show only the local clock time beside the
 * delivery/read ticks (for example, "6:27 PM").
 */
export const fmtFullTime = (s: string | Date | null | undefined): string => {
  const d = toValidDate(s)
  if (!d) return ''
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export const sameDay = (a: string | Date | null | undefined, b: string | Date | null | undefined): boolean => {
  const da = toValidDate(a)
  const db = toValidDate(b)
  if (!da || !db) return false
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

export const dateLabel = (s: string | Date | null | undefined): string => {
  const d = toValidDate(s)
  if (!d) return ''
  const now = new Date()
  if (sameDay(d, now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const initials = (name: string | null | undefined): string =>
  String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() || '').join('')

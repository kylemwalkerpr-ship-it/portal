/**
 * Query-noise filter for the opportunity engine.
 *
 * Google Search Console occasionally leaks non-keyword strings into the top
 * queries: PDF filenames, file paths, and pasted URLs (e.g. a "rates final.pdf"
 * filename plus a pacific.edu file path). These can never be resolved into a
 * cannibal-merge or a real content opportunity, and they surface as "Cannibal
 * sweep: 8 failed" noise. Filter them before they reach the radar.
 */

const FILE_EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|jpg|jpe?g|png|gif|webp|svg|csv|zip|rar|mp3|mp4|txt)(?:[^a-z0-9]|$)/i

// A pasted URL/domain or a filesystem path fragment is never a search keyword.
const URL_FRAGMENT_RE =
  /(?:^|[\s"'])(?:https?:\/\/|www\.)|(?:^|\/)(?:sites|files|wp-content|uploads|assets)(?:\/|$)|\b(?:[a-z0-9-]+\.)+(?:edu|com|org|net|gov|io|co)(?:\/|$)/i

/** Max word count for a plausible keyword phrase; longer strings are pasted text. */
const MAX_KEYWORD_WORDS = 8

/**
 * True when a query string is noise (a filename/URL/pasted blob), not a real
 * keyword. Empty strings are also considered junk.
 */
export function isJunkQuery(term: string): boolean {
  const t = (term || '').trim()
  if (!t) return true
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length > MAX_KEYWORD_WORDS) return true
  if (FILE_EXT_RE.test(t)) return true
  if (URL_FRAGMENT_RE.test(t)) return true
  return false
}

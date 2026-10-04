/**
 * Escape LIKE wildcards so an email used with PostgREST `ilike` matches only
 * itself (case-insensitively). Without this, `_` and `%` in an address act as
 * wildcards and could match a different person's profile row.
 */
export function escapeIlikeExact(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

/**
 * Make free-text search input safe to embed inside a PostgREST `.or()` filter
 * string. Commas and parentheses are `.or()` delimiters, so raw input could
 * append extra filter branches; quotes/backslashes can break parsing. They are
 * replaced with spaces, the term is length-capped, then LIKE wildcards are
 * escaped so `%`/`_` match literally.
 */
export function postgrestOrTerm(value: string, max = 100): string {
  return value
    .replace(/[,()"'\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .replace(/[%_]/g, (ch) => `\\${ch}`)
}

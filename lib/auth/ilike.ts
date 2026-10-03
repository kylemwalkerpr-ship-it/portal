/**
 * Escape LIKE wildcards so an email used with PostgREST `ilike` matches only
 * itself (case-insensitively). Without this, `_` and `%` in an address act as
 * wildcards and could match a different person's profile row.
 */
export function escapeIlikeExact(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

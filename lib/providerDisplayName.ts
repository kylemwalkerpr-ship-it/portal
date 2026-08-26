/**
 * Single source of truth for rendering a provider's display name.
 *
 * The bug this replaces: every surface rolled its own fallback
 * (`full_name || 'X'`, `full_name ?? 'X'`, nothing at all), and
 * `profiles.full_name` can be an EMPTY STRING in the database — which
 * passes `??` and `||` differently at each call site, so gig cards,
 * the hero case-file slideshow, and gig JSON-LD rendered a blank name
 * next to "Licensed attorney".
 *
 * Chain: trimmed full_name → username → email local-part → role-aware
 * fallback. Empty strings and whitespace are treated as missing.
 */

interface ProviderLike {
  full_name?: string | null
  username?: string | null
  email?: string | null
}

export function providerDisplayName(
  provider: ProviderLike | null | undefined,
  fallback = 'YouSafe provider',
): string {
  const candidates = [provider?.full_name, provider?.username, provider?.email]
  for (const c of candidates) {
    const s = typeof c === 'string' ? c.trim() : ''
    if (s) return s
  }
  return fallback
}

/** Role-aware fallback label when no name field has any value. */
export function providerDisplayLabel(
  provider: ProviderLike | null | undefined,
  providerType?: string | null,
): string {
  const fallback =
    String(providerType || '').toLowerCase() === 'consultant'
      ? 'Regulated consultant'
      : 'Licensed attorney'
  return providerDisplayName(provider, fallback)
}

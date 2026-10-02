/**
 * Bar / licence / membership number rules, shared by the client form and the
 * server validator (no server-only imports here).
 *
 * 3-20 characters, letters, digits, spaces and - . / only, starting
 * alphanumeric, with at least one digit. Covers e.g. "123456", "SBN 287654",
 * "NY-4567890", "R512345", "F201900123".
 */
export const BAR_NUMBER_PATTERN = /^(?=.*\d)[A-Za-z0-9][A-Za-z0-9 .\-/]{2,19}$/

export function normalizeBarNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().replace(/\s+/g, ' ').toUpperCase()
  return clean || null
}

export function isValidBarNumber(value: unknown): boolean {
  const clean = normalizeBarNumber(value)
  return !!clean && BAR_NUMBER_PATTERN.test(clean)
}

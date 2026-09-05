/**
 * P1-E1 — SEO Intel lock seed binding.
 *
 * The Brief Assembly "SEO Intel" readiness chip must only stay locked while the
 * writerContract still matches the topic/region/keyword seed it was produced
 * for. Changing topic, primary keyword, or region clears the lock so a prior
 * contract cannot certify a different brief into Drafting.
 */

export type SeoIntelLockSeedInput = {
  region?: string | null
  primaryKeyword?: string | null
  topic?: string | null
  title?: string | null
}

/** Normalize free text so trivial whitespace/case drift does not thrash the lock. */
export function normalizeSeoIntelSeedPart(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Stable seed fingerprint for the SEO Intel writer-contract lock.
 * Primary keyword wins over topic/title (same precedence as seoBriefSeed in UI).
 */
export function buildSeoIntelLockSeed(input: SeoIntelLockSeedInput): string {
  const keywordOrTopic = normalizeSeoIntelSeedPart(
    input.primaryKeyword || input.topic || input.title || '',
  )
  const region = normalizeSeoIntelSeedPart(input.region || '')
  if (!keywordOrTopic && !region) return ''
  return `${region}::${keywordOrTopic}`
}

/** True when a previously locked seed no longer matches the live brief fields. */
export function isSeoIntelLockStale(
  lockedSeed: string | null | undefined,
  currentSeed: string | null | undefined,
): boolean {
  const locked = String(lockedSeed || '').trim()
  const current = String(currentSeed || '').trim()
  if (!locked) return false
  return locked !== current
}

export type SeoIntelBriefLock = {
  brief: unknown
  writerContract: string
  /** Seed fingerprint captured at lock time (region::keyword). */
  lockSeed: string
}

/** Lock is valid only when a non-empty contract exists AND its seed still matches. */
export function isSeoIntelLocked(
  lock: Pick<SeoIntelBriefLock, 'writerContract' | 'lockSeed'> | null | undefined,
  currentSeed: string | null | undefined,
): boolean {
  if (!lock) return false
  const contract = String(lock.writerContract || '').trim()
  if (!contract) return false
  if (isSeoIntelLockStale(lock.lockSeed, currentSeed)) return false
  return true
}

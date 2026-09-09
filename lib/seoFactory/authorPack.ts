/**
 * AuthorPack + research claim map for ContentSpec (Agent C).
 *
 * Operator-supplied experience beats are the only permitted first-person
 * material. Empty beats must never be filled with invented people
 * ("Maria from Manila") or testimonials. YMYL pages require a real named
 * author with a topic-relevant credential — JSON-LD must not silently
 * default to "YouSafe Editorial Team" when a pack is present.
 */

const YMYL_AUTHOR_TYPES: ReadonlySet<string> = new Set([
  'legal_guide',
  'article',
  'regional_page',
  'regional_from',
  'regional_university',
])

export type ExperienceBeat = {
  situation: string
  action: string
  result: string
  anonymised: true
}

export type AuthorPack = {
  name: string
  credential: string
  experienceScope: string
  reviewedBy?: string
  lastReviewed?: string
  experienceBeats: ExperienceBeat[]
  /** Public marketplace profile URL of the cited attorney/consultant. */
  marketplaceUrl?: string
  providerType?: 'attorney' | 'consultant'
  servicePages?: Array<{ title: string; url: string; match?: string }>
}

export type ResearchClaim = {
  url: string
  publisher: string
  supports: string
  excerpt?: string
}

/** Indexable legal/article/regional types require a real named author. */
export function ymylAuthorRequired(contentType: string, indexable: boolean): boolean {
  if (!indexable) return false
  const type = String(contentType || '').trim()
  return YMYL_AUTHOR_TYPES.has(type) || type.startsWith('regional_')
}

/**
 * Structural + YMYL author checks. Returns issue codes/messages; never throws.
 * `ymyl` + missing name or credential → `'ymyl_author_required'`.
 */
export function validateAuthorPack(
  pack: AuthorPack | null | undefined,
  opts: { contentType: string; ymyl: boolean },
): string[] {
  const issues: string[] = []
  const ymyl = Boolean(opts.ymyl) || ymylAuthorRequired(opts.contentType, true)
  const name = typeof pack?.name === 'string' ? pack.name.trim() : ''
  const credential = typeof pack?.credential === 'string' ? pack.credential.trim() : ''

  if (ymyl && (!name || !credential)) {
    issues.push('ymyl_author_required')
  }

  if (pack == null) return issues
  if (typeof pack !== 'object') {
    issues.push('author: malformed AuthorPack')
    return issues
  }
  if (pack.name !== undefined && typeof pack.name !== 'string') {
    issues.push('author.name: must be a string')
  }
  if (pack.credential !== undefined && typeof pack.credential !== 'string') {
    issues.push('author.credential: must be a string')
  }
  if (pack.experienceScope !== undefined && typeof pack.experienceScope !== 'string') {
    issues.push('author.experienceScope: must be a string')
  }
  if (pack.reviewedBy !== undefined && typeof pack.reviewedBy !== 'string') {
    issues.push('author.reviewedBy: must be a string')
  }
  if (pack.lastReviewed !== undefined && typeof pack.lastReviewed !== 'string') {
    issues.push('author.lastReviewed: must be a string')
  }
  if (pack.marketplaceUrl !== undefined) {
    if (typeof pack.marketplaceUrl !== 'string' || !/^https:\/\/market\.yousafeconsultancy\.com\//i.test(pack.marketplaceUrl)) {
      issues.push('author.marketplaceUrl: must be an https marketplace URL')
    }
  }
  if (pack.providerType !== undefined && pack.providerType !== 'attorney' && pack.providerType !== 'consultant') {
    issues.push('author.providerType: must be attorney or consultant')
  }
  if (pack.experienceBeats !== undefined && !Array.isArray(pack.experienceBeats)) {
    issues.push('author.experienceBeats: must be an array')
  } else if (Array.isArray(pack.experienceBeats)) {
    for (let i = 0; i < pack.experienceBeats.length; i++) {
      const beat = pack.experienceBeats[i]
      if (!beat || typeof beat !== 'object') {
        issues.push(`author.experienceBeats[${i}]: malformed beat`)
        continue
      }
      if (!beat.situation || typeof beat.situation !== 'string') {
        issues.push(`author.experienceBeats[${i}]: situation missing`)
      }
      if (!beat.action || typeof beat.action !== 'string') {
        issues.push(`author.experienceBeats[${i}]: action missing`)
      }
      if (!beat.result || typeof beat.result !== 'string') {
        issues.push(`author.experienceBeats[${i}]: result missing`)
      }
    }
  }
  return issues
}

const EMPTY_BEATS_PROMPT =
  'Do not invent personal stories, named people, or testimonials. Write from procedure and official rules only.'

/**
 * Writer-facing experience block. Empty beats → procedure-only (no Maria-from-Manila).
 * Operator-supplied beats are the only permitted anecdotes.
 */
export function experienceBeatsPromptBlock(beats: ExperienceBeat[]): string {
  const list = Array.isArray(beats) ? beats.filter((b) => b && b.situation && b.action && b.result) : []
  if (!list.length) return EMPTY_BEATS_PROMPT
  const lines = [
    'OPERATOR-SUPPLIED EXPERIENCE BEATS (use only these; never invent people or testimonials):',
    ...list.map(
      (b, i) =>
        `${i + 1}. Situation: ${b.situation} Action: ${b.action} Result: ${b.result}${b.anonymised ? ' (anonymised)' : ''}`,
    ),
    EMPTY_BEATS_PROMPT,
  ]
  return lines.join('\n')
}

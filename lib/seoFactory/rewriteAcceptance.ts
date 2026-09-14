/**
 * Shared rewrite acceptance. Length alone is not enough.
 */

import { countBodyWords } from './contentDepth'
import { validateRevisionQuality, type RevisionValidation } from './revisionQuality'
import type { SeoFactoryAudit } from './audit'

const QUALIFICATION = /\b(unless|except|only if|does not|cannot|not eligible|subject to|provided that)\b/i

export function acceptRewriteCandidate(input: {
  previous: string
  next: string
  previousAudit?: SeoFactoryAudit | null
  nextAudit?: SeoFactoryAudit | null
  requiredKeywords?: string[]
}): RevisionValidation {
  const prevWords = countBodyWords(input.previous)
  const nextWords = countBodyWords(input.next)
  if (nextWords < 40) return { ok: false, reason: 'rewrite shorter than 40 words' }
  if (prevWords >= 800 && nextWords < prevWords * 0.7) {
    return { ok: false, reason: 'rewrite dropped more than 30% of an established article' }
  }
  if (QUALIFICATION.test(input.previous) && !QUALIFICATION.test(input.next)) {
    return { ok: false, reason: 'rewrite removed a qualification or exception' }
  }
  if (input.previousAudit && input.nextAudit) {
    return validateRevisionQuality(input.previousAudit, input.nextAudit, {
      original: input.previous,
      revised: input.next,
      requiredKeywords: input.requiredKeywords || [],
    })
  }
  return { ok: true }
}

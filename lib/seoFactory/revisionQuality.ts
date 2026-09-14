import type { SeoFactoryAudit } from './audit'
import { coversKeywordIntent, stripForScan } from './contentQualityGate'
import { resolveTermSources, type KeywordTerm } from '@/lib/seoEngine/keywordTerms'

export type RevisionValidation = { ok: boolean; reason?: string }
export type RevisionValidator = (original: string, revised: string) => RevisionValidation

/** A style edit cannot spend publishing readiness to buy a better score elsewhere. */
export function validateRevisionQuality(
  previous: SeoFactoryAudit,
  revised: SeoFactoryAudit,
  coverage?: { original: string; revised: string; requiredKeywords: string[]; keywordTerms?: KeywordTerm[] },
): RevisionValidation {
  if (coverage) {
    const required = resolveTermSources(coverage.requiredKeywords, coverage.keywordTerms)
    const originalBody = stripForScan(coverage.original)
    const revisedBody = stripForScan(coverage.revised)
    for (const { term, source } of required) {
      if (source === 'demand' && coversKeywordIntent(originalBody, term) && !coversKeywordIntent(revisedBody, term)) {
        return { ok: false, reason: `Revision lost required keyword coverage: ${term}` }
      }
    }
  }
  const remaining = new Map<string, number>()
  for (const finding of previous.blockers) {
    remaining.set(finding.code, (remaining.get(finding.code) || 0) + 1)
  }
  for (const finding of revised.blockers) {
    const available = remaining.get(finding.code) || 0
    if (!available) return { ok: false, reason: `Revision introduced a publishing blocker: ${finding.message}` }
    remaining.set(finding.code, available - 1)
  }
  if (revised.score < previous.score) return { ok: false, reason: 'Revision reduced the publishing audit score' }
  if (previous.humanScore != null && (revised.humanScore == null || revised.humanScore < previous.humanScore)) {
    return { ok: false, reason: 'Revision reduced editorial quality' }
  }
  return { ok: true }
}

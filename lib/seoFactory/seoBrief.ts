/**
 * Phase 9 — structured SEO brief from first-party intel.
 * Feeds the existing writer; does not invent volume or force a ranking word count.
 */

import type { KeywordCandidate } from './keywordDiscover'
import type { KeywordTopicCluster } from './keywordGrouping'
import type { CoverageBreakdown, InternalLinkSuggestion } from './coverageLinks'
import type { ClassifiedOpportunity, SeoAction } from './opportunityAction'
import type { CannibalizationCandidate } from './cannibalDetect'

export type SearchIntent =
  | 'informational'
  | 'commercial'
  | 'transactional'
  | 'navigational'
  | 'mixed'
  | 'unknown'

export interface SeoBrief {
  primaryTopic: string
  searchIntent: SearchIntent
  opportunityAction: SeoAction
  targetCluster: string[]
  entities: string[]
  questions: string[]
  recommendedSections: string[]
  internalLinks: InternalLinkSuggestion[]
  existingCoverage?: number
  competingInternalPages: string[]
  evidence: {
    gscQueries: string[]
    suggestionQueries: string[]
  }
  warnings: string[]
}

export function inferSearchIntent(phrases: string[]): SearchIntent {
  const blob = phrases.join(' ').toLowerCase()
  const hits: SearchIntent[] = []
  if (/apply|fee|cost|price|hire|enroll|pay/.test(blob)) hits.push('transactional')
  if (/best|vs|compare|review|top/.test(blob)) hits.push('commercial')
  if (/login|portal|status|account/.test(blob)) hits.push('navigational')
  if (/how|what|why|requirements|eligibility/.test(blob)) hits.push('informational')
  const uniq = [...new Set(hits)]
  if (uniq.length === 0) return 'informational'
  if (uniq.length > 1) return 'mixed'
  return uniq[0]
}

export function buildSeoBrief(input: {
  seed: string
  candidates?: KeywordCandidate[]
  clusters?: KeywordTopicCluster[]
  coverage?: CoverageBreakdown
  opportunity?: ClassifiedOpportunity
  cannibals?: CannibalizationCandidate[]
  links?: InternalLinkSuggestion[]
}): SeoBrief {
  const seed = String(input.seed || '').trim()
  const candidates = input.candidates || []
  const cluster = input.clusters?.[0]
  const targetCluster = cluster
    ? cluster.keywords.map((k) => k.keyword)
    : candidates.slice(0, 12).map((c) => c.keyword)
  if (!targetCluster.includes(seed) && seed) targetCluster.unshift(seed)

  const gscQueries = candidates.filter((c) => c.sources.includes('gsc')).map((c) => c.keyword)
  const suggestionQueries = candidates.filter((c) => c.sources.includes('suggest')).map((c) => c.keyword)
  const entities = [...new Set([...(cluster?.entities || []), ...targetCluster.slice(0, 8)])]

  const questions = [
    `What is ${seed}?`,
    `Who is eligible for ${seed}?`,
    `What documents do you need for ${seed}?`,
    `How long does ${seed} take?`,
    `How much does ${seed} cost?`,
  ]

  const recommendedSections = [
    'In 60 seconds',
    'Who this is for',
    'Requirements and eligibility',
    'Documents and evidence',
    'Process and timeline',
    'Costs and fees',
    'Common mistakes',
    'FAQ',
    'Sources',
  ]

  const action: SeoAction = input.opportunity?.action || 'WATCH'
  const warnings: string[] = []
  if (action === 'REFRESH') {
    warnings.push('REFRESH — expand the existing URL; do not create a sibling article.')
  }
  if (action === 'CONSOLIDATE') {
    warnings.push('CONSOLIDATE — do not publish a new URL until a human picks a canonical page.')
  }
  if (action === 'DEFEND') {
    warnings.push('DEFEND — targeted maintenance only; avoid a full rewrite.')
  }
  if (action === 'CREATE') {
    warnings.push('CREATE — no covering URL; still avoid stuffing cluster terms.')
  }
  warnings.push('Cover entities naturally. Do not keyword-stuff. Do not invent statutes, fees, or outcomes.')
  warnings.push('Word count is editorial guidance from content type, not an SEO ranking factor.')

  const competing = [...new Set((input.cannibals || []).flatMap((c) => [c.pageA, c.pageB]))]

  return {
    primaryTopic: seed,
    searchIntent: inferSearchIntent(targetCluster),
    opportunityAction: action,
    targetCluster: [...new Set(targetCluster)].slice(0, 16),
    entities: entities.slice(0, 16),
    questions,
    recommendedSections,
    internalLinks: (input.links || []).slice(0, 8),
    existingCoverage: input.coverage?.score,
    competingInternalPages: competing,
    evidence: {
      gscQueries: [...new Set(gscQueries)].slice(0, 20),
      suggestionQueries: [...new Set(suggestionQueries)].slice(0, 20),
    },
    warnings,
  }
}

/** Prompt block for the existing drafting pipeline — does not replace suggest-brief. */
export function formatSeoBriefForWriter(brief: SeoBrief): string {
  const lines = [
    '## $0 SEO intelligence brief (writer contract)',
    `Primary topic: ${brief.primaryTopic}`,
    `Search intent: ${brief.searchIntent}`,
    `Opportunity action: ${brief.opportunityAction}`,
    `Cluster terms (use naturally, do not stuff): ${brief.targetCluster.join('; ')}`,
    `Entities to cover: ${brief.entities.join('; ')}`,
    `Questions to answer: ${brief.questions.join(' | ')}`,
    `Recommended sections: ${brief.recommendedSections.join(' · ')}`,
  ]
  if (brief.existingCoverage != null) lines.push(`Existing coverage score: ${brief.existingCoverage}/100`)
  if (brief.competingInternalPages.length) {
    lines.push(`Competing internal pages (do not duplicate): ${brief.competingInternalPages.join(' ')}`)
  }
  if (brief.internalLinks.length) {
    lines.push('Internal-link opportunities (use where editorial):')
    for (const l of brief.internalLinks) {
      lines.push(`- [${l.suggestedAnchor}](${l.targetUrl}) — ${l.reason}`)
    }
  }
  lines.push('Evidence GSC: ' + (brief.evidence.gscQueries.join('; ') || '(none)'))
  lines.push('Evidence suggest: ' + (brief.evidence.suggestionQueries.join('; ') || '(none)'))
  lines.push('Warnings:')
  for (const w of brief.warnings) lines.push(`- ${w}`)
  if (brief.opportunityAction === 'REFRESH') {
    lines.push('Writer MUST update the existing page, not open a second article.')
  }
  if (brief.opportunityAction === 'CONSOLIDATE') {
    lines.push('Writer MUST respect CONSOLIDATE — no new sibling URL.')
  }
  return lines.join('\n')
}

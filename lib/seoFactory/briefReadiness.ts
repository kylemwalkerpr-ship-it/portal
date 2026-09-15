import { BriefInvalidError, type SealedBrief } from './sealedBrief'

const CANNED = [
  /^eligibility and requirements$/i,
  /^documents and evidence checklist$/i,
  /^application process step by step$/i,
  /^costs, timing and common risks$/i,
  /^worked example$/i,
]

export function briefReadinessIssues(input: {
  brief: SealedBrief
  contentType?: string
  primaryKeyword?: string
  observedEvidenceCount?: number
}): { issues: string[]; stage: 'brief_invalid' | 'needs_research' } {
  const issues: string[] = []
  const headings = (input.brief.outline || []).map((c) => String(c.heading || '').trim())
  const cannedMatches = CANNED.filter((re) => headings.some((h) => re.test(h))).length
  if (cannedMatches >= 4) {
    issues.push('outline is the generic immigration fallback rather than an evidence-led editorial plan')
  }
  if (headings.some((h) => /^worked example$/i.test(h)) && !(input.brief.unresolved || []).some((u) => /example|scenario/i.test(String(u)))) {
    issues.push('generic Worked Example section is unsupported by the briefing evidence')
  }
  const purposes = (input.brief.outline || [])
    .filter((c) => !/^(in 60 seconds|table of contents|faq|sources)$/i.test(String(c.heading || '').trim()))
    .map((c) => String(c.purpose || '').trim())
  if (!purposes.length || purposes.some((purpose) => !purpose)) {
    issues.push('one or more substantive sections lack an evidence-led purpose')
  }
  if (String(input.brief.thesis || '').trim().length < 24) issues.push('thesis is insufficient')
  if ((input.brief.takeaways || []).length < 3) issues.push('brief lacks three supported takeaways')
  if (input.observedEvidenceCount === 0) {
    return { issues: [...issues, 'no persisted research observations are available for this brief'], stage: 'needs_research' }
  }
  return { issues, stage: 'brief_invalid' }
}

export function assertBriefReady(input: Parameters<typeof briefReadinessIssues>[0]): void {
  const result = briefReadinessIssues(input)
  if (result.issues.length) throw new BriefInvalidError(result.issues, result.stage)
}

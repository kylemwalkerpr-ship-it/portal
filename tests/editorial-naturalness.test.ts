import {
  buildEditorialCorpusProfile,
  editorialFragmentScore,
  evaluateEditorialNaturalness,
  extractEditorialFingerprint,
  fingerprintDistance,
} from '@/lib/seoFactory/editorialNaturalness'
import { buildEditorialCorpusFromRows } from '@/lib/seoFactory/editorialCorpus'
import { parseBlindEditorFindings } from '@/lib/seoFactory/blindEditor'
import {
  parseSpanCandidates,
  selectBestSpanReplacements,
  type DenoiseSpan,
} from '@/lib/seoFactory/maskedDenoise'

function pad(seed: string, n = 7): string {
  return Array.from({ length: n }, (_, i) => `${seed} The reader checks the official instruction at checkpoint ${i + 1} and keeps the matching record before moving to the next decision.`).join(' ')
}

function acceptedDoc(variant: number): string {
  return `# Student filing guide ${variant}

## Eligibility

IRCC first checks whether the applicant fits the program rules. ${pad(`Eligibility evidence ${variant} links the applicant, program and decision.`)}

## Documents

Keep the passport with the application record. A bank letter has a different job: it supports the financial evidence. ${pad(`Document control ${variant} starts with the named record and the action it supports.`, 5)}

## Process

Start with the live account instructions. Then upload the requested record. If IRCC asks for an update, respond through the account rather than rebuilding the whole file. ${pad(`The filing sequence ${variant} changes actor and sentence shape as the reader moves from account to evidence.`, 5)}

## Risks

A complete upload can still need follow-up evidence. However, a request for another document is different from a refusal. ${pad(`Risk note ${variant} distinguishes a rule from its consequence and gives the reader a concrete next action.`, 5)}
`
}

function rejectedDoc(variant: number): string {
  const boiler = `Navigating the application process can be complex for applicants. Understanding the requirements is important for applicants who want to navigate the process successfully. There are several factors to consider when it comes to the application process and the requirements involved. It is important to understand the process and the requirements before moving forward with the process.`
  return `# Application process ${variant}

## Overview

${Array.from({ length: 8 }, () => boiler).join('\n\n')}

## Requirements

${Array.from({ length: 7 }, () => boiler).join('\n\n')}
`
}

describe('editorial naturalness intelligence', () => {
  it('detects semantic repetition beyond exact string duplication', () => {
    const doc = `# CRS guide

## Score inputs

Applicants submit identity evidence and employment records so the authority can verify score inputs before a decision. The application connects each document to the scoring factor it proves. Keep supporting evidence with the application.

## Timing

IRCC publishes invitation rounds separately from an individual profile. Check the current round before treating an older threshold as a prediction for the next draw. A previous round is historical evidence, not a guarantee. The reader should separate a published threshold from a personal forecast.

## Profile maintenance

A profile can change when the applicant updates supported information. Keep the underlying record before changing a scored field. Review the new total after the update. Save the evidence that supports the revised entry.

## Evidence review

Candidates file identity documents and employment records so the agency can confirm score inputs before a decision. The filing connects each record to the scoring factor it proves. Keep supporting documents with the filing.
`
    const report = evaluateEditorialNaturalness(doc)
    expect(report.findings.some((f) => f.code === 'semantic_repetition' || f.code === 'section_semantic_overlap')).toBe(true)
    expect(report.repairSpans.length).toBeGreaterThan(0)
  })

  it('measures actor, discourse, specificity and novelty as a stable fingerprint', () => {
    const fp = extractEditorialFingerprint(acceptedDoc(1))
    expect(fp.paragraphCount).toBeGreaterThan(5)
    expect(fp.sentenceCount).toBeGreaterThan(10)
    expect(fp.metrics.informationNovelty).toBeGreaterThanOrEqual(0)
    expect(fp.metrics.informationNovelty).toBeLessThanOrEqual(1)
    expect(fp.metrics.actorConcentration).toBeGreaterThanOrEqual(0)
    expect(fp.metrics.discourseDiversity).toBeGreaterThanOrEqual(0)
    expect(fp.skeleton).toContain('eligibility')
  })

  it('learns accepted vs compliance-rejected distributions', () => {
    const accepted = [1, 2, 3, 4, 5].map(acceptedDoc)
    const rejected = [1, 2, 3].map(rejectedDoc)
    const profile = buildEditorialCorpusProfile({ accepted, rejected })
    expect(profile.acceptedCount).toBe(5)
    expect(profile.rejectedCount).toBe(3)
    expect(profile.accepted).toBeTruthy()
    expect(profile.rejected).toBeTruthy()

    const acceptedDistance = fingerprintDistance(extractEditorialFingerprint(acceptedDoc(8)), profile.accepted)
    const rejectedDistance = fingerprintDistance(extractEditorialFingerprint(rejectedDoc(8)), profile.rejected)
    expect(acceptedDistance).not.toBeNull()
    expect(rejectedDistance).not.toBeNull()
    expect(acceptedDistance!).toBeLessThan(2)
    expect(rejectedDistance!).toBeLessThan(2)
  })

  it('does not learn prose rejection from provider or deploy failures', () => {
    const rows = [
      ...[1, 2, 3, 4].map((i) => ({ content: acceptedDoc(i), content_type: 'legal_guide', status: 'merged', last_failure_kind: null })),
      { content: rejectedDoc(1), content_type: 'legal_guide', status: 'failed', last_failure_kind: 'compliance_gate' },
      { content: rejectedDoc(2), content_type: 'legal_guide', status: 'failed', last_failure_kind: 'ai_provider' },
      { content: rejectedDoc(3), content_type: 'legal_guide', status: 'failed', last_failure_kind: 'cloudflare_deploy' },
    ]
    const profile = buildEditorialCorpusFromRows(rows, 'legal_guide')
    expect(profile).toBeTruthy()
    expect(profile?.acceptedCount).toBe(4)
    expect(profile?.rejectedCount).toBe(1)
  })
})

describe('blind editor', () => {
  it('accepts only exact, bounded prose quotes', () => {
    const quote = 'This paragraph repeats the same application point without giving the reader a new decision.'
    const content = `# Guide\n\n${quote}\n\n## Process\nA concrete next step follows here.`
    const rows = parseBlindEditorFindings(JSON.stringify({
      findings: [
        { quote, issue: 'It repeats rather than advances.', instruction: 'Compress it into the new decision.' },
        { quote: 'This quote does not exist in the document and should be ignored.', issue: 'x', instruction: 'y' },
      ],
    }), content)
    expect(rows).toHaveLength(1)
    expect(content.slice(rows[0].start, rows[0].end)).toBe(quote)
  })
})

describe('contrastive denoise reranking', () => {
  it('parses multiple candidates while preserving legacy one-candidate output', () => {
    const parsed = parseSpanCandidates(`===SPAN_1_A===\nFirst version.\n===SPAN_1_B===\nSecond version.\n===SPAN_2===\nLegacy version.`)
    expect(parsed.get('SPAN_1')).toEqual(['First version.', 'Second version.'])
    expect(parsed.get('SPAN_2')).toEqual(['Legacy version.'])
  })

  it('selects the stronger measured candidate instead of taking model output order', () => {
    const original = 'Navigating the application process can be complex for applicants. Understanding the requirements is important when it comes to the application process and the requirements involved.'
    const better = 'IRCC checks the application against the program rules. Keep the requested evidence with the file so each record supports a specific decision.'
    const content = `# Guide\n\n${original}`
    const start = content.indexOf(original)
    const span: DenoiseSpan = {
      id: 'SPAN_1',
      code: 'predictable_boilerplate',
      t: 'mid',
      start,
      end: start + original.length,
      original,
      instruction: 'Lead with the concrete actor and action.',
    }
    expect(editorialFragmentScore(better)).toBeGreaterThan(editorialFragmentScore(original))
    const chosen = selectBestSpanReplacements(content, [span], new Map([
      ['SPAN_1', [original, better]],
    ]))
    expect(chosen.get('SPAN_1')).toBe(better)
  })
})

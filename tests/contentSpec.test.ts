/**
 * ContentSpec tests (implementation brief §7.3 — spec provenance).
 *
 * Unverified links, invented citations, malformed source records, and
 * incompatible region/type combinations are rejected before any AI call.
 */
import {
  CONTENT_SPEC_VERSION,
  assertValidContentSpec,
  createContentSpec,
  validateContentSpec,
  type CreateContentSpecInput,
} from '@/lib/seoFactory/contentSpec'
import { depthSpecForType } from '@/lib/seoFactory/contentDepth'
import { PLAYBOOK_VERSION } from '@/lib/seoFactory/contentQualityPlaybook'

const BASE: CreateContentSpecInput = {
  jobId: 'job-2026-042',
  contentType: 'legal_guide',
  region: 'uk',
  indexable: true,
  target: {
    canonicalUrl: 'https://yousafeconsultancy.com/legal/uk-skilled-worker-visa',
    host: 'yousafeconsultancy.com',
    path: '/legal/uk-skilled-worker-visa',
  },
  intent: {
    primaryQuery: 'uk skilled worker visa requirements',
    reader: 'a migrant worker preparing an application',
    queryNeed: 'eligibility, documents, and the application procedure',
    stage: 'consideration',
  },
  primaryKeyword: 'uk skilled worker visa',
  requiredKeywords: [
    { phrase: 'skilled worker visa', kind: 'short' },
    { phrase: 'how to apply for a uk skilled worker visa', kind: 'long_tail' },
  ],
  outline: [{ heading: 'Eligibility', level: 2, purpose: 'who qualifies' }],
  requiredSections: ['In 60 seconds', 'FAQ', 'Sources'],
  verifiedEstateLinks: [
    {
      url: 'https://yousafeconsultancy.com/legal/uk-visas',
      anchor: 'UK visa guides',
      role: 'hub',
      verification: { verifiedBy: 'link-audit', verifiedAt: '2026-08-28T00:00:00.000Z', httpStatus: 200 },
    },
    {
      url: '/legal/uk-work-permits',
      anchor: 'UK work permits',
      role: 'related',
      verification: { verifiedBy: 'link-audit', verifiedAt: '2026-08-28T00:00:00.000Z', httpStatus: 200 },
    },
  ],
  approvedSources: [
    { url: 'https://www.gov.uk/skilled-worker-visa', publisher: 'UK Home Office', purpose: 'official policy' },
  ],
  ymyl: { disclaimerRequired: true, statutoryAnchors: ['Appendix Skilled Workers'], freshnessRequired: true },
  aeoGeo: { answerFirst: true, faqRequired: true, quotableEvidenceRequired: true },
  plannerRunId: 'run-77',
  sourceHashes: { ownership: 'abc123', gsc: 'def456' },
  generatedAt: '2026-08-29T10:00:00.000Z',
}

function specWith(overrides: Partial<CreateContentSpecInput>): CreateContentSpecInput {
  return { ...BASE, ...overrides }
}

/** Verified marker as link-audit would issue it. */
const VERIFIED: CreateContentSpecInput['verifiedEstateLinks'][number]['verification'] = {
  verifiedBy: 'link-audit',
  verifiedAt: '2026-08-28T00:00:00.000Z',
  httpStatus: 200,
}

/** Strip the verification evidence from an otherwise well-formed link record. */
function withoutVerification(l: CreateContentSpecInput['verifiedEstateLinks'][number]) {
  const { verification: _v, ...rest } = l
  return rest as unknown as CreateContentSpecInput['verifiedEstateLinks'][number]
}

describe('createContentSpec', () => {
  it('builds a valid spec and derives the word budget from contentDepth for the type', () => {
    const spec = createContentSpec(BASE)
    expect(spec.version).toBe(PLAYBOOK_VERSION)
    const depth = depthSpecForType('legal_guide')
    expect(spec.wordBudget).toEqual({
      min: depth.minWords,
      target: depth.targetWords,
      max: depth.maxWords,
    })
    expect(() => assertValidContentSpec(spec)).not.toThrow()
  })

  it('keeps an explicit word budget when one is supplied', () => {
    const spec = createContentSpec(specWith({ wordBudget: { min: 2200, target: 2500, max: 2800 } }))
    expect(spec.wordBudget).toEqual({ min: 2200, target: 2500, max: 2800 })
  })

  it('round-trips through JSON unchanged (immutable persisted snapshot)', () => {
    const spec = createContentSpec(BASE)
    expect(JSON.parse(JSON.stringify(spec))).toEqual(spec)
  })

  it('defaults YMYL/AEO obligations from indexability for legal guides', () => {
    const spec = createContentSpec(BASE)
    expect(spec.ymyl.disclaimerRequired).toBe(true)
    expect(spec.aeoGeo.answerFirst).toBe(true)
  })

  it('CONTENT_SPEC_VERSION equals the playbook version', () => {
    expect(CONTENT_SPEC_VERSION).toBe(PLAYBOOK_VERSION)
  })
})

describe('validateContentSpec — rejections before AI (test matrix §7.3)', () => {
  const expectIssues = (input: CreateContentSpecInput, fragment: string) => {
    const issues = validateContentSpec(input)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some((i) => i.includes(fragment))).toBe(true)
  }

  it('rejects a playbook version mismatch', () => {
    const spec: Record<string, unknown> = { ...createContentSpec(BASE), version: '1999.01.1' }
    expect(validateContentSpec(spec).join('\n')).toContain('version')
  })

  it('rejects an incompatible region/type combination (regional type with global region)', () => {
    expectIssues(
      specWith({ contentType: 'regional_page', region: 'global' }),
      'region/type',
    )
  })

  it('accepts a regional type with a concrete region', () => {
    expect(() =>
      assertValidContentSpec(createContentSpec(specWith({ contentType: 'regional_page' }))),
    ).not.toThrow()
  })

  it('rejects unverified estate links (http, placeholder host, malformed, invented path)', () => {
    expectIssues(
      specWith({
        verifiedEstateLinks: [
          { url: 'http://yousafeconsultancy.com/legal/uk', anchor: 'x', role: 'hub', verification: VERIFIED },
        ],
      }),
      'unverified or placeholder URL',
    )
    expectIssues(
      specWith({
        verifiedEstateLinks: [{ url: 'https://example.com/legal', anchor: 'x', role: 'hub', verification: VERIFIED }],
      }),
      'unverified or placeholder URL',
    )
    expectIssues(
      specWith({
        verifiedEstateLinks: [{ url: 'not a url', anchor: 'x', role: 'hub', verification: VERIFIED }],
      }),
      'unverified or placeholder URL',
    )
    expectIssues(
      specWith({
        verifiedEstateLinks: [{ url: '/legal/TODO', anchor: 'x', role: 'hub', verification: VERIFIED }],
      }),
      'unverified or placeholder URL',
    )
  })

  it('rejects links without link-audit verification evidence (syntax alone is not proof)', () => {
    expectIssues(
      specWith({
        verifiedEstateLinks: [
          withoutVerification({
            url: 'https://yousafeconsultancy.com/legal/uk-visas',
            anchor: 'plausible hub',
            role: 'hub',
            verification: VERIFIED,
          }),
        ],
      }),
      'missing or invalid link-audit verification evidence',
    )
    expectIssues(
      specWith({
        verifiedEstateLinks: [
          {
            url: '/legal/uk-visa-requirements',
            anchor: 'plausible but unverified path',
            role: 'related',
            verification: { verifiedBy: 'planner' as never, verifiedAt: '2026-08-28T00:00:00.000Z' },
          },
        ],
      }),
      'missing or invalid link-audit verification evidence',
    )
    expectIssues(
      specWith({
        verifiedEstateLinks: [
          {
            url: '/legal/uk-work-permits',
            anchor: 'bad timestamp',
            role: 'related',
            verification: { verifiedBy: 'link-audit', verifiedAt: 'not-a-date' },
          },
        ],
      }),
      'missing or invalid link-audit verification evidence',
    )
    expectIssues(
      specWith({
        verifiedEstateLinks: [
          {
            url: '/legal/uk-work-permits',
            anchor: 'implausible status',
            role: 'related',
            verification: { verifiedBy: 'link-audit', verifiedAt: '2026-08-28T00:00:00.000Z', httpStatus: 404 },
          },
        ],
      }),
      'implausible verification httpStatus',
    )
  })

  it('accepts explicitly link-audit-verified estate links', () => {
    expect(() => assertValidContentSpec(createContentSpec(BASE))).not.toThrow()
  })

  it('rejects malformed estate-link records (missing anchor, invalid role, duplicate URL)', () => {
    expectIssues(
      specWith({
        verifiedEstateLinks: [
          {
            url: 'https://yousafeconsultancy.com/legal/uk-visas',
            anchor: '',
            role: 'hub',
            verification: VERIFIED,
          },
        ],
      }),
      'missing anchor',
    )
    expectIssues(
      specWith({
        verifiedEstateLinks: [
          {
            url: 'https://yousafeconsultancy.com/legal/uk-visas',
            anchor: 'a',
            role: 'hub',
            verification: VERIFIED,
          },
          {
            url: 'https://yousafeconsultancy.com/legal/uk-visas',
            anchor: 'b',
            role: 'related',
            verification: VERIFIED,
          },
        ],
      }),
      'duplicate URL',
    )
  })

  it('rejects invented citations (placeholder publisher URL, non-https, missing fields)', () => {
    expectIssues(
      specWith({
        approvedSources: [{ url: 'https://example.com/visa', publisher: 'Example', purpose: 'x' }],
      }),
      'invented, non-https, or placeholder citation',
    )
    expectIssues(
      specWith({
        approvedSources: [{ url: 'http://www.gov.uk/skilled-worker-visa', publisher: 'UK Home Office', purpose: 'x' }],
      }),
      'invented, non-https, or placeholder citation',
    )
    expectIssues(
      specWith({
        approvedSources: [{ url: 'https://www.gov.uk/skilled-worker-visa', publisher: '', purpose: 'x' }],
      }),
      'missing publisher',
    )
    expectIssues(
      specWith({
        approvedSources: [{ url: 'https://www.gov.uk/skilled-worker-visa', publisher: 'UK Home Office', purpose: '' }],
      }),
      'missing purpose',
    )
  })

  it('rejects arbitrary https citations that are not canonical official sources for this job', () => {
    expectIssues(
      specWith({
        approvedSources: [
          { url: 'https://www.migrationinsights.com/articles/uk-policy-update', publisher: 'Migration Insights', purpose: 'blog summary' },
        ],
      }),
      'is not a canonical official source for this job and carries no provenance evidence',
    )
    expectIssues(
      specWith({
        approvedSources: [
          { url: 'https://medium.com/@someone/uk-visa-tips', publisher: 'Medium post', purpose: 'background' },
        ],
      }),
      'low-value citation host',
    )
  })

  it('accepts canonical official sources for the region/topic context', () => {
    expect(() => assertValidContentSpec(createContentSpec(BASE))).not.toThrow()
    expect(
      validateContentSpec(
        specWith({
          approvedSources: [
            { url: 'https://www.gov.uk/student-visa', publisher: 'UK Home Office', purpose: 'official policy' },
          ],
        }),
      ).filter((i) => i.startsWith('approvedSources')),
    ).toEqual([])
  })

  it('accepts a non-cream source only with well-formed link-audit provenance evidence', () => {
    // NMC is a nursing-board authority: citable only when the job is about
    // nursing. This Skilled Worker job must therefore supply explicit
    // live-verification provenance to cite it at all.
    const source = {
      url: 'https://www.nmc.org.uk/registration/join-the-register',
      publisher: 'Nursing and Midwifery Council',
      purpose: 'live-checked issuing-body reference',
      provenance: {
        evidence: 'link-audit' as const,
        verifiedAt: '2026-08-28T00:00:00.000Z',
        contentHash: 'a'.repeat(64),
      },
    }
    const nmcIssue = (approvedSources: unknown[]) =>
      (validateContentSpec({ ...createContentSpec(BASE), approvedSources } as unknown as CreateContentSpecInput) || [])
        .filter((i) => i.includes('approvedSources'))
    expect(
      nmcIssue([{ ...source, provenance: undefined }]),
    ).toEqual(['approvedSources: "https://www.nmc.org.uk/registration/join-the-register" is not a canonical official source for this job and carries no provenance evidence'])
    expect(nmcIssue([source])).toEqual([])
    expectIssues(
      specWith({
        approvedSources: [
          {
            ...source,
            provenance: { evidence: 'planner' as never, verifiedAt: '2026-08-28T00:00:00.000Z' },
          },
        ],
      }),
      'is not a canonical official source for this job and carries no provenance evidence',
    )
    expectIssues(
      specWith({
        approvedSources: [
          {
            ...source,
            provenance: { evidence: 'link-audit' as const, verifiedAt: '2026-08-28T00:00:00.000Z', contentHash: 'zzz' },
          },
        ],
      }),
      'is not a canonical official source for this job and carries no provenance evidence',
    )
  })

  it('rejects malformed keyword records and duplicate phrases', () => {
    expectIssues(
      specWith({
        requiredKeywords: [{ phrase: '', kind: 'short' }],
      }),
      'phrase missing or empty',
    )
    expectIssues(
      specWith({
        requiredKeywords: [
          { phrase: 'skilled worker visa', kind: 'short' },
          { phrase: 'Skilled Worker Visa', kind: 'short' },
        ],
      }),
      'duplicate phrase',
    )
  })

  it('rejects an incoherent word budget', () => {
    expectIssues(specWith({ wordBudget: { min: 2800, target: 2500, max: 2200 } }), 'min ≤ target ≤ max')
    expectIssues(specWith({ wordBudget: { min: 0, target: 100, max: 200 } }), 'must be positive')
  })

  it('rejects a target whose canonicalUrl does not match host + path', () => {
    expectIssues(
      specWith({
        target: {
          canonicalUrl: 'https://other-host.com/legal/uk-skilled-worker-visa',
          host: 'yousafeconsultancy.com',
          path: '/legal/uk-skilled-worker-visa',
        },
      }),
      'does not match host + path',
    )
  })

  it('rejects a missing or non-ISO provenance timestamp and malformed source hashes', () => {
    const spec = createContentSpec(BASE)
    expect(
      validateContentSpec({ ...spec, provenance: { ...spec.provenance, generatedAt: 'not-a-date' } }).join('\n'),
    ).toContain('generatedAt')
    expect(
      validateContentSpec({ ...spec, provenance: { ...spec.provenance, sourceHashes: { ownership: '' } } }).join('\n'),
    ).toContain('malformed entry')
  })

  it('rejects an unknown content type or region outright', () => {
    expectIssues(specWith({ contentType: 'landing_zone' as never }), 'unknown content type')
    expectIssues(specWith({ region: 'mars' as never }), 'unknown region')
  })
})

describe('assertValidContentSpec', () => {
  it('throws with every issue listed for an invalid spec', () => {
    expect(() =>
      assertValidContentSpec({ ...createContentSpec(BASE), jobId: '', region: 'mars' as never }),
    ).toThrow(/content spec validation failed/)
  })
})

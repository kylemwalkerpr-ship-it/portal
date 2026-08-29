/**
 * Content Quality Playbook registry tests (implementation brief §7.1, §7.2).
 *
 * Registry completeness: every code emitted by the quality, audit, depth,
 * link, Ahrefs, and master-engine evaluators exists in the registry exactly
 * once, with a consistent severity/owner/repair class. Prompt parity: one
 * fixed ContentSpec renders the same versioned core requirements to brief,
 * writer, and reviewer.
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  CONTENT_QUALITY_PLAYBOOK,
  PLAYBOOK_VERSION,
  gate,
  lookupGate,
  ownerFor,
  playbookManifest,
  renderBriefRules,
  renderReviewerRules,
  renderWriterRules,
  repairClassFor,
  severityFor,
  assertRegisteredFindingCodes,
  type GateSeverity,
} from '@/lib/seoFactory/contentQualityPlaybook'

const EVALUATOR_FILES = [
  'contentQualityGate.ts',
  'audit.ts',
  'contentDepth.ts',
  'linkAudit.ts',
  'ahrefsIssues.ts',
  'masterEngine.ts',
]

/** Codes the evaluator modules can emit, extracted from their source. */
function emittedCodes(): Set<string> {
  const codes = new Set<string>()
  for (const f of EVALUATOR_FILES) {
    const src = fs.readFileSync(path.join(process.cwd(), 'lib/seoFactory', f), 'utf8')
    for (const m of src.matchAll(/\b(?:code|gateCode):\s*'([a-z0-9_]+)'/g)) codes.add(m[1])
  }
  return codes
}

const VALID_SPEC = {
  version: PLAYBOOK_VERSION,
  jobId: 'job-2026-001',
  contentType: 'legal_guide',
  region: 'uk',
  indexable: true,
  primaryKeyword: 'uk skilled worker visa',
  requiredKeywords: [
    { phrase: 'skilled worker visa', kind: 'short' as const },
    { phrase: 'how to apply for a uk skilled worker visa', kind: 'long_tail' as const },
  ],
  wordBudget: { min: 2200, target: 2500, max: 2800 },
  verifiedEstateLinks: [
    { url: 'https://yousafeconsultancy.com/legal/uk-visas', anchor: 'UK visa guides', role: 'hub' as const },
  ],
  approvedSources: [
    { url: 'https://www.gov.uk/skilled-worker-visa', publisher: 'UK Home Office', purpose: 'official policy' },
  ],
  ymyl: { disclaimerRequired: true },
  aeoGeo: { answerFirst: true, faqRequired: true },
}

describe('CONTENT_QUALITY_PLAYBOOK registry structure', () => {
  it('has no duplicate codes and every code is a non-empty string', () => {
    const codes = CONTENT_QUALITY_PLAYBOOK.map((g) => g.code)
    expect(codes.length).toBeGreaterThan(0)
    expect(new Set(codes).size).toBe(codes.length)
    for (const g of CONTENT_QUALITY_PLAYBOOK) expect(typeof g.code).toBe('string')
  })

  it('every gate has a valid severity, owner, repair class, and ship effect', () => {
    const severities: GateSeverity[] = ['format_blocker', 'blocker', 'warning', 'info']
    const owners = ['brief', 'writer', 'deterministic', 'reviewer', 'human']
    const repairClasses = ['deterministic', 'targeted_ai', 'human_only']
    const shipEffects = ['block', 'allow_with_flag', 'advisory']
    for (const g of CONTENT_QUALITY_PLAYBOOK) {
      expect(severities).toContain(g.severity)
      expect(owners).toContain(g.owner)
      expect(repairClasses).toContain(g.repairClass)
      expect(shipEffects).toContain(g.shipEffect)
      expect(g.requirement.length).toBeGreaterThan(0)
      expect(g.promptInstruction.length).toBeGreaterThan(0)
      expect(g.evidence.length).toBeGreaterThan(0)
      expect(g.testFixture.length).toBeGreaterThan(0)
    }
  })

  it('every format_blocker blocks ship and every blocker has an evidence/repair owner', () => {
    for (const g of CONTENT_QUALITY_PLAYBOOK) {
      if (g.severity === 'format_blocker') expect(g.shipEffect).toBe('block')
      if (g.severity === 'blocker') {
        expect(g.shipEffect).toBe('block')
        expect(g.owner).not.toBe('human')
      }
    }
  })
})

describe('registry completeness (test matrix §7.1)', () => {
  it('every code emitted by the quality, audit, depth, link, Ahrefs, and master evaluators is registered', () => {
    const registered = new Set(CONTENT_QUALITY_PLAYBOOK.map((g) => g.code))
    const missing = [...emittedCodes()].filter((c) => !registered.has(c))
    expect(missing).toEqual([])
  })

  it('the evaluator source scan is not vacuous', () => {
    expect(emittedCodes().size).toBeGreaterThan(50)
  })
})

describe('lookup helpers', () => {
  it('gate()/severityFor()/ownerFor()/repairClassFor() resolve a registered code', () => {
    const g = gate('keyword_stuffing')
    expect(g.severity).toBe('blocker')
    expect(severityFor('keyword_stuffing')).toBe('blocker')
    expect(ownerFor('keyword_stuffing')).toBe('writer')
    expect(repairClassFor('keyword_stuffing')).toBe('targeted_ai')
  })

  it('gate() throws for an unregistered code and lookupGate() returns undefined', () => {
    expect(lookupGate('not_a_real_code')).toBeUndefined()
    expect(() => gate('not_a_real_code')).toThrow(/unknown gate code/)
    expect(() => gate('')).toThrow(/unknown gate code/)
  })
})

describe('assertRegisteredFindingCodes', () => {
  it('accepts findings whose severities match the registry', () => {
    expect(() =>
      assertRegisteredFindingCodes([
        { code: 'keyword_stuffing', severity: 'blocker' },
        { code: 'wall_of_text', severity: 'warning' },
        { code: 'robots_noindex', severity: 'pass' },
      ]),
    ).not.toThrow()
  })

  it('rejects an unregistered finding code', () => {
    expect(() => assertRegisteredFindingCodes([{ code: 'made_up_code' }])).toThrow(/unknown gate code/)
  })

  it('rejects a live blocker whose registered shipEffect or severity no longer blocks (no silent downgrade)', () => {
    expect(() =>
      assertRegisteredFindingCodes([{ code: 'wall_of_text', severity: 'blocker' }]),
    ).toThrow(/live blocker/)
    expect(() =>
      assertRegisteredFindingCodes([{ code: 'keyword_stuffing', severity: 'warning' }]),
    ).toThrow(/live warning/)
  })
})

describe('playbookManifest', () => {
  it('reports consistent counts and the current version', () => {
    const m = playbookManifest()
    expect(m.playbookVersion).toBe(PLAYBOOK_VERSION)
    expect(m.gateCount).toBe(CONTENT_QUALITY_PLAYBOOK.length)
    expect(m.codes).toHaveLength(CONTENT_QUALITY_PLAYBOOK.length)
    expect(new Set(m.codes).size).toBe(m.gateCount)
    const total = Object.values(m.bySeverity).reduce((a, b) => a + b, 0)
    expect(total).toBe(m.gateCount)
    expect(m.shipBlockingCodes).toContain('keyword_stuffing')
    expect(m.shipBlockingCodes).toContain('tldr_format_invalid')
  })
})

describe('prompt parity (test matrix §7.2)', () => {
  const brief = renderBriefRules(VALID_SPEC)
  const writer = renderWriterRules(VALID_SPEC)
  const reviewer = renderReviewerRules([{ code: 'keyword_stuffing', severity: 'blocker' }], VALID_SPEC)

  it('brief, writer, and reviewer renders carry the same playbook version and job id', () => {
    for (const render of [brief, writer, reviewer]) {
      expect(render).toContain(`CONTENT QUALITY PLAYBOOK ${PLAYBOOK_VERSION}`)
      expect(render).toContain('job-2026-001')
    }
  })

  it('all three renders share the identical versioned core requirements for the job', () => {
    const bullets = (render: string) => render.split('\n').filter((l) => l.startsWith('- '))
    const briefBullets = bullets(brief)
    // The shared core: every brief bullet that is a spec fact (not the two
    // brief-specific closing rules) must appear verbatim in writer + reviewer.
    const core = briefBullets.filter((l) => !l.startsWith('- The brief '))
    for (const line of core) {
      expect(bullets(writer)).toContain(line)
      expect(bullets(reviewer)).toContain(line)
    }
  })

  it('each render names the type, region, budget, keywords, verified links, and approved sources', () => {
    for (const render of [brief, writer, reviewer]) {
      expect(render).toContain('legal_guide')
      expect(render).toContain('uk')
      expect(render).toContain('min 2200 · target 2500 · max 2800')
      expect(render).toContain('skilled worker visa')
      expect(render).toContain('https://yousafeconsultancy.com/legal/uk-visas')
      expect(render).toContain('https://www.gov.uk/skilled-worker-visa')
    }
  })

  it('the reviewer render lists only the outstanding finding instructions and no others', () => {
    expect(reviewer).toContain('[keyword_stuffing]')
    expect(reviewer).not.toContain('[missing_faq]')
    expect(reviewer).toContain('never regenerate the document')
  })

  it('optional keywords render as info-only, never force-fit', () => {
    const render = renderWriterRules({
      ...VALID_SPEC,
      requiredKeywords: [...VALID_SPEC.requiredKeywords, { phrase: 'rare edge query', kind: 'short', optional: true }],
    })
    expect(render).toContain('Optional keywords (info only; never force-fit): rare edge query')
  })
})

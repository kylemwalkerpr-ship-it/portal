/**
 * Milestone B wiring tests: spec snapshot identity across stages (brief
 * §7.2/§7.3) and registry-driven prompt rendering (§2.1 — one registry; no
 * duplicated policy prose).
 */
import {
  resolveContentSpecForJob,
  reviveContentSpec,
  serializeContentSpec,
  validateContentSpec,
} from '@/lib/seoFactory/contentSpec'
import { buildFactorySystemPrompt } from '@/lib/seoFactory/prompts'
import {
  PLAYBOOK_VERSION,
  renderBriefRules,
  renderReviewerRules,
  renderWriterRules,
} from '@/lib/seoFactory/contentQualityPlaybook'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'

const ARGS = {
  jobId: 'job-wire-1',
  contentType: 'legal_guide',
  region: 'UK',
  indexable: true,
  canonicalUrl: 'https://yousafeconsultancy.com/legal/uk-skilled-worker-visa',
  primaryKeyword: 'uk skilled worker visa',
  requiredShortKeywords: ['skilled worker visa', 'uk work visa'],
  requiredLongTailKeywords: ['how to apply for a uk skilled worker visa'],
  verifiedSourceUrls: ['https://www.gov.uk/skilled-worker-visa'],
  outline: ['Eligibility', 'Application process', 'FAQ'],
  topic: 'uk skilled worker visa requirements',
  minWords: 1200,
  targetWords: 1600,
  maxWords: 2400,
}

const PLAN: OwnerPlan = {
  host: 'apex',
  repo: 'yousafe-portal',
  filePath: 'content/legal/uk-skilled-worker-visa.md',
  canonicalUrl: ARGS.canonicalUrl,
  contentType: 'legal_guide',
  indexable: true,
  intentClass: 'informational',
  action: 'create',
  routingSource: 'registry',
  matched: null,
  blockers: [],
} as unknown as OwnerPlan

describe('resolveContentSpecForJob — one spec per job', () => {
  it('resolves and validates exactly one spec from pipeline inputs', () => {
    const { spec, reason, issues } = resolveContentSpecForJob(ARGS)
    expect(reason).toBeUndefined()
    expect(issues).toBeUndefined()
    expect(spec).toBeTruthy()
    expect(spec!.version).toBe(PLAYBOOK_VERSION)
    expect(spec!.region).toBe('uk')
    expect(spec!.wordBudget).toEqual({ min: 1200, target: 1600, max: 2400 })
    expect(spec!.approvedSources.map((s) => s.url)).toEqual(['https://www.gov.uk/skilled-worker-visa'])
    expect(spec!.approvedSources[0].provenance?.evidence).toBe('link-audit')
    expect(validateContentSpec(spec)).toEqual([])
  })

  it('fails closed and safe — invalid inputs keep the pre-spec (null) behavior', () => {
    const bad = resolveContentSpecForJob({ ...ARGS, canonicalUrl: 'not a url' })
    expect(bad.spec).toBeNull()
    expect(bad.reason).toBeTruthy()
    const missing = resolveContentSpecForJob({ ...ARGS, primaryKeyword: '' })
    expect(missing.spec).toBeNull()
  })

  it('canonicalizes duplicate legacy outline sections before validation', () => {
    const result = resolveContentSpecForJob({
      ...ARGS,
      outline: ['In 60 seconds', 'Related guides', ' related   guides ', 'FAQ', 'FAQ'],
    })
    expect(result.spec).toBeTruthy()
    expect(result.spec?.requiredSections).toEqual(['In 60 seconds', 'Related guides', 'FAQ'])
    expect(result.spec?.outline.map((entry) => entry.heading)).toEqual(['In 60 seconds', 'Related guides', 'FAQ'])
    expect(validateContentSpec(result.spec)).toEqual([])
  })

  it('deduplicates keyword phrases crossing legacy short and long-tail arrays', () => {
    const result = resolveContentSpecForJob({
      ...ARGS,
      requiredShortKeywords: ['Skilled worker visa', ' skilled   worker visa '],
      requiredLongTailKeywords: ['SKILLED WORKER VISA', 'how to apply for a skilled worker visa'],
    })
    expect(result.spec?.requiredKeywords.map((keyword) => keyword.phrase)).toEqual([
      'Skilled worker visa',
      'how to apply for a skilled worker visa',
    ])
    expect(validateContentSpec(result.spec)).toEqual([])
  })

  it('keeps spec snapshot identity: serialize → parse → revive round-trips byte-for-byte', () => {
    const { spec } = resolveContentSpecForJob(ARGS)
    if (!spec) throw new Error('spec must resolve')
    const snapshot = serializeContentSpec(spec)
    const parsed = JSON.parse(snapshot)
    const revived = reviveContentSpec(parsed)
    expect(revived).toBeTruthy()
    // Same immutable snapshot at every stage — identical serialization.
    expect(serializeContentSpec(revived!)).toBe(snapshot)
    expect(revived).toEqual(JSON.parse(snapshot))
  })

  it('reviveContentSpec rejects invalid or absent snapshots without weakening', () => {
    expect(reviveContentSpec(null)).toBeNull()
    expect(reviveContentSpec({})).toBeNull()
    expect(reviveContentSpec(JSON.parse(serializeContentSpec({ ...resolveContentSpecForJob(ARGS).spec!, version: '0.0.1' } as any)))).toBeNull()
  })
})

describe('registry-driven prompt projections', () => {
  const { spec } = resolveContentSpecForJob(ARGS)
  if (!spec) throw new Error('spec must resolve')

  it('brief, writer, and reviewer renders share the same version and facts', () => {
    const snapshot = JSON.parse(serializeContentSpec(spec))
    const brief = renderBriefRules(spec)
    const writer = renderWriterRules(spec)
    const reviewer = renderReviewerRules([{ code: 'outcome_promise' }], snapshot)
    for (const rendered of [brief, writer, reviewer]) {
      expect(rendered).toContain(PLAYBOOK_VERSION)
      expect(rendered).toContain('uk skilled worker visa')
      expect(rendered).toContain('https://www.gov.uk/skilled-worker-visa')
    }
    // The same snapshot renders identical core requirements to writer and reviewer.
    const core = (s: string) => s.split('\n').filter((l) => l.startsWith('- Word budget') || l.startsWith('- Primary keyword'))
    expect(core(writer)).toEqual(core(reviewer))
  })

  it('buildFactorySystemPrompt renders writer rules + allowlists from the spec', () => {
    const prompt = buildFactorySystemPrompt({
      plan: PLAN,
      contentType: 'legal_guide',
      minWords: 1200,
      requiredShortKeywords: ['legacy-short-kw-not-in-spec'],
      spec,
    })
    expect(prompt).toContain('CONTENT QUALITY PLAYBOOK — BRIEF RULES')
    expect(prompt).toContain('CONTENT QUALITY PLAYBOOK — WRITER RULES')
    expect(prompt).toContain(PLAYBOOK_VERSION)
    expect(prompt).toContain('https://www.gov.uk/skilled-worker-visa')
    // Legacy keyword array NOT in the spec is never rendered — the spec is
    // the single source of required keywords.
    expect(prompt).not.toContain('legacy-short-kw-not-in-spec')
  })

  it('buildFactorySystemPrompt without a spec keeps legacy behavior (safe adapter)', () => {
    const prompt = buildFactorySystemPrompt({
      plan: PLAN,
      contentType: 'legal_guide',
      minWords: 1200,
      requiredShortKeywords: ['legacy-short-kw'],
      requiredLongTailKeywords: ['legacy long tail keyword phrase here'],
      sources: ['https://www.gov.uk/skilled-worker-visa'],
    })
    expect(prompt).not.toContain('CONTENT QUALITY PLAYBOOK — WRITER RULES')
    expect(prompt).toContain('legacy-short-kw')
    expect(prompt).toContain('https://www.gov.uk/skilled-worker-visa')
  })

  it('spec-present prompts are deterministic for the same snapshot', () => {
    const a = buildFactorySystemPrompt({ plan: PLAN, contentType: 'legal_guide', minWords: 1200, spec })
    const b = buildFactorySystemPrompt({ plan: PLAN, contentType: 'legal_guide', minWords: 1200, spec: JSON.parse(serializeContentSpec(spec)) })
    expect(a).toBe(b)
  })
})

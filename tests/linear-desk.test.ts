/**
 * Linear desk: one conversation, explore CoT, sealed brief, self-reflection.
 */
import { buildFactorySystemPrompt } from '@/lib/seoFactory/prompts'
import {
  LINEAR_CONVERSATION_ADDENDUM,
  buildDiscoverBlock,
  deskPhaseAiOpts,
  linearDeskSystem,
  renderDeskConversation,
  runLinearDesk,
  shouldRunLinearDesk,
} from '@/lib/seoFactory/linearDesk'
import {
  parseSealedBrief,
  sealBriefFromAssembly,
  validateSealedBrief,
  executeBriefPrompt,
} from '@/lib/seoFactory/sealedBrief'
import {
  parseExplore,
  parseReflection,
  needsRewrite,
  stripDeskThinking,
  mergeExploreIntoBrief,
  explorePrompt,
  reflectPrompt,
  scoreExplore,
  scoreReflection,
  REFLECTION_SHIP_FLOOR,
} from '@/lib/seoFactory/deskCognition'
import { deskLayoutPromptBlock } from '@/lib/seoFactory/deskLayout'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'
import type { QualityGateResult } from '@/lib/seoFactory/contentQualityGate'

const plan = {
  host: 'legal.yousafeconsultancy.com',
  repo: 'caseworks',
  canonicalUrl: 'https://legal.yousafeconsultancy.com/h-1b-visa',
  filePath: 'app/h-1b-visa/page.tsx',
  routingSource: 'test',
  intentClass: 'informational',
  action: 'create',
  indexable: true,
  blockers: [],
} as unknown as OwnerPlan

const EXPLORE_JSON = JSON.stringify({
  readerQuestion: 'What must be in the packet before an H-1B can be filed this season?',
  evidenceWeHave: [
    'USCIS H-1B specialty occupation page',
    'specialty occupation as a demand topic',
  ],
  wouldHaveToInvent: ['USCIS filing fee for 2026'],
  argumentSpine: 'You file an H-1B only after the LCA is certified and the packet is complete.',
  chapterPlan: [
    { heading: 'Who this path is actually for', because: 'Constraint first', covers: ['specialty occupation'] },
    { heading: 'Documents you gather next', because: 'Named artefacts', covers: ['labor condition'], continues: 'Eligibility named who can file' },
  ],
  kitRisks: ['Eligibility H2 restating the thesis as a mini-guide'],
  gateWatch: [
    'stuffed_primary_opener',
    'keyword_stuffing',
    'keyword_pasted_heading',
    'faq_duplicates_h2',
    'missing_tldr',
    'missing_faq',
    'sentence_start_repetition',
  ],
  takeawayClaims: [
    'The certified LCA must sit with Form I-129 before USCIS will accept the petition.',
    'Premium processing changes the wait, not the evidence bar.',
    'A missing document at filing usually becomes a request for evidence, not an instant refusal.',
  ],
  faqThatDoesNotEchoH2s: [
    'What happens if a required document is missing at filing?',
    'Can I start this process while my current permission is still valid?',
  ],
})

const BRIEF_JSON = JSON.stringify({
  thesis: 'You file an H-1B only after the LCA is certified and the packet is complete.',
  takeaways: [
    'The certified LCA must sit with Form I-129 before USCIS will accept the petition.',
    'Premium processing changes the wait, not the evidence bar.',
    'A missing document at filing usually becomes a request for evidence, not an instant refusal.',
  ],
  lede: 'Answer whether the reader can file this season, then name the document that usually blocks the window.',
  outline: [
    { heading: 'In 60 seconds', purpose: 'Complete claims', bridgeFrom: '', coverTopics: [], format: 'takeaways' },
    { heading: 'Who this path is actually for', purpose: 'Constraint', bridgeFrom: '', coverTopics: ['specialty occupation'], format: 'prose' },
    { heading: 'Documents you gather next', purpose: 'Artefacts', bridgeFrom: 'Eligibility named who can file', coverTopics: [], format: 'bullets' },
    { heading: 'Filing sequence', purpose: 'Numbered steps', bridgeFrom: 'The packet is complete', coverTopics: [], format: 'steps' },
    { heading: 'Costs and timing', purpose: 'Fees and waits', bridgeFrom: 'Sequence filed', coverTopics: [], format: 'table' },
    { heading: 'FAQ', purpose: 'Unsettled questions', bridgeFrom: '', coverTopics: [], format: 'faq' },
    { heading: 'Sources', purpose: 'Allowlist URLs', bridgeFrom: '', coverTopics: [], format: 'sources' },
  ],
  faqQuestions: [
    'What happens if a required document is missing at filing?',
    'Can I start this process while my current permission is still valid?',
    'Which official page should I re-check the week I file?',
    'What should I do if the decision is a refusal or a request for evidence?',
  ],
  unresolved: [],
})

const DRAFT = `---
title: H-1B visa
description: Practical filing steps with official sources for H-1B petitions in 2026.
primaryKeyword: h-1b visa
---

# H-1B visa

You file after the LCA is certified. That is the constraint that surprises most first-time petitioners.

## In 60 seconds
- The certified LCA must sit with Form I-129 before USCIS will accept the petition.
- Premium processing changes the wait, not the evidence bar.
- A missing document at filing usually becomes a request for evidence.

## Who this path is actually for

Specialty occupation work still has to match the degree. The LCA you just certified is the first artefact the officer will look for.

## Documents you gather next

Keep the certified LCA with the passport and the I-129 packet. USCIS issues a receipt once that packet is in.

## FAQ

### What happens if a required document is missing at filing?

USCIS usually issues a request for evidence rather than a silent refusal.

## Sources

- [USCIS](https://www.uscis.gov/)

**Disclaimer:** This page is educational and editorial only. It is **not legal advice**.
`

const blockedQuality = (): QualityGateResult => ({
  ok: false,
  findings: [{ code: 'thin_content', severity: 'blocker', message: 'thin', fix: 'expand' }],
  blockers: [{ code: 'thin_content', severity: 'blocker', message: 'thin', fix: 'expand' }],
  warnings: [],
  humanScore: 70,
  summary: 'blocked',
})

const cleanQuality = (): QualityGateResult => ({
  ok: true,
  findings: [],
  blockers: [],
  warnings: [],
  humanScore: 90,
  summary: 'ok',
})

describe('desk layout (Alma-grade, YouSafe voice)', () => {
  it('puts complete-claim takeaways first and forbids mill openers', () => {
    const lines = deskLayoutPromptBlock('legal_guide').join('\n')
    expect(lines).toMatch(/IN 60 SECONDS is the takeaways slot/)
    expect(lines).toMatch(/complete claims/)
    expect(lines).toMatch(/This section covers/)
    expect(lines).not.toMatch(/99%/)
  })

  it('uses Key Takeaways on blogs instead of the legal kit', () => {
    const lines = deskLayoutPromptBlock('blog_post').join('\n')
    expect(lines).toMatch(/KEY TAKEAWAYS first/)
    expect(lines).toMatch(/Do not force FAQ, TOC, or In 60 seconds on blogs/)
  })
})

describe('sealed brief — no guesswork', () => {
  it('rejects keyword-fragment takeaways and FAQ that restates an H2', () => {
    const parsed = parseSealedBrief(JSON.stringify({
      thesis: 'h-1b visa',
      takeaways: ['h-1b visa', 'specialty occupation', 'labor condition'],
      lede: 'short',
      outline: [
        { heading: 'Eligibility and requirements', purpose: '', bridgeFrom: '' },
        { heading: 'Documents', purpose: 'Named artefacts', bridgeFrom: '' },
      ],
      faqQuestions: ['What are the eligibility and requirements?'],
      unresolved: ['USCIS filing fee for 2026'],
    }))
    expect(parsed.ok).toBe(false)
    expect(parsed.issues.some((i) => /thesis/.test(i))).toBe(true)
    expect(parsed.issues.some((i) => /takeaways/.test(i))).toBe(true)
    expect(parsed.issues.some((i) => /bridgeFrom/.test(i))).toBe(true)
    expect(parsed.issues.some((i) => /faqQuestions/.test(i))).toBe(true)
    expect(parsed.issues.some((i) => /unresolved/.test(i))).toBe(false)
  })

  it('accepts complete claims, bridges, and FAQ that does not echo H2s', () => {
    const brief = {
      thesis: 'You file an H-1B only after the LCA is certified and the packet is complete.',
      takeaways: [
        'The certified LCA must sit with Form I-129 before USCIS will accept the petition.',
        'Premium processing changes the wait, not the evidence bar.',
        'A missing document at filing usually becomes a request for evidence, not an instant refusal.',
      ],
      lede: 'Answer whether the reader can file this season, then name the document that usually blocks the window.',
      outline: [
        { heading: 'In 60 seconds', purpose: 'Complete claims', bridgeFrom: '', coverTopics: [], format: 'takeaways' as const },
        { heading: 'Who this path is actually for', purpose: 'The constraint that disqualifies guesswork', bridgeFrom: '', coverTopics: ['specialty occupation'], format: 'prose' as const },
        { heading: 'Documents you gather next', purpose: 'Named artefacts in officer order', bridgeFrom: 'Eligibility already named who can file', coverTopics: ['labor condition'], format: 'bullets' as const },
        { heading: 'Filing sequence', purpose: 'Numbered steps', bridgeFrom: 'The packet is complete', coverTopics: [], format: 'steps' as const },
        { heading: 'Costs and timing', purpose: 'What it costs and how long each stage takes', bridgeFrom: 'The sequence is filed', coverTopics: [], format: 'table' as const },
        { heading: 'FAQ', purpose: 'Questions the H2s did not settle', bridgeFrom: '', coverTopics: [], format: 'faq' as const },
      ],
      faqQuestions: [
        'What happens if a required document is missing at filing?',
        'Can I start this process while my current permission is still valid?',
        'Which official page should I re-check the week I file?',
        'What should I do if the decision is a refusal or a request for evidence?',
      ],
      unresolved: [],
    }
    expect(validateSealedBrief(brief, { primaryKeyword: 'h-1b visa', contentType: 'legal_guide' })).toEqual([])
    expect(validateSealedBrief({ ...brief, unresolved: ['USCIS filing fee for 2026'] }, { primaryKeyword: 'h-1b visa', contentType: 'legal_guide' })).toEqual([])
  })

  it('fills missing plan fields from the operator outline instead of leaving the writer to guess', () => {
    const sealed = sealBriefFromAssembly({
      primaryKeyword: 'h-1b visa',
      audience: 'specialty occupation workers',
      contentType: 'legal_guide',
      h2Outline: ['In 60 seconds', 'Eligibility', 'Documents', 'Process', 'FAQ', 'Sources'],
      kwH2Map: { 'specialty occupation': 'Eligibility', 'labor condition': 'Documents' },
    })
    expect(sealed.thesis.length).toBeGreaterThan(24)
    expect(sealed.takeaways.length).toBeGreaterThanOrEqual(3)
    expect(sealed.outline.find((c) => c.heading === 'Documents')?.bridgeFrom).toMatch(/Eligibility/)
    expect(sealed.outline.find((c) => c.heading === 'Eligibility')?.coverTopics).toContain('specialty occupation')
    expect(sealed.faqQuestions.some((q) => /eligibility/i.test(q) && /requirements/i.test(q))).toBe(false)
  })
})

describe('explore + self-reflection cognition', () => {
  it('parses explore JSON and folds wouldHaveToInvent into unresolved', () => {
    const explore = parseExplore(EXPLORE_JSON)
    expect(explore?.argumentSpine).toMatch(/LCA is certified/)
    expect(explore?.wouldHaveToInvent).toContain('USCIS filing fee for 2026')
    const merged = mergeExploreIntoBrief({
      thesis: 'You file an H-1B only after the LCA is certified and the packet is complete.',
      takeaways: ['The certified LCA must sit with Form I-129 before USCIS will accept the petition.'],
      faqQuestions: [],
      unresolved: [],
    }, explore)
    expect(merged.unresolved).toContain('USCIS filing fee for 2026')
    expect(merged.faqQuestions[0]).toMatch(/missing at filing/)
    const withOutline = mergeExploreIntoBrief({
      thesis: '',
      takeaways: [],
      faqQuestions: [],
      unresolved: [],
      outline: [
        { heading: 'Who this path is actually for', purpose: '', bridgeFrom: '', coverTopics: [] as string[], format: 'prose' },
        { heading: 'Documents you gather next', purpose: '', bridgeFrom: '', coverTopics: [] as string[], format: 'prose' },
      ],
    }, explore)
    expect(withOutline.takeaways.length).toBeGreaterThanOrEqual(3)
    expect(withOutline.outline?.[1]?.bridgeFrom).toMatch(/who can file/i)
    expect(withOutline.outline?.[0]?.purpose).toMatch(/Constraint first/)
  })

  it('infers revise when stuffing is named even without an explicit verdict', () => {
    const reflection = parseReflection(JSON.stringify({
      throughline: 'holds',
      stuffing: ['primary keyword as the H1 opener'],
      kitSplices: [],
      guesswork: [],
      layout: [],
      gateRisks: [],
      revisePlan: ['Open on the constraint, not the keyword.'],
    }))
    expect(reflection?.verdict).toBe('revise')
    expect(needsRewrite(reflection, false)).toBe(true)
    expect(needsRewrite({ ...reflection!, verdict: 'ship', stuffing: [], kitSplices: [], guesswork: [], layout: [], gateRisks: [] }, false)).toBe(false)
    expect(needsRewrite({ ...reflection!, verdict: 'ship' }, true)).toBe(true)
  })

  it('strips think tags and leaked explore JSON from the published body', () => {
    const leaked = [
      '<think>The keyword density looks low. I should paste h-1b visa again.</think>',
      EXPLORE_JSON,
      '',
      DRAFT,
    ].join('\n')
    const cleaned = stripDeskThinking(leaked)
    expect(cleaned).toMatch(/# H-1B visa/)
    expect(cleaned).not.toMatch(/<think>/)
    expect(cleaned).not.toMatch(/wouldHaveToInvent/)
    expect(cleaned).not.toMatch(/paste h-1b visa again/)
  })

  it('asks explore for named chain-of-thought patterns and reflect for a JSON verdict, not a rewrite', () => {
    expect(explorePrompt()).toMatch(/EXPLORE/)
    expect(explorePrompt()).toMatch(/READER_QUESTION/)
    expect(explorePrompt()).toMatch(/CHAPTER_CONTINUITY/)
    expect(explorePrompt()).toMatch(/GATE_WATCH/)
    expect(explorePrompt()).toMatch(/stuffed_primary_opener/)
    expect(explorePrompt()).toMatch(/keyword_pasted_heading/)
    expect(explorePrompt()).toMatch(/wouldHaveToInvent/)
    expect(explorePrompt()).toMatch(/never be published/)
    expect(reflectPrompt()).toMatch(/SELF-REFLECT/)
    expect(reflectPrompt()).toMatch(/Return ONLY a JSON object/)
    expect(reflectPrompt()).toMatch(/automated score/)
    expect(reflectPrompt()).not.toMatch(/complete corrected markdown article/)
  })
})

describe('automated explore patterns and reflection scoring', () => {
  it('scores a complete explore as ready and flags missing patterns', () => {
    const complete = scoreExplore(parseExplore(EXPLORE_JSON), { primaryKeyword: 'h-1b visa' })
    expect(complete.missing).toEqual([])
    expect(complete.score).toBeGreaterThanOrEqual(70)
    expect(complete.patterns.every((p) => p.ok)).toBe(true)

    const thin = scoreExplore(parseExplore(JSON.stringify({
      readerQuestion: 'h-1b visa',
      evidenceWeHave: [],
      wouldHaveToInvent: [],
      argumentSpine: 'h-1b visa',
      chapterPlan: [],
      kitRisks: [],
      gateWatch: [],
      takeawayClaims: ['h-1b visa'],
      faqThatDoesNotEchoH2s: [],
    })), { primaryKeyword: 'h-1b visa' })
    expect(thin.score).toBeLessThan(70)
    expect(thin.missing).toEqual(expect.arrayContaining([
      'READER_QUESTION',
      'EVIDENCE_MAP',
      'ARGUMENT_SPINE',
      'CHAPTER_CONTINUITY',
      'KIT_RISK',
      'GATE_WATCH',
      'TAKEAWAY_CLAIMS',
      'FAQ_GAP',
    ]))
  })

  it('fails an optimistic ship when the draft has a mill opener', () => {
    const millDraft = DRAFT.replace(
      'Specialty occupation work still has to match the degree. The LCA you just certified is the first artefact the officer will look for.',
      'This section covers everything you need to know about the h-1b visa petition in 2026.',
    )
    const reflection = parseReflection(JSON.stringify({
      throughline: 'one argument holds across chapters',
      guesswork: [],
      stuffing: [],
      kitSplices: [],
      layout: [],
      gateRisks: [],
      verdict: 'ship',
      revisePlan: [],
    }))
    const millScore = scoreReflection({
      content: millDraft,
      quality: cleanQuality(),
      reflection,
      explore: parseExplore(EXPLORE_JSON),
      unresolved: ['USCIS filing fee for 2026'],
      primaryKeyword: 'h-1b visa',
    })
    expect(millScore.pass).toBe(false)
    expect(millScore.floor).toBe(REFLECTION_SHIP_FLOOR)
    expect(millScore.reasons.some((r) => /mill opener/i.test(r))).toBe(true)
    expect(needsRewrite(reflection, false, millScore)).toBe(true)

    const cleanScore = scoreReflection({
      content: DRAFT,
      quality: cleanQuality(),
      reflection,
      explore: parseExplore(EXPLORE_JSON),
      unresolved: ['USCIS filing fee for 2026'],
      primaryKeyword: 'h-1b visa',
    })
    expect(cleanScore.pass).toBe(true)
    expect(needsRewrite(reflection, false, cleanScore)).toBe(false)
  })

  it('fails when the model says ship while ship blockers are still open', () => {
    const reflection = parseReflection(JSON.stringify({
      throughline: 'one argument holds across chapters',
      guesswork: [],
      stuffing: [],
      kitSplices: [],
      layout: [],
      gateRisks: [],
      verdict: 'ship',
      revisePlan: [],
    }))
    const score = scoreReflection({
      content: DRAFT,
      quality: blockedQuality(),
      reflection,
      explore: parseExplore(EXPLORE_JSON),
    })
    expect(score.pass).toBe(false)
    expect(score.dimensions.find((d) => d.id === 'honesty')?.score).toBe(0)
    expect(needsRewrite(reflection, true, score)).toBe(true)
  })

  it('rewrites Review warnings that the planner named, not word-count targets', () => {
    const reflection = parseReflection(JSON.stringify({
      throughline: 'one argument holds across chapters',
      guesswork: [],
      stuffing: [],
      kitSplices: [],
      layout: [],
      gateRisks: [],
      verdict: 'ship',
      revisePlan: [],
    }))
    const openerWarn = {
      ...cleanQuality(),
      warnings: [{ code: 'stuffed_primary_opener', severity: 'warning' as const, message: 'mill opener', fix: 'bridge' }],
    }
    const score = scoreReflection({
      content: DRAFT,
      quality: openerWarn,
      reflection,
      explore: parseExplore(EXPLORE_JSON),
    })
    expect(score.pass).toBe(false)
    expect(needsRewrite(reflection, false, score, openerWarn)).toBe(true)
    const cleanScore = scoreReflection({
      content: DRAFT,
      quality: cleanQuality(),
      reflection,
      explore: parseExplore(EXPLORE_JSON),
    })
    expect(cleanScore.pass).toBe(true)
    expect(needsRewrite(reflection, false, cleanScore, {
      warnings: [{ code: 'word_count_target', severity: 'warning', message: 'under target', fix: 'expand' }],
    })).toBe(false)
  })
})

describe('linear desk conversation', () => {
  it('does not run on a resumed draft or a gig', () => {
    expect(shouldRunLinearDesk({ contentType: 'legal_guide', resumeContent: '# saved' })).toBe(false)
    expect(shouldRunLinearDesk({ contentType: 'marketplace_gig' })).toBe(false)
    expect(shouldRunLinearDesk({ contentType: 'legal_guide', indexable: true })).toBe(true)
  })

  it('keeps discover, explore, brief, and draft in one thread and shows gates from turn 0', () => {
    const system = linearDeskSystem(buildFactorySystemPrompt({
      plan,
      contentType: 'legal_guide',
      minWords: 2200,
      maxWords: 2800,
    }))
    expect(system).toMatch(/ONE CONVERSATION/)
    expect(system).toMatch(/EXPLORES Discover/)
    expect(system).toMatch(/READER_QUESTION/)
    expect(system).toMatch(/SELF-REFLECTS/)
    expect(system).toMatch(/automated score/)
    expect(system).toMatch(/IN 60 SECONDS is the takeaways slot/)
    expect(system).toMatch(/Q1\. ONE ARTICLE/)

    const discover = buildDiscoverBlock({
      primaryKeyword: 'h-1b visa',
      contentType: 'legal_guide',
      requiredShortKeywords: ['specialty occupation'],
      sources: ['https://www.uscis.gov/working-in-the-united-states/temporary-workers/h-1b-specialty-occupations'],
    })
    const prompt = renderDeskConversation(
      [{ role: 'user', name: 'discover', text: discover }],
      'explore',
      'EXPLORE — chain of thought before the brief.',
    )
    expect(prompt).toMatch(/DISCOVER INTELLIGENCE/)
    expect(prompt).toMatch(/USER · explore/)
    expect(prompt).toMatch(/Do not start over/)
  })

  it('reasons with high effort on planning turns and low effort on long prose', () => {
    expect(deskPhaseAiOpts('explore')).toEqual({ reasoningEffort: 'high', skipQualityContract: true })
    expect(deskPhaseAiOpts('brief')).toEqual({ reasoningEffort: 'high', skipQualityContract: true })
    expect(deskPhaseAiOpts('reflect')).toEqual({ reasoningEffort: 'high', skipQualityContract: true })
    expect(deskPhaseAiOpts('draft')).toEqual({ reasoningEffort: 'low', skipQualityContract: false })
    expect(deskPhaseAiOpts('review')).toEqual({ reasoningEffort: 'low', skipQualityContract: false })
  })

  it('explores, seals, writes, self-reflects, then rewrites leftover blockers in the same conversation', async () => {
    const calls: string[] = []
    const efforts: Array<string | undefined> = []
    const result = await runLinearDesk({
      system: 'GATES: no stuffing, one article.',
      assembly: {
        primaryKeyword: 'h-1b visa',
        contentType: 'legal_guide',
        h2Outline: ['In 60 seconds', 'Who this path is actually for', 'Documents you gather next', 'FAQ', 'Sources'],
        sources: ['https://www.uscis.gov/'],
      },
      minWords: 200,
      maxWords: 800,
      generate: async (opts) => {
        calls.push(opts.phase)
        efforts.push(opts.reasoningEffort)
        expect(opts.system).toContain(LINEAR_CONVERSATION_ADDENDUM)
        expect(opts.prompt).toMatch(/one conversation/i)
        if (opts.phase === 'explore') {
          expect(opts.skipQualityContract).toBe(true)
          expect(opts.prompt).toMatch(/EXPLORE/)
          expect(opts.prompt).toMatch(/DISCOVER INTELLIGENCE/)
          return { text: EXPLORE_JSON, provider: 'test', model: 'test' }
        }
        if (opts.phase === 'brief') {
          expect(opts.prompt).toMatch(/argumentSpine/)
          expect(opts.prompt).toMatch(/wouldHaveToInvent/)
          expect(opts.prompt).toMatch(/Seal the brief FROM that exploration/)
          return { text: BRIEF_JSON, provider: 'test', model: 'test' }
        }
        if (opts.phase === 'draft') {
          expect(opts.skipQualityContract).toBe(false)
          expect(opts.prompt).toMatch(/EXECUTE the sealed brief/)
          expect(opts.prompt).toMatch(/Who this path is actually for/)
          expect(opts.prompt).toMatch(/USCIS filing fee for 2026/)
          return { text: `<think>plan the lede</think>\n${DRAFT}`, provider: 'test', model: 'test' }
        }
        if (opts.phase === 'reflect') {
          expect(opts.prompt).toMatch(/SELF-REFLECT/)
          expect(opts.prompt).toMatch(/EXECUTE the sealed brief/)
          expect(opts.prompt).not.toMatch(/Return the complete corrected markdown article/)
          return {
            text: JSON.stringify({
              throughline: 'holds',
              guesswork: [],
              stuffing: [],
              kitSplices: [],
              layout: ['thin FAQ'],
              gateRisks: ['thin_content'],
              verdict: 'revise',
              revisePlan: ['Keep the argument; deepen Documents with the named artefacts already in Discover.'],
            }),
            provider: 'test',
            model: 'test',
          }
        }
        expect(opts.phase).toBe('review')
        expect(opts.prompt).toMatch(/SELF-REVIEW/)
        expect(opts.prompt).toMatch(/EXECUTE the sealed brief/)
        expect(opts.prompt).toMatch(/Revise plan/)
        expect(opts.prompt).toMatch(/AUTOMATED SCORE/)
        return { text: DRAFT, provider: 'test', model: 'test' }
      },
      evaluate: blockedQuality,
    })
    expect(calls).toEqual(['explore', 'brief', 'draft', 'reflect', 'review'])
    expect(efforts).toEqual(['high', 'high', 'low', 'high', 'low'])
    expect(result.turns.map((t) => t.name)).toEqual(
      expect.arrayContaining(['discover', 'explore', 'brief', 'draft', 'reflect', 'review']),
    )
    expect(result.explored).toBe(true)
    expect(result.reflected).toBe(true)
    expect(result.reviewed).toBe(true)
    expect(result.exploreScore?.missing || []).toEqual([])
    expect(result.reflectionScore?.pass).toBe(false)
    expect(result.brief.thesis).toMatch(/LCA is certified/)
    expect(result.brief.unresolved).toContain('USCIS filing fee for 2026')
    expect(result.content).toMatch(/# H-1B visa/)
    expect(result.content).not.toMatch(/<think>/)
    expect(result.content).not.toMatch(/wouldHaveToInvent/)
    expect(executeBriefPrompt(result.brief)).toMatch(/EXECUTE the sealed brief/)
  })

  it('skips the rewrite when self-reflection ships and the evaluator is clean', async () => {
    const calls: string[] = []
    const result = await runLinearDesk({
      system: 'GATES: no stuffing, one article.',
      assembly: { primaryKeyword: 'h-1b visa', contentType: 'legal_guide' },
      minWords: 200,
      maxWords: 800,
      generate: async (opts) => {
        calls.push(opts.phase)
        if (opts.phase === 'explore') return { text: EXPLORE_JSON, provider: 'test', model: 'test' }
        if (opts.phase === 'brief') return { text: BRIEF_JSON, provider: 'test', model: 'test' }
        if (opts.phase === 'draft') return { text: DRAFT, provider: 'test', model: 'test' }
        if (opts.phase === 'reflect') {
          return {
            text: JSON.stringify({
              throughline: 'one argument',
              guesswork: [],
              stuffing: [],
              kitSplices: [],
              layout: [],
              gateRisks: [],
              verdict: 'ship',
              revisePlan: [],
            }),
            provider: 'test',
            model: 'test',
          }
        }
        throw new Error(`unexpected phase ${opts.phase}`)
      },
      evaluate: cleanQuality,
    })
    expect(calls).toEqual(['explore', 'brief', 'draft', 'reflect'])
    expect(result.reviewed).toBe(false)
    expect(result.reflected).toBe(true)
    expect(result.held).toBe(true)
    expect(result.exploreScore?.score).toBeGreaterThanOrEqual(70)
    expect(result.reflectionScore?.pass).toBe(true)
    expect(result.turns.map((t) => t.name)).not.toContain('review')
  })

  it('rewrites from self-reflection even when the evaluator has not yet blocked', async () => {
    const calls: string[] = []
    const result = await runLinearDesk({
      system: 'GATES: no stuffing, one article.',
      assembly: { primaryKeyword: 'h-1b visa', contentType: 'legal_guide' },
      minWords: 200,
      maxWords: 800,
      generate: async (opts) => {
        calls.push(opts.phase)
        if (opts.phase === 'explore') return { text: EXPLORE_JSON, provider: 'test', model: 'test' }
        if (opts.phase === 'brief') return { text: BRIEF_JSON, provider: 'test', model: 'test' }
        if (opts.phase === 'draft') return { text: DRAFT, provider: 'test', model: 'test' }
        if (opts.phase === 'reflect') {
          return {
            text: JSON.stringify({
              throughline: 'Documents restarts the thesis',
              guesswork: [],
              stuffing: ['h-1b visa as the H2'],
              kitSplices: [],
              layout: [],
              gateRisks: [],
              verdict: 'revise',
              revisePlan: ['Open Documents on the LCA already certified, not a new definition.'],
            }),
            provider: 'test',
            model: 'test',
          }
        }
        expect(opts.prompt).toMatch(/Open Documents on the LCA/)
        return { text: DRAFT, provider: 'test', model: 'test' }
      },
      evaluate: cleanQuality,
    })
    expect(calls).toEqual(['explore', 'brief', 'draft', 'reflect', 'review'])
    expect(result.reviewed).toBe(true)
  })

  it('rewrites when the automated score fails even if the model says ship', async () => {
    const millDraft = DRAFT.replace(
      'Specialty occupation work still has to match the degree. The LCA you just certified is the first artefact the officer will look for.',
      'This section covers everything you need to know about the h-1b visa petition in 2026.',
    )
    const calls: string[] = []
    const result = await runLinearDesk({
      system: 'GATES: no stuffing, one article.',
      assembly: { primaryKeyword: 'h-1b visa', contentType: 'legal_guide' },
      minWords: 200,
      maxWords: 800,
      generate: async (opts) => {
        calls.push(opts.phase)
        if (opts.phase === 'explore') return { text: EXPLORE_JSON, provider: 'test', model: 'test' }
        if (opts.phase === 'brief') return { text: BRIEF_JSON, provider: 'test', model: 'test' }
        if (opts.phase === 'draft') return { text: millDraft, provider: 'test', model: 'test' }
        if (opts.phase === 'reflect') {
          return {
            text: JSON.stringify({
              throughline: 'one argument holds across chapters',
              guesswork: [],
              stuffing: [],
              kitSplices: [],
              layout: [],
              gateRisks: [],
              verdict: 'ship',
              revisePlan: [],
            }),
            provider: 'test',
            model: 'test',
          }
        }
        expect(opts.prompt).toMatch(/AUTOMATED SCORE/)
        expect(opts.prompt).toMatch(/must revise/)
        return { text: DRAFT, provider: 'test', model: 'test' }
      },
      evaluate: cleanQuality,
    })
    expect(calls).toEqual(['explore', 'brief', 'draft', 'reflect', 'review'])
    expect(result.reviewed).toBe(true)
    expect(result.reflection?.verdict).toBe('ship')
    expect(result.content).not.toMatch(/This section covers/)
  })
})

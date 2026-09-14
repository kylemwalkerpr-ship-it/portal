/**
 * Linear desk: one conversation, sealed brief, Alma-grade layout, no guesswork.
 */
import { buildFactorySystemPrompt } from '@/lib/seoFactory/prompts'
import {
  LINEAR_CONVERSATION_ADDENDUM,
  buildDiscoverBlock,
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
import { deskLayoutPromptBlock } from '@/lib/seoFactory/deskLayout'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'

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
    expect(parsed.issues.some((i) => /unresolved/.test(i))).toBe(true)
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

describe('linear desk conversation', () => {
  it('does not run on a resumed draft or a gig', () => {
    expect(shouldRunLinearDesk({ contentType: 'legal_guide', resumeContent: '# saved' })).toBe(false)
    expect(shouldRunLinearDesk({ contentType: 'marketplace_gig' })).toBe(false)
    expect(shouldRunLinearDesk({ contentType: 'legal_guide', indexable: true })).toBe(true)
  })

  it('keeps discover, brief, and draft in one thread and shows gates from turn 0', () => {
    const system = linearDeskSystem(buildFactorySystemPrompt({
      plan,
      contentType: 'legal_guide',
      minWords: 2200,
      maxWords: 2800,
    }))
    expect(system).toMatch(/ONE CONVERSATION/)
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
      'brief',
      'SEALED BRIEF — return ONLY a JSON object.',
    )
    expect(prompt).toMatch(/DISCOVER INTELLIGENCE/)
    expect(prompt).toMatch(/USER · brief/)
    expect(prompt).toMatch(/Do not start over/)
  })

  it('plans, then writes from that plan, then self-reviews leftover blockers in the same conversation', async () => {
    const calls: string[] = []
    const briefJson = JSON.stringify({
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
    const draft = `---
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
        expect(opts.system).toContain(LINEAR_CONVERSATION_ADDENDUM)
        expect(opts.prompt).toMatch(/one conversation/i)
        if (opts.phase === 'brief') return { text: briefJson, provider: 'test', model: 'test' }
        if (opts.phase === 'draft') {
          expect(opts.prompt).toMatch(/EXECUTE the sealed brief/)
          expect(opts.prompt).toMatch(/Who this path is actually for/)
          return { text: draft, provider: 'test', model: 'test' }
        }
        expect(opts.prompt).toMatch(/SELF-REVIEW/)
        expect(opts.prompt).toMatch(/EXECUTE the sealed brief/)
        return { text: draft, provider: 'test', model: 'test' }
      },
      evaluate: () => ({
        ok: false,
        findings: [{ code: 'thin_content', severity: 'blocker' as const, message: 'thin', fix: 'expand' }],
        blockers: [{ code: 'thin_content', severity: 'blocker' as const, message: 'thin', fix: 'expand' }],
        warnings: [],
        humanScore: 70,
        summary: 'blocked',
      }),
    })
    expect(calls[0]).toBe('brief')
    expect(calls).toContain('draft')
    expect(calls).toContain('review')
    expect(result.turns.map((t) => t.name)).toEqual(expect.arrayContaining(['discover', 'brief', 'draft', 'review']))
    expect(result.brief.thesis).toMatch(/LCA is certified/)
    expect(executeBriefPrompt(result.brief)).toMatch(/EXECUTE the sealed brief/)
  })
})

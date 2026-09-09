import {
  extractRegisterCard,
  houseRegisterFor,
  registerCardPromptBlock,
  registerDrift,
  resolveSectionPurpose,
  synthesizeThesis,
} from '@/lib/seoFactory/registerCard'
import { evaluateContentQuality } from '@/lib/seoFactory/contentQualityGate'
import { isHarperProseFinding } from '@/lib/seoFactory/harperLane'
import { createContentSpec } from '@/lib/seoFactory/contentSpec'
import { buildFactorySystemPrompt } from '@/lib/seoFactory/prompts'

const PLAN = {
  matched: null as any,
  matchScore: 0,
  host: 'legal' as const,
  repo: 'caseworks' as any,
  filePath: 'app/us/student-visa-documents/page.tsx',
  canonicalUrl: 'https://legal.yousafeconsultancy.com/us/student-visa-documents/',
  indexable: true,
  action: 'create',
  intentClass: 'legal_guide',
  contentType: 'legal_guide',
  warnings: [] as string[],
  blockers: [] as string[],
  ymy: true,
  routingSource: 'standing_rules' as const,
}

describe('synthesizeThesis / section purpose', () => {
  it('keeps an operator thesis and synthesizes one when missing', () => {
    expect(synthesizeThesis({ thesis: 'Sponsor leads the points test.' })).toBe('Sponsor leads the points test.')
    expect(
      synthesizeThesis({
        primaryKeyword: 'student visa documents',
        reader: 'an F-1 applicant',
        queryNeed: 'the live form list',
      }),
    ).toMatch(/F-1 applicant[\s\S]*live form list/)
  })

  it('replaces planner-outline placeholders with a real section job', () => {
    expect(resolveSectionPurpose('Eligibility', 'planner outline')).toMatch(/Who this is for/)
    expect(resolveSectionPurpose('FAQ', 'brief outline')).toMatch(/reader questions/)
    expect(resolveSectionPurpose('Documents', 'named artefacts')).toBe('named artefacts')
  })

  it('createContentSpec always stores a thesis and rewrites planner purposes', () => {
    const spec = createContentSpec({
      jobId: 'job-1',
      contentType: 'legal_guide',
      region: 'us',
      indexable: true,
      target: {
        canonicalUrl: 'https://legal.yousafeconsultancy.com/us/student-visa-documents/',
        host: 'legal.yousafeconsultancy.com',
        path: '/us/student-visa-documents/',
      },
      intent: {
        primaryQuery: 'student visa documents',
        reader: 'an F-1 applicant',
        queryNeed: 'the live form list',
        stage: 'consideration',
      },
      primaryKeyword: 'student visa documents',
      requiredKeywords: [{ phrase: 'student visa', kind: 'short' }],
      outline: [{ heading: 'Eligibility', level: 2, purpose: 'planner outline' }],
    })
    expect(spec.thesis).toMatch(/F-1 applicant/)
    expect(spec.outline[0].purpose).toMatch(/Who this is for/)
  })
})

describe('register card', () => {
  it('guides are stricter on contractions than blogs', () => {
    expect(houseRegisterFor('legal_guide').contractionPerHundred).toBeLessThan(
      houseRegisterFor('blog_post').contractionPerHundred,
    )
    expect(houseRegisterFor('blog_post').burstinessCv).toBeGreaterThan(houseRegisterFor('article').burstinessCv)
  })

  it('prompt names the house register, not a person to clone', () => {
    const block = registerCardPromptBlock(houseRegisterFor('legal_guide'))
    expect(block).toMatch(/HOUSE REGISTER/)
    expect(block).toMatch(/not a person to clone/)
    expect(block).toMatch(/Contrastive shift/)
  })

  it('flags mill rhythm as register_drift on a long indexable guide', () => {
    const mill = Array.from({ length: 80 }, () =>
      'Applicants must confirm the current student visa documents rule on the official government site before they file.',
    ).join(' ')
    const content = `---
title: Student visa documents
primaryKeyword: student visa documents
---

# Student visa documents

## In 60 seconds
- Confirm the form list

## Eligibility
${mill}

## Documents
${mill}

## Process
${mill}

## FAQ
### What should you prepare first?
Identity documents.

## Sources
- [USCIS](https://www.uscis.gov/)

This guide is educational only, not legal advice.
`
    const card = extractRegisterCard(content)
    const drift = registerDrift(card, houseRegisterFor('legal_guide'), { contentType: 'legal_guide' })
    expect(drift).toBeTruthy()
    const r = evaluateContentQuality({
      content,
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
      indexable: true,
    })
    expect(r.warnings.some((w) => w.code === 'register_drift') || r.blockers.length > 0).toBe(true)
    expect(isHarperProseFinding('register_drift')).toBe(true)
  })
})

describe('factory prompt mapping net', () => {
  it('writes guides as one specialist and injects the house register', () => {
    const prompt = buildFactorySystemPrompt({
      plan: PLAN,
      contentType: 'legal_guide',
      minWords: 2200,
      spec: createContentSpec({
        jobId: 'job-1',
        contentType: 'legal_guide',
        region: 'us',
        indexable: true,
        target: {
          canonicalUrl: PLAN.canonicalUrl,
          host: 'legal.yousafeconsultancy.com',
          path: '/us/student-visa-documents/',
        },
        intent: {
          primaryQuery: 'student visa documents',
          reader: 'an F-1 applicant',
          queryNeed: 'the live form list',
          stage: 'consideration',
        },
        primaryKeyword: 'student visa documents',
        requiredKeywords: [{ phrase: 'student visa', kind: 'short' }],
        thesis: 'Treat the live USCIS list as the file, not a forum PDF.',
      }),
    })
    expect(prompt).toMatch(/senior specialist writing one/)
    expect(prompt).not.toMatch(/You are the YouSafe \/ MyCaseworks SEO content factory/)
    expect(prompt).toMatch(/HOUSE REGISTER/)
    expect(prompt).toMatch(/Treat the live USCIS list/)
    expect(prompt).not.toMatch(/One idea per sentence/)
    expect(prompt).not.toMatch(/40–80 words, self-contained for LLM citation/)
  })
})

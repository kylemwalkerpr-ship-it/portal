import { stripDuplicateArticleCopy } from '@/lib/seoFactory/editorialScaffold'

/**
 * Reproduction of the 2026-09-02 shipped NCLEX artifact: two near-copies of
 * the same article in one document. Copy 2 restarts mid-document with its own
 * frontmatter (rendered at the bottom) and a REWORDED H1
 * (`…2026 Guide` → `…2026`) plus paraphrased FAQ questions.
 */
function copy(h1Suffix: string, faqQ: string) {
  return [
    `# NCLEX Prep Help for International Candidates ${h1Suffix}`,
    '',
    'You start your nclex preparation help by verifying your nursing education meets the state board requirements.',
    '',
    '## In 60 seconds',
    '',
    '- State boards control eligibility and you must apply through the NCSBN portal first.',
    '- Credential evaluation and English proficiency tests usually take several weeks.',
    '- Pearson VUE handles testing centers and you schedule after receiving your ATT.',
    '',
    '## Table of contents',
    '',
    '- [Step 1](#step-1) · [Step 2](#step-2) · [FAQ](#faq)',
    '',
    '## Step 1: Check Your State Board Eligibility First',
    '',
    'Your state board of nursing sets the exact rules for practice. You must pick one state before you start any paperwork. Each state publishes its own eligibility checklist and fee schedule.',
    '',
    'State boards review academic coursework hour by hour and compare your clinical practicum against minimum standards before any decision.',
    '',
    '## Step 2: Use Official NCLEX Preparation Help Resources',
    '',
    'Study materials must match the current Next Generation NCLEX format. The NCSBN releases official practice tests that mirror the actual item types and scoring algorithm.',
    '',
    '## Step 3: Plan Your Exam Timeline and Visa Status',
    '',
    'Scheduling requires coordination between your state board, the NCSBN, and Pearson VUE. You cannot register until your state board sends your candidate information.',
    '',
    "## Worked Example: Sarah's Path to NCLEX Success",
    '',
    "Sarah graduated with a nursing degree from a Philippines university. She wanted to test in Texas but her state board required a CGFNS evaluation. She received her ATT by email within ten business days.",
    '',
    '## How to Get Professional Help for Your Application',
    '',
    'Complex education records often require extra review. You may need help when your nursing program used a different curriculum structure or clinical hour calculation.',
    '',
    '## FAQ: NCLEX Preparation Help Questions',
    '',
    `### ${faqQ}`,
    '',
    'The nclex preparation help refers to the official review materials, scheduling guidance, and document checklists required for international candidates.',
    '',
    '## Sources',
    '',
    '- NCSBN Official Website',
    '- Pearson VUE NCLEX Testing Portal',
    '- USCIS Students and Employment',
    '',
    'This guide provides educational information only. It does not constitute legal advice or immigration counsel.',
  ].join('\n')
}

describe('NCLEX echo regression (2026-09-02 shipped artifact)', () => {
  it('strips the REWORDED-H1 restart copy (2026 Guide → 2026)', () => {
    const doc = [
      '---',
      'title: NCLEX Prep Help for International Candidates: 2026',
      'description: Learn the exact steps for nclex preparation help.',
      'primaryKeyword: nclex preparation help',
      'canonicalUrl: https://legal.yousafeconsultancy.com/us/nclex-preparation-help/',
      'robots: index,follow',
      'date: 2026-08-24',
      'region: us',
      'content_type: legal_guide',
      'ownerHost: legal',
      '---',
      '',
      copy(': 2026 Guide', 'What is the nclex preparation help and who needs it?'),
      '',
      '---',
      'title: NCLEX Prep Help for International Candidates: 2026',
      'description: Learn the exact steps for nclex preparation help.',
      'primaryKeyword: nclex preparation help',
      'canonicalUrl: https://legal.yousafeconsultancy.com/us/nclex-preparation-help/',
      'robots: index,follow',
      'date: 2026-08-24',
      'region: us',
      'content_type: legal_guide',
      'ownerHost: legal',
      '---',
      '',
      copy(': 2026', 'What resources do international nurses need to prepare?'),
    ].join('\n')

    const result = stripDuplicateArticleCopy(doc)
    expect(result.removed).toBe(true)
    expect(result.copies).toBe(2)
    // Copy-2-unique markers are gone (its FAQ question + the mid-document frontmatter).
    expect(result.content).not.toContain('What resources do international nurses need to prepare?')
    // Exactly ONE frontmatter block survives (the top one) — the mid-document
    // restart block was cut with copy 2.
    expect((result.content.match(/^title:\s*NCLEX/gm) || []).length).toBe(1)
    expect((result.content.match(/^# NCLEX/gm) || []).length).toBe(1)
  })

  it('keeps ONE copy when the frontmatter is missing entirely (bottom-rendered frontmatter shape)', () => {
    const doc = [
      copy(': 2026 Guide', 'What is the nclex preparation help and who needs it?'),
      '',
      '---',
      'title: NCLEX Prep Help for International Candidates: 2026',
      'primaryKeyword: nclex preparation help',
      'content_type: legal_guide',
      'ownerHost: legal',
      '---',
      '',
      copy(': 2026', 'What resources do international nurses need to prepare?'),
    ].join('\n')

    const result = stripDuplicateArticleCopy(doc)
    expect(result.removed).toBe(true)
    expect((result.content.match(/# NCLEX/g) || []).length).toBe(1)
  })

  it('keeps a single copy intact (no false positive on legitimate documents)', () => {
    const doc = [
      '---',
      'title: NCLEX Prep Help for International Candidates: 2026',
      '---',
      '',
      copy(': 2026', 'What is the nclex preparation help and who needs it?'),
    ].join('\n')
    const result = stripDuplicateArticleCopy(doc)
    expect(result.removed).toBe(false)
    expect((result.content.match(/# NCLEX/g) || []).length).toBe(1)
  })
})

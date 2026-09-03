import { countBodyWords } from '@/lib/seoFactory/contentDepth'
import { evaluateContentQuality } from '@/lib/seoFactory/contentQualityGate'
import { applyDeterministicRepairs } from '@/lib/seoFactory/editorialScaffold'
import { detectForcedFaqWordings } from '@/lib/seoFactory/contentQualityGate'

/**
 * A compliant indexable legal-guide skeleton (≥650 body words so the gate's
 * engagement checks run) the individual cases mutate. Long enough that the
 * keyword-density reducer never fires on the primary phrase.
 */
function compliantBody(opts: {
  faq: string
  sources?: string
  processBlock?: string
  documentsBlock?: string
}): string {
  return [
    '# Bookkeeping Service for LLC: 2026 Guide',
    '',
    '## In 60 seconds',
    '- A bookkeeping service for llc keeps the accounts clean and the filings on time.',
    '- Fees vary by state and transaction volume.',
    '- This guide explains setup, costs, and compliance duties for owners.',
    '',
    '## Eligibility',
    'Any limited liability company may hire a bookkeeping service for llc purposes. The service must be registered with the state where the company operates. Records stay with the company at all times.',
    'A single-member LLC qualifies on the same terms as a multi-member company. The paperwork is identical in most states. Foreign-owned companies add one extra form.',
    'Companies with employees carry payroll duties on top of the base records. Those duties do not change who may hire a provider.',
    'The state filing office publishes the current fee schedule every January. Fees differ by less than fifty dollars between most jurisdictions.',
    'An owner may change providers mid-year without restating the ledger. The new provider opens with the closing trial balance.',
    '',
    '## Documents',
    opts.documentsBlock ??
      'Articles of organization, an EIN letter, and bank statements. The bookkeeping service for llc onboarding needs each document before setup begins.',
    'Bring the operating agreement as well. Providers use it to confirm who may authorize payments.',
    'A prior-year trial balance helps a new provider open the ledger without restating history.',
    'Payroll summaries complete the file for companies with staff.',
    'Signed engagement letters define the scope and the monthly close date.',
    '',
    '## Process',
    opts.processBlock ?? 'Choose a provider. Share access. Reconcile monthly. A bookkeeping service for llc files the quarterly reports.',
    'Set a monthly close date. Review the reconciliations. Sign off before the quarter ends.',
    'Keep the source receipts for seven years. Digital copies satisfy the retention rule in every state.',
    'Reconciliation compares the ledger against the bank feed line by line. Discrepancies surface within two business days.',
    'Quarterly reports mirror the federal filing calendar. Missing a quarter triggers a penalty notice within six weeks.',
    '',
    '## Compliance',
    'Each state audits registered providers once per year. The review covers trust accounting and data retention.',
    'A provider that fails the review loses its registration until the findings are corrected. Owners can verify registration status on the state portal.',
    'Penalties for late filings scale with the delay. First-time late filers often qualify for a waiver on request.',
    'Record requests arrive most often during a sale or a financing. Lenders ask for three years of reconciled statements.',
    'Companies under examination should notify the provider immediately. The provider holds the working papers that answer examiner questions.',
    'Examiners may also interview staff who processed payments. Providers schedule those sessions in advance.',
    'The examination closes with a findings letter. Corrective actions carry a ninety-day deadline.',
    '',
    '## FAQ',
    '',
    opts.faq,
    '',
    '## Sources',
    '',
    opts.sources ?? '- [IRS](https://www.irs.gov/)',
  ].join('\n')
}

/** Two-sentence, >900-char wall blocks (no clause punctuation) — the shape the
 *  old splitter could never break (sentences.length < 3 bailed). */
const LONG_WALL = [
  'Every limited liability company that operates in the United States and carries more than a nominal volume of transactions in a given tax year is expected under the governing framework to maintain records that allow an independent reviewer to reconcile reported income against bank activity, and the owner who fails to maintain that separation discovers at audit that reconstructing a year of commingled activity costs far more than the bookkeeping service ever would have.',
  'The second consideration is timing, because a company that waits until the filing season to organize its accounts discovers that deductions which would have been available under a maintained system are lost simply because the underlying receipts were never categorized in the months when the expenses actually occurred.',
].join(' ')

describe('regression: the four never-clearing audit findings', () => {
  // ── 1. faq_forced_keyword in a collapsible <details><summary> pair ────────
  it('detects and removes a machine-worded question inside a details/summary FAQ', () => {
    const body = compliantBody({
      faq: [
        '<details>',
        '<summary>Is it possible to bookkeeping service for llc?</summary>',
        'Yes — a bookkeeping service for llc can be engaged at any point in the year.',
        '</details>',
        '',
        '<details>',
        '<summary>How much does professional bookkeeping cost?</summary>',
        'Costs depend on transaction volume and payroll needs.',
        '</details>',
        '',
        '<details>',
        '<summary>Who qualifies for streamlined filing?</summary>',
        'Every LLC registered in the state qualifies.',
        '</details>',
      ].join('\n'),
    })
    // The detector sees the collapsible question.
    expect(
      detectForcedFaqWordings(body, 'bookkeeping service for llc').map((j) => j.question),
    ).toContain('Is it possible to bookkeeping service for llc?')
    // The deterministic repair removes the whole <details> pair.
    const r = applyDeterministicRepairs({
      content: body,
      primaryKeyword: 'bookkeeping service for llc',
      region: 'US',
      indexable: true,
      contentType: 'legal_guide',
    })
    expect(r.applied.some((a) => a.startsWith('faq_forced_keyword_removed'))).toBe(true)
    expect(r.content).not.toContain('Is it possible to bookkeeping service for llc?')
    // Healthy collapsible pairs survive.
    expect(r.content).toContain('How much does professional bookkeeping cost?')
  })

  it('still removes the ### heading form of a forced FAQ question', () => {
    const body = compliantBody({
      faq: [
        '### Is it possible to bookkeeping service for llc?',
        '',
        'Yes — a bookkeeping service for llc can be engaged at any point in the year.',
        '',
        '### How much does professional bookkeeping cost?',
        '',
        'Costs depend on transaction volume and payroll needs.',
        '',
        '### Who qualifies for streamlined filing?',
        '',
        'Every LLC registered in the state qualifies.',
      ].join('\n'),
    })
    const r = applyDeterministicRepairs({
      content: body,
      primaryKeyword: 'bookkeeping service for llc',
      region: 'US',
      indexable: true,
      contentType: 'legal_guide',
    })
    expect(r.applied.some((a) => a.startsWith('faq_forced_keyword_removed'))).toBe(true)
    expect(r.content).not.toContain('Is it possible to bookkeeping service for llc?')
  })

  // ── 2. wall_of_text: a 2-sentence dense block must be splittable ─────────
  it('splits a >520-char two-sentence block so wall_of_text can clear', () => {
    const gateInput = compliantBody({
      faq: '<details><summary>How much does professional bookkeeping cost?</summary>Costs depend on volume.</details>',
      processBlock: LONG_WALL,
      documentsBlock: LONG_WALL,
    })
    expect(countBodyWords(gateInput)).toBeGreaterThanOrEqual(650)
    const gate = evaluateContentQuality({
      content: gateInput,
      primaryKeyword: 'bookkeeping service for llc',
      indexable: true,
      contentType: 'legal_guide',
    })
    expect(gate.warnings.find((w) => w.code === 'wall_of_text')).toBeTruthy()

    const r = applyDeterministicRepairs({
      content: gateInput,
      primaryKeyword: 'bookkeeping service for llc',
      region: 'US',
      indexable: true,
      contentType: 'legal_guide',
    })
    expect(r.applied).toContain('wall_of_text_split')
    const gateAfter = evaluateContentQuality({
      content: r.content,
      primaryKeyword: 'bookkeeping service for llc',
      indexable: true,
      contentType: 'legal_guide',
    })
    expect(gateAfter.warnings.find((w) => w.code === 'wall_of_text')).toBeFalsy()
  })

  // ── 3. source_name_not_hyperlinked: unmatched labels are removed ─────────
  it('removes a plain source label no curated source can claim', () => {
    const body = compliantBody({
      faq: '<details><summary>How much does professional bookkeeping cost?</summary>Costs depend on volume.</details>',
      sources: [
        '- [IRS](https://www.irs.gov/)',
        '- FLSA Wage & Hour Guidance',
      ].join('\n'),
    })
    const gate = evaluateContentQuality({
      content: body,
      primaryKeyword: 'bookkeeping service for llc',
      indexable: true,
      contentType: 'legal_guide',
    })
    expect(gate.warnings.find((w) => w.code === 'source_name_not_hyperlinked')).toBeTruthy()

    const r = applyDeterministicRepairs({
      content: body,
      primaryKeyword: 'bookkeeping service for llc',
      region: 'US',
      indexable: true,
      contentType: 'legal_guide',
    })
    expect(r.applied.some((a) => a.includes('unlinkable removed'))).toBe(true)
    expect(r.content).not.toContain('FLSA Wage & Hour Guidance')
    expect(r.content).toContain('[IRS](https://www.irs.gov/)')
    const gateAfter = evaluateContentQuality({
      content: r.content,
      primaryKeyword: 'bookkeeping service for llc',
      indexable: true,
      contentType: 'legal_guide',
    })
    expect(gateAfter.warnings.find((w) => w.code === 'source_name_not_hyperlinked')).toBeFalsy()
  })

  it('still auto-links a curated plain label instead of removing it', () => {
    const body = compliantBody({
      faq: '<details><summary>How much does professional bookkeeping cost?</summary>Costs depend on volume.</details>',
      sources: '- IRS\n- [CDC](https://www.cdc.gov/)',
    })
    const r = applyDeterministicRepairs({
      content: body,
      primaryKeyword: 'bookkeeping service for llc',
      region: 'US',
      indexable: true,
      contentType: 'legal_guide',
    })
    expect(r.content).toContain('[IRS](https://www.irs.gov/)')
    expect(r.applied).toContain('official_source_labels_linked')
  })
})

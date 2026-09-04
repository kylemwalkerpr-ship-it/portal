import { autoMapKeywordsToH2s } from '../lib/seoFactory/keywordPlacement'

describe('autoMapKeywordsToH2s', () => {
  const h2s = [
    'Overview',
    'Eligibility Requirements',
    'Application Process',
    'Required Documents',
    'Timeline & Fees',
    'Frequently Asked Questions',
  ]

  it('maps every keyword and prefers heading token overlap', () => {
    const mapped = autoMapKeywordsToH2s(
      ['spouse visa eligibility', 'application form', 'orphan term xyz'],
      h2s,
      {},
    )
    expect(mapped['spouse visa eligibility']).toBe('Eligibility Requirements')
    expect(mapped['application form']).toBe('Application Process')
    expect(mapped['orphan term xyz']).toBe('Eligibility Requirements')
  })

  it('does not wipe user-chosen mappings', () => {
    const prev = { 'application form': 'Timeline & Fees' }
    const mapped = autoMapKeywordsToH2s(['application form', 'new keyword'], h2s, prev)
    expect(mapped['application form']).toBe('Timeline & Fees')
    expect(mapped['new keyword']).toBeTruthy()
    expect(h2s).toContain(mapped['new keyword'])
  })

  it('falls back to FAQ when every heading is structural', () => {
    const structural = ['Overview', 'Introduction', 'FAQ']
    const mapped = autoMapKeywordsToH2s(['unrelated phrase'], structural, {})
    expect(mapped['unrelated phrase']).toBe('FAQ')
  })

  it('falls back to the last H2 when there is no FAQ and all are structural', () => {
    const structural = ['Overview', 'Introduction', 'Conclusion']
    const mapped = autoMapKeywordsToH2s(['unrelated phrase'], structural, {})
    expect(mapped['unrelated phrase']).toBe('Conclusion')
  })

  it('drops mappings for headings that no longer exist', () => {
    const mapped = autoMapKeywordsToH2s(
      ['application form'],
      ['Eligibility Requirements', 'Required Documents'],
      { 'application form': 'Application Process' },
    )
    expect(mapped['application form']).not.toBe('Application Process')
    expect(['Eligibility Requirements', 'Required Documents']).toContain(mapped['application form'])
  })
})

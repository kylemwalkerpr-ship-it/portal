import { mergeInterlinkLists, normalizeInterlinkRecord } from '@/lib/seoFactory/studioInterlinks'

describe('studio interlink normalization', () => {
  it('reads Master Engine camelCase edges (the Find-interlinks empty-pill bug)', () => {
    const n = normalizeInterlinkRecord({
      anchorText: 'UK spouse visa guide',
      targetUrl: 'https://legal.yousafeconsultancy.com/uk/spouse-visa/',
      targetHost: 'legal',
    })
    expect(n).toEqual({
      label: 'UK spouse visa guide',
      url: 'https://legal.yousafeconsultancy.com/uk/spouse-visa/',
      site: 'legal',
    })
  })

  it('reads snake_case and registry shapes', () => {
    expect(normalizeInterlinkRecord({
      anchor_text: 'Marketplace consultation',
      target_url: 'https://portal.yousafeconsultancy.com/consultation',
      target_host: 'market',
    })?.label).toBe('Marketplace consultation')
    expect(normalizeInterlinkRecord({
      label: 'US guide',
      url: 'https://usa.yousafeconsultancy.com/visa/',
      site: 'regional',
    })?.site).toBe('regional')
  })

  it('drops records without an http(s) URL so empty pills never render', () => {
    expect(normalizeInterlinkRecord({ anchorText: 'orphan', targetUrl: '' })).toBeNull()
    expect(normalizeInterlinkRecord({ label: 'no url' })).toBeNull()
  })

  it('merges engine + estate lists and de-dupes by URL', () => {
    const merged = mergeInterlinkLists(
      [{ label: 'Live guide', url: 'https://legal.yousafeconsultancy.com/uk/ilr/' }],
      [{
        anchorText: 'ILR guide',
        targetUrl: 'https://legal.yousafeconsultancy.com/uk/ilr/',
        targetHost: 'legal',
      }, {
        anchorText: 'Marketplace',
        targetUrl: 'https://portal.yousafeconsultancy.com/',
        targetHost: 'market',
      }],
    )
    expect(merged.map((m) => m.url)).toEqual([
      'https://legal.yousafeconsultancy.com/uk/ilr/',
      'https://portal.yousafeconsultancy.com/',
    ])
  })
})

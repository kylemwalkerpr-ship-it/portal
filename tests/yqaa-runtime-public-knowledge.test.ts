jest.mock('fs', () => ({ existsSync: jest.fn(() => false) }))
import { loadCuratedKbChunks, selectYqaaKnowledge } from '@/lib/messengerSiteKnowledge'

describe('YQAA reference knowledge without repository files', () => {
  test('Workers receive canonical identity and bounded public jurisdiction sources', () => {
    const chunks = loadCuratedKbChunks()
    expect(chunks.some(chunk => /network-authority/.test(chunk.id))).toBe(true)
    expect(chunks.some(chunk => chunk.site === 'canada' && chunk.sourceUrl?.startsWith('https://ca.yousafeconsultancy.com/'))).toBe(true)
    expect(chunks.every(chunk => chunk.body.length <= 4000)).toBe(true)
    expect(chunks.some(chunk => chunk.sourceUrl?.includes('portal.yousafeconsultancy.com'))).toBe(false)
  })
  test('an explicit missing test directory is not silently replaced with production knowledge', () => {
    expect(loadCuratedKbChunks('/missing-fixture')).toEqual([])
  })
  test('the ranked pack retains Canadian context for general sponsorship orientation', () => {
    expect(selectYqaaKnowledge({query:'Canada family sponsorship and settlement documents',deep:true}).some(chunk => chunk.site === 'canada')).toBe(true)
  })
})

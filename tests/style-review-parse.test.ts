import { parseStyleJson } from '../lib/seoFactory/styleReviewParse'

describe('parseStyleJson', () => {
  it('parses a bare JSON object', () => {
    const parsed = parseStyleJson('{"items":[{"category":"wordy","quote":"in order to","issue":"padding","suggestion":"to"}]}')
    expect(parsed?.items).toHaveLength(1)
    expect(parsed?.items[0].quote).toBe('in order to')
  })

  it('parses a fenced json block with trailing prose', () => {
    const raw = 'Here is the critique:\n```json\n{"items":[{"category":"cliche","quote":"delve into","issue":"banned","suggestion":"look at"}]}\n```\nHope that helps.'
    const parsed = parseStyleJson(raw)
    expect(parsed?.items).toHaveLength(1)
    expect(parsed?.items[0].category).toBe('cliche')
  })

  it('accepts an empty items array as a successful parse', () => {
    expect(parseStyleJson('{"items":[]}')).toEqual({ items: [] })
  })

  it('returns null when there is no JSON object', () => {
    expect(parseStyleJson('The draft is fine, no issues.')).toBeNull()
  })

  it('returns null on truncated JSON instead of throwing', () => {
    expect(parseStyleJson('{"items":[{"quote":"hello"')).toBeNull()
  })
})

import { parseBriefJson } from '@/lib/seoFactory/briefModel'

describe('parseBriefJson', () => {
  it('recovers raw newlines, tabs, and carriage returns inside quoted values', () => {
    const raw = '{"suggestedH1":"A practical guide","reasoning":"First line\nSecond line\twith detail\r\nThird line","h2Outline":[]}'

    const parsed = parseBriefJson(raw)

    expect(parsed.suggestedH1).toBe('A practical guide')
    expect(parsed.reasoning).toBe('First line\nSecond line\twith detail\r\nThird line')
  })

  it('extracts a JSON object from a fenced model response', () => {
    const parsed = parseBriefJson('Here is the brief:\n```json\n{"suggestedH1":"A guide","h2Outline":[]}\n```')

    expect(parsed.suggestedH1).toBe('A guide')
    expect(parsed.h2Outline).toEqual([])
  })

  it('does not hide genuinely malformed JSON', () => {
    expect(() => parseBriefJson('{"suggestedH1":"missing closing brace"')).toThrow()
  })
})

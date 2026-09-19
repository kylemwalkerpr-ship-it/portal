import fs from 'node:fs'
import path from 'node:path'

describe('SEO admin LLM visibility truthfulness', () => {
  it('does not render unavailable share-of-voice as a 0% tab badge', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/design/admin-seo-engine.tsx'),
      'utf8',
    )

    expect(source).toContain("llmShareOfVoice == null ? '—'")
    expect(source).not.toContain("shareOfVoice ?? 0}%` : ''")
    expect(source).toContain("includes('audit_failed')")
    expect(source).toContain("'UNAVAILABLE'")
  })
})

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Marketplace gig pitch voice contract', () => {
  const voice = read('lib/seoVoice.ts')
  const suggest = read('lib/seoSuggest.ts')

  test('keeps pitch and tagline buyer-led instead of provider mini-bios', () => {
    expect(voice).toContain('Pitch and tagline stay buyer-led')
    expect(voice).toContain('never a provider mini-bio')
    expect(voice).toContain('Never open with the provider identity or credentials')
    expect(voice).toContain('buyer-as-subject')
    expect(voice).not.toContain('Exception: title and pitch')
    expect(voice).not.toContain('Title + pitch: declarative service intent')
  })

  test('keeps the field-specific scaffold wired into every AI suggestion', () => {
    expect(suggest).toContain('const fieldToneScaffold = getFieldToneScaffold(field as FieldName, role)')
    expect(suggest).toContain("case 'pitch':")
    expect(suggest).toContain("case 'tagline':")
    expect(suggest).toContain('client-facing, plain language, names the audience and the outcome')
  })
})

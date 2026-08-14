/**
 * Render-format regression — well-formatted documents must survive the
 * markdown → JSX conversion that ships live pages.
 *
 * 2026-08 incident: articles drafted with numbered steps, tables, and callouts
 * landed as unformatted text because `markdownToJsx` / `markdownToBlogJsx`
 * only understood <ul> bullets. Numbered lists were downgraded to bullets
 * (numbers lost), pipe tables and blockquote callouts fell through as literal
 * text. These tests lock the ordered-list / table / blockquote rendering so a
 * drafted document always lands with its numbering, lists, and callouts intact.
 */
import { renderTargetFile } from '@/lib/seoFactory/renderTarget'
import { EDITORIAL_FORMATTING_CONTRACT } from '@/lib/seoFactory/editorialContract'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'

function plan(partial: Partial<OwnerPlan> & Pick<OwnerPlan, 'host' | 'repo' | 'filePath' | 'canonicalUrl'>): OwnerPlan {
  return {
    matched: null,
    matchScore: 0,
    indexable: true,
    action: 'build',
    intentClass: 'procedural',
    contentType: 'legal_guide',
    warnings: [],
    blockers: [],
    ymy: partial.host === 'legal',
    routingSource: 'standing_rules',
    ...partial,
  }
}

const caseworksPlan = plan({
  host: 'legal',
  repo: 'caseworks',
  filePath: 'app/us/format-test/page.tsx',
  canonicalUrl: 'https://legal.yousafeconsultancy.com/us/format-test/',
})

const blogPlan = plan({
  host: 'legal',
  repo: 'yousafe-consultancy',
  filePath: 'app/blog/format-test/page.tsx',
  canonicalUrl: 'https://yousafeconsultancy.com/blog/format-test/',
})

const structuredBody = [
  '# Format test guide',
  '',
  '## In 60 seconds',
  '- Answer one.',
  '- Answer two.',
  '',
  '## Steps',
  '1. Gather your passport.',
  '2. Complete the form.',
  '3. File before the deadline.',
  '',
  '## Checklist',
  '- Passport',
  '- Proof of funds',
  '',
  '## Comparison',
  '| Option | Cost |',
  '| --- | --- |',
  '| Option A | $1 |',
  '| Option B | $2 |',
  '',
  '## Warning',
  '> **Note:** verify the current fee schedule.',
  '',
  'This is educational only, not legal advice.',
].join('\n')

describe('renderTarget — numbering, tables, and callouts survive to the live page', () => {
  it('renders numbered steps as an ordered <ol>, preserving the count', () => {
    const { fileContent } = renderTargetFile({
      plan: caseworksPlan,
      content: structuredBody,
      title: 'Format test guide',
      region: 'US',
      contentType: 'legal_guide',
      primaryKeyword: 'format test',
      indexable: true,
      canonicalUrl: caseworksPlan.canonicalUrl,
    })
    expect(fileContent).toContain('<ol>')
    expect(fileContent).toContain('</ol>')
    // The three steps keep their order as list items, no longer bullets.
    expect(fileContent).toContain('<li>Gather your passport.</li>')
    expect(fileContent).toContain('<li>Complete the form.</li>')
    expect(fileContent).toContain('<li>File before the deadline.</li>')
  })

  it('does not collapse bullets and numbers into a single list', () => {
    const { fileContent } = renderTargetFile({
      plan: caseworksPlan,
      content: structuredBody,
      title: 'Format test guide',
      region: 'US',
      contentType: 'legal_guide',
      primaryKeyword: 'format test',
      indexable: true,
      canonicalUrl: caseworksPlan.canonicalUrl,
    })
    // The checklist is a <ul>; the steps are a separate <ol>.
    expect(fileContent).toContain('<ul>')
    expect(fileContent).toContain('<li>Passport</li>')
    // <ol> must open after the <ul> closed — never as a child of it.
    expect(fileContent.indexOf('</ul>')).toBeGreaterThan(-1)
    expect(fileContent.indexOf('<ol>')).toBeGreaterThan(fileContent.indexOf('</ul>'))
  })

  it('renders a markdown pipe table as a real <table>', () => {
    const { fileContent } = renderTargetFile({
      plan: caseworksPlan,
      content: structuredBody,
      title: 'Format test guide',
      region: 'US',
      contentType: 'legal_guide',
      primaryKeyword: 'format test',
      indexable: true,
      canonicalUrl: caseworksPlan.canonicalUrl,
    })
    expect(fileContent).toContain('<table>')
    expect(fileContent).toContain('</table>')
    expect(fileContent).toContain('<th>Option</th>')
    expect(fileContent).toContain('<th>Cost</th>')
    expect(fileContent).toContain('<td>Option A</td>')
    expect(fileContent).toContain('<td>Option B</td>')
    // No literal pipe-row leak into the page.
    expect(fileContent).not.toContain('| Option | Cost |')
  })

  it('renders a blockquote callout as a real <blockquote>', () => {
    const { fileContent } = renderTargetFile({
      plan: caseworksPlan,
      content: structuredBody,
      title: 'Format test guide',
      region: 'US',
      contentType: 'legal_guide',
      primaryKeyword: 'format test',
      indexable: true,
      canonicalUrl: caseworksPlan.canonicalUrl,
    })
    expect(fileContent).toContain('<blockquote>')
    expect(fileContent).toContain('</blockquote>')
    expect(fileContent).toContain('<strong>Note:</strong> verify the current fee schedule.')
  })

  it('blog pages render numbered steps with a list-decimal <ol>', () => {
    const { fileContent } = renderTargetFile({
      plan: blogPlan,
      content: structuredBody,
      title: 'Format test guide',
      region: 'US',
      contentType: 'blog_post',
      primaryKeyword: 'format test',
      indexable: true,
      canonicalUrl: blogPlan.canonicalUrl,
    })
    expect(fileContent).toContain('<ol className="mt-4 list-decimal')
    expect(fileContent).toContain('<li>Gather your passport.</li>')
    // Blog tables render with the bordered utility classes.
    expect(fileContent).toContain('<table className="mt-4 w-full border-collapse text-sm">')
    expect(fileContent).toContain('<blockquote className="mt-4 border-l-2')
  })
})

describe('editorialContract — deterministic markdown format spec is locked in', () => {
  it('instructs real markdown numbers so the renderer can keep the count', () => {
    expect(EDITORIAL_FORMATTING_CONTRACT).toMatch(/NUMBERED LISTS/)
    expect(EDITORIAL_FORMATTING_CONTRACT).toMatch(/numbered <ol>/i)
    expect(EDITORIAL_FORMATTING_CONTRACT).toMatch(/Never fake numbering/i)
  })

  it('instructs the pipe-table and blockquote syntax the renderer understands', () => {
    expect(EDITORIAL_FORMATTING_CONTRACT).toContain('| --- | --- |')
    expect(EDITORIAL_FORMATTING_CONTRACT).toMatch(/real <table>/i)
    expect(EDITORIAL_FORMATTING_CONTRACT).toMatch(/blockquote/i)
  })

  it('instructs one-blank-line spacing and no trailing spaces', () => {
    expect(EDITORIAL_FORMATTING_CONTRACT).toMatch(/exactly ONE blank line/i)
    expect(EDITORIAL_FORMATTING_CONTRACT).toMatch(/trailing spaces/i)
  })
})

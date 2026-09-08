/**
 * Marketplace copy rendering — HTML comments must never leak as visible text.
 *
 * Live defect (2026-09-08): 213 gig descriptions carried `<!-- roster-ref:… -->`
 * internal identifiers and lib/bioMarkdown rendered them verbatim, so the
 * public gig page displayed "roster-ref:7e2a1339" as text. The renderer now
 * strips comments; plain-text surfaces (gig pitch) use stripHtmlComments too.
 */
import { stripHtmlComments, renderBioMarkdown, replaceMarkdownSection } from '@/lib/bioMarkdown'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, Fragment } from 'react'

describe('stripHtmlComments', () => {
  it('removes full HTML comments', () => {
    const out = stripHtmlComments('Help with filing <!-- roster-ref:7e2a1339 --> fast.').replace(/\s+/g, ' ')
    expect(out).toBe('Help with filing fast.')
  })

  it('removes bare / unterminated comment tokens', () => {
    expect(stripHtmlComments('a <!-- b -- c')).not.toContain('<!--')
    expect(stripHtmlComments('a --> b')).not.toContain('-->')
  })

  it('removes multiline comments and preserves the rest', () => {
    const input = '## About me\nI am X.\n<!-- Public roster research indicates roughly 5+ years.\nPractice setting (public): … -->\nCredentials shown.'
    const out = stripHtmlComments(input)
    expect(out).not.toContain('roster')
    expect(out).not.toContain('Practice setting')
    expect(out).toContain('## About me')
    expect(out).toContain('I am X.')
    expect(out).toContain('Credentials shown.')
  })

  it('returns empty for null/undefined', () => {
    expect(stripHtmlComments(null)).toBe('')
    expect(stripHtmlComments(undefined)).toBe('')
  })
})

describe('renderBioMarkdown — comments never become visible text', () => {
  const HOSTILE = `## About me — Deirdre Dawn Nero
I am Deirdre Dawn Nero, a licensed attorney.
<!-- roster-ref:7e2a1339 -->
Public roster research indicates roughly 23+ years of relevant immigration practice.
- one
- two`

  it('renders no roster-ref / comment text, while keeping headings + bullets', () => {
    const html = renderToStaticMarkup(createElement(Fragment, null, renderBioMarkdown(HOSTILE)))
    // Comments never leak; real (non-comment) lines still render.
    expect(html).not.toContain('roster-ref')
    expect(html).not.toContain('<!--')
    expect(html).toContain('About me — Deirdre Dawn Nero')
    expect(html).toContain('Public roster research indicates roughly 23+ years')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<li>two</li>')
  })

  it('strips a malformed (unterminated) roster comment so it never renders', () => {
    const html = renderToStaticMarkup(createElement(Fragment, null, renderBioMarkdown('## X\nhelp <!-- roster-ref:abc123')))
    expect(html).not.toContain('roster-ref')
    expect(html).not.toContain('<!--')
    expect(html).toContain('help')
  })
})

describe('replaceMarkdownSection — real end-of-input, no \\Z reliance', () => {
  const NEW = '## About me — X\nI am X.\n'

  it('replaces a section that is the LAST section in the description', () => {
    const d = '## Who this is for\nsome text\n## About me — old\nold lines\n'
    const out = replaceMarkdownSection(d, '## About me', NEW)
    expect(out.startsWith('## Who this is for\nsome text\n## About me — X\nI am X.')).toBe(true)
    expect(out.endsWith('I am X.')).toBe(true)
    expect(out).not.toContain('old lines')
  })

  it('replaces a section with a following ## heading (keeps the rest)', () => {
    const d = '## About me — old\na\nb\n## Disclaimer\nlegal\n'
    const out = replaceMarkdownSection(d, '## About me', NEW)
    expect(out).toBe(NEW + '## Disclaimer\nlegal\n')
  })

  it('keeps a literal letter Z inside the section (no \\Z identity-escape truncation)', () => {
    const d = '## About me — Zack\ne-Z-filing guidance for residents\n## Next step\nz\n'
    const out = replaceMarkdownSection(d, '## About me', NEW)
    expect(out).toBe(NEW + '## Next step\nz\n')
  })

  it('leaves the description unchanged when the heading is absent', () => {
    expect(replaceMarkdownSection('## OnlyOther\nx', '## About me', NEW)).toBe('## OnlyOther\nx')
  })
})
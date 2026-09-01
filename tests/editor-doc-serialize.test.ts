import { parseDsHtml, serializeDsHtml } from '../lib/editorDoc'

describe('editorDoc — WYSIWYG DOM ↔ markdown gateway', () => {
  it('round-trips headings, paragraphs, bold/italic, links', () => {
    const html = '<h2>Fee models</h2><p>Rates run from <strong>$50</strong> to <em>$300</em> per hour. See <a href="https://www.irs.gov/">IRS</a>.</p>'
    const md = serializeDsHtml(html)
    expect(md).toContain('## Fee models')
    expect(md).toContain('**$50**')
    expect(md).toContain('*$300*')
    expect(md).toContain('[IRS](https://www.irs.gov/)')
  })

  it('serializes lists with correct markers and numbering', () => {
    const html = '<ul><li>School shortlisting</li><li>Essay editing</li></ul><ol><li>First</li><li>Second</li></ol>'
    const md = serializeDsHtml(html)
    expect(md).toContain('- School shortlisting')
    expect(md).toContain('1. First')
    expect(md).toContain('2. Second')
  })

  it('serializes tables with a separator row', () => {
    const html = '<table><thead><tr><th>Fee model</th><th>Range</th></tr></thead><tbody><tr><td>Hourly</td><td>$50-$300</td></tr></tbody></table>'
    const md = serializeDsHtml(html)
    expect(md.split('\n')[0]).toBe('| Fee model | Range |')
    expect(md.split('\n')[1]).toBe('| --- | --- |')
    expect(md).toContain('| Hourly | $50-$300 |')
  })

  it('emits data-keep containers verbatim (frontmatter / JSON-LD)', () => {
    const keep = '<div data-keep="1">\u0000KEEP\u0000<script type="application/ld+json">{"@type": "Article"}</script></div>'
    const md = serializeDsHtml('<h1>Title</h1>' + keep)
    expect(md).toContain('# Title')
    expect(md).toContain('{"@type": "Article"}')
  })

  it('blockquotes and hr survive the round trip', () => {
    const md = serializeDsHtml('<blockquote>Never rely on verbal promises.</blockquote><hr>')
    expect(md).toContain('> Never rely on verbal promises.')
    expect(md).toContain('---')
  })

  it('parses nested inline children inside list items', () => {
    const nodes = parseDsHtml('<ul><li><strong>Cash-only</strong> payment</li></ul>')
    expect(serializeDsHtml('<ul><li><strong>Cash-only</strong> payment</li></ul>')).toContain('- **Cash-only** payment')
    expect(nodes[0].tag).toBe('ul')
  })
})
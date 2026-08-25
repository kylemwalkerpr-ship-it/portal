/**
 * Regression tests for the Word-style draft renderer (lib/markdownDocument).
 *
 * Locks that the Draft stage "Document" view renders a draft the way it will
 * read on the live page: front matter stripped, real headings, pipe tables,
 * ordered/unordered lists, and blockquote callouts with bold lead-ins.
 * Rendered server-side (renderToStaticMarkup) so no DOM/Testing Library is
 * needed.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { documentPreviewSource, MarkdownDocument } from '@/lib/markdownDocument'

const render = (md: string) => renderToStaticMarkup(React.createElement(MarkdownDocument, { source: md }))

describe('MarkdownDocument — Word-style draft renderer', () => {
  it('strips YAML front matter and renders headings', () => {
    const html = render('---\ntitle: Test Guide\nprimary_keyword: test guide\n---\n# Guide Title\n\n## Section One\n')
    expect(html).toContain('<h1')
    expect(html).toContain('Guide Title')
    expect(html).toContain('<h2')
    expect(html).toContain('Section One')
    expect(html).not.toContain('primary_keyword')
  })

  it('renders a pipe table with header and body cells', () => {
    const html = render('| Document | Fee |\n| --- | --- |\n| Passport | $165 |\n')
    expect(html).toContain('<table')
    expect(html).toContain('<th')
    expect(html).toContain('Document')
    expect(html).toContain('<td')
    expect(html).toContain('Passport')
  })

  it('renders ordered and unordered lists', () => {
    const html = render('1. First step\n2. Second step\n\n- A bullet\n- Another bullet\n')
    expect(html).toContain('<ol')
    expect(html).toContain('<ul')
    expect(html).toContain('First step')
    expect(html).toContain('Another bullet')
  })

  it('renders blockquote callouts with bold lead-ins', () => {
    const html = render('> **Note:** verify the fee schedule.\n')
    expect(html).toContain('<blockquote')
    expect(html).toContain('<strong>Note:</strong>')
  })

  it('renders the empty state when there is no content', () => {
    const html = render('')
    expect(html).toContain('Nothing to preview yet')
  })

  it('does not render JSON-LD script dumps in the live document preview', () => {
    const raw = `# CPT approval letter

The DSO writes the campus letter.

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is CPT?"}]}
</script>
`
    expect(documentPreviewSource(raw)).toContain('The DSO writes')
    expect(documentPreviewSource(raw)).not.toContain('@context')
    expect(documentPreviewSource(raw)).not.toContain('FAQPage')
    const html = render(raw)
    expect(html).toContain('CPT approval letter')
    expect(html).not.toContain('@context')
    expect(html).not.toContain('mainEntity')
  })
})

describe('MarkdownDocument — HTML content rendering', () => {
  it('renders HTML h2 tags as styled headings', () => {
    const html = '<h2>In 60 seconds</h2><p>The F-1 visa lets students study.</p>'
    const { renderToStaticMarkup } = require('react-dom/server')
    const React = require('react')
    const { MarkdownDocument } = require('@/lib/markdownDocument')
    const result = renderToStaticMarkup(React.createElement(MarkdownDocument, { source: html }))
    expect(result).toContain('<h2')
    expect(result).toContain('In 60 seconds')
    expect(result).not.toContain('&lt;h2&gt;')
  })

  it('renders HTML anchor tags as styled links', () => {
    const html = '<p>Visit <a href="https://www.uscis.gov">USCIS</a> for details.</p>'
    const { renderToStaticMarkup } = require('react-dom/server')
    const React = require('react')
    const { MarkdownDocument } = require('@/lib/markdownDocument')
    const result = renderToStaticMarkup(React.createElement(MarkdownDocument, { source: html }))
    expect(result).toContain('<a')
    expect(result).toContain('https://www.uscis.gov')
    expect(result).toContain('USCIS')
    expect(result).not.toContain('&lt;a href')
  })

  it('renders HTML list tags as styled lists', () => {
    const html = '<ul><li><strong>Stream 1:</strong> Post-Study Work</li><li><strong>Stream 2:</strong> Graduate</li></ul>'
    const { renderToStaticMarkup } = require('react-dom/server')
    const React = require('react')
    const { MarkdownDocument } = require('@/lib/markdownDocument')
    const result = renderToStaticMarkup(React.createElement(MarkdownDocument, { source: html }))
    expect(result).toContain('<ul')
    expect(result).toContain('<li')
    expect(result).toContain('Post-Study Work')
    expect(result).not.toContain('&lt;ul&gt;')
  })

  it('still renders pure markdown as before', () => {
    const md = '## Heading\n\nParagraph with **bold**.'
    const { renderToStaticMarkup } = require('react-dom/server')
    const React = require('react')
    const { MarkdownDocument } = require('@/lib/markdownDocument')
    const result = renderToStaticMarkup(React.createElement(MarkdownDocument, { source: md }))
    expect(result).toContain('<h2')
    expect(result).toContain('Heading')
    expect(result).toContain('<strong>bold</strong>')
  })
})

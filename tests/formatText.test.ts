import React from 'react'
import { renderToString } from 'react-dom/server'
import { formatWhatsAppText } from '../lib/messaging/formatText'

describe('formatWhatsAppText', () => {
  it('formats bold text with asterisks', () => {
    const node = formatWhatsAppText('Hello *world*!')
    const html = renderToString(React.createElement('div', null, node))
    expect(html).toContain('Hello ')
    expect(html).toContain('world')
    expect(html).toMatch(/<strong[^>]*>world<\/strong>/)
    expect(html).toContain('!')
  })

  it('formats italic text with underscores', () => {
    const node = formatWhatsAppText('This is _italic_ text')
    const html = renderToString(React.createElement('div', null, node))
    expect(html).toContain('<em>italic</em>')
  })

  it('formats strikethrough with tildes', () => {
    const node = formatWhatsAppText('This is ~deleted~ text')
    const html = renderToString(React.createElement('div', null, node))
    expect(html).toContain('<del>deleted</del>')
  })

  it('formats code with backticks', () => {
    const node = formatWhatsAppText('Use `const x = 1` here')
    const html = renderToString(React.createElement('div', null, node))
    expect(html).toMatch(/<code[^>]*>const x = 1<\/code>/)
  })

  it('handles line breaks', () => {
    const node = formatWhatsAppText('Line 1\nLine 2')
    const html = renderToString(React.createElement('div', null, node))
    expect(html).toContain('Line 1<br/>Line 2')
  })
})

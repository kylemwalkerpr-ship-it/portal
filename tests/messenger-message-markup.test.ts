import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderMessageMarkup } from '@/lib/messaging/messageMarkup'

const render = (text: string) => renderToStaticMarkup(React.createElement('div', null, renderMessageMarkup(text)))
describe('safe Messenger message formatting', () => {
  test('shows generated and space-padded bold as semantic strong text', () => {
    const html = render('Hi **YQAA**. This is ** important **.\nNext step.')
    expect(html).toContain('<strong>YQAA</strong>')
    expect(html).toContain('<strong>important</strong>')
    expect(html).not.toContain('**')
    expect(html).toContain('\nNext step.')
  })
  test('escapes HTML and keeps unsafe links inert', () => {
    const html = render('<img src=x onerror=alert(1)> [open](javascript:alert(1)) **safe**')
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<a')
    expect(html).toContain('<strong>safe</strong>')
  })
  test('renders a public source link safely and leaves incomplete markers readable', () => {
    const html = render('[Source](https://ca.yousafeconsultancy.com/resources/) **unfinished')
    expect(html).toContain('href="https://ca.yousafeconsultancy.com/resources/"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('**unfinished')
  })
})

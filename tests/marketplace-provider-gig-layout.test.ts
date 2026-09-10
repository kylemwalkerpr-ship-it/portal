import fs from 'node:fs'
import path from 'node:path'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderBioMarkdown } from '@/lib/bioMarkdown'

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function render(markdown: string): string {
  return renderToStaticMarkup(createElement(Fragment, null, renderBioMarkdown(markdown)))
}

describe('marketplace rich text renderer', () => {
  test('renders supported inline formatting instead of leaking markdown markers', () => {
    const html = render([
      '## What you receive',
      '',
      '**Attorney review** with *written guidance*, __clear scope__, and <u>important limitations</u>.',
      '',
      '- **Evidence** checklist',
      '- [USCIS guidance](https://www.uscis.gov/)',
      '',
      '1. Upload the file',
      '2. Receive the review',
    ].join('\n'))

    expect(html).toContain('<strong>Attorney review</strong>')
    expect(html).toContain('<em>written guidance</em>')
    expect(html).toContain('<strong>clear scope</strong>')
    expect(html).toContain('<u>important limitations</u>')
    expect(html).toContain('<ul')
    expect(html).toContain('<ol')
    expect(html).toContain('href="https://www.uscis.gov/"')
    expect(html).not.toContain('**Attorney review**')
    expect(html).not.toContain('__clear scope__')
  })

  test('removes dangling strong markers instead of displaying raw ** or __', () => {
    expect(render('**Important limitation')).toContain('Important limitation')
    expect(render('Important limitation**')).toContain('Important limitation')
    expect(render('__Important limitation')).toContain('Important limitation')
    expect(render('Important limitation__')).toContain('Important limitation')
    expect(render('**Important limitation')).not.toContain('**')
    expect(render('Important limitation__')).not.toContain('__')
  })

  test('does not emit executable links from seller-authored markdown', () => {
    const html = render('[click me](javascript:alert(1))')
    expect(html).toContain('click me')
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('javascript:alert')
  })
})

describe('provider and gig professional-service layout', () => {
  const layout = read('app/marketplace/layout.tsx')
  const css = read('app/marketplace/provider-gig-layout.css')
  const sellerPage = read('components/marketplace/SellerProfilePage.tsx')

  test('loads the provider/gig layer after existing marketplace visual contracts', () => {
    const finishing = layout.indexOf("import './marketplace-card-finishing.css'")
    const providerGig = layout.indexOf("import './provider-gig-layout.css'")
    expect(finishing).toBeGreaterThan(-1)
    expect(providerGig).toBeGreaterThan(finishing)
  })

  test('puts package selection and checkout ahead of the seller card in the purchase rail', () => {
    expect(css).toContain('.ys-sidebar > :nth-child(2)')
    expect(css).toContain('order: 1')
    expect(css).toContain('.ys-sidebar > :nth-child(3)')
    expect(css).toContain('order: 2')
    expect(css).toContain('.ys-sidebar > :nth-child(1)')
    expect(css).toContain('order: 3')
  })

  test('uses one mobile ordering context so pricing is not stranded below reviews', () => {
    expect(css).toContain('@media (max-width: 1024px)')
    expect(css).toContain('display: contents !important')
    expect(css).toContain('.ys-sidebar {\n    order: 2')
    expect(css).toContain('.ys-content-layout > div:first-child > :not(:first-child)')
  })

  test('shows services on the default About Me profile view without duplicate stat cards', () => {
    expect(sellerPage).toContain('className="ys-seller-about-stack"')
    expect(sellerPage).toContain('<SellerAbout seller={seller} />')
    expect(sellerPage).toContain('<SellerGigs gigs={gigs}')
    expect(sellerPage).not.toContain('<SellerStats seller={seller} />')
  })
})

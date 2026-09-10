/// <reference types="jest" />

import fs from 'node:fs'
import path from 'node:path'

describe('Marketplace gig long-form section hierarchy', () => {
  test('keeps Similar Services, then Reviews, then FAQs at the bottom on all viewports', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'app/mobile-marketplace-profile-gig.css'), 'utf8')
    const media = css.indexOf('@media (max-width: 700px)')
    const similar = css.indexOf("div:has(a[href^='/gigs/'])")
    const reviews = css.indexOf('div:has(h2)')
    const faq = css.indexOf('div:has(> h3 + div > div > button)')

    expect(similar).toBeGreaterThan(-1)
    expect(reviews).toBeGreaterThan(similar)
    expect(faq).toBeGreaterThan(reviews)
    expect(similar).toBeLessThan(media)
    expect(reviews).toBeLessThan(media)
    expect(faq).toBeLessThan(media)
    expect(css.slice(similar, media)).toContain('order: 80')
    expect(css.slice(reviews, media)).toContain('order: 90')
    expect(css.slice(faq, media)).toContain('order: 100')
  })
})

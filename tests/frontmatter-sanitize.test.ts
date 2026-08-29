/**
 * Frontmatter sanitizer regression tests.
 *
 * Locks in the fix for the nested-YAML description incident: a leaked
 * frontmatter block was scraped into the YAML description field, which was
 * then re-injected into the body, creating an ever-nesting header.
 */
import { sanitizeFrontmatter } from '@/lib/seoFactory/formatContract'

const POLLUTED_DESCRIPTION = `content_type: article region: US description: "content_type: article region: US description: \\"content_type: article region: US description: editorial guide for international students.\\""`

const LIVE_BLOB = `---
title: "F-1 Student Visa Guide: Requirements, Costs and Timeline"
content_type: article
region: US
description: ${JSON.stringify(POLLUTED_DESCRIPTION)}
canonicalUrl: /us/f-1-student-visa
robots: index,follow
ogImage: /og-image.png
---

content_type: article
region: US
description: "F-1 Student Visa Guide: Requirements, Costs and Timeline"
# F-1 Student Visa Guide: Requirements, Costs and Timeline

The F-1 visa is the primary student route for international study in the United States. This guide walks through each step of the process.

## In 60 seconds

- Apply to a SEVP-certified school first.
- Pay the SEVIS fee before your visa interview.
- Bring your I-20 and proof of funding to the consulate.

## Sources

- USCIS official guidance
`

describe('sanitizeFrontmatter', () => {
  it('replaces a polluted nested-YAML description with a clean single-line body sentence', () => {
    const out = sanitizeFrontmatter(LIVE_BLOB)
    const fmMatches = out.match(/^---\n[\s\S]*?\n---\n/gm)
    expect(fmMatches).toHaveLength(1)

    const descMatch = out.match(/^description:\s*(.+)$/m)
    expect(descMatch).toBeTruthy()
    const desc = descMatch![1].trim()
    expect(desc.length).toBeGreaterThanOrEqual(70)
    expect(desc.length).toBeLessThanOrEqual(160)
    expect(desc).not.toMatch(/content_type:|region:|canonicalUrl:|robots:|ogImage:|description:/)
    expect(desc).not.toMatch(/---/)
  })

  it('strips leaked YAML lines from the visible body so the body starts with the H1', () => {
    const out = sanitizeFrontmatter(LIVE_BLOB)
    const body = out.replace(/^---\n[\s\S]*?\n---\n\n?/, '')
    expect(body.trimStart()).toMatch(/^#\s+F-1 Student Visa Guide/)
    expect(body).not.toMatch(/\ncontent_type:\s+article/)
    expect(body).not.toMatch(/\nregion:\s+US/)
  })

  it('keeps a clean document unchanged except for ordering and whitespace', () => {
    const clean = `---
title: "Clean Guide"
content_type: article
region: US
description: "A clean description that sits inside the allowed band and contains no leaked tokens."
canonicalUrl: /us/clean
robots: index,follow
ogImage: /og-image.png
---

# Clean Guide

Body text here.
`
    const out = sanitizeFrontmatter(clean)
    expect(out).toContain('title: Clean Guide')
    expect(out).toContain('description: A clean description that sits inside the allowed band and contains no leaked tokens.')
    expect(out).toMatch(/^#\s+Clean Guide/m)
  })

  it('creates a frontmatter block when the input has none', () => {
    const out = sanitizeFrontmatter('# Bare Draft\n\nSome body text that explains things.')
    expect(out).toMatch(/^---\n/)
    expect(out).toMatch(/\n---\n\n# Bare Draft/)
    const desc = out.match(/^description:\s*(.+)$/m)?.[1]
    expect(desc).toBeTruthy()
    expect(desc!.length).toBeGreaterThanOrEqual(70)
    expect(desc!.length).toBeLessThanOrEqual(160)
  })
})

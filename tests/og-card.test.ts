import {
  buildOgCardSpec,
  ogImageFilePath,
  ogImagePublicPath,
  renderOgImageFile,
  renderOpenGraphImageModule,
} from '@/lib/seoFactory/ogCard'
import { renderTargetFile } from '@/lib/seoFactory/renderTarget'

const caseworksPlan = {
  matched: null as any,
  matchScore: 0,
  host: 'legal' as const,
  repo: 'caseworks' as any,
  filePath: 'app/us/student-visa-documents/page.tsx',
  canonicalUrl: 'https://legal.yousafeconsultancy.com/us/student-visa-documents/',
  indexable: true,
  action: 'create' as const,
  intentClass: 'legal_guide',
  contentType: 'legal_guide',
  warnings: [] as string[],
  blockers: [] as string[],
  ymy: true,
  routingSource: 'standing_rules' as const,
}

describe('og paths', () => {
  it('colocates opengraph-image.tsx next to page.tsx', () => {
    expect(ogImageFilePath('app/us/student-visa-documents/page.tsx')).toBe(
      'app/us/student-visa-documents/opengraph-image.tsx',
    )
    expect(ogImagePublicPath('app/us/student-visa-documents/page.tsx')).toBe(
      '/us/student-visa-documents/opengraph-image',
    )
    expect(ogImagePublicPath('landing-page/app/blog/essay-editing-service/page.tsx')).toBe(
      '/blog/essay-editing-service/opengraph-image',
    )
    expect(ogImageFilePath('content/uk/foo.mdx')).toBeNull()
  })
})

describe('house visual register', () => {
  it('is a desk card: country + title + artefact, no people or stamps', () => {
    const spec = buildOgCardSpec({
      title: 'Student visa documents checklist 2026',
      region: 'US',
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
      content: 'Confirm Form I-20 on the USCIS list before you file.',
    })
    expect(spec.kicker).toMatch(/United States/)
    expect(spec.title).toMatch(/Student visa documents/)
    expect(spec.artefact).toMatch(/I-20/)
    expect(spec.bg).toBe('#0F1C2E')
    const tsx = renderOpenGraphImageModule(spec)
    expect(tsx).toContain('next/og')
    expect(tsx).toContain('ImageResponse')
    expect(tsx).toContain('Form I-20')
    expect(tsx).not.toMatch(/passport photo|family|airport|Getty|smiling/i)
    const angled = renderOpenGraphImageModule({ ...spec, title: 'A < B > C' })
    expect(angled).toContain('<')
    expect(angled).toContain('>')
    expect(angled).not.toMatch(/title:\s*"A < B/)
  })

  it('blogs use the cream YouSafe pole', () => {
    const spec = buildOgCardSpec({
      title: 'How to build a student visa file',
      region: 'US',
      contentType: 'blog_post',
      filePath: 'landing-page/app/blog/x/page.tsx',
    })
    expect(spec.brand).toBe('yousafe')
    expect(spec.bg).toBe('#F4EFE6')
  })
})

describe('renderTarget uses the per-page card', () => {
  it('caseworks metadata points at the colocated OG, not the shared PNG', () => {
    const { fileContent } = renderTargetFile({
      plan: caseworksPlan,
      content: `---
title: Student visa documents checklist 2026
description: Confirm the live USCIS list and Form I-20 before you file.
---

# Student visa documents checklist 2026

Confirm Form I-20 on the USCIS list.

## Eligibility
You need a valid passport.

## FAQ
### What should you prepare first?
The live form list.

This is educational only, not legal advice.
`,
      title: 'Student visa documents checklist 2026',
      region: 'US',
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
      indexable: true,
      canonicalUrl: caseworksPlan.canonicalUrl,
    })
    expect(fileContent).toContain('url: "/us/student-visa-documents/opengraph-image"')
    expect(fileContent).not.toMatch(/url:\s*"\/og-image\.png"/)
    const og = renderOgImageFile({
      planFilePath: caseworksPlan.filePath,
      title: 'Student visa documents checklist 2026',
      region: 'US',
      contentType: 'legal_guide',
      primaryKeyword: 'student visa documents',
      content: 'Form I-20',
    })
    expect(og?.filePath).toBe('app/us/student-visa-documents/opengraph-image.tsx')
    expect(og?.fileContent).toContain('ImageResponse')
  })
})

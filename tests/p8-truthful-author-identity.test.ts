/**
 * P8-PORTAL-A1-IDENTITY — truthful author/reviewer rendering.
 *
 * Fail-closed contract pinned here:
 *   · a marketplace citation is an AUTHOR identity, never a review event:
 *     `authorPackFromProvider` must not set `reviewedBy` to the cited person
 *     and must not stamp `lastReviewed` with the generation clock;
 *   · rendered visible bylines + structured metadata use the truthful named
 *     author from the pruned AuthorPack when one exists, and the existing
 *     Organization/editorial fallback otherwise — never a fabricated person;
 *   · reviewer metadata is OPTIONAL and DISTINCT: `reviewer === author` is
 *     never emitted to satisfy a schema;
 *   · no surface claims "attorney-reviewed" unless a proven reviewStatus
 *     establishes it (the apex CTA wording is neutral).
 */
import { renderTargetFile } from '@/lib/seoFactory/renderTarget'
import {
  resolveRenderedAuthor,
  resolveRenderedReviewer,
} from '@/lib/seoFactory/renderTargetCore'
import {
  authorPackFromProvider,
  matchProvidersToTopic,
  type CitableProvider,
} from '@/lib/seoFactory/providerAuthors'
import { buildEeatJsonLd } from '@/lib/seoFactory/eeat'
import type { AuthorPack } from '@/lib/seoFactory/authorPack'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'

function plan(
  partial: Partial<OwnerPlan> & Pick<OwnerPlan, 'host' | 'repo' | 'filePath' | 'canonicalUrl'>,
): OwnerPlan {
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

function pack(over: Partial<AuthorPack> = {}): AuthorPack {
  return {
    name: 'Jordan Hale',
    credential: 'Licensed attorney · NY',
    experienceScope: '8 years of practice · immigration, visas · US',
    experienceBeats: [],
    marketplaceUrl: 'https://market.yousafeconsultancy.com/providers/jordan-hale',
    providerType: 'attorney',
    ...over,
  }
}

const caseworksPlan = () =>
  plan({
    host: 'legal',
    repo: 'caseworks',
    filePath: 'app/us/h1b-visa/page.tsx',
    canonicalUrl: 'https://legal.yousafeconsultancy.com/us/h1b-visa/',
    contentType: 'legal_guide',
  })

const blogPlan = () =>
  plan({
    host: 'apex',
    repo: 'yousafe-consultancy',
    filePath: 'app/blog/f1-opt-filing-guide/page.tsx',
    canonicalUrl: 'https://yousafeconsultancy.com/blog/f1-opt-filing-guide/',
    contentType: 'blog_post',
  })

const markdown = `---
title: "H-1B visa filing guide for employers"
description: "A practical H-1B filing guide."
---

# H-1B visa filing guide for employers

Employers should confirm the registration window and the prevailing-wage step before filing.

## Filing steps

1. Register the beneficiary.
2. File the I-129 petition.

## FAQ

### When can an employer file the petition?
After an accepted registration and within the filing window.

Not legal advice — consult a licensed attorney.
`

function renderCaseworks(author?: AuthorPack | null) {
  const p = caseworksPlan()
  return renderTargetFile({
    plan: p,
    content: markdown,
    title: 'H-1B visa filing guide for employers',
    region: 'US',
    contentType: 'legal_guide',
    primaryKeyword: 'h1b visa filing',
    indexable: true,
    canonicalUrl: p.canonicalUrl,
    ...(author ? { author } : {}),
  })
}

function renderBlog(author?: AuthorPack | null) {
  const p = blogPlan()
  return renderTargetFile({
    plan: p,
    content: markdown,
    title: 'F-1 OPT filing guide',
    region: 'US',
    contentType: 'blog_post',
    primaryKeyword: 'f-1 opt filing',
    indexable: true,
    canonicalUrl: p.canonicalUrl,
    ...(author ? { author } : {}),
  })
}

function citable(
  partial: Partial<CitableProvider> & { name: string; profileId: string },
): CitableProvider {
  const seed: CitableProvider = {
    profileId: partial.profileId,
    role: 'attorney',
    name: partial.name,
    username: 'jordan-hale',
    credentialType: 'Licensed attorney',
    barNumber: null,
    showBarNumber: false,
    barState: 'NY',
    yearsExperience: 8,
    tagline: 'US immigration petitions',
    practiceAreas: ['immigration', 'visas'],
    specialties: ['H-1B'],
    jurisdictions: ['US'],
    profileUrl: '',
    gigs: [
      { slug: 'h1b-petition-review', title: 'H-1B petition review', category: 'work visa', jurisdiction: 'US' },
    ],
    ...partial,
  }
  return seed
}

describe('providerAuthors — a citation is never a review event', () => {
  it('authorPackFromProvider sets no reviewer and no generation-time review date', () => {
    const cited = matchProvidersToTopic([citable({ name: 'Jordan Hale', profileId: 'a-us' })], {
      region: 'US',
      topic: 'H-1B visa',
      primaryKeyword: 'h-1b visa',
      contentType: 'legal_guide',
    })
    expect(cited[0]).toBeTruthy()
    const fromProvider = authorPackFromProvider(cited[0]!)
    expect(fromProvider.name).toBe('Jordan Hale')
    expect(fromProvider.reviewedBy).toBeUndefined()
    expect(fromProvider.lastReviewed).toBeUndefined()
    expect('reviewedBy' in fromProvider).toBe(false)
    expect('lastReviewed' in fromProvider).toBe(false)
    // Never the generation clock dressed up as a review date.
    expect(JSON.stringify(fromProvider)).not.toContain(new Date().toISOString().slice(0, 10))
    // The only reviewer identity this pack could name is the author themselves.
    expect(fromProvider.reviewedBy).not.toBe(fromProvider.name)
  })

  it('E-E-A-T JSON-LD never carries a self-review for a cited provider', () => {
    const cited = matchProvidersToTopic([citable({ name: 'Jordan Hale', profileId: 'a-us' })], {
      region: 'US',
      topic: 'H-1B visa',
      primaryKeyword: 'h-1b visa',
      contentType: 'legal_guide',
    })
    const json = buildEeatJsonLd({
      title: 'H-1B visa filing guide',
      canonicalUrl: 'https://legal.yousafeconsultancy.com/us/h1b-visa/',
      datePublished: '2026-09-01',
      authorPack: authorPackFromProvider(cited[0]!),
      ymyl: true,
    })
    const parsed = JSON.parse(json)
    const article = parsed['@graph'][0]
    expect(article.author.name).toBe('Jordan Hale')
    expect(article.reviewedBy).toBeUndefined()
    expect(json).not.toContain('"reviewedBy"')
  })
})

describe('renderTargetCore — truthful byline and optional distinct reviewer', () => {
  it('resolveRenderedAuthor prefers the named AuthorPack, else the editorial entity', () => {
    expect(resolveRenderedAuthor(pack())).toEqual({
      name: 'Jordan Hale',
      url: 'https://market.yousafeconsultancy.com/providers/jordan-hale',
      named: true,
    })
    const fallback = resolveRenderedAuthor(null)
    expect(fallback.named).toBe(false)
    expect(fallback.name).toBe('MyCaseworks Editorial')
    expect(fallback.firm).toBe('MyCaseworks')
    // A nameless pack is not a person.
    expect(resolveRenderedAuthor({ ...pack(), name: '   ' }).named).toBe(false)
  })

  it('resolveRenderedReviewer refuses self-review and unsupported reviewers', () => {
    expect(resolveRenderedReviewer(pack(), 'Jordan Hale')).toBeNull()
    expect(resolveRenderedReviewer(pack({ reviewedBy: '  jordan hale ' }), 'Jordan Hale')).toBeNull()
    expect(resolveRenderedReviewer(pack({ reviewedBy: '' }), 'Jordan Hale')).toBeNull()
    expect(resolveRenderedReviewer(null, 'MyCaseworks Editorial')).toBeNull()
    expect(resolveRenderedReviewer(pack({ reviewedBy: 'Dana Whitfield' }), 'Jordan Hale')).toEqual({
      name: 'Dana Whitfield',
      url: 'https://legal.yousafeconsultancy.com/about/',
    })
  })

  it('caseworks page renders the real named author and no reviewer', () => {
    const { fileContent } = renderCaseworks(pack())
    expect(fileContent).toContain(
      'author: { name: "Jordan Hale", url: "https://market.yousafeconsultancy.com/providers/jordan-hale" },',
    )
    expect(fileContent).not.toContain('reviewer:')
    expect(fileContent).not.toMatch(/reviewer=/)
    expect(fileContent).not.toContain('MyCaseworks Editorial')
    expect(fileContent).toContain('reviewStatus: "editorial-only"')
    expect(fileContent).not.toMatch(/attorney-reviewed/i)
  })

  it('caseworks page keeps the editorial fallback and still fabricates no reviewer', () => {
    const { fileContent } = renderCaseworks()
    expect(fileContent).toContain(
      'author: { name: "MyCaseworks Editorial", firm: "MyCaseworks", url: "https://legal.yousafeconsultancy.com/about/" },',
    )
    expect(fileContent).not.toContain('reviewer:')
    expect(fileContent).not.toMatch(/reviewer=/)
    expect(fileContent).toContain('reviewStatus: "editorial-only"')
  })

  it('caseworks page emits a reviewer only when it is a distinct, persisted identity', () => {
    const selfReviewed = renderCaseworks(pack({ reviewedBy: 'Jordan Hale' })).fileContent
    expect(selfReviewed).not.toContain('reviewer:')
    expect(selfReviewed).not.toMatch(/reviewer=/)

    const distinct = renderCaseworks(pack({ reviewedBy: 'Dana Whitfield' })).fileContent
    expect(distinct).toContain('reviewer: { name: "Dana Whitfield"')
    expect(distinct).toMatch(/<UpdatedStamp date=\{"\d{4}-\d{2}-\d{2}"\} reviewer="Dana Whitfield" \/>/)
    // Never the author as their own reviewer.
    const reviewerName = distinct.match(/reviewer: \{ name: "([^"]+)"/)![1]
    expect(reviewerName).not.toBe('Jordan Hale')
    // No review date is invented from the generation clock.
    expect(distinct).not.toMatch(/lastReviewed|reviewedAt/)
  })

  it('apex blog uses the truthful named author and neutral CTA wording', () => {
    const { fileContent } = renderBlog(pack())
    expect(fileContent).toContain('authors: ["Jordan Hale"]')
    expect(fileContent).toContain('{date} · Jordan Hale')
    expect(fileContent).not.toContain('MyCaseworks Editorial')
    expect(fileContent).not.toMatch(/attorney-reviewed/i)
    expect(fileContent).toContain('read the full MyCaseworks guide:')
  })

  it('apex blog keeps the editorial fallback byline when no named author exists', () => {
    const { fileContent } = renderBlog()
    expect(fileContent).toContain('authors: ["MyCaseworks Editorial"]')
    expect(fileContent).toContain('{date} · MyCaseworks Editorial')
    expect(fileContent).not.toMatch(/attorney-reviewed/i)
  })
})

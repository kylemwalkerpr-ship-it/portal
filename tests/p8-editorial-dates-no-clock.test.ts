/**
 * P8-PORTAL-FRESHNESS — an editorial publication/update date is DATA, never the
 * render / repair / re-audit / ship clock.
 *
 * Fail-closed contract pinned here:
 *   · a rendered caseworks page or apex blog page claims a date ONLY when the
 *     draft supplied a trustworthy frontmatter/persisted day; otherwise the
 *     visible stamp/byline and the structured `publishedTime`/`modifiedTime`/
 *     `publishedDate`/`updatedDate` fields are OMITTED (never `now`);
 *   · visible and structured metadata always agree — the same trusted day (or
 *     no day at all) drives both surfaces;
 *   · the trusted-date helper rejects relative ("today"), malformed and
 *     impossible ("2026-02-30") input instead of guessing;
 *   · the front-matter renderer and the blog-index entry never synthesize
 *     `date:`;
 *   · the deterministic scaffold repair and the Ahrefs schema repair never
 *     insert `datePublished`/`dateModified`, and the Ahrefs validator no longer
 *     treats their absence as an error;
 *   · the generated target file still parses (no duplicate/leftover imports)
 *     when the conditional `UpdatedStamp` import is emitted or omitted.
 */
import * as ts from 'typescript'
import { renderTargetFile, buildBlogPostEntry, insertBlogPostIntoData } from '@/lib/seoFactory/renderTarget'
import { resolveTrustedEditorialDates, trustedIsoDay } from '@/lib/seoFactory/renderTargetCore'
import { applyDeterministicRepairs } from '@/lib/seoFactory/editorialScaffold'
import { applyAhrefsDraftRepairs, articleJsonLdErrors } from '@/lib/seoFactory/ahrefsIssues'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'
import type { AuthorPack } from '@/lib/seoFactory/authorPack'

const CLOCK_DAY = new Date().toISOString().slice(0, 10)

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
    filePath: 'landing-page/app/blog/f1-opt-filing-guide/page.tsx',
    canonicalUrl: 'https://yousafeconsultancy.com/blog/f1-opt-filing-guide/',
    contentType: 'blog_post',
  })

function markdown(frontMatter = ''): string {
  return `---
title: "H-1B visa filing guide for employers"
description: "A practical H-1B filing guide for employers and international hires."
${frontMatter}---

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
}

const reviewerPack: AuthorPack = {
  name: 'Jordan Hale',
  credential: 'Licensed attorney · NY',
  experienceScope: '8 years of practice · immigration, visas · US',
  experienceBeats: [],
  marketplaceUrl: 'https://market.yousafeconsultancy.com/providers/jordan-hale',
  providerType: 'attorney',
  reviewedBy: 'Dana Whitfield',
}

function renderCaseworks(frontMatter: string, author?: AuthorPack | null) {
  const p = caseworksPlan()
  return renderTargetFile({
    plan: p,
    content: markdown(frontMatter),
    title: 'H-1B visa filing guide for employers',
    region: 'US',
    contentType: 'legal_guide',
    primaryKeyword: 'h1b visa filing',
    indexable: true,
    canonicalUrl: p.canonicalUrl,
    ...(author ? { author } : {}),
  })
}

function renderBlog(frontMatter: string) {
  const p = blogPlan()
  return renderTargetFile({
    plan: p,
    content: markdown(frontMatter),
    title: 'F-1 OPT filing guide',
    region: 'US',
    contentType: 'blog_post',
    primaryKeyword: 'f-1 opt filing',
    indexable: true,
    canonicalUrl: p.canonicalUrl,
  })
}

/** The generated target must be real TSX the caseworks repo can compile. */
function parseTargetTsx(source: string, label: string): void {
  const file = ts.createSourceFile(
    `${label}.tsx`,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const diagnostics = (file as unknown as { parseDiagnostics?: Array<{ messageText: unknown }> })
    .parseDiagnostics
  // Fail loudly if the compiler's parse-diagnostic surface ever changes, so
  // this can never pass vacuously.
  expect(Array.isArray(diagnostics)).toBe(true)
  expect((diagnostics || []).map((d) => String(d.messageText))).toEqual([])
}

/**
 * A repeated module specifier is a hard link-time failure in the target repo
 * even though the page still parses — e.g. the regression where a conditional
 * `UpdatedStamp` import left two consecutive `Tldr` imports behind.
 */
function importModulePaths(source: string): string[] {
  return (source.match(/^import\s[^\n]*?from\s+"([^"]+)";?$/gm) || []).map(
    (line) => (line.match(/from\s+"([^"]+)"/) || [])[1],
  )
}

function expectUniqueImports(source: string): void {
  const paths = importModulePaths(source)
  expect(paths.every(Boolean)).toBe(true)
  // No module may be imported twice — a repeated specifier is a hard
  // link-time failure in the target repo even when the file parses.
  expect([...new Set(paths)].length).toBe(paths.length)
  // The conditional import must match usage exactly, and never appear twice.
  const stampImports = paths.filter((p) => p === '@/components/article/UpdatedStamp').length
  expect(stampImports).toBe(/<UpdatedStamp\b/.test(source) ? 1 : 0)
  expect(paths.filter((p) => p === '@/components/article/Tldr').length).toBe(1)
}

describe('trustedIsoDay — only a real, explicitly supplied day is trustworthy', () => {
  it('accepts real ISO days and normalizes them', () => {
    expect(trustedIsoDay('2026-03-04')).toBe('2026-03-04')
    expect(trustedIsoDay('  2026-03-04  ')).toBe('2026-03-04')
    expect(trustedIsoDay('"2026-03-04"')).toBe('2026-03-04')
    expect(trustedIsoDay("'2026-03-04'")).toBe('2026-03-04')
    expect(trustedIsoDay('2026-03-04T10:11:12.000Z')).toBe('2026-03-04')
    expect(trustedIsoDay('2026-03-04 10:11')).toBe('2026-03-04')
    // A real day written without zero padding is still a real day.
    expect(trustedIsoDay('2026-3-4')).toBe('2026-03-04')
    // Leap day exists in 2024, not in 2026.
    expect(trustedIsoDay('2024-02-29')).toBe('2024-02-29')
  })

  it('rejects relative, malformed and impossible dates instead of guessing', () => {
    for (const bad of [
      '',
      '   ',
      null,
      undefined,
      'today',
      'Today',
      'yesterday',
      'now',
      '2026',
      '03/04/2026',
      'March 4, 2026',
      'last reviewed 2026-03-04',
      '2026-13-01',
      '2026-00-10',
      '2026-02-30',
      '2026-02-29',
      '2026-03-32',
      '2026-03-04x',
      'generatedAt: 2026-03-04',
    ]) {
      expect(trustedIsoDay(bad as string | null | undefined)).toBeNull()
    }
  })

  it('resolveTrustedEditorialDates reads only explicit frontmatter date keys', () => {
    expect(resolveTrustedEditorialDates(undefined)).toEqual({ published: null, updated: null })
    expect(resolveTrustedEditorialDates({})).toEqual({ published: null, updated: null })
    // Scaffolding/provenance keys are not editorial dates.
    expect(
      resolveTrustedEditorialDates({
        generatedBy: 'seo-factory',
        ownerHost: 'legal',
        title: '2026-03-04',
      }),
    ).toEqual({ published: null, updated: null })
    expect(resolveTrustedEditorialDates({ date: '2026-03-04' })).toEqual({
      published: '2026-03-04',
      updated: null,
    })
    expect(
      resolveTrustedEditorialDates({ publishedDate: '2026-03-04', dateModified: '2026-04-05' }),
    ).toEqual({ published: '2026-03-04', updated: '2026-04-05' })
    expect(resolveTrustedEditorialDates({ date: 'today', updated: '2026-04-05' })).toEqual({
      published: null,
      updated: '2026-04-05',
    })
  })
})

describe('caseworks page — no clock date, trusted dates preserved', () => {
  it('omits every date surface when the draft supplies no trusted date', () => {
    const { fileContent } = renderCaseworks('')
    expect(fileContent).not.toMatch(/\bpublishedDate\b|\bupdatedDate\b/)
    expect(fileContent).not.toMatch(/\bpublishedTime\b|\bmodifiedTime\b/)
    expect(fileContent).not.toContain('<UpdatedStamp')
    expect(fileContent).not.toContain('UpdatedStamp')
    expect(fileContent).not.toContain(CLOCK_DAY)
    parseTargetTsx(fileContent, 'caseworks-no-date')
  })

  it('emits exactly one conditional import block when a reviewer exists', () => {
    const { fileContent } = renderCaseworks('', reviewerPack)
    expectUniqueImports(fileContent)
    expect(fileContent).toContain('import { UpdatedStamp } from "@/components/article/UpdatedStamp";')
    // Reviewer identity alone never brings a date with it.
    expect(fileContent).toMatch(/<UpdatedStamp reviewer="Dana Whitfield" \/>/)
    expect(fileContent).not.toMatch(/\bpublishedDate\b|\bupdatedDate\b/)
    expect(fileContent).not.toContain(CLOCK_DAY)
    parseTargetTsx(fileContent, 'caseworks-reviewer-no-date')
  })

  it('never duplicates an import when the conditional UpdatedStamp import flips', () => {
    // Regression: the conditional import block once left two consecutive
    // `import { Tldr } ...` lines behind, which red-X's the caseworks build.
    const withoutStamp = renderCaseworks('').fileContent
    const withStamp = renderCaseworks('publishedDate: 2026-03-04\nupdatedDate: 2026-04-05\n').fileContent
    const withReviewerOnly = renderCaseworks('', reviewerPack).fileContent
    expectUniqueImports(withoutStamp)
    expectUniqueImports(withStamp)
    expectUniqueImports(withReviewerOnly)
    expect(withoutStamp).not.toContain('UpdatedStamp')
    expect((withStamp.match(/import\s+\{\s*Tldr\s*\}/g) || []).length).toBe(1)
    expect((withReviewerOnly.match(/import\s+\{\s*Tldr\s*\}/g) || []).length).toBe(1)
  })

  it('preserves a trusted frontmatter date consistently across visible + structured surfaces', () => {
    const { fileContent } = renderCaseworks(
      'publishedDate: 2026-03-04\nupdatedDate: 2026-04-05\n',
      reviewerPack,
    )
    expect(fileContent).toContain('  publishedDate: "2026-03-04",')
    expect(fileContent).toContain('  updatedDate: "2026-04-05",')
    expect(fileContent).toContain('    publishedTime: "2026-03-04",')
    expect(fileContent).toContain('    modifiedTime: "2026-04-05",')
    expect(fileContent).toMatch(/<UpdatedStamp date=\{"2026-04-05"\} reviewer="Dana Whitfield" \/>/)
    expect(fileContent).not.toContain(CLOCK_DAY)

    const visibleMeta = fileContent.match(/publishedDate: "([^"]+)"/)![1]
    const structuredPublished = fileContent.match(/publishedTime: "([^"]+)"/)![1]
    const visibleUpdated = fileContent.match(/updatedDate: "([^"]+)"/)![1]
    const structuredModified = fileContent.match(/modifiedTime: "([^"]+)"/)![1]
    const stampDate = fileContent.match(/<UpdatedStamp date=\{"([^"]+)"\}/)![1]
    expect(structuredPublished).toBe(visibleMeta)
    expect(structuredModified).toBe(visibleUpdated)
    expect(stampDate).toBe(visibleUpdated)
    parseTargetTsx(fileContent, 'caseworks-trusted-date')
  })

  it('ignores an untrustworthy frontmatter date rather than rendering it', () => {
    const { fileContent } = renderCaseworks('date: today\nupdated: 2026-02-30\n')
    expect(fileContent).not.toMatch(/\bpublishedDate\b|\bupdatedDate\b/)
    expect(fileContent).not.toContain('today')
    expect(fileContent).not.toContain('2026-02-30')
    parseTargetTsx(fileContent, 'caseworks-untrusted-date')
  })
})

describe('apex blog page — byline and structured date agree', () => {
  it('shows the author alone and no publishedTime when no trusted date exists', () => {
    const { fileContent } = renderBlog('')
    expect(fileContent).not.toMatch(/\bpublishedTime\b|\bmodifiedTime\b/)
    expect(fileContent).not.toContain('{date}')
    expect(fileContent).toContain(
      '<p className="text-sm text-muted-foreground">MyCaseworks Editorial</p>',
    )
    expect(fileContent).not.toContain(CLOCK_DAY)
  })

  it('carries a trusted frontmatter date into both the byline and publishedTime', () => {
    const { fileContent } = renderBlog('date: 2026-03-04\n')
    expect(fileContent).toContain('    publishedTime: "2026-03-04",')
    expect(fileContent).toContain(
      '<p className="text-sm text-muted-foreground">2026-03-04 · MyCaseworks Editorial</p>',
    )
    expect(fileContent).not.toContain(CLOCK_DAY)
    const bylineDate = fileContent.match(/text-muted-foreground">(\d{4}-\d{2}-\d{2}) ·/)![1]
    expect(fileContent).toContain(`publishedTime: "${bylineDate}",`)
  })
})

describe('blog index + frontmatter renderer — never synthesize date:', () => {
  const sampleData = `export const blogPosts: BlogPost[] = [
  {
    slug: "existing-post",
    title: "Existing Post",
    date: "2026-01-01",
  },
]
`

  it('builds an index entry without a date when the draft has none', () => {
    const entry = buildBlogPostEntry({
      plan: blogPlan(),
      content: markdown(''),
      title: 'F-1 OPT filing guide',
      region: 'US',
    })
    expect('date' in entry).toBe(false)
    expect(JSON.stringify(entry)).not.toContain(CLOCK_DAY)

    const updated = insertBlogPostIntoData(sampleData, entry)
    const inserted = updated.slice(
      updated.indexOf('slug: "f1-opt-filing-guide"'),
      updated.indexOf('slug: "existing-post"'),
    )
    expect(inserted).not.toMatch(/\bdate:/)
    expect(inserted).toContain('slug: "f1-opt-filing-guide",')
    expect(updated).toContain('date: "2026-01-01"')
  })

  it('carries a trusted draft date into the index entry', () => {
    const entry = buildBlogPostEntry({
      plan: blogPlan(),
      content: markdown('date: 2026-03-04\n'),
      title: 'F-1 OPT filing guide',
      region: 'US',
    })
    expect(entry.date).toBe('2026-03-04')
    const updated = insertBlogPostIntoData(sampleData, entry)
    expect(updated).toContain('    date: "2026-03-04",')
  })

  it('omits frontmatter date: on the markdown/MDX renderer with no trusted date', () => {
    const p = plan({
      host: 'portal',
      repo: 'portal',
      filePath: 'catalogue/guides/h1b-visa.md',
      canonicalUrl: 'https://portal.yousafeconsultancy.com/catalogue/guides/h1b-visa',
      contentType: 'legal_guide',
    })
    const rendered = renderTargetFile({
      plan: p,
      content: markdown(''),
      title: 'H-1B visa filing guide for employers',
      region: 'US',
      contentType: 'legal_guide',
      primaryKeyword: 'h1b visa filing',
      indexable: true,
      canonicalUrl: p.canonicalUrl,
    })
    const front = rendered.fileContent.slice(0, rendered.fileContent.indexOf('\n---', 3))
    expect(front).not.toMatch(/^\s*date:/m)
    expect(front).not.toContain(CLOCK_DAY)

    const trusted = renderTargetFile({
      plan: p,
      content: markdown('date: 2026-03-04\n'),
      title: 'H-1B visa filing guide for employers',
      region: 'US',
      contentType: 'legal_guide',
      primaryKeyword: 'h1b visa filing',
      indexable: true,
      canonicalUrl: p.canonicalUrl,
    })
    expect(trusted.fileContent).toContain('\ndate: 2026-03-04\n')
  })
})

describe('deterministic repair paths never insert a clock date', () => {
  const scaffoldDraft = `---
title: "Australia student visa conditions: work limits and OSHC"
description: "A practical guide to Australian student visa work limits, OSHC and enrolment conditions for 2026."
---

# Australia student visa conditions: work limits and OSHC

Students must keep enrolment active and hold OSHC for the whole visa period.
`

  it('editorialScaffold injects Article JSON-LD without datePublished/dateModified', () => {
    const { content, applied } = applyDeterministicRepairs({
      content: scaffoldDraft,
      title: 'Australia student visa conditions: work limits and OSHC',
      primaryKeyword: 'australia student visa conditions',
      region: 'AU',
      indexable: true,
      contentType: 'article',
    })
    expect(applied).toContain('schema_article')
    expect(content).not.toMatch(/datePublished|dateModified/)
    expect(content).not.toContain(CLOCK_DAY)
    const raw = (content.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/) || [])[1]
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed['@type']).toBe('Article')
    expect(parsed.datePublished).toBeUndefined()
    expect(parsed.dateModified).toBeUndefined()
  })

  it('Ahrefs repair rebuilds Article JSON-LD without inventing dates', () => {
    const draft = `---
title: UK Graduate Route visa requirements 2026
description: A practical guide to the UK Graduate Route with official sources and next steps.
canonicalUrl: https://legal.yousafeconsultancy.com/uk/graduate-route/
---

# UK Graduate Route visa requirements 2026

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":"UK Graduate Route visa requirements 2026","author":{"@type":"Organization","name":"MyCaseworks"}}
</script>

Graduates should check the completion window and the funds evidence before applying.
`
    const { content, applied } = applyAhrefsDraftRepairs(draft, {
      primaryKeyword: 'uk graduate visa',
      targetUrl: 'https://legal.yousafeconsultancy.com/uk/graduate-route/',
    })
    expect(applied).toContain('ahrefs_schema')
    expect(content).not.toMatch(/datePublished|dateModified/)
    expect(content).not.toContain(CLOCK_DAY)
    expect(articleJsonLdErrors(content)).toEqual([])
    // The rebuilt block keeps its reader-facing content and gains the image.
    expect(content).toContain('"image"')
    expect(content).toContain('UK Graduate Route visa requirements 2026')
  })

  it('Ahrefs validator no longer demands a date, but still demands the real fields', () => {
    const noDate = `# Guide

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":"H","image":["https://legal.yousafeconsultancy.com/og-image.png"],"author":{"@type":"Organization","name":"MyCaseworks"}}
</script>
`
    expect(articleJsonLdErrors(noDate)).toEqual([])

    const missingImage = `<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":"H","author":{"@type":"Organization","name":"MyCaseworks"}}
</script>`
    expect(articleJsonLdErrors(missingImage)).toContain(
      'Article missing image (schema.org / Google required)',
    )

    const missingAuthor = `<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":"H","image":["https://legal.yousafeconsultancy.com/og-image.png"]}
</script>`
    expect(articleJsonLdErrors(missingAuthor)).toContain('Article missing author')
  })
})

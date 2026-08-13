/**
 * Route-subtype overwrite guard — the last line of defence against the
 * 2026-08 incident where "uk graduate visa requirements" shipped onto the
 * spouse-visa-document-checklist page and overwrote live content.
 */
import { extractGeoModifiers, extractRouteSubtypes } from '@/lib/seoFactory/ownership'
import {
  assertNoRouteSubtypeConflict,
  extractExistingPageSubject,
  geoScopeConflict,
  routeSubtypeConflict,
} from '@/lib/seoFactory/routeSubtypeGuard'
import { getRepoFileContent } from '@/lib/githubContents'

jest.mock('@/lib/githubContents', () => ({
  getRepoFileContent: jest.fn(),
}))

const mockedGet = getRepoFileContent as jest.Mock

const SPOUSE_PAGE = `import type { ArticleMeta } from "@/lib/article-types";

const meta: ArticleMeta = {
  slug: "uk-spouse-visa-document-checklist-2026",
  title: "UK spouse visa doc checklist (2026): what UKVI wants",
  primaryKeyword: "UK spouse visa document checklist 2026",
};

export const metadata = { title: "x" };
export default function Page() { return null; }
`

const STUDENT_HUB_PAGE = `import type { ArticleMeta } from "@/lib/article-types";

const meta: ArticleMeta = {
  slug: "student-visas",
  title: "US student visas: F-1, CPT, OPT & STEM OPT",
  primaryKeyword: "us student visas hub",
};

export const metadata = { title: "x" };
export default function Page() { return null; }
`

const BOULDER_PAGE = `import type { ArticleMeta } from "@/lib/article-types";

const meta: ArticleMeta = {
  slug: "f1-rejection-recovery",
  title: "Boulder F-1 Visa: School, I-20, and Application Steps",
  primaryKeyword: "boulder f-1 visa",
};

export const metadata = { title: "x" };
export default function Page() { return null; }
`

describe('extractRouteSubtypes', () => {
  it('extracts normalized route subtypes', () => {
    expect(extractRouteSubtypes('uk spouse visa document checklist 2026')).toEqual(['spouse'])
    expect(extractRouteSubtypes('uk dependent visa child requirements')).toEqual([
      'dependent',
      'child',
    ])
    expect(extractRouteSubtypes('uk graduate visa requirements')).toEqual(['graduate'])
    expect(extractRouteSubtypes('how to rent in austin')).toEqual([])
  })

  it('normalizes British spelling variants (dependant → dependent)', () => {
    expect(extractRouteSubtypes('uk dependant visa child requirements')).toEqual([
      'dependent',
      'child',
    ])
  })
})

describe('extractGeoModifiers', () => {
  it('extracts city/university/state modifiers', () => {
    expect(extractGeoModifiers('boulder student visas')).toEqual(['boulder'])
    expect(extractGeoModifiers('auburn university student housing')).toEqual([
      'auburn',
      'university',
    ])
    expect(extractGeoModifiers('austin student housing')).toEqual(['austin'])
  })

  it('returns nothing for generic route keywords', () => {
    expect(extractGeoModifiers('us student visas hub')).toEqual([])
    expect(extractGeoModifiers('uk spouse visa document checklist 2026')).toEqual([])
    expect(extractGeoModifiers('uk graduate visa requirements')).toEqual([])
  })

  it('matches university-of phrases', () => {
    expect(extractGeoModifiers('university of washington f-1')).toContain('washington')
  })
})

describe('routeSubtypeConflict', () => {
  it('conflicts when route subtypes are disjoint', () => {
    expect(
      routeSubtypeConflict('uk graduate visa requirements', 'UK spouse visa document checklist').conflict,
    ).toBe(true)
    expect(
      routeSubtypeConflict('uk dependent visa child requirements', 'UK spouse visa document checklist')
        .conflict,
    ).toBe(true)
  })

  it('does not conflict for the same subtype (legitimate expansion)', () => {
    expect(
      routeSubtypeConflict('uk spouse visa document checklist 2026', 'UK spouse visa document checklist')
        .conflict,
    ).toBe(false)
  })

  it('does not conflict when the family pillar shares the dependent token with the hub', () => {
    // "uk dependent visa family pillar" → {dependent}; the family-visas hub title
    // carries {spouse, child, dependent, parent}. The shared "dependent" allows
    // the pillar to expand the hub, while "family" alone would not have.
    expect(
      routeSubtypeConflict(
        'uk dependent visa family pillar',
        'UK Family Visas: spouse, child dependant, and parent guide',
      ).conflict,
    ).toBe(false)
  })

  it('conflicts across different specific routes even when both share "family"', () => {
    // "family" is an umbrella; partner vs parent are the real (disjoint) routes.
    expect(
      routeSubtypeConflict('uk family visa partner route', 'UK family visa parent route').conflict,
    ).toBe(true)
    expect(
      routeSubtypeConflict('uk family visa partner', 'UK family visa child dependant').conflict,
    ).toBe(true)
  })

  it('does not conflict when a spelling variant matches (dependant vs dependent)', () => {
    expect(
      routeSubtypeConflict('uk dependant visa child requirements', 'UK dependent visa child guide')
        .conflict,
    ).toBe(false)
  })

  it('does not conflict when either side has no specific route subtype', () => {
    expect(routeSubtypeConflict('austin rental guide', 'UK spouse visa document checklist').conflict).toBe(
      false,
    )
    // pure "family" (umbrella only) carries no disambiguating token → fail-open
    expect(routeSubtypeConflict('uk family visa guide', 'UK spouse visa document checklist').conflict).toBe(
      false,
    )
  })
})

describe('geoScopeConflict', () => {
  it('conflicts when a geo-specific article targets a generic hub (the boulder incident)', () => {
    const c = geoScopeConflict('boulder student visas', 'US student visas: F-1, CPT, OPT & STEM OPT')
    expect(c.conflict).toBe(true)
    expect(c.article).toEqual(['boulder'])
    expect(c.existing).toEqual([])
  })

  it('conflicts when a generic article targets a geo-specific page', () => {
    const c = geoScopeConflict('us student visas hub', 'Boulder F-1 Visa: School, I-20, and Application Steps')
    expect(c.conflict).toBe(true)
    expect(c.existing).toEqual(['boulder'])
  })

  it('conflicts when both sides are geo-specific but different scopes', () => {
    expect(geoScopeConflict('austin student visas', 'Boulder F-1 Visa').conflict).toBe(true)
  })

  it('passes when both sides share the same geo scope (legit expansion)', () => {
    expect(geoScopeConflict('boulder f-1 visa', 'Boulder F-1 Visa: School, I-20, and Application Steps').conflict).toBe(
      false,
    )
    expect(geoScopeConflict('boulder student visas', 'boulder f-1 visa').conflict).toBe(false)
  })

  it('passes when neither side is geo-specific', () => {
    expect(geoScopeConflict('uk spouse visa document checklist', 'UK spouse visa doc checklist').conflict).toBe(
      false,
    )
    expect(geoScopeConflict('us student visas hub', 'US student visas: F-1, CPT, OPT & STEM OPT').conflict).toBe(
      false,
    )
  })
})

describe('extractExistingPageSubject', () => {
  it('reads primaryKeyword from a caseworks page.tsx', () => {
    expect(
      extractExistingPageSubject(
        SPOUSE_PAGE,
        'app/uk/immigration/uk-spouse-visa-document-checklist-2026/page.tsx',
      ),
    ).toBe('UK spouse visa document checklist 2026')
  })

  it('falls back to title when primaryKeyword is missing', () => {
    const page = `const meta = { title: "UK Spouse Visa Document Checklist" } as any;`
    expect(extractExistingPageSubject(page, 'app/uk/foo/page.tsx')).toBe(
      'UK Spouse Visa Document Checklist',
    )
  })

  it('reads title from markdown front matter', () => {
    const md = '---\ntitle: "Canada spousal sponsorship guide"\ncanonical: "https://legal.yousafeconsultancy.com/ca/spousal/"\n---\n\nbody'
    expect(extractExistingPageSubject(md, 'ca/content/spousal.md')).toContain('spousal')
  })
})

describe('assertNoRouteSubtypeConflict', () => {
  beforeEach(() => jest.clearAllMocks())

  it('throws when the existing page has a different route subtype', async () => {
    mockedGet.mockResolvedValue(SPOUSE_PAGE)
    await expect(
      assertNoRouteSubtypeConflict({
        owner: 'kylemwalkerpr-ship-it',
        repo: 'caseworks',
        filePath: 'app/uk/immigration/uk-spouse-visa-document-checklist-2026/page.tsx',
        primaryKeyword: 'uk graduate visa requirements',
      }),
    ).rejects.toThrow(/route-subtype conflict/i)
  })

  it('passes for a legitimate expansion of the same subtype', async () => {
    mockedGet.mockResolvedValue(SPOUSE_PAGE)
    await expect(
      assertNoRouteSubtypeConflict({
        owner: 'kylemwalkerpr-ship-it',
        repo: 'caseworks',
        filePath: 'app/uk/immigration/uk-spouse-visa-document-checklist-2026/page.tsx',
        primaryKeyword: 'uk spouse visa document checklist 2026',
      }),
    ).resolves.toBeUndefined()
  })

  it('passes when the path is free (new page)', async () => {
    mockedGet.mockResolvedValue(undefined)
    await expect(
      assertNoRouteSubtypeConflict({
        owner: 'kylemwalkerpr-ship-it',
        repo: 'caseworks',
        filePath: 'app/uk/immigration/uk-graduate-visa-requirements-2026/page.tsx',
        primaryKeyword: 'uk graduate visa requirements',
      }),
    ).resolves.toBeUndefined()
  })

  it('throws when a geo-specific article targets the generic student-visas hub', async () => {
    mockedGet.mockResolvedValue(STUDENT_HUB_PAGE)
    await expect(
      assertNoRouteSubtypeConflict({
        owner: 'kylemwalkerpr-ship-it',
        repo: 'caseworks',
        filePath: 'app/us/student-visas/page.tsx',
        primaryKeyword: 'boulder student visas',
      }),
    ).rejects.toThrow(/geo-scope conflict/i)
  })

  it('throws when a generic article targets a geo-specific page', async () => {
    mockedGet.mockResolvedValue(BOULDER_PAGE)
    await expect(
      assertNoRouteSubtypeConflict({
        owner: 'kylemwalkerpr-ship-it',
        repo: 'caseworks',
        filePath: 'app/us/student-visas/f1-rejection-recovery/page.tsx',
        primaryKeyword: 'us student visas hub',
      }),
    ).rejects.toThrow(/geo-scope conflict/i)
  })

  it('passes when the article shares the existing page geo scope', async () => {
    mockedGet.mockResolvedValue(BOULDER_PAGE)
    await expect(
      assertNoRouteSubtypeConflict({
        owner: 'kylemwalkerpr-ship-it',
        repo: 'caseworks',
        filePath: 'app/us/student-visas/f1-rejection-recovery/page.tsx',
        primaryKeyword: 'boulder f-1 visa',
      }),
    ).resolves.toBeUndefined()
  })
})

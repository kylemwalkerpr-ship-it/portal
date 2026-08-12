/**
 * Route-subtype overwrite guard — the last line of defence against the
 * 2026-08 incident where "uk graduate visa requirements" shipped onto the
 * spouse-visa-document-checklist page and overwrote live content.
 */
import { extractRouteSubtypes } from '@/lib/seoFactory/ownership'
import {
  assertNoRouteSubtypeConflict,
  extractExistingPageSubject,
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
})

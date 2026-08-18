/**
 * Keyword planner — Phase C: drop junk before clustering, route the five
 * seed pages as expand-existing (never a sibling).
 *
 * No live GSC / Supabase calls in CI — snapshot rows are injected.
 */
import { buildKeywordPlan } from '@/lib/seoFactory/keywordPlanner'
import { getGscAccess } from '@/lib/gscAuth'
import { loadGscSnapshot, loadOwnershipRegistry } from '@/lib/seoDataLoaders'

const PDF_JUNK = '"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983'

jest.mock('@/lib/gscAuth', () => ({
  getGscAccess: jest.fn(),
}))

jest.mock('@/lib/seoDataLoaders', () => ({
  loadGscSnapshot: jest.fn(),
  loadOwnershipRegistry: jest.fn(),
}))

jest.mock('@supabase/supabase-js', () => {
  const makeBuilder = (result: unknown) => {
    const builder: Record<string, any> = { then: (resolve: any) => Promise.resolve(resolve(result)) }
    for (const m of ['select', 'eq', 'not', 'gte', 'neq', 'order', 'limit', 'head', 'single']) {
      builder[m] = () => builder
    }
    return builder
  }
  return {
    createClient: jest.fn(() => ({
      from: () => makeBuilder({ data: [], error: null, count: 0 }),
    })),
  }
})

const mockAccess = getGscAccess as jest.Mock
const mockSnapshot = loadGscSnapshot as jest.Mock
const mockRegistry = loadOwnershipRegistry as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockAccess.mockResolvedValue(null) // no live GSC → snapshot path
  mockRegistry.mockResolvedValue({ rows: [] })
  mockSnapshot.mockResolvedValue({
    topQueries: [
      { term: PDF_JUNK, impressions: 40, clicks: 0, ctr: 0, position: 9 },
      { term: 'university of bristol international student guide', impressions: 248, clicks: 1, ctr: 0.004, position: 10.2 },
    ],
    opportunities: {},
    topPages: [],
  })
})

describe('buildKeywordPlan — Phase C routing', () => {
  it('drops the junk query before clustering and expands the Bristol seed owner', async () => {
    const result = await buildKeywordPlan({ minImpressions: 5 })

    const boardTerms = result.board.map((b) => b.term)
    expect(boardTerms).not.toContain(PDF_JUNK.toLowerCase())
    expect(boardTerms.some((t) => t.includes('pacific.edu') || t.includes('user2983'))).toBe(false)

    const bristol = result.board.find((b) => b.term === 'university of bristol international student guide')
    expect(bristol).toBeDefined()
    expect(bristol!.lane).toBe('expand')
    expect(bristol!.owner.url).toBe('https://legal.yousafeconsultancy.com/guide/uk-university-of-bristol-international-student-guide/')
    expect(bristol!.owner.action).toBe('expand')
    expect(bristol!.owner.filePath).toBe('app/guide/uk-university-of-bristol-international-student-guide/page.tsx')
  })

  it('emits the seed as an expand plan item with ownerUrl set (never a sibling)', async () => {
    const result = await buildKeywordPlan({ minImpressions: 5 })
    const item = result.plan.find((p) => p.term === 'university of bristol international student guide')
    expect(item).toBeDefined()
    expect(item!.lane).toBe('expand')
    expect(item!.ownerUrl).toBe('https://legal.yousafeconsultancy.com/guide/uk-university-of-bristol-international-student-guide/')
    expect(item!.repo).toBe('caseworks')
    expect(item!.filePath).toBe('app/guide/uk-university-of-bristol-international-student-guide/page.tsx')
  })
})

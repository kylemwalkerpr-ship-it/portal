const junkRows = [
  '"2025-2026 stockton room and meal plan rates" "$4,938"',
  '"2025-2026 stockton room and meal plan rates" "21 plan"',
  '"2025-2026 stockton room and meal plan rates" "double occupancy"',
  '"2025-2026 stockton room and meal plan rates" pacific pdf',
  '"2025-2026 stockton room and meal plan rates" pdf',
  '"2026 2027 stockton room and meal plan rates" pacific',
  '"2026 stockton room and meal plan rates" pacific pdf',
  '"2026-04" "2026-2027 stockton room and meal plan rates final"',
  '"2026-04" "2026-2027 stockton room and meal plan rates final.pdf"',
  '"2026-04" "2026-2027 stockton room and meal plan rates final.pdf" pacific',
  '"2026-04" "2026-2027 stockton room and meal plan rates final_0.pdf"',
  '"2026-04" "2026-2027 stockton room and meal plan rates"',
  '"2026-04" "stockton room and meal plan rates final"',
  '"2026-04" "stockton room and meal plan rates" pacific',
  '"2026-04" "stockton room and meal plan rates" pacific.edu',
].map((keys, i) => ({ keys: [keys], impressions: 1 + (i % 5), clicks: 0, ctr: 0, position: 5 + (i % 5) }))

jest.mock('@/lib/gscAuth', () => ({
  getGscAccess: jest.fn().mockResolvedValue({ accessToken: 'tok', siteUrl: 'sc-domain:yousafeconsultancy.com', mode: 'service_account' }),
}))
import { buildSeoWarRoom } from '@/lib/seoFactory/seoWarRoom'
const realFetch = global.fetch
beforeAll(() => {
  global.fetch = (async (url: any, opts: any) => {
    if (String(url).includes('searchconsole.googleapis.com')) {
      return { ok: true, json: async () => ({ rows: junkRows }) }
    }
    return realFetch(url, opts)
  }) as any
})
afterAll(() => { global.fetch = realFetch })
it('repro live junk + snapshot merge', async () => {
  const war = await buildSeoWarRoom({ days: 90, limit: 40, minImpressions: 3 })
  console.log('WAR summary', war.summary)
  console.log('WAR snapshot', JSON.stringify(war.snapshot ?? null), 'queriesAnalyzed', war.kpis.queriesAnalyzed)
}, 60000)

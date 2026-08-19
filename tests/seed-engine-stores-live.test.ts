/**
 * LIVE ENGINE STORE BACKFILL — skipped unless RUN_LIVE_SEED=1
 *
 *   RUN_LIVE_SEED=1 npx jest tests/seed-engine-stores-live.test.ts --no-coverage
 */
import fs from 'node:fs'
import path from 'node:path'

const LIVE = process.env.RUN_LIVE_SEED === '1'

function loadDotEnvLocal(): void {
  const p = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim().replace(/^"|"$/g, '')
  }
}

;(LIVE ? describe : describe.skip)('LIVE seed · later engine stores', () => {
  beforeAll(() => {
    loadDotEnvLocal()
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeTruthy()
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeTruthy()
  })

  it('backfills ahrefs, intel, forecasts, rewards, calibration, outreach e2e', async () => {
    const { runEngineStoreBackfill } = await import('@/lib/seoEngine/engineBackfill')
    const { loadLatestAhrefsSnapshot } = await import('@/lib/seoEngine/ahrefsAudit')
    const { loadRewardLedger, loadCalibrationHistory, loadForecasts, loadRankingScores } = await import('@/lib/seoEngine/rankingModel')
    const { loadKnowledgeFeed } = await import('@/lib/seoEngine/knowledge')
    const { listTargetOpportunities, getTargetDashboard } = await import('@/lib/seoEngine/backlinkEngine')

    const report = await runEngineStoreBackfill()
    // eslint-disable-next-line no-console
    console.log('BACKFILL STEPS', JSON.stringify(report.steps, null, 2))

    const failed = report.steps.filter((s) => !s.ok)
    expect(failed.map((s) => `${s.name}: ${s.error || s.detail}`)).toEqual([])

    const ahrefs = await loadLatestAhrefsSnapshot()
    expect(ahrefs).toBeTruthy()
    expect((ahrefs?.issues || []).length).toBeGreaterThan(0)

    const intel = await loadKnowledgeFeed(20)
    expect(intel.items.length).toBeGreaterThan(0)

    const scores = await loadRankingScores({ limit: 40 })
    const forecasts = await loadForecasts(80)
    expect(scores.length).toBeGreaterThan(0)
    expect(forecasts.length).toBeGreaterThan(0)

    const rewards = await loadRewardLedger(40)
    const cals = await loadCalibrationHistory(10)
    expect(cals.length).toBeGreaterThan(0)

    const targets = await listTargetOpportunities({ limit: 20 })
    expect(targets.length).toBeGreaterThan(0)
    const dash = await getTargetDashboard({ limit: 20 })
    expect(dash.length).toBeGreaterThan(0)

    // eslint-disable-next-line no-console
    console.log('LIVE COUNTS', {
      scores: scores.length,
      forecasts: forecasts.length,
      rewards: rewards.length,
      calibrations: cals.length,
      targets: targets.length,
      dashboard: dash.length,
      ahrefsIssues: ahrefs?.issues.length,
    })
    expect(rewards.length + cals.length).toBeGreaterThan(0)
  }, 240_000)

  it('persists a GSC snapshot the tracker can actually read', async () => {
    const { backfillGscSnapshot } = await import('@/lib/seoEngine/engineBackfill')
    const { listSnapshots } = await import('@/lib/seoFactory/gscHistory')
    const step = await backfillGscSnapshot()
    // eslint-disable-next-line no-console
    console.log('GSC SNAPSHOT STEP', step)
    expect(step.ok).toBe(true)
    expect(step.wrote).toBeGreaterThan(0)
    const siteUrl = process.env.GSC_SITE_URL || 'https://legal.yousafeconsultancy.com/'
    const snaps = await listSnapshots(siteUrl, 3)
    expect(snaps.length).toBeGreaterThan(0)
  }, 60_000)

  it('drafts outreach against the seeded backlink target list', async () => {
    const { backfillBacklinkOutreach } = await import('@/lib/seoEngine/engineBackfill')
    const { listTargetOpportunities, getTargetDashboard } = await import('@/lib/seoEngine/backlinkEngine')
    const step = await backfillBacklinkOutreach()
    // eslint-disable-next-line no-console
    console.log('OUTREACH STEP', step)
    expect(step.ok).toBe(true)
    const targets = await listTargetOpportunities({ limit: 20 })
    expect(targets.length).toBeGreaterThan(0)
    const dash = await getTargetDashboard({ limit: 20 })
    expect(dash.length).toBeGreaterThan(0)
  }, 60_000)
})

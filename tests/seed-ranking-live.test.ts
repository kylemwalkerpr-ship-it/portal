/**
 * LIVE SEED RUNNER — not part of the default suite.
 *
 *   RUN_LIVE_SEED=1 NEXT_PUBLIC_SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
 *     npx jest tests/seed-ranking-live.test.ts
 *
 * Runs the real ranking pass (`runRankingPassForPlans`) against the configured
 * Supabase project (production by default), which:
 *   1. pulls current GSC signals (live OAuth when `gsc_connection` has a
 *      refresh token, else the committed GSC snapshot),
 *   2. loads measured LLM fan-out citation evidence per cluster,
 *   3. computes + persists `seo_ranking_scores` and `seo_forecast_runs` for
 *      the top cluster plans.
 *
 * It then verifies the rows actually landed, so the dashboard has data.
 *
 * Env precedence: shell vars win; anything missing is loaded from .env.local.
 * The test is skipped (describe.skip) unless RUN_LIVE_SEED=1 so CI stays green.
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
    if (!process.env[k]) {
      process.env[k] = t.slice(i + 1).trim().replace(/^"|"$/g, '')
    }
  }
}

(LIVE ? describe : describe.skip)('LIVE seed · ranking model pass', () => {
  beforeAll(() => {
    loadDotEnvLocal()
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeTruthy()
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeTruthy()
  })

  it('runs the ranking pass against current GSC and persists scores + forecasts', async () => {
    const { loadPlansDashboard } = await import('@/lib/seoEngine/planner')
    const { runRankingPassForPlans, loadRankingScores } = await import('@/lib/seoEngine/rankingModel')
    const { loadForecasts } = await import('@/lib/seoEngine/rankingModel')

    const { plans } = await loadPlansDashboard(20)
    expect(plans.length).toBeGreaterThan(0)

    const result = await runRankingPassForPlans(20)
    expect(result.computed).toBeGreaterThan(0)

    const scores = await loadRankingScores({ limit: 100 })
    const forecasts = await loadForecasts(120)
    expect(scores.length).toBeGreaterThan(0)
    expect(forecasts.length).toBeGreaterThan(0)

    // eslint-disable-next-line no-console
    console.log(
      'LIVE SEED OK',
      JSON.stringify({
        plans: plans.length,
        computed: result.computed,
        topScores: result.topScores,
        scoresPersisted: scores.length,
        forecastsPersisted: forecasts.length,
      }),
    )
  }, 180_000)
})

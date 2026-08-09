import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/cron/forecast-reward-weekly
 * Weekly forecast → reward feedback loop (Monday 06:00 UTC via GitHub Actions).
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Compares each matured 30/60/90-day forecast against observed GSC (the
 * execution tracker), credits one deterministic `forecast_accuracy` reward
 * event per evaluated (topic, run_date, horizon) into seo_reward_events, and —
 * when the week yields enough evidence — bounded-recalibrates family weights
 * into seo_model_calibration. Idempotent: re-runs never double-credit.
 *
 * Body (optional): { "limit": 400 } — max forecast rows to evaluate.
 */
function authorize(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  return Boolean(expected && provided && provided === expected)
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { limit?: number }
  try {
    const { runForecastRewardPass } = await import('@/lib/seoEngine/forecastReward')
    const { recordEngineRun } = await import('@/lib/seoEngine/knowledge')
    const result = await runForecastRewardPass({ limit: body.limit || 400 })
    const status: 'success' | 'partial' | 'failed' = result.failed
      ? 'failed'
      : result.events || result.evaluated
        ? 'success'
        : 'partial'
    await recordEngineRun(
      'forecast-reward',
      status,
      { phase: 'forecast-reward', ...result },
      result.failed ? [result.failed] : [],
      'cron',
    )
    return NextResponse.json({ ok: true, phase: 'forecast-reward', ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'forecast-reward pass failed'
    await import('@/lib/seoEngine/knowledge').then(({ recordEngineRun }) =>
      recordEngineRun('forecast-reward', 'failed', { phase: 'forecast-reward' }, [message], 'cron'),
    ).catch(() => {})
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

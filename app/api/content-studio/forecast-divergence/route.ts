/**
 * POST /api/content-studio/forecast-divergence
 *
 * Body: {
 *   canonicalUrls: string[],
 *   observations: Array<{ url: string, position: number | null, direction: 'up'|'down'|'flat'|'unknown' }>
 * }
 *
 * For each canonical URL on the PublishLedger stamp, we surface whether the
 * Kalman-style 60-day forecast agrees or disagrees with the actual GSC trend:
 *
 *   agree      — model expects up, GSC moved up (or vice-versa).
 *   disagree   — model expects up, but GSC actually moved down. The admin
 *                sees a red badge so they can investigate (ranking model
 *                drift? Google update? Thin content?) before the divergence
 *                infects the citation ledger.
 *   missing    — topic has no forecast row persisted yet.
 *   unknown    — not enough inputs (GSC or forecast) to conclude.
 *
 * Auth: admin only.
 *
 * Implementation notes
 *   - We resolve canonical URL → topic through `content_jobs` (latest job
 *     matching either canonical_url or live_canonical_url).
 *   - For each unique topic we fetch the most recent `seo_forecast_runs` row
 *     with horizon_days = 60. The forecast_reward cron makes sure only one
 *     row exists per (topic, subject_key, horizon, day).
 *   - Divergence compute lives in lib/seoFactory/forecastDivergence so it
 *     can be unit-tested without a Supabase connection.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  computeDivergence,
  type DivergenceObservation,
  type Direction,
} from '@/lib/seoFactory/forecastDivergence'

interface DivergenceRequestBody {
  canonicalUrls?: string[]
  observations?: Array<{ url: string; position: number | null; direction: Direction }>
}

interface DivergenceEntry {
  url: string
  topic: string | null
  observedPosition: number | null
  forecastDirection: Direction
  trendDirection: Direction
  divergence: {
    status: 'agree' | 'disagree' | 'missing' | 'unknown'
    note: string
    magnitude: number | null
  }
  forecast: {
    projection60: number | null
    probabilityTop10: number | null
    runDate: string | null
    lift: number | null
  } | null
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Cap how many URLs we resolve per call: divergence is hot-path UI. */
const MAX_URLS = 30

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = (await request.json().catch(() => ({}))) as DivergenceRequestBody
    const canonicalUrls = Array.isArray(body.canonicalUrls)
      ? body.canonicalUrls.map((u) => String(u || '').trim()).filter(Boolean).slice(0, MAX_URLS)
      : []
    if (!canonicalUrls.length) {
      return NextResponse.json({ ok: true, entries: [] })
    }

    // 1. canonical URL → topic (latest job that has the URL).
    const client = sb()
    const { data: jobRows, error: jobErr } = await client
      .from('content_jobs')
      .select('id, topic, canonical_url, live_canonical_url, updated_at, status')
      .or(
        [
          ...canonicalUrls.map((u) => `canonical_url.eq.${u}`),
          ...canonicalUrls.map((u) => `live_canonical_url.eq.${u}`),
        ].join(','),
      )
      .order('updated_at', { ascending: false })
      .limit(canonicalUrls.length * 2)
    if (jobErr) {
      console.warn('[forecast-divergence] content_jobs query failed', jobErr.message)
    }

    // Pick the latest row per canonical URL.
    const urlToTopic = new Map<string, string>()
    for (const row of (jobRows || []) as Array<{
      topic: string | null
      canonical_url: string | null
      live_canonical_url: string | null
      updated_at: string | null
    }>) {
      const candidates = [row.canonical_url, row.live_canonical_url].filter(Boolean) as string[]
      for (const u of candidates) {
        if (!urlToTopic.has(u) && row.topic) urlToTopic.set(u, row.topic)
      }
    }
    const uniqueTopics = Array.from(new Set(urlToTopic.values())).slice(0, MAX_URLS)

    // 2. topics → latest 60-day forecast row.
    const topicToForecast = new Map<string, {
      projection60: number | null
      probabilityTop10: number | null
      runDate: string | null
      lift: number | null
    }>()
    if (uniqueTopics.length) {
      const { data: forecastRows, error: fcErr } = await client
        .from('seo_forecast_runs')
        .select('topic, projected_position, probability_top10, run_date, lift, created_at')
        .in('topic', uniqueTopics)
        .eq('horizon_days', 60)
        .order('created_at', { ascending: false })
        .limit(uniqueTopics.length * 2)
      if (fcErr) {
        console.warn('[forecast-divergence] seo_forecast_runs query failed', fcErr.message)
      }
      for (const f of (forecastRows || []) as Array<{
        topic: string
        projected_position: number | string | null
        probability_top10: number | string | null
        run_date: string | null
        lift: number | string | null
      }>) {
        if (topicToForecast.has(f.topic)) continue
        topicToForecast.set(f.topic, {
          projection60: f.projected_position != null ? Number(f.projected_position) : null,
          probabilityTop10: f.probability_top10 != null ? Number(f.probability_top10) : null,
          runDate: f.run_date || null,
          lift: f.lift != null ? Number(f.lift) : null,
        })
      }
    }

    // 3. Index the observations by URL so we can match in O(1).
    const obsByUrl = new Map<string, { position: number | null; direction: Direction }>()
    for (const o of body.observations || []) {
      if (!o?.url) continue
      obsByUrl.set(String(o.url), {
        position: o.position ?? null,
        direction: (o.direction || 'unknown') as Direction,
      })
    }

    // 4. Assemble per-URL entries.
    const entries: DivergenceEntry[] = canonicalUrls.map((url) => {
      const topic = urlToTopic.get(url) || null
      const fc = topic ? topicToForecast.get(topic) || null : null
      const obs = obsByUrl.get(url) || { position: null, direction: 'unknown' as Direction }
      const observation: DivergenceObservation = {
        url,
        topic,
        observedPosition: obs.position,
        forecastProjection60: fc?.projection60 ?? null,
        forecastProbabilityTop10: fc?.probabilityTop10 ?? null,
        forecastRunDate: fc?.runDate ?? null,
        trendDirection: obs.direction,
      }
      const verdict = computeDivergence(observation)
      return {
        url,
        topic,
        observedPosition: obs.position,
        forecastDirection: verdict.forecastDirection,
        trendDirection: obs.direction,
        divergence: { status: verdict.status, note: verdict.note, magnitude: verdict.magnitude },
        forecast: fc,
      }
    })

    return NextResponse.json({ ok: true, entries, source: 'forecast-divergence' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'forecast-divergence lookup failed'
    console.warn('[forecast-divergence] ', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { LIFECYCLE_STAGES, COUNTRIES, type Country } from '@/lib/seoEngine/ontology'

/**
 * GET /api/seo-engine/lifecycle
 * The immigrant life-cycle ontology — full (stage × country) matrix with
 * seed keywords, statutory anchors, authorities, services and interlink
 * neighbors. Served from the live Supabase copy when seeded, else the static
 * source of truth.
 *
 * POST /api/seo-engine/lifecycle  (body: { seed?: boolean })
 * Upserts the ontology into seo_lifecycle_stages so the DB is the runtime
 * source for the dashboard and planner.
 */
export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const supabase = createSupabaseAdminClient()
    const { data } = await supabase.from('seo_lifecycle_stages').select('*').order('priority', { ascending: false })
    if (data && data.length > 0) {
      return NextResponse.json({ ok: true, source: 'db', stages: data, countries: COUNTRIES })
    }
    return NextResponse.json({ ok: true, source: 'static', stages: LIFECYCLE_STAGES, countries: COUNTRIES })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'lifecycle failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = (await req.json().catch(() => ({}))) as { seed?: boolean }
    if (body.seed === false) {
      return NextResponse.json({ ok: true, message: 'no-op — seeding skipped' })
    }

    const supabase = createSupabaseAdminClient()
    let inserted = 0
    let updated = 0

    for (const stage of LIFECYCLE_STAGES) {
      for (const country of COUNTRIES) {
        const cell = stage.countries[country]
        const row = {
          id: `${stage.key}|${country.toLowerCase()}`,
          stage: stage.key,
          stage_label: stage.label,
          country,
          phase: stage.phase,
          funnel: stage.funnel,
          ymyl_level: stage.ymyl,
          intent_mix: stage.intentMix as unknown as Record<string, unknown>,
          services: stage.services,
          content_types: stage.contentTypes,
          seed_keywords: cell.seedKeywords,
          statutory_anchors: cell.statutoryAnchors,
          priority: stage.priority || 5,
        }
        const { error } = await supabase.from('seo_lifecycle_stages').upsert(row, { onConflict: 'id' })
        if (error) {
          if (/42P01|relation .* does not exist/i.test(error.message)) {
            return NextResponse.json(
              { ok: false, error: 'seo_lifecycle_stages table missing', guidance: 'Run supabase/migrations/20260809_seo_master_engine.sql once in Supabase.' },
              { status: 503 },
            )
          }
          return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
        }
        inserted += 1
        updated += 1
      }
    }
    return NextResponse.json({ ok: true, inserted, updated, total: LIFECYCLE_STAGES.length * COUNTRIES.length })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'seed failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'

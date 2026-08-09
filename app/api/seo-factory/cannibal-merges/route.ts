import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { clusterIdFromTerm } from '@/lib/seoFactory/cannibalMerge'

/**
 * GET /api/seo-factory/cannibal-merges
 * Shared merge-decision history (both sources) for the deployed Content Studio.
 *
 * Robust against partially-applied migrations: if Supabase reports a missing
 * column (PG 42703) for resolution_type / follow_up_at / differentiation_plan
 * we transparently fall back to a column-less select and tag the response with
 * `degraded: true` plus a `guidance` telling the operator how to upgrade.
 *
 * POST also uses idempotent column-optional upsert values.
 *
 * Returns the latest 100 decisions, newest first.
 */
const COLUMN_LIST = [
  'cluster_id','source','stem','terms','winner_url','loser_urls','redirects_created',
  'pr_url','pr_number','status','message','merged_at',
  'resolution_type','follow_up_at','differentiation_plan',
]
const MINIMAL_COLUMN_LIST = [
  'cluster_id','source','stem','terms','winner_url','loser_urls','redirects_created',
  'pr_url','pr_number','status','message','merged_at',
]
// 42703 = column does not exist; 42P01 = relation does not exist; PGRST116 = not found.
const MISSING_COLUMN_RE = /column\s+([\w."]+)\s+does not exist/i

export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const supabase = createSupabaseAdminClient()

    // Try the full column list first.
    let { data, error } = await supabase
      .from('cannibal_merges')
      .select(COLUMN_LIST.join(','))
      .order('merged_at', { ascending: false })
      .limit(100)

    let degraded = false
    let missingColumns: string[] = []
    let guidance: string | null = null

    if (error) {
      if (/42P01|relation .* does not exist/i.test(error.message)) {
        return NextResponse.json(
          {
            error: 'cannibal_merges table does not exist yet',
            guidance:
              'Run supabase/migrations/20260808_cannibal_merges.sql once in the Supabase SQL editor.',
          },
          { status: 503 },
        )
      }
      const m = error.message.match(MISSING_COLUMN_RE)
      if (m) {
        // Fall back to the minimal select; remember which column broke so callers can surface it.
        degraded = true
        missingColumns = COLUMN_LIST.filter(
          (c) => c !== MINIMAL_COLUMN_LIST[MINIMAL_COLUMN_LIST.indexOf(c) as unknown as never],
        ).filter((c) => m[1]?.includes(c.replace(/_/g, '_')))
        if (missingColumns.length === 0) missingColumns = [m[1]?.replace(/"/g, '') || 'unknown']
        guidance =
          `Merge history is missing the column "${missingColumns[0]}". Run supabase/migrations/20260809_cannibal_rechecks.sql in the Supabase SQL editor (or trigger the "Apply SEO Factory Migrations" workflow) to add it.`

        const retry = await supabase
          .from('cannibal_merges')
          .select(MINIMAL_COLUMN_LIST.join(','))
          .order('merged_at', { ascending: false })
          .limit(100)
        if (retry.error) {
          console.error('[cannibal-merges]', retry.error)
          return NextResponse.json({ error: retry.error.message }, { status: 500 })
        }
        data = retry.data
      } else {
        console.error('[cannibal-merges]', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      ok: true,
      degraded,
      missingColumns,
      guidance,
      merges: (data ?? []).map((r) => {
        const mergedAtMs = r.merged_at ? new Date(r.merged_at).getTime() : Date.now()
        // Define a fallback for typeof-any data shape.
        type Row = Record<string, unknown>
        const row = r as Row
        const rawResolution = row.resolution_type as string | undefined
        const rawFollowUp = row.follow_up_at as string | undefined
        const rawPlan = row.differentiation_plan as unknown
        const followUpMs = rawFollowUp ? new Date(rawFollowUp).getTime() : undefined
        return {
          clusterId: row.cluster_id as string,
          source: row.source,
          stem: row.stem as string,
          terms: Array.isArray(row.terms) ? (row.terms as unknown[]) : [],
          winnerUrl: row.winner_url as string,
          loserUrls: Array.isArray(row.loser_urls) ? (row.loser_urls as unknown[]) : [],
          redirectsCreated: (row.redirects_created as number) ?? 0,
          prUrl: (row.pr_url as string) ?? undefined,
          prNumber: (row.pr_number as number) ?? undefined,
          status: row.status,
          message: (row.message as string) ?? undefined,
          resolutionType: rawResolution ?? ((row.status === 'merged') ? 'consolidate' : 'defer'),
          followUpAt: followUpMs,
          differentiationPlan: Array.isArray(rawPlan) ? rawPlan : undefined,
          recheckDue: Boolean(followUpMs && followUpMs <= Date.now()),
          mergedAt: Number.isFinite(mergedAtMs) ? mergedAtMs : Date.now(),
        }
      }),
    })
  } catch (err) {
    console.error('[cannibal-merges]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'cannibal merges list failed' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = await request.json().catch(() => ({}))
    const term = String(body.term || '').trim().slice(0, 160)
    const resolutionType = ['consolidate', 'differentiate', 'defer'].includes(String(body.resolutionType))
      ? String(body.resolutionType)
      : 'consolidate'
    const winnerUrl = String(body.winnerUrl || '').trim()
    if (!term || (resolutionType === 'consolidate' && !winnerUrl)) {
      return NextResponse.json(
        { error: resolutionType === 'consolidate' ? 'term and winnerUrl are required to record a consolidation.' : 'term is required to record this resolution.' },
        { status: 400 },
      )
    }

    const loserUrls = Array.isArray(body.loserUrls)
      ? body.loserUrls.map(String).slice(0, 50)
      : []
    const status = body.status === 'differentiating'
      ? 'differentiating'
      : body.status === 'deferred'
        ? 'deferred'
        : body.status === 'skipped'
          ? 'skipped'
          : 'merged'
    const source = body.source === 'command_center' ? 'command_center' : 'portal'
    const prNumber = Number(body.prNumber) > 0 ? Number(body.prNumber) : null
    const followUpAt = body.followUpAt ? new Date(Number(body.followUpAt)).toISOString() : null

    const supabase = createSupabaseAdminClient()

    // Build the upsert with the optional columns and try; on column-missing error
    // retry without them so older databases still accept new merge decisions.
    const fullUpsert = {
      cluster_id: String(body.clusterId || clusterIdFromTerm(term)),
      source,
      stem: String(body.stem || '').trim().slice(0, 200) || clusterIdFromTerm(term),
      terms: JSON.stringify(
        Array.isArray(body.terms) && body.terms.length > 0
          ? body.terms.map(String).slice(0, 20)
          : [term],
      ),
      winner_url: winnerUrl,
      loser_urls: JSON.stringify(loserUrls),
      redirects_created: Number(body.redirectsCreated) > 0 ? Number(body.redirectsCreated) : 0,
      pr_url: String(body.prUrl || '').trim() || null,
      pr_number: prNumber,
      status,
      resolution_type: resolutionType,
      follow_up_at: followUpAt,
      differentiation_plan: Array.isArray(body.differentiationPlan) ? body.differentiationPlan : null,
      message: String(body.message || '').trim().slice(0, 500) || null,
      merged_at: new Date().toISOString(),
    }
    const minimalUpsert = {
      cluster_id: fullUpsert.cluster_id,
      source: fullUpsert.source,
      stem: fullUpsert.stem,
      terms: fullUpsert.terms,
      winner_url: fullUpsert.winner_url,
      loser_urls: fullUpsert.loser_urls,
      redirects_created: fullUpsert.redirects_created,
      pr_url: fullUpsert.pr_url,
      pr_number: fullUpsert.pr_number,
      status: fullUpsert.status,
      message: fullUpsert.message,
      merged_at: fullUpsert.merged_at,
    }

    let result = await supabase
      .from('cannibal_merges')
      .upsert(fullUpsert as never, { onConflict: 'cluster_id,source' })
      .select('cluster_id,source,status,winner_url,merged_at')
      .single()

    let degraded = false
    let missingColumns: string[] = []
    let guidance: string | null = null

    if (result.error && MISSING_COLUMN_RE.test(result.error.message)) {
      degraded = true
      const m = result.error.message.match(MISSING_COLUMN_RE)
      missingColumns = m?.[1] ? [m[1].replace(/"/g, '')] : ['resolution_type']
      guidance =
        'cannibal_merges is missing resolution_type/follow_up_at/differentiation_plan. Run supabase/migrations/20260809_cannibal_rechecks.sql to upgrade. Recorded without those columns for now.'

      result = await supabase
        .from('cannibal_merges')
        .upsert(minimalUpsert as never, { onConflict: 'cluster_id,source' })
        .select('cluster_id,source,status,winner_url,merged_at')
        .single()
    }

    if (result.error) {
      if (/42P01|relation .* does not exist/i.test(result.error.message)) {
        return NextResponse.json(
          {
            error: 'cannibal_merges table does not exist yet',
            guidance:
              'Run supabase/migrations/20260808_cannibal_merges.sql once in the Supabase SQL editor.',
          },
          { status: 503 },
        )
      }
      console.error('[cannibal-merges]', result.error)
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, degraded, missingColumns, guidance, merge: result.data })
  } catch (err) {
    console.error('[cannibal-merges]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'cannibal merges upsert failed' },
      { status: 500 },
    )
  }
}

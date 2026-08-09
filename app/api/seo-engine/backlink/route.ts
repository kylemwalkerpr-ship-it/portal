import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  listInboundGaps,
  listOutboundGaps,
  listTargetOpportunities,
  getTargetDashboard,
  runBacklinkReport,
  type BacklinkKind,
  type BacklinkLane,
  type TargetStatus,
} from '@/lib/seoEngine/backlinkEngine'
import type { Country, LifecycleStage } from '@/lib/seoEngine/ontology'

/**
 * GET /api/seo-engine/backlink
 *   ?report=inbound|outbound|opportunities|dashboard|full    (default: full)
 *   ?country=US|UK|CA|AU
 *   ?stage=intent|schools|work|housing|visa|settlement|citizenship|family|relatives
 *   ?kind=media|gov|edu|ngo|industry_blog|partner|directory|forum
 *   ?lane=editorial|guest_post|resource_page|directory|podcast_interview|broken_outreach|community|partner
 *   ?status=identified|qualifying|...
 *   ?minInbound=3
 *   ?minOutbound=3
 *   ?limit=50
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const url = new URL(req.url)
    const report = url.searchParams.get('report')?.trim() || 'full'
    const country = (url.searchParams.get('country')?.trim().toUpperCase() || undefined) as Country | undefined
    const stage = url.searchParams.get('stage')?.trim() as LifecycleStage | undefined
    const kind = url.searchParams.get('kind') as BacklinkKind | undefined
    const lane = url.searchParams.get('lane') as BacklinkLane | undefined
    const targetStatus = url.searchParams.get('status') as TargetStatus | undefined
    const minInbound = Number(url.searchParams.get('minInbound') || 3)
    const minOutbound = Number(url.searchParams.get('minOutbound') || 3)
    const limit = Number(url.searchParams.get('limit') || 50)

    let data: any = { ok: true, report }
    if (report === 'inbound') {
      data.inboundGaps = await listInboundGaps({ minInbound, limit, country, stage })
    } else if (report === 'outbound') {
      data.outboundGaps = await listOutboundGaps({ minOutbound, limit })
    } else if (report === 'opportunities') {
      data.targets = await listTargetOpportunities({ country, stage, kind, lane, status: targetStatus, limit: 100 })
    } else if (report === 'dashboard') {
      data.dashboard = await getTargetDashboard({ country, stage, status: targetStatus, limit })
    } else if (report === 'full') {
      data = { ...data, ...(await runBacklinkReport({ country, stage })) }
    } else {
      return NextResponse.json({ ok: false, error: `Unknown report '${report}'` }, { status: 400 })
    }
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'backlink report failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'

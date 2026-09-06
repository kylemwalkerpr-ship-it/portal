/**
 * Content Studio — Specialist Intel signals API.
 *
 * SSOT: docs/CONTENT_STUDIO_SPECIALIST_INTEL.md
 *
 * The signal contract is the single door specialists (and scripts/cron) use to
 * POST lean JSON signals into the studio, and the door operators use to move a
 * signal new → queued → consumed | dismissed.
 *
 *   GET    /api/content-studio/specialist-signals?status=&role=&region=&limit=
 *   POST   /api/content-studio/specialist-signals   { role, region?, priority?, payload, relatedJobId? }
 *   PATCH  /api/content-studio/specialist-signals   { id, status: queued|consumed|dismissed }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  insertSignal,
  isSpecialistRole,
  listSignals,
  normalizeRegion,
  parseSpecialistSignal,
  setSignalStatus,
  type SpecialistSignalStatus,
} from '@/lib/seoFactory/specialistFeeds'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const role = searchParams.get('role')
    const region = searchParams.get('region')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '60', 10) || 60, 200)

    const statusFilter: SpecialistSignalStatus[] =
      status === null || status === '' || status === 'open'
        ? ['new', 'queued']
        : (status
            .split(',')
            .map((s) => s.trim())
            .filter(
              (s): s is SpecialistSignalStatus =>
                s === 'new' || s === 'queued' || s === 'consumed' || s === 'dismissed',
            ))

    const signals = await listSignals({
      status: statusFilter,
      role: role && isSpecialistRole(role) ? role : null,
      region: region ? normalizeRegion(region) : null,
      limit,
    })
    return NextResponse.json(
      { signals, count: signals.length },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch (err) {
    console.error('[content-studio/specialist-signals GET]', err)
    return NextResponse.json({ error: 'Internal error', signals: [], count: 0 }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    let signal
    try {
      signal = parseSpecialistSignal(body)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Invalid signal' },
        { status: 400 },
      )
    }

    const inserted = await insertSignal(signal)
    if (!inserted.ok) {
      return NextResponse.json(
        {
          error: inserted.error || 'Signal ingestion failed',
          ok: false,
          tableMissing: /does not exist|relation/i.test(inserted.error || ''),
        },
        { status: 422 },
      )
    }
    return NextResponse.json({ ok: true, id: inserted.id, signal }, { status: 201 })
  } catch (err) {
    console.error('[content-studio/specialist-signals POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    let body: { id?: unknown; status?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const id = String(body.id ?? '').trim()
    const rawStatus = String(body.status ?? '').trim()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    if (!(rawStatus === 'queued' || rawStatus === 'consumed' || rawStatus === 'dismissed')) {
      return NextResponse.json(
        { error: 'status must be one of queued | consumed | dismissed' },
        { status: 400 },
      )
    }
    const result = await setSignalStatus(id, rawStatus)
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 422 })
    }
    return NextResponse.json({ ok: true, id, status: rawStatus })
  } catch (err) {
    console.error('[content-studio/specialist-signals PATCH]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
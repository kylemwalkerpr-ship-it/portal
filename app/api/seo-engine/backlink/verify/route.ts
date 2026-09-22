import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  BACKLINK_VERIFICATION_METHOD,
  listBacklinkVerifications,
  verifyBacklinkClaim,
} from '@/lib/seoFactory/backlinkVerification'

/**
 * POST /api/seo-engine/backlink/verify
 *
 * The ONLY path that may transition a backlink target to `won`. Admin-only.
 *
 * Body shape:
 *   { target_id, source_url, target_url, outreach_id?, actor? }
 *
 *   target_id   exact seo_backlink_targets.id the claim belongs to
 *   source_url  claimed third-party page that should carry the link; must be
 *               absolute http(s) on the prospect domain (or a subdomain), and
 *               may not be a YouSafe-owned host or a localhost/private literal
 *   target_url  the exact YouSafe URL the claim says is linked; its host must
 *               be a HOST_PUBLIC estate host
 *
 * The helper fetches the claimed page live, requires a REAL anchor href to the
 * exact target URL (structural exact-href proof), appends one immutable
 * seo_backlink_verifications evidence row for EVERY attempt that reached the
 * network, and only on a positive verdict writes the durable won pointers.
 * Negative/unavailable checks never mark the target won and never mark it lost.
 *
 * GET /api/seo-engine/backlink/verify?target_id=...
 *   → the append-only verification evidence trail for one target.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const targetId = String(body.target_id || '').trim()
    const sourceUrl = String(body.source_url || '').trim()
    const targetUrl = String(body.target_url || '').trim()
    if (!targetId) return NextResponse.json({ ok: false, error: 'target_id required' }, { status: 400 })
    if (!sourceUrl || !targetUrl) {
      return NextResponse.json(
        { ok: false, error: 'source_url (the claimed third-party page) and target_url (the exact YouSafe URL) are required' },
        { status: 400 },
      )
    }

    const result = await verifyBacklinkClaim({
      targetId,
      sourceUrl,
      targetUrl,
      outreachId: body.outreach_id ? String(body.outreach_id) : null,
      actor: auth.profile?.email || auth.profileId || null,
    })
    if (!result.verdict) {
      // A rejected claim performed no fetch and appended no evidence, so there
      // is nothing to report as an attempt: it is a 400, not a verdict.
      const notFound = result.reason === 'backlink target not found'
      return NextResponse.json(
        { ok: false, error: result.error || result.reason || 'backlink verification failed' },
        { status: notFound ? 404 : 400 },
      )
    }
    if (!result.ok) {
      // The attempt reached the network but did not produce a durable win
      // (evidence insert failed, or the won write was refused). The recorded
      // verdict is returned as-is; no win and no loss is claimed.
      return NextResponse.json(
        {
          ok: false,
          verdict: result.verdict,
          link_present: result.linkPresent,
          verification_id: result.verificationId,
          evidence_persisted: result.evidencePersisted,
          error: result.error || result.reason || 'backlink verification failed',
        },
        { status: 500 },
      )
    }
    return NextResponse.json({
      ok: true,
      verdict: result.verdict,
      method: BACKLINK_VERIFICATION_METHOD,
      link_present: result.linkPresent,
      verification_id: result.verificationId,
      evidence_persisted: result.evidencePersisted,
      transitioned_to_won: result.transitionedToWon,
      target_status: result.targetStatus,
      source_url: result.sourceUrl,
      target_url: result.targetUrl,
      source_http_status: result.sourceHttpStatus,
      source_final_url: result.sourceFinalUrl,
      observed_href: result.observedHref,
      reason: result.reason,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'backlink verification failed' },
      { status: 500 },
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const url = new URL(req.url)
    const targetId = url.searchParams.get('target_id')?.trim() || ''
    if (!targetId) return NextResponse.json({ ok: false, error: 'target_id required' }, { status: 400 })
    const limit = Number(url.searchParams.get('limit') || 25)
    const verifications = await listBacklinkVerifications(targetId, Number.isFinite(limit) ? limit : 25)
    return NextResponse.json({ ok: true, method: BACKLINK_VERIFICATION_METHOD, verifications })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'backlink verification history failed' },
      { status: 500 },
    )
  }
}

export const dynamic = 'force-dynamic'

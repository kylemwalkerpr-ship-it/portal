/**
 * POST /api/content-studio/verify-published
 *
 * Body: { canonicalUrl: string, jobId?: string }
 *
 * Re-checks each published stamp the admin sees in VIII · Publish & Cite:
 *   - HTTP 200 response
 *   - canonical <link rel="canonical"> tag intact
 *   - audit re-run (auditScore)
 *
 * Returns the LiveVerifyResult + a small `stamp` projection the UI needs to
 * render a click-to-verify badge (status · message · ageing hints).
 *
 * Auth: admin only (defensive — this also pings the live CDN/IndexNow so we
 * do not want anonymous callers sucking our caches dry).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { verifyLiveUrl, type LiveVerifyInput, type LiveVerifyResult } from '@/lib/seoFactory/liveVerify'
import { isDeploymentProvenLiveResult } from '@/lib/seoFactory/deploymentProvenLive'
import { finalizeStagedInterlinksForLiveSource } from '@/lib/seoFactory/interlinkVerification'
import { verifyStampMessage } from '@/lib/seoFactory/verifyStampMessage'

interface VerifyRequestBody {
  canonicalUrl?: string
  jobId?: string
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = (await request.json().catch(() => ({}))) as VerifyRequestBody
    const canonicalUrl = String(body?.canonicalUrl || '').trim()
    if (!/^https?:\/\//i.test(canonicalUrl)) {
      return NextResponse.json(
        { error: 'canonicalUrl must be an absolute http(s) URL' },
        { status: 400 },
      )
    }

    const input: LiveVerifyInput = {
      canonicalUrl,
      jobId: body?.jobId || null,
    }

    let result: LiveVerifyResult
    try {
      result = await verifyLiveUrl(input)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'verify failed'
      return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }

    // Stamp projection shaping — keep the full LiveVerifyResult so the UI
    // can render any extra field it wants without a second round-trip.
    const stamp = {
      status: result.ok
        ? 'verified'
        : (result.hasNoIndex)
          ? 'noindex'
          : (result.hasCanonical === false)
            ? 'canonical_mismatch'
            : (result.httpStatus && result.httpStatus !== 200)
              ? 'fetch_failed'
              : 'needs_review',
      message: result.error
        ? String(result.error)
        : (result.ok
          ? `Verified · HTTP ${result.httpStatus} · ${result.wordCount ?? '?'}w · score ${result.auditScore ?? '?'}/100`
          : (result.hasNoIndex)
            ? 'Live URL is noindex'
            : (result.hasCanonical === false)
              ? (result.canonicalHref
                ? `Canonical tag points to ${result.canonicalHref}`
                : 'Missing canonical tag on live page')
              : `HTTP ${result.httpStatus || '?'} · needs review`),
    }

    // Interlink truth is finalized ONLY after verifyLiveUrl has actually
    // established ok=true for this exact canonicalUrl: staged rows are checked
    // against the live source HTML (exact anchor href) and target liveness.
    // Never weakens the content verification above — a finalization failure is
    // reported beside the result, not instead of it.
    //
    // Job binding (P6): when the caller supplied the exact content_jobs.id,
    // finalization is bound to that exact job so admin verification can never
    // finalize rows staged by ANOTHER ship job that shares the canonical.
    // M1: a job-bound finalization additionally requires the SAME positive
    // deployment-lineage gate as the scheduled reconciler — ok=true alone is
    // not enough for a supplied job id (an uncontracted/legacy health verdict
    // proves nothing about that job's official deployment). When no jobId
    // exists the documented legacy path runs, which is jobless-only (H1):
    // only rows with source_job_id IS NULL are read/finalized.
    const jobId = String(body?.jobId || '').trim()
    const lineageProven = isDeploymentProvenLiveResult(result)
    const interlinksWithheld =
      result.ok && jobId && !lineageProven ? 'deployment_lineage_not_proven' : null
    if (interlinksWithheld) {
      // M2: the ARTICLE verification succeeded, but interlink finalization was
      // deliberately withheld. Say both things — a bare "Verified" would imply
      // the staged rows were finalized.
      stamp.message = verifyStampMessage({ stampMessage: stamp.message, interlinksWithheld })
      console.warn(
        '[verify-published] interlink finalization withheld — ok=true verdict without positive deployment lineage for the supplied job id',
        {
          canonicalUrl,
          jobId,
          publicationPhase: result.publicationPhase ?? null,
          lineageVerified: result.lineageVerified ?? null,
        },
      )
    }
    const interlinks = result.ok && !interlinksWithheld
      ? await finalizeStagedInterlinksForLiveSource({
          canonicalUrl,
          ...(jobId ? { sourceJobId: jobId } : {}),
        })
      : null

    return NextResponse.json({
      ok: true,
      stamp,
      result,
      interlinks,
      ...(interlinksWithheld ? { interlinksWithheld } : {}),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'verify-published failed' },
      { status: 500 },
    )
  }
}

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
        : (result.hasCanonical === false)
          ? 'canonical_mismatch'
          : (result.hasNoIndex)
            ? 'noindex'
            : (result.httpStatus && result.httpStatus !== 200)
              ? 'fetch_failed'
              : 'needs_review',
      message: result.error
        ? String(result.error)
        : (result.ok
          ? `Verified · HTTP ${result.httpStatus} · ${result.wordCount ?? '?'}w · score ${result.auditScore ?? '?'}/100`
          : (result.hasCanonical === false)
            ? `Canonical tag points to ${result.canonicalHref || 'a different URL'}`
            : (result.hasNoIndex)
              ? 'Live URL is noindex'
              : `HTTP ${result.httpStatus || '?'} · needs review`),
    }

    return NextResponse.json({ ok: true, stamp, result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'verify-published failed' },
      { status: 500 },
    )
  }
}

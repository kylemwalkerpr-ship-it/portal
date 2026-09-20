/**
 * P6 final repair — ADMIN JOB BINDING.
 *
 * `POST /api/content-studio/verify-published` already receives the exact
 * `jobId`. Passing it through as `sourceJobId` stops an admin verification from
 * finalizing staged rows staged by ANOTHER ship job that shares the canonical,
 * and (M1) a supplied job id additionally requires the same positive
 * deployment-lineage proof the scheduled reconciler uses. The documented
 * legacy path is preserved ONLY when no jobId exists (there is no exact
 * identity to bind to — and none is ever invented); the finalizer then
 * restricts itself to jobless rows (H1).
 */
jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(async () => ({ profileId: 'admin-1' })),
}))
jest.mock('@/lib/seoFactory/liveVerify', () => ({ verifyLiveUrl: jest.fn() }))
jest.mock('@/lib/seoFactory/interlinkVerification', () => ({
  finalizeStagedInterlinksForLiveSource: jest.fn(),
}))

import { NextRequest } from 'next/server'
import { verifyLiveUrl } from '@/lib/seoFactory/liveVerify'
import { finalizeStagedInterlinksForLiveSource } from '@/lib/seoFactory/interlinkVerification'

const verifyLiveUrlMock = jest.mocked(verifyLiveUrl)
const finalizeMock = jest.mocked(finalizeStagedInterlinksForLiveSource)

const CANONICAL = 'https://legal.yousafeconsultancy.com/us/student-visas/'
const JOB = '77777777-7777-4777-8777-777777777777'

const FINALIZED = {
  sourceUrl: CANONICAL,
  checked: 1,
  applied: 1,
  absent: 0,
  targetNotLive: 0,
  unverifiable: 0,
  sourceNotLive: 0,
  skipped: 0,
  dbErrors: 0,
  sourceFetchOk: true,
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/content-studio/verify-published/route')
  const res = await POST(
    new NextRequest('http://localhost/api/content-studio/verify-published', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

beforeEach(() => {
  jest.clearAllMocks()
  verifyLiveUrlMock.mockResolvedValue({
    ok: true,
    liveUrl: CANONICAL,
    httpStatus: 200,
    verifiedAt: '2026-09-20T12:00:00.000Z',
    lineageVerified: true,
    publicationPhase: 'live_verified',
  } as never)
  finalizeMock.mockResolvedValue({ ...FINALIZED })
})

describe('A) the exact admin jobId binds interlink finalization', () => {
  it('passes the exact jobId as sourceJobId', async () => {
    const { status } = await post({ canonicalUrl: CANONICAL, jobId: JOB })

    expect(status).toBe(200)
    expect(finalizeMock).toHaveBeenCalledTimes(1)
    expect(finalizeMock).toHaveBeenCalledWith({ canonicalUrl: CANONICAL, sourceJobId: JOB })
  })

  it('preserves the legacy source-url-only behavior only when no jobId exists', async () => {
    await post({ canonicalUrl: CANONICAL })

    expect(finalizeMock).toHaveBeenCalledWith({ canonicalUrl: CANONICAL })
  })

  it('never finalizes when the live verification did not resolve ok=true', async () => {
    verifyLiveUrlMock.mockResolvedValue({
      ok: false,
      liveUrl: CANONICAL,
      httpStatus: 404,
      verifiedAt: '2026-09-20T12:00:00.000Z',
      error: 'not live yet',
    } as never)

    const { json } = await post({ canonicalUrl: CANONICAL, jobId: JOB })

    expect(finalizeMock).not.toHaveBeenCalled()
    expect(json.interlinks).toBeNull()
  })

  it('M1: withholds job-bound finalization on an ok=true verdict without positive deployment lineage', async () => {
    verifyLiveUrlMock.mockResolvedValue({
      ok: true,
      liveUrl: CANONICAL,
      httpStatus: 200,
      verifiedAt: '2026-09-20T12:00:00.000Z',
      // Legacy/uncontracted health verdict: ok=true proves nothing about the
      // official deployment of the supplied job.
      lineageVerified: null,
      publicationPhase: null,
    } as never)

    const { json } = await post({ canonicalUrl: CANONICAL, jobId: JOB })

    expect(finalizeMock).not.toHaveBeenCalled()
    expect(json.interlinks).toBeNull()
    expect(json.interlinksWithheld).toBe('deployment_lineage_not_proven')
  })

  it('M2: a withheld job-bound verification never shows a bare "Verified" article message', async () => {
    verifyLiveUrlMock.mockResolvedValue({
      ok: true,
      liveUrl: CANONICAL,
      httpStatus: 200,
      verifiedAt: '2026-09-20T12:00:00.000Z',
      // Article verification succeeded (ok=true), but the supplied exact job
      // has no positive deployment lineage — the staged interlinks stay planned.
      lineageVerified: null,
      publicationPhase: null,
    } as never)

    const { json } = await post({ canonicalUrl: CANONICAL, jobId: JOB })
    const stamp = json.stamp as { status: string; message: string }

    // The article-level success is kept ...
    expect(stamp.status).toBe('verified')
    expect(stamp.message).toContain('Article verified')
    // ... while the withheld interlink state is stated explicitly.
    expect(stamp.message).toContain('interlinks pending deployment lineage')
    expect(json.interlinksWithheld).toBe('deployment_lineage_not_proven')
    expect(json.interlinks).toBeNull()
  })

  it('M1: a job-bound live_verified lineage verdict still finalizes', async () => {
    const { json } = await post({ canonicalUrl: CANONICAL, jobId: JOB })

    expect(finalizeMock).toHaveBeenCalledWith({ canonicalUrl: CANONICAL, sourceJobId: JOB })
    expect(json.interlinks).toMatchObject({ applied: 1 })
    expect(json.interlinksWithheld).toBeUndefined()
  })

  it('M1: a jobless legacy call is not lineage-gated (jobless-only scope is enforced by the finalizer, H1)', async () => {
    verifyLiveUrlMock.mockResolvedValue({
      ok: true,
      liveUrl: CANONICAL,
      httpStatus: 200,
      verifiedAt: '2026-09-20T12:00:00.000Z',
    } as never)

    const { json } = await post({ canonicalUrl: CANONICAL })

    expect(finalizeMock).toHaveBeenCalledWith({ canonicalUrl: CANONICAL })
    expect(json.interlinksWithheld).toBeUndefined()
  })
})

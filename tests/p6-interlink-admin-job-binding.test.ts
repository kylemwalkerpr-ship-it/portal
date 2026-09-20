/**
 * P6 final repair — ADMIN JOB BINDING.
 *
 * `POST /api/content-studio/verify-published` already receives the exact
 * `jobId`. Passing it through as `sourceJobId` stops an admin verification from
 * finalizing staged rows staged by ANOTHER ship job that shares the canonical.
 * The legacy source-url-only behavior is preserved ONLY when no jobId exists
 * (there is no exact identity to bind to — and none is ever invented).
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
})

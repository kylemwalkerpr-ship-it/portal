/**
 * P6 (supervisor review repair) — the NORMAL ship background-verification path
 * must finalize staged interlinks by itself.
 *
 * Blocker repaired: interlink finalization was only reachable from
 * `POST /api/content-studio/verify-published`. An ordinary successful ship
 * launched `verifyLiveInBackground()` and nothing ever finalized the rows
 * staged for that ship, so valid links could stay `planned` indefinitely.
 *
 * Contract pinned here on the REAL background runner:
 *   · verifyLiveUrl resolves ok=true   → finalize for that EXACT canonicalUrl
 *   · verifyLiveUrl resolves ok=false   → never finalize (fail closed)
 *   · verifyLiveUrl rejects             → never finalize, never rejects
 *   · finalization throws               → isolated; a successful content
 *     verification is never turned into a failure
 * Plus the single-writer rule: no new unverified `applied` writer exists.
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  runBackgroundLiveVerification,
  verifyLiveInBackground,
  type LiveVerifyResult,
} from '@/lib/seoFactory/liveVerify'

const EXACT_CANONICAL =
  'https://legal.yousafeconsultancy.com/us/student-visas/f1-document-checklist-2026/'

const mockFinalize = jest.fn(async () => ({
  sourceUrl: EXACT_CANONICAL,
  checked: 1,
  applied: 1,
  absent: 0,
  targetNotLive: 0,
  unverifiable: 0,
  sourceNotLive: 0,
  sourceFetchOk: true,
}))

// The default (non-injected) finalizer must be the real live-proof module.
jest.mock('@/lib/seoFactory/interlinkVerification', () => ({
  finalizeStagedInterlinksForLiveSource: (...args: unknown[]) =>
    (mockFinalize as (...a: unknown[]) => unknown)(...args),
}))

const VERIFY_OK = {
  ok: true,
  liveUrl: EXACT_CANONICAL,
  httpStatus: 200,
  verifiedAt: '2026-09-20T00:00:00.000Z',
} as unknown as LiveVerifyResult

/** The same ok=true verdict with positive official deployment lineage (M1). */
const VERIFY_LINEAGE_PROVEN = {
  ...VERIFY_OK,
  lineageVerified: true,
  publicationPhase: 'live_verified',
} as unknown as LiveVerifyResult

const okVerify = jest.fn(async () => VERIFY_OK)
const failedVerify = jest.fn(
  async () => ({ ...VERIFY_OK, ok: false }) as unknown as LiveVerifyResult,
)
const throwingVerify = jest.fn(async () => {
  throw new Error('network unreachable')
})

let warnSpy: jest.SpyInstance

beforeEach(() => {
  mockFinalize.mockClear()
  mockFinalize.mockResolvedValue({
    sourceUrl: EXACT_CANONICAL,
    checked: 1,
    applied: 1,
    absent: 0,
    targetNotLive: 0,
    unverifiable: 0,
    sourceNotLive: 0,
    sourceFetchOk: true,
  })
  // Implementations are re-established per test: a bare jest.restoreAllMocks()
  // would strip jest.fn implementations and silently pass the negative cases.
  okVerify.mockClear()
  okVerify.mockImplementation(async () => VERIFY_OK)
  failedVerify.mockClear()
  failedVerify.mockImplementation(
    async () => ({ ...VERIFY_OK, ok: false }) as unknown as LiveVerifyResult,
  )
  throwingVerify.mockClear()
  throwingVerify.mockImplementation(async () => {
    throw new Error('network unreachable')
  })
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe('background live verification — interlink finalization', () => {
  it('finalizes staged rows for the EXACT canonicalUrl once verification is ok=true', async () => {
    // `finalize` is deliberately NOT injected: this proves the default wiring
    // is the real finalizer and that the exact canonical is passed through.
    await runBackgroundLiveVerification({ canonicalUrl: EXACT_CANONICAL }, { verify: okVerify })

    expect(okVerify).toHaveBeenCalledTimes(1)
    expect(okVerify).toHaveBeenCalledWith({ canonicalUrl: EXACT_CANONICAL })
    expect(mockFinalize).toHaveBeenCalledTimes(1)
    expect(mockFinalize).toHaveBeenCalledWith({ canonicalUrl: EXACT_CANONICAL })
  })

  it('never finalizes when the content verification is not ok (fail closed)', async () => {
    await runBackgroundLiveVerification({ canonicalUrl: EXACT_CANONICAL }, { verify: failedVerify })

    expect(failedVerify).toHaveBeenCalledTimes(1)
    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it('never finalizes when the verifier rejects, and never rejects itself', async () => {
    await expect(
      runBackgroundLiveVerification({ canonicalUrl: EXACT_CANONICAL }, { verify: throwingVerify }),
    ).resolves.toBeUndefined()

    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it('isolates a finalization failure — the successful content verification stands', async () => {
    mockFinalize.mockRejectedValueOnce(new Error('interlink store exploded'))

    await expect(
      runBackgroundLiveVerification({ canonicalUrl: EXACT_CANONICAL }, { verify: okVerify }),
    ).resolves.toBeUndefined()

    expect(okVerify).toHaveBeenCalledTimes(1)
    expect(mockFinalize).toHaveBeenCalledTimes(1)
  })

  it('does not finalize without a canonicalUrl even when verification is ok', async () => {
    await runBackgroundLiveVerification({ canonicalUrl: '   ' }, { verify: okVerify })

    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it('binds the ship-time finalization to the exact ship job when one is known', async () => {
    const shipJob = '66666666-6666-4666-8666-666666666666'
    const lineageVerify = jest.fn(async () => VERIFY_LINEAGE_PROVEN)

    await runBackgroundLiveVerification(
      { canonicalUrl: EXACT_CANONICAL, jobId: shipJob },
      { verify: lineageVerify },
    )

    // The exact job id travels into verification (official deployment
    // lineage) and into the finalizer (only that job's staged rows may apply).
    expect(lineageVerify).toHaveBeenCalledWith({ canonicalUrl: EXACT_CANONICAL, jobId: shipJob })
    expect(mockFinalize).toHaveBeenCalledWith({
      canonicalUrl: EXACT_CANONICAL,
      sourceJobId: shipJob,
    })
  })

  it('M1: withholds job-bound finalization on an ok=true verdict WITHOUT positive deployment lineage', async () => {
    const shipJob = '66666666-6666-4666-8666-666666666666'
    // VERIFY_OK is ok=true but carries the legacy/uncontracted health verdict
    // (no lineageVerified / publicationPhase) — proving nothing about the
    // official production deployment of that job.
    await runBackgroundLiveVerification(
      { canonicalUrl: EXACT_CANONICAL, jobId: shipJob },
      { verify: okVerify },
    )

    expect(okVerify).toHaveBeenCalledWith({ canonicalUrl: EXACT_CANONICAL, jobId: shipJob })
    expect(mockFinalize).not.toHaveBeenCalled()
    // The withheld truth is observable, never silent.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/without positive deployment lineage/i),
      expect.objectContaining({ jobId: shipJob }),
    )
  })

  it('legacy callers without a job id keep the source-url-only finalization', async () => {
    await runBackgroundLiveVerification({ canonicalUrl: EXACT_CANONICAL }, { verify: okVerify })

    expect(mockFinalize).toHaveBeenCalledWith({ canonicalUrl: EXACT_CANONICAL })
  })

  it('M1: requires the exact live_verified phase, not just a lineage flag', async () => {
    const shipJob = '66666666-6666-4666-8666-666666666666'
    const wrongPhaseVerify = jest.fn(
      async () =>
        ({
          ...VERIFY_LINEAGE_PROVEN,
          publicationPhase: 'deployment_pending',
        }) as unknown as LiveVerifyResult,
    )

    await runBackgroundLiveVerification(
      { canonicalUrl: EXACT_CANONICAL, jobId: shipJob },
      { verify: wrongPhaseVerify },
    )

    expect(wrongPhaseVerify).toHaveBeenCalledTimes(1)
    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it('verifyLiveInBackground is the ship entry point into the background runner', () => {
    // The real verifyLiveUrl cannot be injected through the public ship entry
    // point, so the delegation itself is pinned at source level (and the ship
    // ordering suite drives the real shipContent through this entry point).
    const src = readFileSync(join(process.cwd(), 'lib', 'seoFactory', 'liveVerify.ts'), 'utf8')
    expect(src).toMatch(
      /export function verifyLiveInBackground\(input:LiveVerifyInput\)\{return runBackgroundLiveVerification\(input\)\}/,
    )
    expect(typeof verifyLiveInBackground).toBe('function')
  })
})

describe('P6 — no unverified applied writer may be introduced', () => {
  it('only the live-proof verifier writes status applied anywhere in lib/app/scripts', () => {
    const roots = ['lib', 'app', 'scripts'].map((dir) => join(process.cwd(), dir))
    const allowed = join('lib', 'seoFactory', 'interlinkVerification.ts')
    const offenders: string[] = []

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(ts|tsx|mts)$/.test(entry.name)) continue
        const source = readFileSync(full, 'utf8')
        if (!/status\s*:\s*'applied'/.test(source)) continue
        if (full.endsWith(allowed)) continue
        offenders.push(full)
      }
    }

    roots.forEach(walk)
    expect(offenders).toEqual([])
  })

  it('the ship door never writes an applied status itself', () => {
    const shipSource = readFileSync(join(process.cwd(), 'lib', 'seoFactory', 'ship.ts'), 'utf8')
    expect(shipSource).not.toMatch(/status\s*:\s*'applied'/)
    expect(shipSource).not.toMatch(/verification_state\s*:/)
    expect(shipSource).not.toMatch(/applied_at\s*:/)
    // staging (not applying) is what the ship door is allowed to do
    expect(shipSource).toMatch(/stageEngineInterlinksForVerification/)
  })
})

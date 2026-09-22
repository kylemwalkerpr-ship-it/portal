import { readFileSync } from 'node:fs'
import { join } from 'node:path'

jest.mock('@/lib/seoFactory/linkAudit', () => ({
  auditLinksLive: jest.fn(),
  sanitizeDraftLinksLive: jest.fn(),
}))

import {
  auditRenderedExternalSources,
  assertRenderedExternalSourcesLive,
} from '@/lib/seoFactory/ship'
import { auditLinksLive } from '@/lib/seoFactory/linkAudit'

const auditLinksLiveMock = auditLinksLive as jest.MockedFunction<typeof auditLinksLive>

describe('P8 rendered-source live verification', () => {
  beforeEach(() => {
    auditLinksLiveMock.mockReset()
  })

  it('re-audits renderer-added external sources while excluding estate URLs', async () => {
    const external = 'https://travel.state.gov/content/travel/en/us-visas.html'
    const estate = 'https://legal.yousafeconsultancy.com/us/student-visas/'
    auditLinksLiveMock.mockResolvedValue([
      {
        code: 'dead_external_link',
        severity: 'blocker',
        url: external,
        message: 'source is not live',
      } as any,
    ])

    await expect(
      assertRenderedExternalSourcesLive({
        artifact: `const sources = [{ url: "${external}" }, { url: "${estate}" }]`,
        knownLiveUrls: [estate],
        citationContext: { region: 'US', topic: 'F-1 visa', keywords: ['f-1 visa'] },
      }),
    ).rejects.toThrow(/Refusing ship: rendered caseworks page/)

    expect(auditLinksLiveMock).toHaveBeenCalledTimes(1)
    const [auditDoc] = auditLinksLiveMock.mock.calls[0]!
    expect(auditDoc).toContain(external)
    expect(auditDoc).not.toContain(estate)
  })

  it('passes when the authoritative live/retrieval audit verifies the rendered source set', async () => {
    auditLinksLiveMock.mockResolvedValue([])
    await expect(
      assertRenderedExternalSourcesLive({
        artifact: 'const sources = [{ url: "https://www.uscis.gov/working-in-the-united-states" }]',
        citationContext: { region: 'US', topic: 'work visa' },
      }),
    ).resolves.toEqual([])
    expect(auditLinksLiveMock).toHaveBeenCalledTimes(1)
  })

  it('returns no findings and avoids a live call when rendered output has no external URLs', async () => {
    await expect(
      auditRenderedExternalSources({
        artifact: 'const canonical = "https://legal.yousafeconsultancy.com/us/student-visas/"',
      }),
    ).resolves.toEqual([])
    expect(auditLinksLiveMock).not.toHaveBeenCalled()
  })

  it('pins the post-render fail-closed gate before the first Git write in shipContent', () => {
    const source = readFileSync(join(process.cwd(), 'lib/seoFactory/ship.ts'), 'utf8')
    const shipStart = source.indexOf('export async function shipContent')
    const shipBody = source.slice(shipStart)
    const renderAt = shipBody.indexOf('renderTargetFile({')
    const auditAt = shipBody.indexOf('assertRenderedExternalSourcesLive({', renderAt)
    const masterGateAt = shipBody.indexOf('// ── Master gate stack', auditAt)
    const firstWriteAt = shipBody.indexOf('putRepoFile(')

    expect(shipStart).toBeGreaterThanOrEqual(0)
    expect(renderAt).toBeGreaterThanOrEqual(0)
    expect(auditAt).toBeGreaterThan(renderAt)
    expect(masterGateAt).toBeGreaterThan(auditAt)
    expect(firstWriteAt).toBeGreaterThan(auditAt)
  })
})

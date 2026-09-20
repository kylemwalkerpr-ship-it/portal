/**
 * P6 — automatic draft interlinks fail closed.
 *
 * When live-internal-link verification throws or proves nothing live, the
 * drafting pipeline must withhold every automatic planner/radar interlink.
 * The previous best-effort `catch` left unverified links in the draft
 * allowlist; that is no longer allowed, and no replacement link is invented.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pruneInterlinksToLiveTargets } from '@/lib/seoFactory/interlinkInjection'

const PIPELINE = path.join(process.cwd(), 'lib/seoFactory/pipelineStream.ts')

const LIVE = 'https://market.yousafeconsultancy.com/categories/study-permits'
const DEAD = 'https://legal.yousafeconsultancy.com/us/made-up-journey/'

describe('A) pruneInterlinksToLiveTargets', () => {
  it('keeps only verified-live candidates (trailing-slash tolerant)', async () => {
    const result = await pruneInterlinksToLiveTargets(
      [
        { label: 'live', url: LIVE },
        { label: 'live slash', url: `${LIVE}/` },
        { label: 'dead', url: DEAD },
      ],
      async () => [`${LIVE}/`],
    )

    expect(result.ok).toBe(true)
    expect(result.links.map((link) => link.url)).toEqual([LIVE, `${LIVE}/`])
  })

  it('withholds every link when verification throws', async () => {
    const result = await pruneInterlinksToLiveTargets(
      [{ url: LIVE }, { url: DEAD }],
      async () => {
        throw new Error('verifier unreachable')
      },
    )

    expect(result).toEqual({ links: [], ok: false, error: 'verifier unreachable' })
  })

  it('withholds every link when nothing is proven live', async () => {
    const result = await pruneInterlinksToLiveTargets([{ url: LIVE }, { url: DEAD }], async () => [])

    expect(result.links).toEqual([])
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/no live internal target/i)
  })

  it('withholds candidates that carry no URL at all', async () => {
    const result = await pruneInterlinksToLiveTargets([{ label: 'no url' }], async () => [LIVE])

    expect(result).toEqual({ links: [], ok: true })
  })

  it('is a no-op for an empty input', async () => {
    expect(await pruneInterlinksToLiveTargets([], async () => [])).toEqual({ links: [], ok: true })
  })
})

describe('B) pipelineStream uses the fail-closed helper (source contract)', () => {
  const source = () => fs.readFileSync(PIPELINE, 'utf8')

  it('imports and calls the fail-closed pruner on radar/planner interlinks', () => {
    const body = source()
    expect(body).toContain("import { pruneInterlinksToLiveTargets } from './interlinkInjection'")
    expect(body).toMatch(/pruneInterlinksToLiveTargets\(radarInterlinks/)
    expect(body).toContain('radarInterlinks = pruned.links')
  })

  it('no longer keeps unverified links in a best-effort catch or splices them out in place', () => {
    const body = source()
    expect(body).not.toContain('live filter is best-effort')
    expect(body).not.toContain('radarInterlinks.splice')
  })

  it('reports the withheld count instead of silently continuing', () => {
    expect(source()).toContain('no unverified links injected')
  })
})

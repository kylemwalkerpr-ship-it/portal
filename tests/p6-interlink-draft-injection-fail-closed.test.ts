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
import { resolveEstateUrl } from '@/lib/seoFactory/linkAudit'

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
    // The first candidate already matches the verifier's live key (trailing
    // slash normalized) and keeps its exact form; the duplicate is deduped and
    // the dead candidate is the only withheld one.
    expect(result.links.map((link) => link.url)).toEqual([LIVE])
    expect(result.withheld).toBe(1)
  })

  it('withholds every link when verification throws', async () => {
    const result = await pruneInterlinksToLiveTargets(
      [{ url: LIVE }, { url: DEAD }],
      async () => {
        throw new Error('verifier unreachable')
      },
    )

    expect(result).toEqual({
      links: [],
      ok: false,
      verifierUnavailable: true,
      withheld: 2,
      error: 'verifier unreachable',
    })
  })

  it('withholds every link when verification ran and nothing is proven live (NOT a verifier failure)', async () => {
    const result = await pruneInterlinksToLiveTargets([{ url: LIVE }, { url: DEAD }], async () => [])

    expect(result.links).toEqual([])
    expect(result.ok).toBe(false)
    expect(result.verifierUnavailable).toBe(false)
    expect(result.withheld).toBe(2)
    expect(result.error).toMatch(/no live internal target/i)
  })

  it('counts DISTINCT normalized withheld URLs (slash variants never inflate the count)', async () => {
    const result = await pruneInterlinksToLiveTargets(
      [{ url: DEAD }, { url: `${DEAD}/` }, { url: LIVE }],
      async () => [LIVE],
    )

    expect(result.ok).toBe(true)
    expect(result.withheld).toBe(1)
  })

  it('withholds candidates that carry no URL at all', async () => {
    const result = await pruneInterlinksToLiveTargets([{ label: 'no url' }], async () => [LIVE])

    expect(result).toEqual({ links: [], ok: true, withheld: 0 })
  })

  it('is a no-op for an empty input', async () => {
    expect(await pruneInterlinksToLiveTargets([], async () => [])).toEqual({
      links: [],
      ok: true,
      withheld: 0,
    })
  })

  it('resolves a root-relative estate candidate and emits the PROVEN absolute live URL', async () => {
    const relative = '/us/student-visas/'
    const absolute = 'https://legal.yousafeconsultancy.com/us/student-visas'
    const result = await pruneInterlinksToLiveTargets(
      [{ label: 'journey next', url: relative }],
      async () => [absolute],
      { resolveCandidate: resolveEstateUrl },
    )

    expect(result.ok).toBe(true)
    expect(result.withheld).toBe(0)
    expect(result.links).toEqual([
      { label: 'journey next', url: absolute },
    ])
  })

  it('reports withheld even on partial success, and never invents a replacement', async () => {
    const result = await pruneInterlinksToLiveTargets(
      [
        { label: 'live', url: LIVE },
        { label: 'dead', url: DEAD },
      ],
      async () => [`${LIVE}/`],
      { resolveCandidate: resolveEstateUrl },
    )

    expect(result.ok).toBe(true)
    expect(result.links.map((link) => link.url)).toEqual([LIVE])
    expect(result.withheld).toBe(1)
  })

  it('withholds an external/non-estate candidate unless its own authority proves it', async () => {
    const external = 'https://example.com/not-estate'
    const result = await pruneInterlinksToLiveTargets(
      [{ url: LIVE }, { url: external }],
      async (urls) => urls.filter((url) => url === LIVE),
      { resolveCandidate: resolveEstateUrl },
    )

    expect(result.links.map((link) => link.url)).toEqual([LIVE])
    expect(result.withheld).toBe(1)
    expect(result.links.map((link) => link.url)).not.toContain(external)
  })
})

describe('B) pipelineStream uses the fail-closed helper (source contract)', () => {
  const source = () => fs.readFileSync(PIPELINE, 'utf8')

  it('imports and calls the fail-closed pruner on radar/planner interlinks', () => {
    const body = source()
    expect(body).toContain("import { pruneInterlinksToLiveTargets } from './interlinkInjection'")
    expect(body).toMatch(/pruneInterlinksToLiveTargets\(\s*radarInterlinks/)
    expect(body).toContain('radarInterlinks = pruned.links')
  })

  it('no longer keeps unverified links in a best-effort catch or splices them out in place', () => {
    const body = source()
    expect(body).not.toContain('live filter is best-effort')
    expect(body).not.toContain('radarInterlinks.splice')
  })

  it('reports the withheld count instead of silently continuing, and distinguishes verifier-unavailable from nothing-live', () => {
    const body = source()
    expect(body).toContain('no unverified links injected')
    expect(body).toContain('live verification was UNAVAILABLE')
    expect(body).toContain('live verification completed but NO candidate was proven live')
  })

  it('normalizes candidates through resolveEstateUrl and reports partial withhelds', () => {
    const body = source()
    expect(body).toContain('resolveEstateUrl')
    expect(body).toMatch(/resolveCandidate: resolveEstateUrl/)
    expect(body).toMatch(/pruned\.withheld > 0/)
  })
})

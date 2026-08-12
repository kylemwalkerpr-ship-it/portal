/**
 * Link-integrity regression suite (2026-08 example.com incident).
 * Locks the three guarantees:
 *  1. Placeholder / invented URLs (example.com, yourdomain.com…) are hard
 *     blockers — a draft can never ship with a made-up link.
 *  2. Dead internal links are caught with real HTTP evidence (404 → blocker),
 *     while verified sitemap URLs pass.
 *  3. The interlink registry normalizes the dead legacy base (caseworks.com)
 *     to the live estate (legal.yousafeconsultancy.com) and only verified
 *     URLs survive into a brief or prompt.
 */
import {
  auditLinksLive,
  auditLinksSync,
  countEstateLinks,
  ensureBriefInterlinks,
  ESTATE_ANCHOR_LINKS,
  extractLinks,
  filterLiveInternalUrls,
  isPlaceholderUrl,
  normalizeEstateUrl,
  resetLinkAuditCaches,
} from '@/lib/seoFactory/linkAudit'

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://legal.yousafeconsultancy.com/</loc></url>
  <url><loc>https://legal.yousafeconsultancy.com/us/</loc></url>
  <url><loc>https://legal.yousafeconsultancy.com/us/student-visas/</loc></url>
  <url><loc>https://legal.yousafeconsultancy.com/us/essay-editing/</loc></url>
  <url><loc>https://legal.yousafeconsultancy.com/services/</loc></url>
</urlset>`

function okJson() {
  return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } })
}

const originalFetch = global.fetch
const originalSitemapUrl = process.env.ESTATE_SITEMAP_URL
const originalTimeout = process.env.LINK_AUDIT_FETCH_TIMEOUT_MS

afterEach(() => {
  global.fetch = originalFetch
  if (originalSitemapUrl == null) delete process.env.ESTATE_SITEMAP_URL
  else process.env.ESTATE_SITEMAP_URL = originalSitemapUrl
  if (originalTimeout == null) delete process.env.LINK_AUDIT_FETCH_TIMEOUT_MS
  else process.env.LINK_AUDIT_FETCH_TIMEOUT_MS = originalTimeout
  resetLinkAuditCaches()
})

function mockEstateFetch(deadPaths: string[] = []) {
  process.env.ESTATE_SITEMAP_URL = 'https://legal.yousafeconsultancy.com/sitemap.xml'
  process.env.LINK_AUDIT_FETCH_TIMEOUT_MS = '3000'
  global.fetch = jest.fn(async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : String(input?.url || '')
    if (url.includes('/sitemap.xml')) {
      return new Response(SITEMAP_XML, { status: 200, headers: { 'content-type': 'application/xml' } })
    }
    if (deadPaths.some((p) => url.endsWith(p))) {
      return new Response('not found', { status: 404 })
    }
    return okJson()
  }) as typeof fetch
}

describe('linkAudit · extraction + classification', () => {
  it('extracts markdown and html links', () => {
    const links = extractLinks('See [the guide](/us/student-visas/) and <a href="https://example.com/x">x</a>.')
    expect(links.map((l) => l.url)).toEqual(['/us/student-visas/', 'https://example.com/x'])
  })

  it('flags placeholder hosts and placeholder path tokens', () => {
    expect(isPlaceholderUrl('https://www.example.com/essay-editing-services').hit).toBe(true)
    expect(isPlaceholderUrl('https://example.org/x').hit).toBe(true)
    expect(isPlaceholderUrl('https://yourdomain.com/a').hit).toBe(true)
    expect(isPlaceholderUrl('https://legal.yousafeconsultancy.com/us/example-path').hit).toBe(true)
    // 2026-08-12 regression: yoursite.com / yourwebsite were not in the host
    // regex — the AI could slip a classic placeholder past the gate.
    expect(isPlaceholderUrl('https://yoursite.com/uk/guide').hit).toBe(true)
    expect(isPlaceholderUrl('https://www.yoursite.com/x').hit).toBe(true)
    expect(isPlaceholderUrl('https://yourwebsite.com/y').hit).toBe(true)
    expect(isPlaceholderUrl('https://legal.yousafeconsultancy.com/us/student-visas/').hit).toBe(false)
  })

  it('normalizes the dead legacy base to the live estate', () => {
    expect(normalizeEstateUrl('https://caseworks.com/us/f1-opt/')).toBe('https://legal.yousafeconsultancy.com/us/f1-opt')
    expect(normalizeEstateUrl('/us/student-visas/#faq')).toBe('/us/student-visas')
  })
})

describe('linkAudit · sync structural audit', () => {
  it('blocks placeholder links even without a verified set', () => {
    const findings = auditLinksSync('Read [services](https://www.example.com/essay-editing-services) now.')
    expect(findings.some((f) => f.code === 'placeholder_link' && f.severity === 'blocker')).toBe(true)
  })

  it('blocks malformed links (no scheme, not relative)', () => {
    // NB: spaces inside the parens mean the text is not extractable markdown,
    // so it renders as literal prose — the engine only audits real links.
    const findings = auditLinksSync('See [x](notaurl)')
    expect(findings.some((f) => f.code === 'malformed_link' && f.severity === 'blocker')).toBe(true)
  })

  it('warns on unverified internal paths when a verified set is supplied', () => {
    const findings = auditLinksSync(
      'See [f1 opt](/us/f1-opt/) and [hub](/us/student-visas/).',
      ['https://legal.yousafeconsultancy.com/us/student-visas/'],
    )
    const unverified = findings.filter((f) => f.code === 'unverified_internal_link')
    expect(unverified.some((f) => f.url === '/us/f1-opt/')).toBe(true)
    expect(unverified.some((f) => f.url === '/us/student-visas/')).toBe(false)
  })

  it('warns on insecure http internal links', () => {
    const findings = auditLinksSync('See [x](http://legal.yousafeconsultancy.com/us/student-visas/)')
    expect(findings.some((f) => f.code === 'insecure_internal_link')).toBe(true)
  })
})

describe('linkAudit · brief internal-link guarantee', () => {
  it('tops up an empty model response to ≥2 from the allowlist', () => {
    const allowlist = [
      { label: 'US hub', url: 'https://legal.yousafeconsultancy.com/us/' },
      { label: 'Student visas', url: 'https://legal.yousafeconsultancy.com/us/student-visas/' },
    ]
    const out = ensureBriefInterlinks(allowlist, [], { region: 'US' })
    expect(out.length).toBeGreaterThanOrEqual(2)
    expect(out[0].url).toContain('yousafeconsultancy.com')
  })

  it('keeps model targets only when they exist in the allowlist (no invented URLs)', () => {
    const allowlist = [
      { label: 'US hub', url: 'https://legal.yousafeconsultancy.com/us/' },
      { label: 'Services', url: 'https://legal.yousafeconsultancy.com/services/' },
      { label: 'Student visas', url: 'https://legal.yousafeconsultancy.com/us/student-visas/' },
    ]
    const modelTargets = [
      { label: 'US hub', url: 'https://legal.yousafeconsultancy.com/us/' },
      // Model hallucination — must be dropped, never shipped
      { label: 'Made up', url: 'https://legal.yousafeconsultancy.com/us/not-a-real-page/' },
      { label: 'Example', url: 'https://example.com/evil' },
    ]
    const out = ensureBriefInterlinks(allowlist, modelTargets, { region: 'US' })
    expect(out.some((l) => l.url.includes('not-a-real-page'))).toBe(false)
    expect(out.some((l) => l.url.includes('example.com'))).toBe(false)
    expect(out.some((l) => l.url.includes('/us/'))).toBe(true)
    expect(out.length).toBeGreaterThanOrEqual(2)
  })

  it('falls back to verified region anchors when the allowlist is empty', () => {
    const out = ensureBriefInterlinks([], [], { region: 'UK' })
    expect(out.length).toBeGreaterThanOrEqual(2)
    // UK anchors must be the verified live estate hosts
    expect(out.every((l) => l.url.includes('yousafeconsultancy.com'))).toBe(true)
    expect(out.some((l) => l.url.includes('/uk/'))).toBe(true)
  })

  it('dedupes by normalized URL across model + allowlist', () => {
    const allowlist = [
      { label: 'US hub', url: 'https://legal.yousafeconsultancy.com/us/' },
      { label: 'Hub (alt label)', url: 'https://legal.yousafeconsultancy.com/us' },
      { label: 'Services', url: 'https://legal.yousafeconsultancy.com/services/' },
    ]
    const out = ensureBriefInterlinks(allowlist, [{ label: 'US hub', url: 'https://legal.yousafeconsultancy.com/us/' }], { region: 'US' })
    const urls = out.map((l) => normalizeEstateUrl(l.url))
    expect(new Set(urls).size).toBe(urls.length)
  })

  it('every region has ≥2 verified live anchors', () => {
    for (const [region, anchors] of Object.entries(ESTATE_ANCHOR_LINKS)) {
      expect(anchors.length).toBeGreaterThanOrEqual(2)
      for (const a of anchors) {
        expect(a.url).toMatch(/yousafeconsultancy\.com/)
      }
    }
  })
})

describe('linkAudit · countEstateLinks (shared INTERNAL_LINKS counter)', () => {
  it('counts relative estate paths and any estate subdomain', () => {
    const body =
      'See [hub](/us/student-visas/) and [legal](https://legal.yousafeconsultancy.com/us/) and [portal](https://portal.yousafeconsultancy.com/)'
    expect(countEstateLinks(body)).toBe(3)
  })

  it('counts caseworks.com links (2026-08 fix: previously ignored)', () => {
    expect(countEstateLinks('Read [guide](https://caseworks.com/us/h1b/)')).toBe(1)
    expect(countEstateLinks('Read [www](https://www.caseworks.com/uk/)')).toBe(1)
  })

  it('counts future estate subdomains automatically via the estate root regex', () => {
    expect(countEstateLinks('See [x](https://api.yousafeconsultancy.com/v1)')).toBe(1)
    expect(countEstateLinks('See [y](https://some-future-sub.caseworks.com/page)')).toBe(1)
  })

  it('does not count external or placeholder hosts', () => {
    expect(countEstateLinks('See [gov](https://www.uscis.gov/x) and [example](https://example.com/y)')).toBe(0)
  })
})

describe('linkAudit · live verification', () => {
  it('marks a 404 internal path as a dead_internal_link blocker', async () => {
    mockEstateFetch(['/us/f1-opt'])
    const findings = await auditLinksLive('See [f1 opt](/us/f1-opt/) and [hub](/us/student-visas/).')
    const dead = findings.filter((f) => f.code === 'dead_internal_link')
    expect(dead.length).toBeGreaterThan(0)
    expect(dead[0].severity).toBe('blocker')
  })

  it('passes sitemap-verified internal links without a live check', async () => {
    mockEstateFetch()
    const findings = await auditLinksLive('See [hub](/us/student-visas/).')
    expect(findings.some((f) => f.code === 'dead_internal_link')).toBe(false)
    expect(findings.some((f) => f.code === 'unverified_internal_link')).toBe(false)
  })

  it('filterLiveInternalUrls keeps only live estate targets', async () => {
    mockEstateFetch(['/us/f1-opt'])
    const live = await filterLiveInternalUrls([
      'https://caseworks.com/us/f1-opt/',
      'https://caseworks.com/us/student-visas/',
    ])
    expect(live).toContain('https://legal.yousafeconsultancy.com/us/student-visas')
    expect(live.some((u) => u.includes('f1-opt'))).toBe(false)
  })
})

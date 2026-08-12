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

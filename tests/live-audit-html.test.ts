import { auditLiveHtml } from '@/lib/seoFactory/liveAudit'

function prose(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
}

function healthyHtml(opts?: { navWords?: number; bodyWords?: number; wrapArticle?: boolean }): string {
  const navWords = opts?.navWords ?? 400
  const bodyWords = opts?.bodyWords ?? 2600
  const nav = `<nav>${'<a href="/home">Home</a> '.repeat(navWords)}</nav>`
  const footer = `<footer>${'<a href="/about">About</a> '.repeat(300)}</footer>`
  const article = `
<h1>UK Renters Rights for International Students 2026</h1>
<h2>Your rights as a tenant</h2><p>${prose(bodyWords)}</p>
<h2>Deposit protection</h2><p>${prose(20)}</p>
<h2>Repairs and safety</h2><p>${prose(20)}</p>
<h2>Ending your tenancy</h2><p>${prose(20)}</p>
<p>In 60 seconds: your key rights as an international student tenant.</p>
<p>This is for informational purposes only and does not constitute legal advice. Consult a qualified solicitor.</p>
<p>See <a href="https://www.gov.uk/private-renting">gov.uk private renting</a>, <a href="/uk/housing-guide">our housing guide</a> and <a href="https://legal.yousafeconsultancy.com/uk/student-visas/">student visas</a>.</p>`
  return `<!DOCTYPE html><html><head>
<title>Renters Rights</title>
<meta name="description" content="${'A'.repeat(150)}">
<link rel="canonical" href="https://legal.yousafeconsultancy.com/uk/renters-rights-international-students/">
<script type="application/ld+json">{"@type":"Article","headline":"x"}</script>
<script type="application/ld+json">{"@type":"FAQPage"}</script>
</head><body>
${nav}<header>Site header</header>
${opts?.wrapArticle === false ? `<div>${article}</div>` : `<article>${article}</article>`}
${footer}
</body></html>`
}

describe('auditLiveHtml — HTML-native live page audit', () => {
  it('scores a healthy rendered page 100/100 and extracts real signals', () => {
    const r = auditLiveHtml({ html: healthyHtml(), contentType: 'article', primaryKeyword: 'renters rights international students' })
    expect(r.score).toBe(100)
    expect(r.h1).toContain('UK Renters Rights')
    expect(r.h2Count).toBeGreaterThanOrEqual(4)
    expect(r.metaDescription?.length).toBe(150)
    expect(r.hasArticleSchema).toBe(true)
    expect(r.hasFaqSchema).toBe(true)
    expect(r.hasGovCitations).toBe(true)
    expect(r.hasDisclaimer).toBe(true)
    expect(r.hasTldr).toBe(true)
    expect(r.internalLinks).toBeGreaterThanOrEqual(2)
    expect(r.keywordInTitle).toBe(true)
    expect(r.wordCount).toBeGreaterThanOrEqual(2200)
    expect(r.warnings).toHaveLength(0)
  })

  it('excludes nav/footer/header boilerplate from the body word count', () => {
    // Big nav + footer, tiny article — word count must reflect the article only.
    const r = auditLiveHtml({
      html: healthyHtml({ navWords: 1200, bodyWords: 40, wrapArticle: true }),
      contentType: 'article',
      primaryKeyword: 'renters rights',
    })
    // 40 prose words + headings/links/disclaimer ≈ far below 1200 nav words.
    expect(r.wordCount).toBeLessThan(200)
  })

  it('still strips nav/footer when the page has no <article>/<main> wrapper', () => {
    const r = auditLiveHtml({
      html: healthyHtml({ navWords: 1200, bodyWords: 40, wrapArticle: false }),
      contentType: 'article',
      primaryKeyword: 'renters rights',
    })
    expect(r.wordCount).toBeLessThan(200)
  })

  it('scores a broken page far below the verified threshold (<30)', () => {
    const r = auditLiveHtml({
      html: '<html><body><p>short page</p></body></html>',
      contentType: 'article',
      primaryKeyword: 'renters rights',
    })
    expect(r.score).toBeLessThan(30)
    expect(r.wordCount).toBeLessThan(2200)
    expect(r.h1).toBeNull()
    expect(r.h2Count).toBe(0)
    expect(r.hasDisclaimer).toBe(false)
    expect(r.hasTldr).toBe(false)
  })

  it('detects government citations via href, not only visible text', () => {
    const html = `<html><body><article><h1>UK Guide for Tenants</h1>
<p>${prose(2300)}</p>
<p>In 60 seconds: your rights.</p>
<p>Educational purposes only — not legal advice.</p>
<h2>A</h2><h2>B</h2><h2>C</h2><h2>D</h2>
<p>More at <a href="https://www.gov.uk/housing">the official housing page</a>.</p>
</article></body></html>`
    const r = auditLiveHtml({ html, contentType: 'article', primaryKeyword: 'uk tenants' })
    expect(r.hasGovCitations).toBe(true)
  })

  it('counts only estate/relative links as internal links, not external URLs', () => {
    const html = `<html><body><article><h1>UK Guide for Tenants</h1>
<p>${prose(2300)}</p>
<p>In 60 seconds: your rights. Not legal advice.</p>
<h2>A</h2><h2>B</h2><h2>C</h2><h2>D</h2>
<p><a href="/uk/housing-guide">internal relative</a>
<a href="https://legal.yousafeconsultancy.com/uk/student-visas/">estate host</a>
<a href="https://en.wikipedia.org/wiki/Renting">external</a></p>
</article></body></html>`
    const r = auditLiveHtml({ html, contentType: 'article', primaryKeyword: 'uk tenants' })
    expect(r.internalLinks).toBe(2)
  })
})

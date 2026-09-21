/**
 * P6 — exact live anchor-href proof.
 *
 * The only admissible proof is a real `<a href>` attribute whose URL matches
 * the target after safe trailing-slash normalization. A target URL that merely
 * appears in plain text, a `<script>` body or JSON is NOT proof.
 */
import {
  exactAnchorHrefMatch,
  extractAnchorHrefs,
  extractDraftAnchorHrefs,
  normalizeInterlinkProofUrl,
} from '@/lib/seoFactory/interlinkVerification'

const TARGET = 'https://legal.yousafeconsultancy.com/uk/student-visas/'

describe('A) normalizeInterlinkProofUrl', () => {
  it('drops trailing slashes and fragments, lowercases the host, keeps the query', () => {
    expect(normalizeInterlinkProofUrl('HTTPS://Legal.YouSafeConsultancy.com/uk/student-visas/#apply')).toBe(
      'https://legal.yousafeconsultancy.com/uk/student-visas',
    )
    expect(normalizeInterlinkProofUrl('https://legal.yousafeconsultancy.com/uk/student-visas/?a=1')).toBe(
      'https://legal.yousafeconsultancy.com/uk/student-visas?a=1',
    )
  })

  it('keeps the root path and never invents a path', () => {
    expect(normalizeInterlinkProofUrl('https://legal.yousafeconsultancy.com/')).toBe(
      'https://legal.yousafeconsultancy.com/',
    )
    expect(normalizeInterlinkProofUrl('')).toBe('')
  })
})

describe('B) exactAnchorHrefMatch', () => {
  it('accepts a structurally exact anchor, including trailing-slash variation', () => {
    const html = `<p>Read the <a class="cta" href="${TARGET}">UK student visa guide</a> first.</p>`
    const proof = exactAnchorHrefMatch(html, TARGET.replace(/\/$/, ''))
    expect(proof.present).toBe(true)
    expect(proof.observedHref).toBe(TARGET)
    expect(proof.context).toContain('UK student visa guide')
  })

  it('accepts single-quoted hrefs', () => {
    const html = `<a href='${TARGET.replace(/\/$/, '')}'>guide</a>`
    expect(exactAnchorHrefMatch(html, TARGET).present).toBe(true)
  })

  it('rejects the target URL present only as plain text', () => {
    const html = `<article><p>See ${TARGET} for details.</p></article>`
    expect(exactAnchorHrefMatch(html, TARGET).present).toBe(false)
  })

  it('rejects the target URL serialized inside JSON', () => {
    const html = `<html><body><script id="__DATA__" type="application/json">{"next":"${TARGET}"}</script></body></html>`
    expect(exactAnchorHrefMatch(html, TARGET).present).toBe(false)
  })

  it('rejects the target URL inside a script assignment', () => {
    const html = `<script>window.__NEXT_DATA__ = { href: "${TARGET}" }</script>`
    expect(exactAnchorHrefMatch(html, TARGET).present).toBe(false)
  })

  it('rejects a markdown link for live-HTML proof (no anchor tag)', () => {
    const html = `<p>[UK student visa guide](${TARGET})</p>`
    expect(exactAnchorHrefMatch(html, TARGET).present).toBe(false)
  })

  it('rejects a different host, path, or query', () => {
    expect(exactAnchorHrefMatch(`<a href="https://evil.example.com/uk/student-visas/">x</a>`, TARGET).present).toBe(false)
    expect(exactAnchorHrefMatch(`<a href="https://legal.yousafeconsultancy.com/uk/other/">x</a>`, TARGET).present).toBe(false)
    expect(exactAnchorHrefMatch(`<a href="${TARGET}?utm=1">x</a>`, TARGET).present).toBe(false)
  })

  it('does not treat an href appearing after the tag as an anchor', () => {
    const html = `<a name="x">anchor</a><p>href="${TARGET}"</p>`
    expect(exactAnchorHrefMatch(html, TARGET).present).toBe(false)
  })

  it('returns no proof for a blank target', () => {
    expect(exactAnchorHrefMatch(`<a href="${TARGET}">x</a>`, '')).toEqual({
      present: false,
      observedHref: null,
      context: null,
    })
  })
})

describe('C) extraction helpers', () => {
  it('extractAnchorHrefs returns only real anchor hrefs', () => {
    const html = `<a href="/a">a</a><a data-x="1" href="/b">b</a><a name="no-href">c</a><script>"/d"</script>`
    expect(extractAnchorHrefs(html)).toEqual(['/a', '/b'])
  })

  it('extractDraftAnchorHrefs reads markdown + HTML anchors but not bare URLs', () => {
    const content = `[one](${TARGET}) and <a href="/two">two</a> and bare ${TARGET}?x=1`
    expect(extractDraftAnchorHrefs(content)).toEqual([`/two`, TARGET])
  })
})

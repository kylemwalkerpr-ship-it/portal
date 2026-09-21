/**
 * P6 (supervisor review repair) — structural anchor proof hardening.
 *
 * Reviewer finding: `extractAnchorHrefs` / `exactAnchorHrefMatch` counted any
 * `<a href=…>` text, including anchors that exist only inside HTML comments,
 * `<script>`/`<style>`/`<template>` payloads or serialized strings — and
 * root-relative live hrefs could never match an absolute target.
 *
 * Contract pinned here:
 *   · comment / script / style / template / serialized payload anchors are
 *     NEVER proof (no script/JSON proof, per the P6 contract);
 *   · a real absolute anchor IS proof;
 *   · a real root-relative / same-site anchor IS proof when resolved against
 *     the verified source canonical, and a cross-host href never is;
 *   · fragments normalize away, queries stay strict;
 *   · the same resolution applies to ship-time staging locators.
 */
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/seoEngine/planner', () => ({
  bestCellForTerm: jest.fn(() => ({ stage: 'schools', country: 'US', score: 0.9 })),
  MIN_CELL_MATCH_SCORE: 0.5,
  plannerClusterId: jest.fn(() => 'seo-us-schools-f1-checklist'),
}))

import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  exactAnchorHrefMatch,
  extractAnchorHrefs,
  extractDraftAnchorHrefs,
  normalizeInterlinkProofUrl,
  resolveSameSiteAnchorHref,
  stageEngineInterlinksForVerification,
} from '@/lib/seoFactory/interlinkVerification'
import { createP6FakeDb, type P6FakeRow } from './helpers/p6InterlinkFakeDb'

const createSupabaseAdminClientMock = jest.mocked(createSupabaseAdminClient)

const SOURCE = 'https://legal.yousafeconsultancy.com/us/student-visas/'
const TARGET = 'https://legal.yousafeconsultancy.com/us/student-permits/'

describe('A) non-rendered payloads can never prove an anchor', () => {
  it('rejects an anchor inside an HTML comment', () => {
    const html = `<article><!-- <a href="${TARGET}">commented out</a> --><p>No link here.</p></article>`
    expect(extractAnchorHrefs(html)).toEqual([])
    expect(exactAnchorHrefMatch(html, TARGET).present).toBe(false)
  })

  it('rejects literal anchor markup inside a script payload', () => {
    const html = `<script>document.write('<a href="${TARGET}">injected</a>')</script>`
    expect(extractAnchorHrefs(html)).toEqual([])
    expect(exactAnchorHrefMatch(html, TARGET).present).toBe(false)
  })

  it('rejects literal anchor markup inside style/template payloads', () => {
    const style = `<style>a[href="${TARGET}"] { color: red; }</style>`
    const template = `<template><a href="${TARGET}">templated</a></template>`
    expect(exactAnchorHrefMatch(style, TARGET).present).toBe(false)
    expect(exactAnchorHrefMatch(template, TARGET).present).toBe(false)
  })

  it('rejects a plain-text / JSON href with no anchor element at all', () => {
    const text = `<p>See ${TARGET} for details.</p>`
    const json = `<script type="application/json">{"href":"${TARGET}"}</script>`
    expect(exactAnchorHrefMatch(text, TARGET).present).toBe(false)
    expect(exactAnchorHrefMatch(json, TARGET).present).toBe(false)
  })

  it('rejects markup serialized inside an attribute string', () => {
    const html = `<div data-html="<a href='${TARGET}'>serialized</a>">no real anchor</div>`
    expect(exactAnchorHrefMatch(html, TARGET).present).toBe(false)
  })

  it('accepts a real anchor that sits AFTER a script payload (no over-stripping)', () => {
    const html = `<script>window.__DATA__={"href":"${TARGET}"}</script><p>Read <a href="${TARGET}">the guide</a>.</p>`
    const proof = exactAnchorHrefMatch(html, TARGET)
    expect(proof.present).toBe(true)
    expect(proof.observedHref).toBe(TARGET)
    expect(proof.context).toContain('the guide')
  })
})

describe('B) same-site resolution of root-relative anchors', () => {
  it('resolves a real root-relative href against the verified source canonical', () => {
    const html = `<p>Read <a href="/us/student-permits/">permits</a> next.</p>`
    // Without the verified source canonical a relative href is not admissible…
    expect(exactAnchorHrefMatch(html, TARGET).present).toBe(false)
    // …with it, the same anchor is exact same-site proof.
    const proof = exactAnchorHrefMatch(html, TARGET, { sourceCanonicalUrl: SOURCE })
    expect(proof.present).toBe(true)
    expect(proof.observedHref).toBe('/us/student-permits/')
  })

  it('refuses a cross-host protocol-relative href', () => {
    const html = `<a href="//evil.example.com/us/student-permits/">off-site</a>`
    expect(exactAnchorHrefMatch(html, TARGET, { sourceCanonicalUrl: SOURCE }).present).toBe(false)
  })

  it('refuses to resolve when no verified source canonical is supplied (fail closed)', () => {
    expect(resolveSameSiteAnchorHref('/us/student-permits/', null)).toBeNull()
    expect(resolveSameSiteAnchorHref('us/student-permits/', 'not-a-url')).toBeNull()
  })

  it('never treats non-http schemes as proof', () => {
    expect(resolveSameSiteAnchorHref('javascript:alert(1)', SOURCE)).toBeNull()
    expect(resolveSameSiteAnchorHref('mailto:hi@example.com', SOURCE)).toBeNull()
  })

  it('keeps absolute cross-host targets valid (targets legitimately live elsewhere)', () => {
    const marketTarget = 'https://market.yousafeconsultancy.com/categories/study-permits'
    const html = `<a href="${marketTarget}">marketplace</a>`
    expect(exactAnchorHrefMatch(html, marketTarget, { sourceCanonicalUrl: SOURCE }).present).toBe(true)
  })
})

describe('C) fragment / query normalization stays strict', () => {
  it('ignores fragments on both sides in a real anchor', () => {
    const html = `<a href="${TARGET}#apply">permits</a>`
    expect(exactAnchorHrefMatch(html, `${TARGET}#top`).present).toBe(true)
    expect(normalizeInterlinkProofUrl(`${TARGET}#top`)).toBe(normalizeInterlinkProofUrl(TARGET))
  })

  it('keeps queries strict in a real anchor', () => {
    expect(exactAnchorHrefMatch(`<a href="${TARGET}?utm=1">x</a>`, TARGET).present).toBe(false)
    expect(exactAnchorHrefMatch(`<a href="${TARGET}?a=1">x</a>`, `${TARGET}?a=1`).present).toBe(true)
  })

  it('a root-relative fragment href only matches the source page itself', () => {
    expect(exactAnchorHrefMatch(`<a href="#apply">apply</a>`, SOURCE, { sourceCanonicalUrl: SOURCE }).present).toBe(
      true,
    )
    expect(exactAnchorHrefMatch(`<a href="#apply">apply</a>`, TARGET, { sourceCanonicalUrl: SOURCE }).present).toBe(
      false,
    )
  })
})

describe('D) staging locators use the same structural rules', () => {
  const CANONICAL = SOURCE
  const TARGET_ROW = 'https://legal.yousafeconsultancy.com/us/student-permits/'

  function row(overrides: Partial<P6FakeRow> = {}): P6FakeRow {
    return {
      id: 'row-1',
      source_slug: 'seo-us-schools-f1-checklist',
      target_url: TARGET_ROW,
      status: 'planned',
      applied_at: null,
      source_url: null,
      verification_state: null,
      verified_at: null,
      verification_evidence: null,
      ...overrides,
    }
  }

  it('stages a root-relative draft anchor resolved against the plan canonical', async () => {
    const db = createP6FakeDb([row()])
    createSupabaseAdminClientMock.mockReturnValue(db.client as never)

    const result = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      primaryKeyword: 'f1 checklist',
      body: `<p>Next: <a href="/us/student-permits/">student permits</a>.</p>`,
    })

    expect(result.staged).toBe(1)
    expect(db.rows[0].source_url).toBe(CANONICAL)
  })

  it('never stages a commented-out or scripted draft link', async () => {
    const db = createP6FakeDb([row()])
    createSupabaseAdminClientMock.mockReturnValue(db.client as never)

    const commented = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      primaryKeyword: 'f1 checklist',
      body: `<!-- [guide](${TARGET_ROW}) -->`,
    })
    const scripted = await stageEngineInterlinksForVerification({
      canonicalUrl: CANONICAL,
      primaryKeyword: 'f1 checklist',
      body: `<script>window.__NEXT={href:"${TARGET_ROW}"}</script>`,
    })

    expect(commented.staged).toBe(0)
    expect(scripted.staged).toBe(0)
    expect(db.updates).toHaveLength(0)
    expect(db.rows[0].source_url).toBeNull()
  })

  it('extractDraftAnchorHrefs still returns raw hrefs only (no bare URLs)', () => {
    expect(extractDraftAnchorHrefs(`[a](${TARGET_ROW}) and ${TARGET_ROW} and <!-- <a href="/x">y</a> -->`)).toEqual([
      TARGET_ROW,
    ])
  })
})

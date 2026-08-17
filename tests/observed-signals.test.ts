import {
  ctrCurveFit,
  dwellPogoProxy,
  labCoreWebVitals,
  lostQueryRate,
  newQueryVelocity,
  paaEligibility,
  rankVolatility,
  scoreHreflang,
  scoreLocalization,
  scoreSecurityHeaders,
  snippetEligibility,
} from '@/lib/seoFactory/observedSignals'
import { computeSignals, type MasterEngineInput } from '@/lib/seoFactory/masterEngine'

const DRAFT = `---
title: UK Graduate Visa Requirements 2026
description: Practical eligibility, documents, and steps with official sources.
author: Immigration Team
date: 2026-08-01
---
# UK Graduate Visa Requirements 2026

## In 60 seconds
The Graduate Route lets you stay two years after an eligible UK degree.

## Eligibility
You must finish an eligible course. See [GOV.UK](https://www.gov.uk/graduate-visa).

## Who can apply for the graduate route?
Eligible graduates with a valid student visa.

## FAQ
### Who can apply?
Eligible graduates with a valid student visa.
`

describe('observedSignals — dark-slot computers', () => {
  it('scores reciprocal hreflang, and 0 when live HTML has none', () => {
    const html = `
      <link rel="alternate" hreflang="en-us" href="https://legal.yousafeconsultancy.com/us/x/" />
      <link rel="alternate" hreflang="en-gb" href="https://legal.yousafeconsultancy.com/uk/x/" />
      <link rel="alternate" hreflang="x-default" href="https://legal.yousafeconsultancy.com/us/x/" />
    `
    expect(scoreHreflang(html)).toBe(1)
    expect(scoreHreflang('<html><body>no tags</body></html>')).toBe(0)
    expect(scoreHreflang(null)).toBeNull()
  })

  it('matches region path to localization', () => {
    expect(scoreLocalization('https://legal.yousafeconsultancy.com/uk/graduate-route/', 'UK')).toBe(1)
    expect(scoreLocalization('https://legal.yousafeconsultancy.com/us/opt/', 'UK')).toBe(0.25)
    expect(scoreLocalization(null, 'UK')).toBeNull()
  })

  it('treats stable rank history as high and a swing as low', () => {
    expect(rankVolatility([{ position: 8 }, { position: 8 }, { position: 9 }, { position: 8 }])).toBeGreaterThan(0.8)
    expect(rankVolatility([{ position: 3 }, { position: 40 }, { position: 5 }, { position: 35 }])).toBeLessThan(0.4)
    expect(rankVolatility([{ position: 8 }])).toBeNull()
  })

  it('maps lost/new query rates honestly', () => {
    expect(lostQueryRate(100, 0)).toBe(1)
    expect(lostQueryRate(80, 20)).toBeCloseTo(0.8, 5)
    expect(newQueryVelocity(100, 40)).toBe(1)
    expect(lostQueryRate(10, null)).toBeNull()
  })

  it('fits CTR to the SERP curve and derives dwell/pogo', () => {
    expect(ctrCurveFit(0.12, 2)).toBeGreaterThan(0.8)
    expect(ctrCurveFit(0.01, 2)).toBeLessThan(0.4)
    const good = dwellPogoProxy(0.12, 2)
    expect(good.dwell).toBeGreaterThan(0.8)
    expect(good.pogo).toBeLessThan(0.2)
  })

  it('scores snippet/PAA eligibility from structure, not guesses', () => {
    expect(snippetEligibility({ faq: true, firstParaAnswer: true, hasList: true, hasTable: false, tldr: true })).toBeGreaterThan(0.8)
    expect(snippetEligibility({ faq: false, firstParaAnswer: false, hasList: false, hasTable: false })).toBe(0)
    expect(paaEligibility(4, true)).toBeGreaterThan(0.8)
  })

  it('builds a lab CWV proxy only from observed live parts', () => {
    expect(labCoreWebVitals({ pageWeight: null, imageDimRatio: null, scriptCount: null, viewport: null })).toBeNull()
    expect(labCoreWebVitals({ pageWeight: 0.9, imageDimRatio: 1, scriptCount: 4, viewport: 1 })).toBeGreaterThan(0.7)
  })

  it('counts security headers when the verify fetch supplied them', () => {
    expect(scoreSecurityHeaders(null)).toBeNull()
    expect(scoreSecurityHeaders({
      'content-security-policy': "default-src 'self'",
      'strict-transport-security': 'max-age=63072000',
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
    })).toBe(1)
  })
})

describe('computeSignals — newly lit slots stay null without evidence', () => {
  const base: MasterEngineInput = {
    topic: 'uk graduate visa',
    primaryKeyword: 'uk graduate visa',
    contentType: 'article',
    region: 'UK',
    title: 'UK Graduate Visa Requirements 2026',
    content: DRAFT,
    canonicalUrl: 'https://legal.yousafeconsultancy.com/uk/graduate-route/',
  }

  it('lights hreflang/localization/snippet from live HTML + draft', () => {
    const html = `<html><head>
      <link rel="alternate" hreflang="en-gb" href="https://legal.yousafeconsultancy.com/uk/graduate-route/" />
      <link rel="alternate" hreflang="en-us" href="https://legal.yousafeconsultancy.com/us/graduate-route/" />
      <link rel="alternate" hreflang="x-default" href="https://legal.yousafeconsultancy.com/uk/graduate-route/" />
      <meta name="viewport" content="width=device-width">
    </head><body><h1>UK Graduate Visa</h1><img src="/a.webp" width="400" height="200" alt="x"></body></html>`
    const v = computeSignals({ ...base, liveHtml: html, liveUrl: base.canonicalUrl })
    expect(v.t_hreflang).toBe(1)
    expect(v.t_localization).toBe(1)
    expect(v.g_featured_snippet).toBeGreaterThan(0.4)
    expect(v.g_paa).toBeGreaterThan(0.2)
    expect(v.x_core_vitals).not.toBeNull()
    expect(v.sc_howto).toBe(0)
    expect(v.t_security_headers).toBeNull()
  })

  it('uses GSC history for volatility and lost-query rate, else null', () => {
    const empty = computeSignals(base)
    expect(empty.g_rank_volatility).toBeNull()
    expect(empty.g_lost_query_rate).toBeNull()
    const v = computeSignals({
      ...base,
      gsc: {
        impressions: 1200,
        clicks: 80,
        ctr: 0.066,
        position: 8,
        queries: 40,
        lostQueries: 5,
        newQueries: 8,
        history: [{ position: 9 }, { position: 8 }, { position: 8 }, { position: 7 }],
      },
    })
    expect(v.g_rank_volatility).toBeGreaterThan(0.7)
    expect(v.g_lost_query_rate).toBeGreaterThan(0.8)
    expect(v.g_new_query_velocity).not.toBeNull()
    expect(v.g_ctr_curve).not.toBeNull()
    expect(v.g_dwell_time).not.toBeNull()
  })
})

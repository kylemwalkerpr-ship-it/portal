/**
 * Marketplace copy-guard regressions (2026-09-08 profile plan):
 *  1. Templated About-block detection MUST catch the "Mapped marketplace
 *     strengths include:" skeleton (Morganne Foley / R. Reis Pagtakhan Jr. /
 *     Nana Hong) as well as the roster/market-research templates — no
 *     regex-negative "already individual" relabelling.
 *  2. Licensing-region validation MUST require the evidence field
 *     (attorneys.bar_state) and reject a claimed licensing region that does
 *     not equal the recorded bar_state, or is cited with no bar_state — all
 *     while ignoring region words inside education text (university names).
 *
 * The regex/constant below mirror scripts/marketplace-clean-templated-bios.mjs
 * (keep in sync).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, Fragment } from 'react'
import { renderBioMarkdown } from '@/lib/bioMarkdown'

const TEMPLATE_RE = /roster|Practice setting \(public\)|confirmed in public sources|Mapped marketplace strengths include|^\s*I am [^,]+, a (Canadian immigration lawyer|licensed U\.S\. immigration attorney|CICC-regulated RCIC)/im
const BAR_STATE_REGION = { FL: 'Florida', NY: 'New York', VA: 'Virginia', CA: 'California', MB: 'Manitoba', NB: 'New Brunswick', NS: 'Nova Scotia', PE: 'Prince Edward Island', NT: 'Northwest Territories', QC: 'Quebec', NL: 'Newfoundland and Labrador', YT: 'Yukon', 'E&W': 'England & Wales', Scotland: 'Scotland', NI: 'Northern Ireland' }

function licensingErrors(
  narrativesByProvider: Record<string, { narrative: string }>,
  rowsByProvider: Record<string, { bar_state: string | null }>,
): string[] {
  const errs: string[] = []
  const canon = (t: string): string | undefined => Object.entries(BAR_STATE_REGION).find(([, r]) => r.toLowerCase() === t.toLowerCase())?.[1]
  for (const [pid, nv] of Object.entries(narrativesByProvider)) {
    const row = rowsByProvider[pid]
    if (!row) continue // consultants have no bar_state
    const expected = row.bar_state ? BAR_STATE_REGION[row.bar_state as keyof typeof BAR_STATE_REGION] : null
    const cited: string[] = []
    for (const m of nv.narrative.matchAll(/\blicensed in ([A-Za-z& ]+?)(?=[,.;]|$)/g)) {
      const t = (m[1] as string).trim()
      if (t) cited.push(t)
    }
    for (const m of nv.narrative.matchAll(/([A-Za-z& ]+?)\s+licensing record/g)) {
      const t = (m[1] as string).trim()
      if (t) cited.push(t)
    }
    for (const c of new Set(cited.map(canon).filter(Boolean))) {
      if (!expected || c !== expected) errs.push(`${pid}: cites licensing "${c}" but bar_state=${row.bar_state || '(none)'}`)
    }
  }
  return errs
}

describe('templated About-block detection — Mapped marketplace strengths skeleton', () => {
  it('flags the exact Morganne Foley / R. Reis Pagtakhan Jr. / Nana Hong skeleton', () => {
    for (const block of [
      'I am Morganne A. Foley, a Canadian immigration lawyer. | Mapped marketplace strengths include: work permits, study permits, pr immigration, attorney review.',
      'I am R. Reis Pagtakhan Jr., a Canadian immigration lawyer. | Mapped marketplace strengths include: work permits, pr immigration, business formation, attorney review.',
      'I am Nana Hong, a CICC-regulated RCIC (R531895). | Mapped marketplace strengths include: pr immigration, work permits, document prep.',
    ]) {
      expect(TEMPLATE_RE.test(block)).toBe(true)
      // And as rendered, the comment/roster text must never leak.
      expect(renderToStaticMarkup(createElement(Fragment, null, renderBioMarkdown(block.replace('|', '\n'))))).toContain('Mapped marketplace strengths include')
    }
  })

  it('flags roster / market-research templates and keeps genuine prose', () => {
    expect(TEMPLATE_RE.test('I am X.\nPublic roster research indicates roughly 5 years.')).toBe(true)
    expect(TEMPLATE_RE.test('## About me\nPractice setting (public): Small firm.' )).toBe(true)
    expect(TEMPLATE_RE.test('I help clients who already drafted a packet and want a regulated second look.')).toBe(false)
  })
})

describe('licensing evidence-field availability', () => {
  it('accepts a licensing claim that equals the recorded bar_state', () => {
    const errs = licensingErrors(
      { a: { narrative: 'Carmen R. Arce is a U.S. immigration attorney licensed in Florida.' } },
      { a: { bar_state: 'FL' } },
    )
    expect(errs).toEqual([])
  })

  it('rejects a licensing claim that contradicts the recorded bar_state (no inference)', () => {
    const errs = licensingErrors(
      { a: { narrative: 'David G. Katona is licensed in California.' } },
      { a: { bar_state: 'NY' } },
    )
    expect(errs).toHaveLength(1)
  })

  it('rejects a licensing claim when bar_state is absent (missing evidence → omit)', () => {
    const errs = licensingErrors(
      { a: { narrative: 'Sai P. Ravikumar is licensed in Manitoba.' } },
      { a: { bar_state: null } },
    )
    expect(errs).toHaveLength(1)
  })

  it('ignores region words that appear only in education text (university names)', () => {
    const errs = licensingErrors(
      { a: { narrative: 'Meghan Felt holds a New Brunswick law degree (LL.B., 2010).' } },
      { a: { bar_state: 'NL' } },
    )
    expect(errs).toEqual([])
  })
})
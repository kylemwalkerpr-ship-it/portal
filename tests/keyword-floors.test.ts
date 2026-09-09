import { ensureKeywordFloors } from '../lib/seoEngine/keywordFloors'

describe('ensureKeywordFloors — UI keyword field never opens below the contract floors', () => {
  it('fills a 3-short seed up to ≥5 shorts using the primary\'s own words', () => {
    const seeded = ['spousal sponsorship', 'family class', 'permanent residency']
    const out = ensureKeywordFloors(seeded, 'canada spouse visa')
    const shorts = out.filter((k) => k.split(/\s+/).length <= 3)
    const longs = out.filter((k) => k.split(/\s+/).length >= 4)
    expect(shorts.length).toBeGreaterThanOrEqual(5)
    for (const s of shorts.slice(0, 3)) expect(seeded).toContain(s) // original terms preserved
    expect(out.some((k) => k === 'canada spouse visa')).toBe(false) // primary never duplicated
    expect(new Set(out).size).toBe(out.length) // deduped
  })

  it('fills long-tails to ≥4 with grammatical phrases', () => {
    const out = ensureKeywordFloors(['spousal sponsorship', 'family class'], 'uk spouse visa')
    const longs = out.filter((k) => k.split(/\s+/).length >= 4)
    expect(longs.length).toBeGreaterThanOrEqual(4)
    for (const l of longs) {
      expect(l).toMatch(/^(how to |how long |documents required |can i |difference between )/)
    }
  })

  it('is idempotent — already-complete lists pass through unchanged', () => {
    const complete = ['a b c d e f g h', 'x y z q p', 'one two three', 'k l m n o p q r', 's t u v', 'w x y z', 'm n o p q', 'r s t u']
    const out = ensureKeywordFloors(complete, 'primary keyword phrase')
    for (const k of complete) expect(out).toContain(k)
  })

  it('does not mill apply-for long-tails onto a calculator or processing-time primary', () => {
    const crs = ensureKeywordFloors(['express entry', 'crs calculator'], 'express entry canada crs calculator')
    const au = ensureKeywordFloors(['student visa', 'visa processing time'], 'australia student visa processing time')
    for (const list of [crs, au]) {
      const longs = list.filter((k) => k.split(/\s+/).length >= 4)
      expect(longs.length).toBeGreaterThanOrEqual(4)
      expect(longs.some((k) => /^how to apply for /.test(k))).toBe(false)
      expect(longs.some((k) => /^is it possible to /.test(k))).toBe(false)
      expect(longs.some((k) => /^can i work while waiting for /.test(k))).toBe(false)
    }
    expect(crs).not.toContain('express')
    expect(crs).not.toContain('express requirements')
    expect(au).not.toContain('australia student')
    expect(au).not.toContain('processing time')
  })
})
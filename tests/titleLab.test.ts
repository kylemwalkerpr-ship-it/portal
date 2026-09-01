import {
  generateTitleCandidates,
  isFillerTitle,
  pickBestTitle,
  rejectFillerTitle,
  scoreTitle,
} from '@/lib/seoEngine/titleLab'

describe('isFillerTitle — catches exactly the template junk', () => {
  it('flags the two user-observed template-filler titles', () => {
    expect(isFillerTitle('Updated Requirements and Guidance for 2026')).toBe(true)
    expect(isFillerTitle('Options, Costs and Trade-Offs in 2026')).toBe(true)
  })

  it('flags other junk: everything/ultimate/bare-in-year, empty, keyword-only', () => {
    expect(isFillerTitle('Everything You Need to Know About UK Visas')).toBe(true)
    expect(isFillerTitle('The Ultimate Guide to US Immigration')).toBe(true)
    expect(isFillerTitle('UK Visa Guide in 2026')).toBe(true)
    expect(isFillerTitle('US Visa Processing Times for 2026')).toBe(true)
    expect(isFillerTitle('')).toBe(true)
    expect(isFillerTitle('visa')).toBe(true)
    expect(isFillerTitle('uk visa')).toBe(true)
  })

  it('leaves real CTR titles alone', () => {
    expect(isFillerTitle('UK Spouse Visa: Application Checklist for Families')).toBe(false)
    expect(isFillerTitle('485 visa english requirements')).toBe(false)
    expect(isFillerTitle('US Visa Fees in 2026: Costs Explained')).toBe(false)
    expect(isFillerTitle('Australia Student Visa Restrictions: 2026 Guide')).toBe(false)
    expect(isFillerTitle('Admissions Consultant Credentials: 2026 Checklist')).toBe(false)
  })
})

describe('generateTitleCandidates', () => {
  it('builds 3-5 candidates, every one containing the primary keyword', () => {
    const candidates = generateTitleCandidates({
      primaryKeyword: 'uk spouse visa application',
      audienceNoun: 'Families',
      year: 2026,
    })
    expect(candidates.length).toBeGreaterThanOrEqual(3)
    expect(candidates.length).toBeLessThanOrEqual(5)
    for (const c of candidates) {
      expect(c.title.toLowerCase()).toContain('uk spouse visa application')
      expect(c.score).toBeGreaterThan(0)
      expect(isFillerTitle(c.title)).toBe(false)
    }
  })

  it('returns [] for an unusable keyword', () => {
    expect(generateTitleCandidates({ primaryKeyword: '' })).toEqual([])
    expect(generateTitleCandidates({ primaryKeyword: '   ' })).toEqual([])
  })

  it('only bills the year when a cost/deadline change justifies it (or is passed)', () => {
    const costly = generateTitleCandidates({ primaryKeyword: 'us visa fees' })
    expect(costly.some((c) => /2026/.test(c.title))).toBe(true)
    const generic = generateTitleCandidates({ primaryKeyword: 'uk partner visa' })
    expect(generic.some((c) => /2026/.test(c.title))).toBe(false)
    const explicit = generateTitleCandidates({ primaryKeyword: 'uk partner visa', year: 2026 })
    expect(explicit.some((c) => /2026/.test(c.title))).toBe(true)
  })
})

describe('scoreTitle', () => {
  const ctx = { primaryKeyword: 'uk spouse visa', audienceNoun: 'Families' }

  it('scores 0 when the primary keyword is missing', () => {
    const result = scoreTitle('Something Completely Different', { primaryKeyword: 'uk spouse visa' })
    expect(result.score).toBe(0)
    expect(result.breakdown.keyword_presence).toBe(0)
  })

  it('penalizes filler in human_style and total', () => {
    const filler = scoreTitle('UK Spouse Visa Guide 2026', ctx)
    const good = scoreTitle('UK Spouse Visa: Application Checklist for Families', ctx)
    expect(filler.breakdown.human_style).toBeLessThan(good.breakdown.human_style)
    expect(filler.score).toBeLessThan(good.score)
  })

  it('zeroes differentiation on an exact duplicate sibling, penalizing total', () => {
    const title = 'UK Spouse Visa: Application Checklist for Families'
    const base = scoreTitle(title, ctx)
    const dup = scoreTitle(title, { ...ctx, siblingTitles: [title] })
    expect(dup.breakdown.differentiation).toBe(0)
    expect(base.breakdown.differentiation).toBe(20)
    expect(dup.score).toBeLessThan(base.score)
  })

  it('awards the full length bucket inside 55-65 chars and decays outside 45-75', () => {
    const ideal = scoreTitle(`uk spouse visa ${'x'.repeat(40)}`, ctx) // 55 chars
    expect(ideal.breakdown.length).toBe(15)
    const tooLong = scoreTitle(`uk spouse visa ${'y'.repeat(95)}`, ctx) // 110 chars
    expect(tooLong.breakdown.length).toBe(0)
    const tooShort = scoreTitle('uk spouse visa x', ctx) // 16 chars
    expect(tooShort.breakdown.length).toBe(0)
  })
})

describe('pickBestTitle', () => {
  const input = {
    primaryKeyword: 'uk spouse visa',
    audienceNoun: 'Families',
    year: 2026,
  }

  it('is deterministic — same input yields the same pick twice', () => {
    const a = pickBestTitle(input)
    const b = pickBestTitle(input)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a).not.toBeNull()
    expect(isFillerTitle(a!.title)).toBe(false)
  })

  it('sibling differentiation: same primary, different sibling sets can diverge', () => {
    const plain = pickBestTitle(input)!
    const penalized = pickBestTitle({ ...input, siblingTitles: [plain.title] })!
    expect(penalized.title).not.toBe(plain.title)
    const otherSibling = generateTitleCandidates(input)
      .map((c) => c.title)
      .find((t) => t !== plain.title)!
    const diverge = pickBestTitle({ ...input, siblingTitles: [otherSibling] })!
    expect(diverge.title).not.toBe(penalized.title)
  })

  it('returns null for an unusable keyword', () => {
    expect(pickBestTitle({ primaryKeyword: '' })).toBeNull()
  })
})

describe('rejectFillerTitle', () => {
  it('passes through a real title untouched', () => {
    const res = rejectFillerTitle('UK Spouse Visa: Application Checklist for Families', {
      primaryKeyword: 'uk spouse visa',
    })
    expect(res.ok).toBe(true)
  })

  it('replaces a filler title with a keyword-bearing non-filler', () => {
    const res = rejectFillerTitle('Options, Costs and Trade-Offs in 2026', {
      primaryKeyword: 'us visa fees',
      requiredLongTailKeywords: ['us visa fees 2026'],
    })
    expect(res.ok).toBe(false)
    if (res.ok === false) {
      expect(res.reason).toContain('filler title rejected')
      expect(isFillerTitle(res.replacement)).toBe(false)
      expect(res.replacement.toLowerCase()).toContain('us visa fees')
      expect(res.replacement).not.toBe('Options, Costs and Trade-Offs in 2026')
    }
  })
})
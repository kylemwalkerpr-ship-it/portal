/**
 * Master Engine — 2026-09 dark-slot wave.
 *
 * Locks the 11 formerly-dark registry slots to their deterministic heuristics.
 * All inputs are existing studio data (draft markdown, competing URLs/snippets,
 * GSC mix, knowledge intel, site-health facts, live HTML) — no paid APIs, no
 * vector DB, no invented embeddings.
 *
 * Slots: s_entity_kg_link · s_embedding_similarity · s_passage_relevance ·
 * t_robots_txt · l_competitor_link_gap · e_brand_reputation ·
 * f_seasonal_alignment · f_trending_velocity · f_news_proximity ·
 * f_competitor_freshness · x_mobile_parity
 */
import {
  SIGNAL_REGISTRY,
  computeSignals,
  scoreMaster,
  type MasterEngineInput,
} from '@/lib/seoFactory/masterEngine'

const DARK_IDS = [
  's_entity_kg_link',
  's_embedding_similarity',
  's_passage_relevance',
  't_robots_txt',
  'l_competitor_link_gap',
  'e_brand_reputation',
  'f_seasonal_alignment',
  'f_trending_velocity',
  'f_news_proximity',
  'f_competitor_freshness',
  'x_mobile_parity',
]

function baseInput(overrides: Partial<MasterEngineInput> = {}): MasterEngineInput {
  return {
    topic: 'uk graduate visa requirements',
    primaryKeyword: 'uk graduate visa',
    contentType: 'legal_guide',
    region: 'UK',
    title: 'Graduate visa requirements',
    indexable: true,
    ...overrides,
  }
}

const LIT_CONTENT = `---
title: "Graduate visa requirements"
author: "Immigration Team"
credentials: "Regulated immigration adviser"
date: "2026-09-01"
---
# uk graduate visa

## Graduate visa eligibility

You must hold a valid student visa when you apply for the graduate visa. See the official guidance at [GOV.UK](https://www.gov.uk/graduate-visa) and the [USCIS](https://www.uscis.gov/) equivalent for comparison.

## How to apply

Follow these steps to apply. See [related guide](/uk/graduate-visa/apply/) and [hub](/uk/).

## Costs and fees

The graduate visa costs GBP 822. The immigration health surcharge also applies.

## FAQ

- Can I work on the Graduate Route?
- What is the processing timeline?

This guide is educational and does not constitute legal advice. Always consult a regulated immigration adviser.
`

describe('Master Engine — dark-slot wave (registry)', () => {
  it('flags all 11 wave slots as computed', () => {
    for (const id of DARK_IDS) {
      const sig = SIGNAL_REGISTRY.find((s) => s.id === id)
      expect(sig).toBeDefined()
      expect(sig!.computed).toBe(true)
    }
  })
})

describe('Master Engine — semantic dark slots', () => {
  it('s_entity_kg_link = fraction of statutory/official hosts linked', () => {
    const v = computeSignals(baseInput({ content: LIT_CONTENT }))
    // gov.uk + uscis out of the 6 known statutory host fragments.
    expect(v.s_entity_kg_link!).toBeCloseTo(2 / 6, 5)
  })

  it('s_entity_kg_link = 0 when the draft links nothing official (but has words)', () => {
    const v = computeSignals(baseInput({ content: '# title\n\nJust prose about the graduate route, no official links.' }))
    expect(v.s_entity_kg_link).toBe(0)
  })

  it('s_entity_kg_link = null at plan time (no draft)', () => {
    const v = computeSignals(baseInput({ content: undefined }))
    expect(v.s_entity_kg_link).toBeNull()
  })

  it('s_embedding_similarity = 0.5 deterministic floor with no competitors', () => {
    expect(computeSignals(baseInput({ content: LIT_CONTENT })).s_embedding_similarity).toBe(0.5)
  })

  it('s_embedding_similarity rises with lexical overlap on competing URLs', () => {
    const v = computeSignals(baseInput({
      content: LIT_CONTENT,
      competingUrls: ['https://other.com/uk/graduate/visa/', 'https://other2.com/uk/graduate-visa-path'],
    }))
    expect(v.s_embedding_similarity!).toBeGreaterThan(0)
    expect(v.s_embedding_similarity!).toBeLessThanOrEqual(1)
  })

  it('s_embedding_similarity = null at plan time when nothing competes and nothing is written', () => {
    const v = computeSignals(baseInput({ content: undefined }))
    expect(v.s_embedding_similarity).toBeNull()
  })

  it('s_passage_relevance = fraction of H2s naming a primary-keyword token', () => {
    const v = computeSignals(baseInput({ content: LIT_CONTENT, primaryKeyword: 'uk graduate visa' }))
    // H2s: "Graduate visa eligibility" (hits graduate/visa) · "How to apply" ·
    // "Costs and fees" · "FAQ" → 1 of 4.
    expect(v.s_passage_relevance!).toBeCloseTo(1 / 4, 5)
  })

  it('s_passage_relevance = null at plan time (no draft)', () => {
    const v = computeSignals(baseInput({ content: undefined, primaryKeyword: 'uk graduate visa' }))
    expect(v.s_passage_relevance).toBeNull()
  })
})

describe('Master Engine — technical / links / eeat dark slots', () => {
  it('t_robots_txt honors live/site-health indexability facts', () => {
    expect(computeSignals(baseInput({ content: LIT_CONTENT, indexable: true })).t_robots_txt).toBe(1)
    expect(computeSignals(baseInput({ content: LIT_CONTENT, siteHealth: { noindex: true } })).t_robots_txt).toBe(0)
    expect(computeSignals(baseInput({ content: LIT_CONTENT, siteHealth: { indexable: false } })).t_robots_txt).toBe(0)
  })

  it('t_robots_txt falls back to 0.3 on a non-indexable plan, 1 otherwise', () => {
    expect(computeSignals(baseInput({ content: LIT_CONTENT, indexable: false })).t_robots_txt).toBe(0.3)
  })

  it('l_competitor_link_gap = internal links vs competing-URL count', () => {
    const twoInternalLinks = '# uk graduate visa\n\n[apply](/uk/graduate-visa/apply/)\n[docs](/uk/graduate-visa/docs/)\n'
    const v = computeSignals(baseInput({
      content: twoInternalLinks,
      competingUrls: ['https://a.com/1', 'https://b.com/2', 'https://c.com/3', 'https://d.com/4'],
    }))
    expect(v.l_competitor_link_gap!).toBeCloseTo(2 / 4, 5)
  })

  it('l_competitor_link_gap caps at 1 and never exceeds the denominator floor', () => {
    const threeLinks = '# uk graduate visa\n\n[x](/uk/1/)\n[y](/uk/2/)\n[z](/uk/3/)\n'
    const v = computeSignals(baseInput({ content: threeLinks }))
    expect(v.l_competitor_link_gap).toBe(1)
  })

  it('e_brand_reputation ladders up with official citations + author + disclaimer', () => {
    // Full stack: gov citation + named author + disclaimer → 0.9
    expect(computeSignals(baseInput({ content: LIT_CONTENT })).e_brand_reputation).toBe(0.9)
    // Official citations but no disclaimer/author → 0.6
    const citeOnly = 'Read the [GOV.UK guidance](https://www.gov.uk/graduate-visa) on the graduate route.'
    expect(computeSignals(baseInput({ content: citeOnly })).e_brand_reputation).toBe(0.6)
    // No citations, no author, no disclaimer → 0.3
    expect(computeSignals(baseInput({ content: 'Plain prose about visas.' })).e_brand_reputation).toBe(0.3)
  })
})

describe('Master Engine — freshness dark slots', () => {
  it('f_seasonal_alignment = 1 for rolling work visas at any month', () => {
    expect(computeSignals(baseInput({ content: LIT_CONTENT, primaryKeyword: 'skilled worker visa', topic: 'work permit' })).f_seasonal_alignment).toBe(1)
  })

  it('f_seasonal_alignment traces the Jan/Sep student-intake window', () => {
    const month = new Date().getMonth()
    const janPeak = month === 11 || month === 0 || month === 1
    const sepPeak = month === 7 || month === 8 || month === 9
    const expected = janPeak || sepPeak ? 1 : 0.4
    const v = computeSignals(baseInput({ content: LIT_CONTENT, primaryKeyword: 'uk student visa january intake', region: 'UK' }))
    expect(v.f_seasonal_alignment).toBe(expected)
  })

  it('f_seasonal_alignment = 0.5 for non-student non-work topics', () => {
    expect(computeSignals(baseInput({ content: LIT_CONTENT, primaryKeyword: 'immigration statistics' })).f_seasonal_alignment).toBe(0.5)
  })

  it('f_trending_velocity = 0.5 when no GSC data exists', () => {
    const v = computeSignals(baseInput({ content: LIT_CONTENT }))
    expect(v.f_trending_velocity).toBe(0.5)
  })

  it('f_trending_velocity uses the new-query emergence rate from GSC', () => {
    const v = computeSignals(baseInput({
      content: LIT_CONTENT,
      gsc: { impressions: 1000, queries: 10, newQueries: 5 },
    }))
    // 0.5 + 0.5 × clamp01(5/10) = 0.75
    expect(v.f_trending_velocity!).toBeCloseTo(0.75, 5)
  })

  it('f_trending_velocity follows the GSC history slope', () => {
    const rising = computeSignals(baseInput({
      content: LIT_CONTENT,
      gsc: { impressions: 1000, history: [{ impressions: 100 }, { impressions: 900 }] },
    }))
    const falling = computeSignals(baseInput({
      content: LIT_CONTENT,
      gsc: { impressions: 1000, history: [{ impressions: 900 }, { impressions: 100 }] },
    }))
    expect(rising.f_trending_velocity!).toBeGreaterThan(0.5)
    expect(falling.f_trending_velocity!).toBeLessThan(0.5)
  })

  it('f_news_proximity = 0.4 floor with no knowledge intel', () => {
    expect(computeSignals(baseInput({ content: LIT_CONTENT })).f_news_proximity).toBe(0.4)
    expect(computeSignals(baseInput({ content: LIT_CONTENT, knowledge: ['just a string item'] })).f_news_proximity).toBe(0.4)
  })

  it('f_news_proximity rises with recent timestamped knowledge items', () => {
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString()
    const noneRecent = new Date(Date.now() - 200 * 86_400_000).toISOString()
    // 1 of 3 items recent → 0.4 + 0.6 × 1/3 = 0.6
    const partial = computeSignals(baseInput({
      content: LIT_CONTENT,
      knowledge: [
        { title: 'breaking change', publishedAt: recent },
        { title: 'old policy', publishedAt: noneRecent },
        { title: 'older note', publishedAt: noneRecent },
      ],
    }))
    expect(partial.f_news_proximity!).toBeCloseTo(0.6, 5)
    // All recent → 1
    const full = computeSignals(baseInput({
      content: LIT_CONTENT,
      knowledge: [
        { title: 'a', publishedAt: recent },
        { title: 'b', publishedAt: recent },
        { title: 'c', publishedAt: recent },
      ],
    }))
    expect(full.f_news_proximity).toBe(1)
  })

  it('f_competitor_freshness stays on the deterministic 0.5 floor (no lastmod feed)', () => {
    const bare = computeSignals(baseInput({ content: LIT_CONTENT }))
    const withCompetitors = computeSignals(baseInput({ content: LIT_CONTENT, competingUrls: ['https://a.com/1', 'https://b.com/2'] }))
    expect(bare.f_competitor_freshness).toBe(0.5)
    expect(withCompetitors.f_competitor_freshness).toBe(0.5)
  })
})

describe('Master Engine — experience dark slot', () => {
  it('x_mobile_parity = 1 for a narrow-table draft with no fixed-width layout', () => {
    const content = '# uk graduate visa\n\n| fee | amount |\n|-----|--------|\n| IHS | 1035 |\n'
    expect(computeSignals(baseInput({ content })).x_mobile_parity).toBe(1)
  })

  it('x_mobile_parity = 0.8 for a single wide table', () => {
    const content = '# uk graduate visa\n\n| a | b | c | d | e |\n\nSome matching prose follows.\n'
    expect(computeSignals(baseInput({ content })).x_mobile_parity).toBe(0.8)
  })

  it('x_mobile_parity = 0.6 for many wide tables', () => {
    const wide = '| a | b | c | d | e |\n|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 |\n'
    const content = `# uk graduate visa\n\n${wide}\n\n## again\n\n${wide}\n`
    expect(computeSignals(baseInput({ content })).x_mobile_parity).toBe(0.6)
  })

  it('x_mobile_parity = 0.6 when a fixed-width px layout appears', () => {
    const content = '# uk graduate visa\n\n<div style="width: 900px">fixed board</div>\n'
    expect(computeSignals(baseInput({ content })).x_mobile_parity).toBe(0.6)
  })
})

describe('Master Engine — scoreMaster coverage', () => {
  it('publishes all 11 wave signals as computed and non-null when inputs are lit', () => {
    const report = scoreMaster({ ...baseInput({ content: LIT_CONTENT, indexable: true }) })
    for (const id of DARK_IDS) {
      const sig = report.computedSignals.find((s) => s.id === id)
      expect(sig).toBeDefined()
      expect(sig!.computed).toBe(true)
      expect(sig!.value).not.toBeNull()
      expect(sig!.value!).toBeGreaterThanOrEqual(0)
      expect(sig!.value!).toBeLessThanOrEqual(1)
    }
  })
})
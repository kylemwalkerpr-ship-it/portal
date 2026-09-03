import {
  appendQueueLineageEvent,
  buildPredictiveSignal,
  confidenceFromEvidence,
  filterRegenerationCandidates,
  freshnessScore,
  type EvidenceLineage,
  type QueueLineageEvent,
  type RegenerationFilters,
} from '@/lib/seoEngine/intelligence'
import { assembleLineageTimeline, type TimelineNode } from '@/lib/seoEngine/rankingModel'
import { auditContent, meetsShipQuality } from '@/lib/seoFactory/audit'
import { validateShipPlan } from '@/lib/seoFactory/shipGate'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'

describe('SEO intelligence model', () => {
  const now = Date.parse('2026-08-09T00:00:00.000Z')
  const evidence: EvidenceLineage[] = [
    {
      kind: 'gsc',
      source: 'Google Search Console',
      observedAt: '2026-08-08T00:00:00.000Z',
      authority: 0.9,
    },
    {
      kind: 'knowledge',
      source: 'USCIS',
      url: 'https://www.uscis.gov/news',
      observedAt: '2026-08-07T00:00:00.000Z',
      authority: 0.98,
    },
  ]

  it('decays stale evidence predictably', () => {
    expect(freshnessScore('2026-08-09T00:00:00.000Z', now)).toBeCloseTo(1)
    expect(freshnessScore('2026-06-25T00:00:00.000Z', now, 45)).toBeCloseTo(0.5, 1)
    expect(freshnessScore('not-a-date', now)).toBe(0)
  })

  it('increases confidence with fresh, authoritative, independent evidence', () => {
    const fresh = confidenceFromEvidence(evidence, now)
    const stale = confidenceFromEvidence(
      evidence.map((item) => ({ ...item, observedAt: '2025-01-01T00:00:00.000Z' })),
      now,
    )
    expect(fresh).toBeGreaterThan(stale)
    expect(fresh).toBeLessThanOrEqual(1)
  })

  it('builds an explainable predictive signal and blocks cannibalized siblings', () => {
    const signal = buildPredictiveSignal(
      {
        topic: 'F-1 visa documents',
        play: 'cannibalization',
        opportunityScore: 82,
        difficultyScore: 44,
        signals: ['Two existing pages target this query'],
        sourcePage: '/us/f1-visa/',
      },
      evidence,
      now,
    )
    expect(signal.modelVersion).toBe('seo-intelligence-v1')
    expect(signal.evidence).toHaveLength(2)
    expect(signal.regenerationEligible).toBe(false)
    expect(signal.reasons.join(' ')).toMatch(/consolidate|canonical/i)
  })
})

describe('regeneration filters', () => {
  const items = [
    { topic: 'Study permit checklist', play: 'content_gap' as const, opportunityScore: 80, difficultyScore: 40, intent: 'informational', region: 'CA' },
    { topic: 'F-1 visa documents', play: 'cannibalization' as const, opportunityScore: 95, difficultyScore: 20, intent: 'informational', region: 'US' },
    { topic: 'Skilled worker requirements', play: 'refresh' as const, opportunityScore: 65, difficultyScore: 55, intent: 'procedural', region: 'UK' },
  ]

  it('never falls back to excluded or cannibalized items', () => {
    const result = filterRegenerationCandidates(items, {
      plays: ['content_gap'],
      minOpportunityScore: 70,
      excludeTopics: ['study permit checklist'],
    })
    expect(result).toEqual([])
  })

  it('supports score, difficulty, intent, and region constraints', () => {
    const result = filterRegenerationCandidates(items, {
      plays: ['refresh'],
      minOpportunityScore: 60,
      maxDifficultyScore: 60,
      intents: ['procedural'],
      region: 'UK',
    })
    expect(result.map((item) => item.topic)).toEqual(['Skilled worker requirements'])
  })

  it('enforces ranking-model floors strictly (no fallback to low-ranked items)', () => {
    const ranked = [
      { topic: 'Express Entry checklist', play: 'content_gap' as const, opportunityScore: 70, rankingScore: 88, confidence: 0.8, aeoGeoScore: 75, observedAt: '2026-08-08T00:00:00.000Z' },
      { topic: 'Generic visa essay', play: 'content_gap' as const, opportunityScore: 60, rankingScore: 42, confidence: 0.3, aeoGeoScore: 30, observedAt: '2026-08-08T00:00:00.000Z' },
    ]
    const result = filterRegenerationCandidates(ranked, {
      minRankingScore: 70,
      minConfidence: 0.6,
      minAeoGeo: 60,
    })
    expect(result.map((item) => item.topic)).toEqual(['Express Entry checklist'])
  })

  it('filters by freshness window using the 45-day half-life', () => {
    const now = Date.parse('2026-08-09T00:00:00.000Z')
    const fresh = { topic: 'Fresh policy change', play: 'content_gap' as const, opportunityScore: 75, observedAt: '2026-08-07T00:00:00.000Z' }
    const stale = { topic: 'Old rumor', play: 'content_gap' as const, opportunityScore: 90, observedAt: '2026-03-01T00:00:00.000Z' }
    const result = filterRegenerationCandidates([fresh, stale], { freshnessWindowDays: 30 })
    expect(result.map((item) => item.topic)).toEqual(['Fresh policy change'])
    // freshnessScore is exported and the threshold math mirrors the half-life
    expect(freshnessScore(stale.observedAt, now, 45)).toBeLessThan(0.1)
  })
})

describe('queue lineage regression', () => {
  it('appends events without mutating history and keeps a bounded timeline', () => {
    const initial = appendQueueLineageEvent([], {
      status: 'pending', actor: 'engine', message: 'Job queued', ts: 10, id: 'one',
    })
    const next = appendQueueLineageEvent(initial, {
      status: 'drafting', actor: 'studio', message: 'Draft started', ts: 20, id: 'two',
    }, 2)
    expect(initial).toHaveLength(1)
    expect(next.map((event) => event.id)).toEqual(['one', 'two'])

    const bounded = appendQueueLineageEvent(next, {
      status: 'failed', actor: 'gate', message: 'Gate blocked', ts: 30, id: 'three',
    }, 2)
    expect(bounded.map((event) => event.id)).toEqual(['two', 'three'])
    expect(bounded[0].message).toBe('Draft started')
  })
})

describe('pipeline lineage replay (generate → gate → ship → regenerate)', () => {
  // ── Fixtures: real shippable/unshippable drafts (mirrors content-quality-gate) ──
  // legal_guide → pillar tier: hard floor is 2,200 body words (max 2,800).
  const solidBody = Array.from({ length: 2300 }, (_, i) => `detail${i}`).join(' ')

  const guide = (bodyExtra: string) => `---
title: F-1 OPT STEM extension requirements
description: Practical guide to OPT STEM extension eligibility, documents, and timelines with official sources.
primaryKeyword: opt stem extension
robots: index,follow
---

# F-1 OPT STEM extension requirements

## In 60 seconds
- Confirm your STEM degree is on the DHS list
- File Form I-765 before your current EAD expires
- Check USCIS processing times before you commit

You need a clear plan before you file. ${bodyExtra}

## Eligibility steps
You confirm the STEM-designated degree, then you collect evidence that matches the rules on [the USCIS official site](https://www.uscis.gov/) .

## Documents checklist
Passport, I-20 with STEM OPT recommendation, and degree transcripts usually sit on the list. Verify live requirements.

## Common risks
Missing signature dates or expired passports often delay a case.

## FAQ
### When should you file?
You file before the current EAD expires to stay within the cap-gap window.

### What is the extension length?
The extension runs 24 months for most approved STEM degrees.

### Can you change employers?
Yes, but the new employer must be E-Verify enrolled.

### Where do you verify requirements?
Check the official USCIS page for your category.

## Sources
- [USCIS official site](https://www.uscis.gov/)

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"When should you file?","acceptedAnswer":{"@type":"Answer","text":"You file before the current EAD expires to stay within the cap-gap window."}},{"@type":"Question","name":"What is the extension length?","acceptedAnswer":{"@type":"Answer","text":"The extension runs 24 months for most approved STEM degrees."}},{"@type":"Question","name":"Can you change employers?","acceptedAnswer":{"@type":"Answer","text":"Yes, but the new employer must be E-Verify enrolled."}}]}
</script>

This guide is educational only, not legal advice. Consult an attorney for your situation.

${solidBody}
`

  // A draft that fails the quality gate: AI tells + outcome promise + hype.
  const slopDraft = guide(
    'In today\'s fast-paced world, we will guarantee your visa approval. Delve into this seamless robust process and leverage our game-changer system!!!',
  )
  // A draft that clears every gate: calm practitioner prose with official sources.
  const cleanDraft = guide(
    'You gather the checklist, confirm each form number, and file only when every item matches the official instructions.',
  )

  // A valid caseworks ship plan for the legal subdomain (passes validateShipPlan).
  const legalPlan: OwnerPlan = {
    matched: null,
    matchScore: 0,
    host: 'legal',
    repo: 'caseworks',
    filePath: 'app/us/opt-stem-extension/page.tsx',
    canonicalUrl: 'https://legal.yousafeconsultancy.com/us/opt-stem-extension/',
    indexable: true,
    action: 'create',
    intentClass: 'procedural',
    contentType: 'legal_guide',
    warnings: [],
    blockers: [],
    ymy: true,
    routingSource: 'registry_owner_url',
  }

  /**
   * Replays the REAL pipeline blocks, not fakes:
   *   generate → gate (auditContent/meetsShipQuality) → regenerate eligibility
   *   (filterRegenerationCandidates with the new ranking filters) → gate again →
   *   ship (validateShipPlan) — appending immutable lineage events at each hop.
   */
  const replayPipeline = (opts: {
    original: string
    regenerated?: string
    filters: RegenerationFilters
    // Structural subset of the filter's T constraint (all fields optional); no
    // `play` field — none of the scenarios is cannibalization, and typing it as
    // `string` would break the constraint and force an unsafe cast.
    candidate: {
      topic: string
      opportunityScore?: number
      rankingScore?: number
      confidence?: number
      aeoGeoScore?: number
      freshness?: number
      observedAt?: string
    }
    t0?: number
  }) => {
    const t0 = opts.t0 ?? Date.parse('2026-08-09T00:00:00.000Z')
    let events: QueueLineageEvent[] = []
    const nodes: TimelineNode[] = []
    // assembleLineageTimeline expects the LATEST job first (it walks sourceJobId
    // back to origin), so present the chain leaf-first — [child, origin].
    const buildTimeline = () => assembleLineageTimeline([...nodes].reverse(), events)

    // 1) GENERATE — original job queued, draft produced
    nodes.push({
      id: 'job-a',
      sourceJobId: null,
      status: 'queued',
      createdAt: new Date(t0).toISOString(),
      title: 'F-1 OPT STEM extension requirements',
      topic: 'opt stem extension',
    })
    events = appendQueueLineageEvent(events, {
      id: 'gen-1', ts: t0 + 1, status: 'queued', actor: 'engine', message: 'Job queued: opt stem extension',
    })

    // 2) GATE (v1) — real audit; the ship-readiness decision is meetsShipQuality
    const audit1 = auditContent({
      content: opts.original,
      contentType: 'legal_guide',
      primaryKeyword: 'opt stem extension',
      indexable: true,
    })
    if (meetsShipQuality(audit1)) {
      events = appendQueueLineageEvent(events, {
        id: 'gate-1', ts: t0 + 2, status: 'passed', actor: 'gate', message: 'Gate cleared on first draft',
      })
      events = appendQueueLineageEvent(events, {
        id: 'ship-1', ts: t0 + 3, status: 'merged', actor: 'github', message: `Ship merged: ${legalPlan.filePath}`,
      })
      return { nodes, events, timeline: buildTimeline(), shipped: true, regenerations: 0 }
    }
    events = appendQueueLineageEvent(events, {
      id: 'gate-1', ts: t0 + 2, status: 'blocked', actor: 'gate',
      message: `Gate blocked: ${audit1.blockers[0]?.code || 'quality'}`,
      evidence: { blockerCodes: audit1.blockers.map((b) => b.code) },
    })

    // 3) REGENERATION ELIGIBILITY — the NEW ranking-model filters decide
    const eligible = filterRegenerationCandidates([opts.candidate], opts.filters)
    if (!eligible.length || !opts.regenerated) {
      events = appendQueueLineageEvent(events, {
        id: 'regen-deny', ts: t0 + 3, status: 'blocked', actor: 'engine',
        message: 'Regeneration denied by ranking-model filters (score/confidence/AEO-GEO/freshness floor)',
      })
      return { nodes, events, timeline: buildTimeline(), shipped: false, regenerations: 0 }
    }

    // 4) REGENERATE — child job chained to the blocked original
    nodes.push({
      id: 'job-b',
      sourceJobId: 'job-a',
      status: 'drafting',
      createdAt: new Date(t0 + 4).toISOString(),
      title: 'F-1 OPT STEM extension requirements',
      topic: 'opt stem extension',
      regenerationMode: 'refresh',
      regenerationReason: 'quality gate block',
    })
    events = appendQueueLineageEvent(events, {
      id: 'regen-1', ts: t0 + 5, status: 'regenerating', actor: 'studio', message: 'Regenerating draft (refresh)',
    })

    // 5) GATE (v2) + SHIP — real gate AND estate-format ship gate
    const audit2 = auditContent({
      content: opts.regenerated,
      contentType: 'legal_guide',
      primaryKeyword: 'opt stem extension',
      indexable: true,
    })
    const planGate = validateShipPlan({ plan: legalPlan, contentType: 'legal_guide' })
    const shippable = meetsShipQuality(audit2) && planGate.ok
    events = appendQueueLineageEvent(events, {
      id: 'gate-2', ts: t0 + 6, status: shippable ? 'passed' : 'blocked', actor: 'gate',
      message: shippable ? 'Gate cleared after regeneration' : 'Gate still blocked after regeneration',
    })
    if (shippable) {
      nodes[nodes.length - 1] = { ...nodes[nodes.length - 1], status: 'merged' }
      events = appendQueueLineageEvent(events, {
        id: 'ship-1', ts: t0 + 7, status: 'merged', actor: 'github', message: `Ship merged: ${legalPlan.filePath}`,
      })
    }
    return { nodes, events, timeline: buildTimeline(), shipped: shippable, regenerations: 1 }
  }

  it('replays the full chain: generate → gate blocked → regenerate → gate passed → ship merged', () => {
    const { nodes, timeline, shipped, regenerations } = replayPipeline({
      original: slopDraft,
      regenerated: cleanDraft,
      filters: { minRankingScore: 70, minConfidence: 0.6, minAeoGeo: 60, freshnessWindowDays: 30 },
      // Explicit freshness field → wall-clock independent (the filter prefers
      // it over observedAt, so this test cannot rot as real time advances).
      candidate: {
        topic: 'opt stem extension',
        opportunityScore: 74,
        rankingScore: 88,
        confidence: 0.8,
        aeoGeoScore: 75,
        freshness: 0.9,
        observedAt: '2026-08-08T00:00:00.000Z',
      },
    })
    expect(shipped).toBe(true)
    expect(regenerations).toBe(1)
    // Both jobs exist and the child is chained to the blocked original.
    expect(nodes.map((n) => n.id)).toEqual(['job-a', 'job-b'])
    expect(nodes[1].sourceJobId).toBe('job-a')
    expect(nodes[1].regenerationMode).toBe('refresh')
    // The timeline walks the chain and interleaves gate events in real order.
    const blockedIdx = timeline.findIndex((e) => e.kind === 'event' && e.status === 'blocked' && e.actor === 'gate')
    const regenIdx = timeline.findIndex((e) => e.kind === 'node' && e.mode === 'refresh')
    const passedIdx = timeline.findIndex((e) => e.kind === 'event' && e.status === 'passed' && e.actor === 'gate')
    const shipIdx = timeline.findIndex((e) => e.kind === 'event' && e.status === 'merged' && e.actor === 'github')
    expect(blockedIdx).toBeGreaterThanOrEqual(0)
    expect(regenIdx).toBeGreaterThan(blockedIdx)
    expect(passedIdx).toBeGreaterThan(regenIdx)
    expect(shipIdx).toBeGreaterThan(passedIdx)
    // Ship gate cleared the estate contract for the merged file.
    expect(timeline[shipIdx].label).toContain('app/us/opt-stem-extension/page.tsx')
    const times = timeline.map((t) => t.ts)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('denies regeneration when the ranking floor is not met — queue stays blocked', () => {
    const { nodes, timeline, shipped, regenerations } = replayPipeline({
      original: slopDraft,
      regenerated: cleanDraft, // never used — filters deny before drafting
      filters: { minRankingScore: 70, minConfidence: 0.6, minAeoGeo: 60 },
      candidate: {
        topic: 'opt stem extension',
        rankingScore: 42, // below the 70 floor
        confidence: 0.8,
        aeoGeoScore: 75,
        observedAt: '2026-08-08T00:00:00.000Z',
      },
    })
    expect(shipped).toBe(false)
    expect(regenerations).toBe(0)
    expect(nodes).toHaveLength(1) // original only — no child job
    expect(timeline.filter((e) => e.kind === 'event' && e.actor === 'engine' && e.status === 'blocked')).toHaveLength(1)
    expect(timeline.some((e) => e.label && String(e.label).includes('denied by ranking-model filters'))).toBe(true)
    expect(timeline.some((e) => e.status === 'merged')).toBe(false)
  })

  it('denies regeneration when evidence is older than the freshness window', () => {
    const { shipped, regenerations, timeline } = replayPipeline({
      original: slopDraft,
      regenerated: cleanDraft,
      filters: { minRankingScore: 70, freshnessWindowDays: 30 },
      candidate: {
        topic: 'opt stem extension',
        rankingScore: 88,
        confidence: 0.8,
        aeoGeoScore: 75,
        observedAt: '2026-03-01T00:00:00.000Z', // ~5 months stale → below 30-day window
      },
    })
    expect(shipped).toBe(false)
    expect(regenerations).toBe(0)
    expect(timeline.some((e) => e.label && String(e.label).includes('denied by ranking-model filters'))).toBe(true)
    // The stale evidence itself is provably past the 45-day half-life floor.
    expect(freshnessScore('2026-03-01T00:00:00.000Z', Date.parse('2026-08-09T00:00:00.000Z'), 45)).toBeLessThan(0.1)
  })

  it('ships on the first draft when the gate passes — no regeneration needed', () => {
    const { nodes, timeline, shipped, regenerations } = replayPipeline({
      original: cleanDraft,
      filters: {},
      candidate: { topic: 'opt stem extension', rankingScore: 90 },
    })
    expect(shipped).toBe(true)
    expect(regenerations).toBe(0)
    expect(nodes).toHaveLength(1)
    expect(timeline.filter((e) => e.kind === 'event' && e.actor === 'gate' && e.status === 'passed')).toHaveLength(1)
    expect(timeline.some((e) => e.status === 'merged')).toBe(true)
  })
})

/**
 * Content Studio UI contract tests — the CI-enforced version of the manual
 * scripts/render-studio-ui-preview.tsx probe.
 *
 * Renders the extracted studio components to static markup (node env, no
 * browser) and asserts the exact E2E contract the Playwright suite depends
 * on, so the monolith extraction can never drift silently:
 *
 *   · StudioStageNav   — id=studio-tab-*, role=tab, aria-selected/controls/
 *                        disabled, disabled+title, gold active bubble, numerals
 *   · ChapterIntro     — chapter-intro class, data-chapter, h2, scope chips,
 *                        jump buttons, mini-pill numerals
 *   · QueueStats/Table — metric cards, table headers, status/gate badges,
 *                        PR links, select-all aria
 *   · ReviewDraftsPanel— studio-review-drafts + studio-review-draft-{id} testids
 *   · ReviewDraftsPanel — studio-review-drafts, document vault, inline gate info
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StudioStageNav } from '@/components/design/studio-stage-nav'
import { ChapterIntro } from '@/components/design/studio-chapter-intro'
import { QueueStats, QueueTable } from '@/components/design/studio-queue'
import { ReviewDraftsPanel } from '@/components/design/studio-review-panels'
import {
  isOpenPr,
  isPublishedJob,
  shipGateFromAuditPayload,
  shipGateIsCleared,
} from '@/components/design/studio-ui-shared'
import type { ContentJob, QueueSummary } from '@/components/design/studio-ui-shared'

/* ── fixtures ─────────────────────────────────────────────────────────── */

const NAV_TABS = [
  { key: 'discover', numeral: 'I', label: 'Discover', sub: 'Signal Intelligence', hint: 'GSC · radar · gaps · opportunities' },
  { key: 'research', numeral: 'II', label: 'Research', sub: 'Keywords & Brief', hint: 'Intent · keywords · interlinks · template' },
  { key: 'draft', numeral: 'III', label: 'Draft & Review', sub: 'Generate · Gate · Fix', hint: '2 jobs · queue · review' },
  { key: 'approve', numeral: 'IV', label: 'Approve & Track', sub: 'Merge · Deploy · Verify', hint: 'PR · deploy · ledger · GSC' },
  { key: 'configure', numeral: 'V', label: 'Configure', sub: 'System Settings', hint: 'AI models · API keys · GSC · health' },
] as const

const NAV_AVAILABILITY: Record<string, { available: boolean; reason: string }> = {
  discover: { available: true, reason: '' },
  research: { available: true, reason: '' },
  draft: { available: false, reason: 'No brief yet' },
  approve: { available: true, reason: '' },
  configure: { available: true, reason: '' },
}

function job(partial: Partial<ContentJob> & Pick<ContentJob, 'id' | 'title' | 'status'>): ContentJob {
  return {
    id: 'j1',
    title: 'US Visa Update Guide',
    topic: 'us visa update',
    content_type: 'article',
    tone: 'educational',
    region: 'US',
    target_repo: 'caseworks',
    status: 'pending',
    source_job_id: null,
    slug: 'us-visa-update-guide',
    content: '# US Visa Update Guide\n\nBody.',
    branch_name: null,
    content_path: null,
    pr_url: null,
    pr_number: null,
    canonical_url: null,
    merged_at: null,
    closed_at: null,
    error_message: null,
    ai_provider: null,
    ai_model: null,
    word_count: 1234,
    seo_score: 88,
    primary_keyword: 'us visa',
    ship_mode: 'auto',
    indexable: true,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...partial,
  }
}

const drafting = job({ id: 'j1', title: 'US Visa Update Guide', status: 'drafting', word_count: 1234, seo_score: 88 })
const prJob = job({
  id: 'j2',
  title: 'Canada Study Permit Guide',
  topic: 'study permit',
  region: 'CA',
  content_type: 'article',
  status: 'pr_created',
  pr_url: 'https://github.com/acme/repo/pull/42',
  pr_number: 42,
  word_count: 2410,
  seo_score: 96,
})

const gateByJob = new Map<string, { score: number | null; passed: boolean | null }>([
  ['j1', { score: 33, passed: false }],
  ['j2', { score: 100, passed: true }],
])

/* ── isPublishedJob — Track ledger stamp predicate ────────────────────── */

describe('isPublishedJob — a stamp is earned only by a genuinely shipped page', () => {
  it('canonical_url alone never earns a stamp (drafts/pr/failed are excluded)', () => {
    // 2026-08 regression: the pipeline writes canonical_url on every job at
    // creation (status 'drafting'), so the old `status === 'merged' ||
    // canonical_url` filter flooded the Track ledger with never-merged drafts.
    expect(
      isPublishedJob(job({ id: 'd1', title: 'Draft', status: 'drafting', canonical_url: 'https://legal.yousafeconsultancy.com/us/draft/' })),
    ).toBe(false)
    expect(
      isPublishedJob(job({ id: 'p1', title: 'PR open', status: 'pr_created', canonical_url: 'https://legal.yousafeconsultancy.com/us/pr/' })),
    ).toBe(false)
    expect(
      isPublishedJob(job({ id: 'f1', title: 'Failed', status: 'failed', canonical_url: 'https://legal.yousafeconsultancy.com/us/fail/' })),
    ).toBe(false)
  })

  it('status merged (or a set merged_at) earns a stamp', () => {
    expect(isPublishedJob(job({ id: 'm1', title: 'Merged', status: 'merged' }))).toBe(true)
    // Defensive: a merged_at timestamp is authoritative even if status is stale.
    expect(
      isPublishedJob(job({ id: 'm2', title: 'Merged-stale', status: 'pr_created', merged_at: '2026-08-01T00:00:00.000Z' })),
    ).toBe(true)
  })
})

/* ── isOpenPr — Approve panel "open PR" predicate ─────────────────────── */

describe('isOpenPr — only a pr_created job is an open pull request', () => {
  it('pr_url alone never makes a merged job an open PR', () => {
    // 2026-08 regression: merge_pr sets status='merged' but RETAINS pr_url for
    // the audit trail, so the old `status === 'pr_created' || j.pr_url` filter
    // left every merged job stuck in "Push to main · N open PRs".
    expect(
      isOpenPr(job({ id: 'm1', title: 'Merged', status: 'merged', pr_url: 'https://github.com/acme/repo/pull/42', pr_number: 42 })),
    ).toBe(false)
    expect(
      isOpenPr(job({ id: 'f1', title: 'Failed', status: 'failed', pr_url: 'https://github.com/acme/repo/pull/7', pr_number: 7 })),
    ).toBe(false)
    expect(
      isOpenPr(job({ id: 'd1', title: 'Drafting', status: 'drafting', pr_url: 'https://github.com/acme/repo/pull/3', pr_number: 3 })),
    ).toBe(false)
  })

  it('status pr_created is an open PR', () => {
    expect(
      isOpenPr(job({ id: 'p1', title: 'PR open', status: 'pr_created', pr_url: 'https://github.com/acme/repo/pull/42', pr_number: 42 })),
    ).toBe(true)
  })
})

/* ── StudioStageNav ───────────────────────────────────────────────────── */

describe('StudioStageNav — E2E navigation contract', () => {
  const html = renderToStaticMarkup(
    React.createElement(StudioStageNav, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tabs: NAV_TABS as any,
      active: 'research',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      availability: NAV_AVAILABILITY as any,
      onSelect: () => undefined,
    }),
  )

  it('renders all 5 pills with stable ids in pipeline order', () => {
    for (const t of NAV_TABS) {
      expect(html).toContain(`id="studio-tab-${t.key}"`)
    }
    expect(html).toContain('aria-label="Content Studio pipeline"')
  })

  it('keeps role=tab + aria-selected/controls wiring', () => {
    expect(html.match(/role="tab"/g) ?? []).toHaveLength(5)
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('aria-controls="studio-panel-research"')
    expect(html).toContain('aria-controls="studio-panel-configure"')
  })

  it('locks unavailable stages with aria-disabled + disabled + reason title', () => {
    expect(html).toContain('aria-disabled="true"')
    expect(/<button[^>]*disabled[^>]*>/.test(html)).toBe(true)
    expect(html).toContain('No brief yet')
  })

  it('paints the active bubble gold and renders all numerals', () => {
    expect(html).toContain('background:#A07E3A')
    for (const n of ['I', 'II', 'III', 'IV', 'V']) {
      expect(html).toContain(`>${n}<`)
    }
  })
})

/* ── ChapterIntro ─────────────────────────────────────────────────────── */

describe('ChapterIntro — stage header contract', () => {
  const html = renderToStaticMarkup(
    React.createElement(ChapterIntro, {
      numeral: 'I',
      title: 'Discover',
      subtitle: 'Signal intelligence — gap detection from every source wired into the engine.',
      chapterKey: 'discover',
      scope: [
        { chip: 'Radar', text: 'Live opportunity radar from GSC deltas' },
        { chip: 'Knowledge', text: 'Planner report of all possible works' },
      ],
      next: 'Research',
      prev: 'Configure',
      onJump: () => undefined,
    }),
  )

  it('preserves the chapter-intro + data-chapter contract', () => {
    expect(html).toContain('class="chapter-intro"')
    expect(html).toContain('data-chapter="discover"')
    expect(html).toContain('<h2')
    expect(html).toContain('Discover</h2>')
  })

  it('renders scope chips and jump buttons', () => {
    expect(html).toContain('Radar')
    expect(html).toContain('Knowledge')
    expect(html).toContain('← Configure')
    expect(html).toContain('Research →')
  })

  it('renders the mini-pill compass numerals', () => {
    expect(html).toContain('>I<')
    expect(html).toContain('>V<')
  })
})

/* ── QueueStats ───────────────────────────────────────────────────────── */

describe('QueueStats — draft queue metric cards', () => {
  const summary: QueueSummary = { total: 5, drafting: 2, pr_created: 1, merged: 1, failed: 1 }

  it('renders all five metric cards from the summary', () => {
    const html = renderToStaticMarkup(
      React.createElement(QueueStats, { jobs: [drafting, prJob], total: 5, summary }),
    )
    for (const label of ['Total jobs', 'In progress', 'PR ready', 'Merged', 'Failed']) {
      expect(html).toContain(label)
    }
    // total from the summary override
    expect(html).toContain('>5<')
  })
})

/* ── QueueTable ───────────────────────────────────────────────────────── */

describe('QueueTable — draft queue table', () => {
  const render = () =>
    renderToStaticMarkup(
      React.createElement(QueueTable, {
        jobs: [drafting, prJob],
        total: 2,
        summary: { total: 2, drafting: 1, pr_created: 1 },
        onSelect: () => undefined,
        loading: false,
        mergeIndex: { byPath: new Map(), byStem: new Map() },
        gateByJob,
        focusJobId: 'j1',
        onLoadMore: () => undefined,
        selectedIds: new Set<string>(),
        onToggleSelect: () => undefined,
        onToggleSelectAll: () => undefined,
        onBulkAction: () => undefined,
        bulkBusy: false,
        bulkAction: null,
      }),
    )

  it('renders table headers Status / Gate / SEO / PR', () => {
    const html = render()
    for (const h of ['Status', 'Gate', 'SEO', 'PR']) {
      expect(html).toContain(h)
    }
  })

  it('renders job rows with status badges, gate badges and PR links', () => {
    const html = render()
    expect(html).toContain('US Visa Update Guide')
    expect(html).toContain('Canada Study Permit Guide')
    expect(html).toContain('Drafting')
    expect(html).toContain('PR Ready')
    expect(html).toContain('✕ BLOCK') // gate 33 blocked
    expect(html).toContain('✓ PASS') // gate 100 passed
    expect(html).toContain('PR #42 ↗')
    expect(html).toContain('aria-label="Select all visible jobs"')
  })

  it('renders the queue filter strip', () => {
    const html = render()
    for (const f of ['All', 'In progress', 'PR ready', 'Merged', 'Failed']) {
      expect(html).toContain(f)
    }
  })
})

/* ── ReviewDraftsPanel ────────────────────────────────────────────────── */

describe('ReviewDraftsPanel — drafts document list', () => {
  it('renders the empty state with the studio-review-drafts testid', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReviewDraftsPanel, {
        jobs: [],
        gateByJob,
        selectedJobId: null,
        onOpenJob: () => undefined,
      }),
    )
    expect(html).toContain('data-testid="studio-review-drafts"')
    expect(html).toContain('Document Vault')
    expect(html).toContain('No pending drafts')
  })

  it('renders per-draft cards with id-scoped testids and an Open in editor action', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReviewDraftsPanel, {
        jobs: [drafting, prJob],
        gateByJob,
        selectedJobId: 'j1',
        onOpenJob: () => undefined,
      }),
    )
    expect(html).toContain('data-testid="studio-review-drafts"')
    expect(html).toContain('data-testid="studio-review-draft-j1"')
    expect(html).not.toContain('data-testid="studio-review-draft-j2"')
    expect(html).toContain('US Visa Update Guide')
    expect(html).not.toContain('Canada Study Permit Guide')
    expect(html).toContain('1234 words') // raw word count format
    expect(html).toContain('Open in editor →')
  })

  it('shows an empty state when a brief is active but no matching job exists', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReviewDraftsPanel, {
        jobs: [prJob],
        gateByJob,
        selectedJobId: null,
        activeTopic: 'Australia student visa fees',
        onOpenJob: () => undefined,
      }),
    )
    expect(html).toContain('No job for this brief yet')
    expect(html).toContain('data-testid="studio-review-empty-brief"')
    expect(html).not.toContain('Canada Study Permit Guide')
  })
})

/* ── ReviewDraftsPanel — vault empty state ───────────────────────────── */

describe('ship-gate UI helpers — score or a finished draft never clears a gate', () => {
  it('shipReady true + zero blockers clears', () => {
    expect(shipGateIsCleared(shipGateFromAuditPayload({ score: 88, shipReady: true, blockers: [] }))).toBe(true)
  })

  it('score >= 90 WITHOUT a shipReady boolean is UNKNOWN — never a pass', () => {
    // The old banner trusted exactly this shape.
    expect(shipGateFromAuditPayload({ score: 100, blockers: [] })).toBeNull()
    expect(shipGateIsCleared(null)).toBe(false)
  })

  it('shipReady true + a real blocker does NOT clear', () => {
    const gate = shipGateFromAuditPayload({
      score: 100,
      shipReady: true,
      blockers: [{ code: 'unlinked_related_guide', message: 'Plain-text related guide' }],
    })
    expect(shipGateIsCleared(gate)).toBe(false)
  })

  it('a blocker count (number 1) defeats a shipReady true', () => {
    expect(shipGateIsCleared(shipGateFromAuditPayload({ score: 100, shipReady: true, blockers: 1 }))).toBe(false)
  })
})

describe('ReviewDraftsPanel — "gates cleared" count derives from the ship gate, never the score', () => {
  const gatePassedJob = job({
    id: 'gp1', title: 'Gate Confirmed', status: 'drafting',
    audit_json: { score: 88, shipReady: true, blockers: [], warnings: [] } as never,
  })
  // The 2026-08 defect: a 96-score finished draft with content but no audit —
  // was counted as "gates cleared" and surfaced for bulk_approve.
  const highScoreNoAudit = job({
    id: 'hn1', title: 'High Score, No Audit', status: 'drafting',
    audit_json: { score: 96, blockers: [] } as never,
  })

  it('counts only ship-ready documents; a high-score un-audited draft is NOT cleared', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReviewDraftsPanel, {
        jobs: [gatePassedJob, highScoreNoAudit],
        gateByJob: new Map([
          [gatePassedJob.id, { score: 88, passed: false }],
          [highScoreNoAudit.id, { score: 96, passed: false }],
        ]),
        selectedJobId: gatePassedJob.id,
        onOpenJob: () => undefined,
      }),
    )
    expect(html).toContain('1 gate cleared')
    expect(html).not.toContain('awaiting audit')
    expect(html).toContain('Gate Confirmed')
    expect(html).not.toContain('High Score, No Audit')
  })
})

describe('ReviewDraftsPanel — document vault', () => {
  it('renders the vault empty state when no drafts exist', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReviewDraftsPanel, {
        jobs: [],
        gateByJob,
        selectedJobId: null,
        onOpenJob: () => undefined,
      }),
    )
    expect(html).toContain('data-testid="studio-review-drafts"')
    expect(html).toContain('Document Vault')
  })

  it('renders draft documents with gate scores and Open in editor buttons', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReviewDraftsPanel, {
        jobs: [drafting],
        gateByJob: new Map([[drafting.id, { score: 48, passed: false }]]),
        selectedJobId: drafting.id,
        onOpenJob: () => undefined,
      }),
    )
    expect(html).toContain('data-testid="studio-review-drafts"')
    expect(html).toContain('THIS BRIEF')
    expect(html).toContain('Open in editor →')
    expect(html).toContain('48') // gate score
  })
})

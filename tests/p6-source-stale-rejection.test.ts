/**
 * P6 Batch B — bounded SOURCE-stale rejection of historical jobless planned
 * `seo_interlinks` rows whose exact target is LIVE and whose durable source
 * mission never shipped.
 *
 * The suite pins the fail-closed contract:
 *   · the predicate requires ALL of: planned + historical jobless/no-proof NULL
 *     fence, an exact absolute http(s) target that classifies LIVE now, an
 *     exact `seo_cluster_plans` mission record that is still planned with
 *     `shipped_at IS NULL`, no live estate URL carrying the mission slug, and no
 *     durable mission→content_jobs identity. Shipped/ambiguous missions, dead
 *     or unknown targets, noncanonical targets and legacy Portal auth-wall rows
 *     are never eligible;
 *   · no source/job/proof/applied column is ever written or fabricated: the
 *     patch carries exactly `status='rejected'` + the three audit fields;
 *   · every write is an exact-row CAS on the RAW STORED target_url plus the
 *     eight NULL subject columns;
 *   · dry run makes ZERO write calls; apply needs `--apply --confirm
 *     REJECT-BATCH-B-SOURCE-STALE` (re-checked in the runner, not trusted from
 *     argv) AND a working durable mission→content_jobs exclusion probe;
 *   · reads/guards that fail or truncate fail the run closed with zero writes;
 *   · the boundary refuses apply without genuine service-role authority before
 *     any client is constructed.
 *
 * The read-only disposition report is pinned in the companion suite
 * (`tests/p6-interlink-disposition-report.test.ts`): an explicitly rejected
 * live-target row is a RESOLVED cohort member and can never be counted as
 * verified applied.
 */
import fs from 'node:fs'
import path from 'node:path'

import {
  P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN,
  P6_SOURCE_STALE_DEFAULT_LIMIT,
  P6_SOURCE_STALE_GATE_ACTOR,
  P6_SOURCE_STALE_GATE_REASON,
  P6_SOURCE_STALE_GATE_REASONS,
  P6_SOURCE_STALE_HARD_MAX_ROWS,
  P6_SOURCE_STALE_REASON_HTTP_404,
  P6_SOURCE_STALE_REASON_HTTP_410,
  P6_SOURCE_STALE_REASON_UNSHIPPED_MISSION,
  buildSourceStaleCasFence,
  buildSourceStaleUpdatePatch,
  classifySourceStaleRow,
  isShippedMissionPlan,
  isNeverShippedMissionPlan,
  liveSlugMatches,
  missionIdentityMatches,
  orderSourceStaleCandidates,
  parseSourceStaleArgs,
  planSourceStale,
  p6SourceStaleReasonForStatus,
  uniqueSourceStaleCandidatesById,
  type P6SourceStaleCandidateRow,
} from '../scripts/p6SourceStaleRejection'
import { P6_SOURCE_STALE_GATE_REASONS as REPORT_GATE_REASONS } from '../scripts/p6InterlinkDisposition'
import {
  runP6SourceStaleRejection,
  type P6SourceStaleRunnerDeps,
} from '../scripts/p6SourceStaleRejectionRunner'
import { runP6SourceStaleCliBoundary } from '../scripts/p6SourceStaleCliBoundary'

const LIVE_TARGET = 'https://market.yousafeconsultancy.com/categories/study-permits'
const PORTAL_TARGET = 'https://portal.yousafeconsultancy.com/au/seo-485-visa'
const DEAD_TARGET = 'https://yousafeconsultancy.com/au/visa'
const SLUG = 'seo-au-visa-australia-visa-application'
const SHIPPED_SLUG = 'seo-ca-schools-canada-study-permit-processing'

const liveObservation = { status: 200, ok: true }

function row(overrides: Partial<P6SourceStaleCandidateRow> = {}): P6SourceStaleCandidateRow {
  return {
    id: 'row-1',
    source_slug: SLUG,
    target_url: LIVE_TARGET,
    status: 'planned',
    source_url: null,
    source_job_id: null,
    verification_state: null,
    verified_at: null,
    verification_evidence: null,
    verification_attempted_at: null,
    staged_at: null,
    applied_at: null,
    created_at: '2026-08-20T00:00:00.000Z',
    ...overrides,
  }
}

const neverShipped = { cluster_id: SLUG, status: 'planned', shipped_at: null }

/** Shipped-mission lane fixtures (deterministic resolver output, exact URL). */
const SHIPPED_SOURCE = 'https://yousafeconsultancy.com/blog/canada-study-permit-processing-time/'
const shippedPlan = {
  cluster_id: SHIPPED_SLUG,
  status: 'shipped',
  shipped_at: '2026-09-02T12:52:30.997+00:00',
}
const shippedResolution = {
  ok: true as const,
  source: {
    url: SHIPPED_SOURCE,
    resolver: 'resolveOwner',
    contentType: 'blog_post',
  },
}

describe('A) source-stale predicate is fail-closed', () => {
  const context = {
    observations: { [LIVE_TARGET]: liveObservation },
    missionPlans: { [SLUG]: neverShipped, [SHIPPED_SLUG]: { cluster_id: SHIPPED_SLUG, status: 'shipped', shipped_at: '2026-09-01T00:00:00.000Z' } },
  }

  it('selects the exact predicate: planned + jobless/no-proof + live target + never-shipped mission', () => {
    expect(classifySourceStaleRow(row(), context)).toBe('eligible')
  })

  it('never selects a row that carries any durable identity or proof', () => {
    for (const override of [
      { source_url: 'https://legal.yousafeconsultancy.com/au/visa/' },
      { source_job_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7' },
      { verification_state: 'absent' },
      { verified_at: '2026-09-01T00:00:00.000Z' },
      { verification_evidence: { any: 'evidence' } },
      { verification_attempted_at: '2026-09-01T00:00:00.000Z' },
      { staged_at: '2026-09-01T00:00:00.000Z' },
      { applied_at: '2026-09-01T00:00:00.000Z' },
      { status: 'applied' },
      { status: 'rejected' },
    ]) {
      expect(classifySourceStaleRow(row(override as P6SourceStaleCandidateRow), context)).toBe(
        'subject_fence_failed',
      )
    }
  })

  it('never selects legacy Portal auth-wall rows or noncanonical targets', () => {
    expect(classifySourceStaleRow(row({ target_url: PORTAL_TARGET }), context)).toBe(
      'legacy_auth_wall',
    )
    for (const bad of ['', '   ', '/au/visa/', 'market.yousafeconsultancy.com/a', 'mailto:x@y.z']) {
      expect(classifySourceStaleRow(row({ target_url: bad }), context)).toBe('noncanonical_target')
    }
  })

  it('never treats a dead or unobserved target as source-stale', () => {
    expect(
      classifySourceStaleRow(row({ target_url: DEAD_TARGET }), {
        ...context,
        observations: { [DEAD_TARGET]: { status: 404, ok: false } },
      }),
    ).toBe('target_dead')
    expect(
      classifySourceStaleRow(row({ target_url: DEAD_TARGET }), {
        ...context,
        observations: { [DEAD_TARGET]: { status: 503, ok: false } },
      }),
    ).toBe('target_not_live')
    expect(classifySourceStaleRow(row(), { ...context, observations: {} })).toBe('target_unknown')
  })

  it('fails closed on an ambiguous mission: no record, shipped, or any other status', () => {
    expect(classifySourceStaleRow(row(), { ...context, missionPlans: {} })).toBe(
      'mission_plan_missing',
    )
    // A SHIPPED mission is never given the never-shipped treatment; without a
    // resolved canonical source it stays ineligible (fail closed).
    expect(
      classifySourceStaleRow(row({ source_slug: SHIPPED_SLUG }), context),
    ).toBe('shipped_source_unresolved')
    for (const status of ['briefed', 'launched', 'done', 'skipped', 'rejected']) {
      expect(
        classifySourceStaleRow(row(), {
          ...context,
          missionPlans: { [SLUG]: { cluster_id: SLUG, status, shipped_at: null } },
        }),
      ).toBe('mission_not_unshipped')
    }
    // shipped_at present but status still planned -> still fail closed.
    expect(
      classifySourceStaleRow(row(), {
        ...context,
        missionPlans: {
          [SLUG]: { cluster_id: SLUG, status: 'planned', shipped_at: '2026-09-02T00:00:00.000Z' },
        },
      }),
    ).toBe('mission_not_unshipped')
    // The plan row's own cluster_id must equal the row's source_slug verbatim.
    expect(
      classifySourceStaleRow(row(), {
        ...context,
        missionPlans: {
          [SLUG]: { cluster_id: `${SLUG}-other`, status: 'planned', shipped_at: null },
        },
      }),
    ).toBe('mission_identity_mismatch')
    expect(missionIdentityMatches({ cluster_id: SLUG }, SLUG)).toBe(true)
    expect(missionIdentityMatches({ cluster_id: ` ${SLUG} ` }, SLUG)).toBe(true)
    expect(missionIdentityMatches({ cluster_id: `${SLUG}-other` }, SLUG)).toBe(false)
    expect(missionIdentityMatches(null, SLUG)).toBe(false)
    expect(isNeverShippedMissionPlan({ cluster_id: SLUG, status: 'planned', shipped_at: null })).toBe(
      true,
    )
    expect(isNeverShippedMissionPlan({ cluster_id: SLUG, status: 'planned', shipped_at: '  ' })).toBe(
      true,
    )
    expect(isNeverShippedMissionPlan(null)).toBe(false)
  })

  it('fails closed when a live estate URL carries the mission slug, and on a durable job identity', () => {
    expect(
      classifySourceStaleRow(row(), { ...context, liveSourceSlugs: [SLUG] }),
    ).toBe('live_source_page_present')
    expect(
      classifySourceStaleRow(row(), {
        ...context,
        missionJobResolvedSlugs: { [SLUG]: 'job-1' },
      }),
    ).toBe('mission_job_resolved')
    expect(classifySourceStaleRow(row({ source_slug: '   ' }), context)).toBe('no_source_slug')
  })

  it('the live-source guard matches only the exact slug inside a live path segment', () => {
    const matches = liveSlugMatches(
      [SLUG, 'seo-us-work-stem-opt'],
      [
        `https://legal.yousafeconsultancy.com/au/${SLUG}/`,
        'https://legal.yousafeconsultancy.com/au/visa/australia-application/',
        `https://usa.yousafeconsultancy.com/us/x-${SLUG}-2026`,
        'not-a-url',
      ],
    )
    expect([...matches]).toEqual([SLUG])
  })
})

describe('A2) shipped-source lane: deterministic resolver + fresh raw 404/410 only', () => {
  const base = {
    observations: { [LIVE_TARGET]: liveObservation },
    missionPlans: { [SHIPPED_SLUG]: shippedPlan },
    shippedSources: { [SHIPPED_SLUG]: shippedResolution },
    sourceObservations: { [SHIPPED_SOURCE]: { status: 404, ok: false } },
  }
  const shippedRow = (overrides: Partial<P6SourceStaleCandidateRow> = {}) =>
    row({ source_slug: SHIPPED_SLUG, ...overrides })

  it('treats exactly `shipped` + a non-null shipped_at as the shipped lane', () => {
    expect(isShippedMissionPlan(shippedPlan)).toBe(true)
    expect(isNeverShippedMissionPlan(shippedPlan)).toBe(false)
    for (const plan of [
      null,
      undefined,
      { cluster_id: SHIPPED_SLUG, status: 'shipped', shipped_at: null },
      { cluster_id: SHIPPED_SLUG, status: 'shipped', shipped_at: '   ' },
      { cluster_id: SHIPPED_SLUG, status: 'planned', shipped_at: '2026-09-02T00:00:00.000Z' },
      { cluster_id: SHIPPED_SLUG, status: 'launched', shipped_at: '2026-09-02T00:00:00.000Z' },
    ]) {
      expect(isShippedMissionPlan(plan)).toBe(false)
    }
  })

  it('selects a shipped mission whose resolved canonical source is a raw 404 or 410', () => {
    expect(classifySourceStaleRow(shippedRow(), base)).toBe('eligible_shipped_source_gone')
    expect(
      classifySourceStaleRow(shippedRow(), {
        ...base,
        sourceObservations: { [SHIPPED_SOURCE]: { status: 410, ok: false } },
      }),
    ).toBe('eligible_shipped_source_gone')
    expect(p6SourceStaleReasonForStatus(404)).toBe(P6_SOURCE_STALE_REASON_HTTP_404)
    expect(p6SourceStaleReasonForStatus(410)).toBe(P6_SOURCE_STALE_REASON_HTTP_410)
  })

  it('NEVER rejects a live shipped source merely because the planned href is absent', () => {
    for (const status of [200, 204, 301, 302]) {
      expect(
        classifySourceStaleRow(shippedRow(), {
          ...base,
          sourceObservations: { [SHIPPED_SOURCE]: { status, ok: status < 400 } },
        }),
      ).toBe('shipped_source_live')
    }
    // A source the authority could not observe, or a 0/5xx/403 answer, is
    // UNKNOWN — never guessed dead.
    for (const status of [0, 403, 429, 500, 503]) {
      expect(
        classifySourceStaleRow(shippedRow(), {
          ...base,
          sourceObservations: { [SHIPPED_SOURCE]: { status, ok: false } },
        }),
      ).toBe('shipped_source_unknown')
    }
    expect(classifySourceStaleRow(shippedRow(), { ...base, sourceObservations: {} })).toBe(
      'shipped_source_unknown',
    )
  })

  it('fails closed when the owner is missing, ambiguous or the resolver errored', () => {
    for (const resolution of [
      undefined,
      null,
      { ok: false as const, reason: 'ownership resolver returned no canonical source URL' },
      { ok: false as const, reason: 'ownership resolver resolved outside the estate host set' },
      { ok: false as const, reason: 'ownership resolver error: boom' },
      { ok: true as const, source: { url: '   ', resolver: 'resolveOwner', contentType: 'blog_post' } },
      { ok: true as const, source: { url: '/blog/canada/', resolver: 'resolveOwner', contentType: 'blog_post' } },
      { ok: true as const, source: { url: 'mailto:x@y.z', resolver: 'resolveOwner', contentType: 'blog_post' } },
    ]) {
      expect(
        classifySourceStaleRow(shippedRow(), {
          ...base,
          shippedSources: resolution ? { [SHIPPED_SLUG]: resolution } : {},
        }),
      ).toBe('shipped_source_unresolved')
    }
  })

  it('never rejects a self-target, verbatim or normalized', () => {
    for (const target of [SHIPPED_SOURCE, `${SHIPPED_SOURCE}/`, `${SHIPPED_SOURCE}#x`]) {
      expect(
        classifySourceStaleRow(shippedRow({ target_url: target }), {
          ...base,
          observations: {
            [target]: liveObservation,
            [SHIPPED_SOURCE]: liveObservation,
            'https://yousafeconsultancy.com/blog/canada-study-permit-processing-time': liveObservation,
          },
        }),
      ).toBe('shipped_source_self_target')
    }
    // Normalized self-target: the stored target uses the same path without the
    // trailing slash, so the exact binding differs but the identity does not.
    expect(
      classifySourceStaleRow(
        shippedRow({ target_url: SHIPPED_SOURCE.replace(/\/$/, '') }),
        { ...base, observations: { [SHIPPED_SOURCE.replace(/\/$/, '')]: liveObservation } },
      ),
    ).toBe('shipped_source_self_target')
  })

  it('requires the exact mission identity and a live exact target', () => {
    expect(
      classifySourceStaleRow(shippedRow(), {
        ...base,
        missionPlans: { [SHIPPED_SLUG]: { ...shippedPlan, cluster_id: `${SHIPPED_SLUG}-x` } },
      }),
    ).toBe('mission_identity_mismatch')
    expect(
      classifySourceStaleRow(shippedRow({ target_url: DEAD_TARGET }), {
        ...base,
        observations: { [DEAD_TARGET]: { status: 404, ok: false } },
      }),
    ).toBe('target_dead')
    expect(classifySourceStaleRow(shippedRow(), { ...base, observations: {} })).toBe(
      'target_unknown',
    )
  })

  it('keeps the historical jobless/no-proof fence, legacy and noncanonical exclusions', () => {
    expect(
      classifySourceStaleRow(shippedRow({ source_url: 'https://legal.yousafeconsultancy.com/x/' }), base),
    ).toBe('subject_fence_failed')
    expect(
      classifySourceStaleRow(shippedRow({ target_url: PORTAL_TARGET }), base),
    ).toBe('legacy_auth_wall')
    expect(classifySourceStaleRow(shippedRow({ target_url: '/au/visa/' }), base)).toBe(
      'noncanonical_target',
    )
  })

  it('plans both lanes with the status-derived reason and separate accounting', () => {
    const plan = planSourceStale(
      [row(), shippedRow({ id: 'shipped-404' }), shippedRow({ id: 'shipped-200' })],
      {
        ...base,
        missionPlans: { [SLUG]: neverShipped, [SHIPPED_SLUG]: shippedPlan },
        sourceObservations: {
          [SHIPPED_SOURCE]: { status: 404, ok: false },
        },
        // The 200 row carries its own exact source URL.
        shippedSources: {
          [SHIPPED_SLUG]: shippedResolution,
        },
      },
      { limit: 200 },
    )
    expect(plan.laneCounts).toEqual({ unshipped_mission: 1, shipped_source_gone: 2 })
    expect(plan.classCounts.eligible).toBe(1)
    expect(plan.classCounts.eligible_shipped_source_gone).toBe(2)
    expect(plan.shippedSourceResolution).toEqual({
      attempted: 1,
      resolved: 1,
      unresolved: 0,
      unresolvedReasons: {},
    })
    expect(plan.sourceStatusCounts).toEqual({ '404': 1 })
    expect(plan.selected[0]).toMatchObject({
      lane: 'unshipped_mission',
      gateReason: P6_SOURCE_STALE_REASON_UNSHIPPED_MISSION,
      source: null,
    })
    expect(plan.selected[1]).toMatchObject({
      lane: 'shipped_source_gone',
      gateReason: P6_SOURCE_STALE_REASON_HTTP_404,
      source: {
        url: SHIPPED_SOURCE,
        rawStatus: 404,
        resolver: 'resolveOwner',
        contentType: 'blog_post',
      },
    })

    const mixed = planSourceStale(
      [shippedRow({ id: 'shipped-404' }), shippedRow({ id: 'shipped-200' })],
      {
        ...base,
        shippedSources: {
          [SHIPPED_SLUG]: { ok: false, reason: 'ownership resolver error: boom' },
        },
      },
      { limit: 200 },
    )
    expect(mixed.laneCounts.shipped_source_gone).toBe(0)
    expect(mixed.shippedSourceResolution).toEqual({
      attempted: 1,
      resolved: 0,
      unresolved: 1,
      unresolvedReasons: { 'ownership resolver error: boom': 1 },
    })
    // Per-ROW classification accounting (two rows share the one mission).
    expect(mixed.classCounts.shipped_source_unresolved).toBe(2)
  })

  it('fences the exact source_slug on the SHIPPED lane only', () => {
    const unshippedFence = buildSourceStaleCasFence(row())
    const shippedFence = buildSourceStaleCasFence(shippedRow(), {
      lane: 'shipped_source_gone',
      sourceSlug: SHIPPED_SLUG,
    })
    expect(unshippedFence).toHaveLength(11)
    expect(shippedFence).toHaveLength(12)
    expect(shippedFence.slice(0, 11)).toEqual(unshippedFence)
    expect(shippedFence[11]).toEqual({
      op: 'eq',
      column: 'source_slug',
      value: SHIPPED_SLUG,
    })
  })

  it('writes only allowlisted reasons, and refuses a non-allowlisted one', () => {
    expect([...P6_SOURCE_STALE_GATE_REASONS]).toEqual([...REPORT_GATE_REASONS])
    for (const reason of P6_SOURCE_STALE_GATE_REASONS) {
      const patch = buildSourceStaleUpdatePatch({
        nowIso: '2026-09-21T12:00:00.000Z',
        gateReason: reason,
      })
      expect(patch.gate_reason).toBe(reason)
      expect(patch.gate_actor).toBe(P6_SOURCE_STALE_GATE_ACTOR)
      expect(Object.keys(patch).sort()).toEqual([
        'gate_actor',
        'gate_reason',
        'gate_updated_at',
        'status',
      ])
    }
    for (const forbidden of ['stale_target_http_404', 'looks-stale', '', '   ']) {
      expect(() =>
        buildSourceStaleUpdatePatch({ nowIso: 'T', gateReason: forbidden }),
      ).toThrow(/non-allowlisted gate_reason/)
    }
  })
})

describe('B) planning is deterministic, bounded and never fabricates identity', () => {
  const observations = { [LIVE_TARGET]: liveObservation, [DEAD_TARGET]: { status: 404, ok: false } }
  const context = {
    observations,
    missionPlans: {
      [SLUG]: neverShipped,
      [SHIPPED_SLUG]: { cluster_id: SHIPPED_SLUG, status: 'shipped', shipped_at: '2026-09-01T00:00:00.000Z' },
    },
  }

  it('orders (created_at, id), dedupes ids and caps the selection', () => {
    const rows = [
      row({ id: 'b', created_at: '2026-08-21T00:00:00.000Z' }),
      row({ id: 'a', created_at: '2026-08-20T00:00:00.000Z' }),
      row({ id: 'a', created_at: '2026-08-20T00:00:00.000Z' }),
      row({ id: 'c', created_at: '2026-08-22T00:00:00.000Z' }),
    ]
    expect(uniqueSourceStaleCandidatesById(rows).map((r) => r.id)).toEqual(['b', 'a', 'c'])
    expect(orderSourceStaleCandidates(rows).map((r) => r.id)).toEqual(['a', 'a', 'b', 'c'])

    const plan = planSourceStale(rows, context, { limit: 2 })
    expect(plan.scannedRows).toBe(3)
    expect(plan.eligibleRows).toBe(3)
    expect(plan.rowsBeyondLimit).toBe(1)
    expect(plan.selected.map((r) => r.id)).toEqual(['a', 'b'])
    expect(plan.selected[0]).toMatchObject({
      source_slug: SLUG,
      target_url: LIVE_TARGET,
      exactTarget: LIVE_TARGET,
      observedStatus: 200,
      gateReason: P6_SOURCE_STALE_GATE_REASON,
      mission: { clusterId: SLUG, status: 'planned', shippedAt: null },
    })
  })

  it('clamps the limit to the hard maximum and counts every ineligible class', () => {
    const rows = [
      row({ id: 'ok' }),
      row({ id: 'shipped', source_slug: SHIPPED_SLUG }),
      row({ id: 'dead', target_url: DEAD_TARGET }),
      row({ id: 'portal', target_url: PORTAL_TARGET }),
      row({ id: 'noncanonical', target_url: '/au/visa/' }),
      row({ id: 'withProof', applied_at: '2026-09-01T00:00:00.000Z' }),
      row({ id: 'unknown', source_slug: 'seo-x' }),
    ]
    const plan = planSourceStale(rows, context, { limit: 10_000 })
    expect(plan.selected).toHaveLength(1)
    expect(plan.classCounts).toMatchObject({
      eligible: 1,
      shipped_source_unresolved: 1,
      target_dead: 1,
      legacy_auth_wall: 1,
      noncanonical_target: 1,
      subject_fence_failed: 1,
      mission_plan_missing: 1,
    })
    // Five rows carry the exact live target (ok/shipped/portal/withProof/
    // unknown) EXCEPT the legacy Portal row, which carries its own target.
    // Four rows therefore answer 200 on the exact live target and one answers
    // the exact 404; the relative/noncanonical target is never probed.
    expect(plan.observedStatusCounts).toEqual({ '200': 4, '404': 1 })
  })

  it('writes exactly the rejected status plus audit metadata and nothing else', () => {
    const patch = buildSourceStaleUpdatePatch({ nowIso: '2026-09-21T12:00:00.000Z' })
    expect(patch).toEqual({
      status: 'rejected',
      gate_reason: P6_SOURCE_STALE_GATE_REASON,
      gate_actor: P6_SOURCE_STALE_GATE_ACTOR,
      gate_updated_at: '2026-09-21T12:00:00.000Z',
    })
    expect(Object.keys(patch).sort()).toEqual([
      'gate_actor',
      'gate_reason',
      'gate_updated_at',
      'status',
    ])
    for (const forbidden of [
      'source_url',
      'source_job_id',
      'verification_state',
      'verified_at',
      'verification_evidence',
      'verification_attempted_at',
      'staged_at',
      'applied_at',
    ]) {
      expect(patch).not.toHaveProperty(forbidden)
    }
  })

  it('fences the exact RAW stored target plus the eight NULL subject columns', () => {
    const padded = row({ target_url: `  ${LIVE_TARGET}  `, id: 'padded' })
    const fence = buildSourceStaleCasFence(padded)
    expect(fence[0]).toEqual({ op: 'eq', column: 'id', value: 'padded' })
    expect(fence[1]).toEqual({ op: 'eq', column: 'status', value: 'planned' })
    expect(fence[2]).toEqual({ op: 'eq', column: 'target_url', value: `  ${LIVE_TARGET}  ` })
    expect(fence.slice(3)).toEqual(
      [
        'source_url',
        'source_job_id',
        'verification_state',
        'verified_at',
        'applied_at',
        'verification_evidence',
        'verification_attempted_at',
        'staged_at',
      ].map((column) => ({ op: 'is', column, value: null })),
    )
    // The proof binding is the TRIMMED target, the CAS fence the RAW one.
    expect(padded.target_url).toContain(' ')
  })
})

describe('C) argv parsing: apply needs the exact token pair', () => {
  it('defaults to dry run and accepts bounded limits', () => {
    const parsed = parseSourceStaleArgs([])
    expect(parsed).toMatchObject({
      ok: true,
      config: { apply: false, confirm: null, limit: P6_SOURCE_STALE_DEFAULT_LIMIT },
    })
    expect(parseSourceStaleArgs(['--limit', '25'])).toMatchObject({ ok: true, config: { limit: 25 } })
    expect(parseSourceStaleArgs(['--limit=200'])).toMatchObject({ ok: true, config: { limit: 200 } })
  })

  it('refuses an out-of-range limit, unknown/duplicate flags and an orphan confirm', () => {
    for (const argv of [
      ['--limit', '0'],
      ['--limit', '201'],
      ['--limit', 'abc'],
      ['--nope'],
      ['--json', '--json'],
      ['--confirm', P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN],
      ['--apply'],
      ['--apply', '--confirm', 'WRONG'],
      ['--apply', '--confirm', ` ${P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN}`],
    ]) {
      expect(parseSourceStaleArgs(argv).ok).toBe(false)
    }
    expect(parseSourceStaleArgs(['--apply', '--confirm', P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN])).toMatchObject(
      { ok: true, config: { apply: true, confirm: P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN } },
    )
    expect(parseSourceStaleArgs(['--help'])).toMatchObject({ ok: true, config: { help: true } })
  })
})

describe('D) runner is fail-closed and dry run never writes', () => {
  function deps(overrides: Partial<P6SourceStaleRunnerDeps> = {}): P6SourceStaleRunnerDeps {
    return {
      readCandidates: async () => ({ rows: [row()], truncated: false }),
      readMissionPlans: async () => ({ plans: { [SLUG]: neverShipped } }),
      readLiveEstateUrls: async () => ({ urls: ['https://legal.yousafeconsultancy.com/au/visa/'] }),
      observeTargets: async (targets) =>
        Object.fromEntries(targets.map((t) => [t, liveObservation])),
      probeMissionJobIdentity: async () => ({ ok: true, resolvedSlugs: {} }),
      applyRejection: async () => {
        throw new Error('write must never be reached')
      },
      countStatuses: async () => ({ planned: 405, rejected: 1494, applied: 0 }),
      now: () => '2026-09-21T12:00:00.000Z',
      ...overrides,
    }
  }

  const config = { apply: false, confirm: null, limit: 50, json: false, help: false }

  it('dry run selects the eligible row and makes zero write calls', async () => {
    const summary = await runP6SourceStaleRejection(config, deps())
    expect(summary.failedClosed).toBe(false)
    expect(summary.eligibleRows).toBe(1)
    expect(summary.selected).toHaveLength(1)
    expect(summary.attemptedWrites).toBe(0)
    expect(summary.writeResults).toEqual([])
    expect(summary.before).toEqual({ planned: 405, rejected: 1494, applied: 0 })
    expect(summary.mode).toBe('dry-run')
    expect(summary.applyBlockers).toContain('mode is dry-run')
  })

  it('an unauthorized programmatic apply makes zero IO calls', async () => {
    const calls: string[] = []
    const summary = await runP6SourceStaleRejection(
      { ...config, apply: true, confirm: 'WRONG' },
      deps({
        readCandidates: async () => {
          calls.push('read')
          return { rows: [row()], truncated: false }
        },
        countStatuses: async () => {
          calls.push('count')
          return null
        },
      }),
    )
    expect(calls).toEqual([])
    expect(summary.failedClosed).toBe(true)
    expect(summary.attemptedWrites).toBe(0)
    expect(summary.selectedForWrite).toBe(0)
    expect(summary.writeResults).toEqual([])
    expect(summary.fatalErrors[0]).toMatch(/confirmation token/)
  })

  it('fails closed on read/guard/mission failures and on truncated reads', async () => {
    const cases: Array<Partial<P6SourceStaleRunnerDeps>> = [
      { readCandidates: async () => ({ rows: [row()], truncated: true }) },
      { readCandidates: async () => ({ rows: [], truncated: false, error: 'db down' }) },
      { readCandidates: async () => { throw new Error('db down') } },
      { readMissionPlans: async () => ({ plans: {}, error: 'mission read failed' }) },
      { readMissionPlans: async () => { throw new Error('mission read threw') } },
      { readLiveEstateUrls: async () => ({ urls: [], error: 'sitemap unavailable' }) },
      { readLiveEstateUrls: async () => { throw new Error('sitemap threw') } },
      { observeTargets: async () => ({}) },
      { observeTargets: async () => { throw new Error('verifier down') } },
    ]
    for (const override of cases) {
      const summary = await runP6SourceStaleRejection(config, deps(override))
      expect(summary.failedClosed).toBe(true)
      expect(summary.attemptedWrites).toBe(0)
      expect(summary.writeResults).toEqual([])
      expect(summary.fatalErrors.length).toBeGreaterThan(0)
    }
  })

  it('records an unavailable durable job-identity probe as an apply blocker', async () => {
    const summary = await runP6SourceStaleRejection(
      config,
      deps({
        probeMissionJobIdentity: async () => ({
          ok: false,
          error: 'permission denied for table content_jobs',
        }),
      }),
    )
    expect(summary.missionJobIdentityProbe).toMatchObject({
      available: false,
      error: 'permission denied for table content_jobs',
    })
    expect(summary.applyBlockers.join(' ')).toMatch(/exclusion probe unavailable/)
    expect(summary.selected).toHaveLength(1)
    expect(summary.attemptedWrites).toBe(0)
  })

  it('apply refuses to write while the durable exclusion probe is unavailable', async () => {
    const summary = await runP6SourceStaleRejection(
      { ...config, apply: true, confirm: P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN },
      deps({ probeMissionJobIdentity: async () => ({ ok: false, error: 'permission denied' }) }),
    )
    expect(summary.failedClosed).toBe(true)
    expect(summary.attemptedWrites).toBe(0)
    expect(summary.fatalErrors[0]).toMatch(/exclusion probe/)
  })

  it('apply writes the exact CAS patch and counts races as skips', async () => {
    const writes: Array<Record<string, unknown>> = []
    const rows = [row({ id: 'one' }), row({ id: 'two', created_at: '2026-08-21T00:00:00.000Z' })]
    const summary = await runP6SourceStaleRejection(
      { ...config, apply: true, confirm: P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN },
      deps({
        readCandidates: async () => ({ rows, truncated: false }),
        applyRejection: async (write) => {
          writes.push({ id: write.id, patch: write.patch, fence: write.fence })
          return { affected: write.id === 'one' ? 1 : 0 }
        },
        countStatuses: async () => ({ planned: 403, rejected: 1496, applied: 0 }),
      }),
    )
    expect(summary.failedClosed).toBe(false)
    expect(summary.rejectedWrites).toBe(1)
    expect(summary.casSkips).toBe(1)
    expect(summary.attemptedWrites).toBe(2)
    expect(writes).toHaveLength(2)
    expect(Object.keys(writes[0].patch as Record<string, string>).sort()).toEqual([
      'gate_actor',
      'gate_reason',
      'gate_updated_at',
      'status',
    ])
    expect(summary.after).toEqual({ planned: 403, rejected: 1496, applied: 0 })
  })

  it('aborts on the first write error and never reports it as success', async () => {
    const summary = await runP6SourceStaleRejection(
      { ...config, apply: true, confirm: P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN },
      deps({
        readCandidates: async () => ({
          rows: [row({ id: 'one' }), row({ id: 'two', created_at: '2026-08-21T00:00:00.000Z' })],
          truncated: false,
        }),
        applyRejection: async () => ({ affected: 0, error: 'permission denied' }),
      }),
    )
    expect(summary.aborted).toBe(true)
    expect(summary.rejectedWrites).toBe(0)
    expect(summary.attemptedWrites).toBe(1)
    expect(summary.notAttemptedWrites).toBe(1)
    expect(summary.fatalErrors[0]).toMatch(/write failed/)
  })

  it('is idempotent: an already-rejected row is not a candidate any more', async () => {
    const summary = await runP6SourceStaleRejection(
      config,
      deps({ readCandidates: async () => ({ rows: [row({ status: 'rejected' })], truncated: false }) }),
    )
    expect(summary.eligibleRows).toBe(0)
    expect(summary.classCounts.subject_fence_failed).toBe(1)
    expect(summary.selectedForWrite).toBe(0)
  })
})

describe('D2) shipped-source lane through the runner (fail-closed, dry-run safe)', () => {
  const config = { apply: false, confirm: null, limit: 200, json: false, help: false }
  const shippedRow = row({ id: 'shipped-1', source_slug: SHIPPED_SLUG })

  function deps(overrides: Partial<P6SourceStaleRunnerDeps> = {}): P6SourceStaleRunnerDeps {
    return {
      readCandidates: async () => ({ rows: [shippedRow], truncated: false }),
      readMissionPlans: async () => ({ plans: { [SHIPPED_SLUG]: shippedPlan } }),
      readLiveEstateUrls: async () => ({ urls: [] }),
      resolveShippedSources: async () => ({ [SHIPPED_SLUG]: shippedResolution }),
      probeSourceUrls: async () => ({ [SHIPPED_SOURCE]: { status: 404, ok: false } }),
      observeTargets: async (targets) =>
        Object.fromEntries(targets.map((t) => [t, liveObservation])),
      probeMissionJobIdentity: async () => ({ ok: true, resolvedSlugs: {} }),
      applyRejection: async () => {
        throw new Error('write must never be reached')
      },
      countStatuses: async () => ({ planned: 405, rejected: 1494, applied: 0 }),
      now: () => '2026-09-21T12:00:00.000Z',
      ...overrides,
    }
  }

  it('dry run selects the shipped row with the status-derived reason and zero writes', async () => {
    const summary = await runP6SourceStaleRejection(config, deps())
    expect(summary.failedClosed).toBe(false)
    expect(summary.selectionByReason).toEqual({ [P6_SOURCE_STALE_REASON_HTTP_404]: 1 })
    expect(summary.laneCounts).toEqual({ unshipped_mission: 0, shipped_source_gone: 1 })
    expect(summary.sourceStatusCounts).toEqual({ '404': 1 })
    expect(summary.shippedSourceResolution).toEqual({
      attempted: 1,
      resolved: 1,
      unresolved: 0,
      unresolvedReasons: {},
    })
    expect(summary.attemptedWrites).toBe(0)
    expect(summary.writeResults).toEqual([])
    expect(summary.selected[0]).toMatchObject({
      lane: 'shipped_source_gone',
      gateReason: P6_SOURCE_STALE_REASON_HTTP_404,
      source: { url: SHIPPED_SOURCE, rawStatus: 404, resolver: 'resolveOwner' },
    })
  })

  it('a live shipped source and a self-target are both left untouched', async () => {
    const live = await runP6SourceStaleRejection(
      config,
      deps({
        probeSourceUrls: async () => ({ [SHIPPED_SOURCE]: { status: 200, ok: true } }),
      }),
    )
    expect(live.selectedForWrite).toBe(0)
    expect(live.classCounts.shipped_source_live).toBe(1)
    expect(live.sourceStatusCounts).toEqual({ '200': 1 })

    const selfTarget = await runP6SourceStaleRejection(
      config,
      deps({
        readCandidates: async () => ({
          rows: [row({ id: 'self', source_slug: SHIPPED_SLUG, target_url: SHIPPED_SOURCE })],
          truncated: false,
        }),
        observeTargets: async () => ({ [SHIPPED_SOURCE]: liveObservation }),
      }),
    )
    expect(selfTarget.selectedForWrite).toBe(0)
    expect(selfTarget.classCounts.shipped_source_self_target).toBe(1)
  })

  it('fails closed when the ownership resolver or the source probe throws', async () => {
    for (const override of [
      {
        resolveShippedSources: async () => {
          throw new Error('registry unavailable')
        },
      },
      {
        probeSourceUrls: async () => {
          throw new Error('source verifier down')
        },
      },
    ]) {
      const summary = await runP6SourceStaleRejection(config, deps(override))
      expect(summary.failedClosed).toBe(true)
      expect(summary.selectedForWrite).toBe(0)
      expect(summary.attemptedWrites).toBe(0)
      expect(summary.fatalErrors.length).toBeGreaterThan(0)
    }
  })

  it('without a resolver dependency the shipped lane selects nothing and is visible', async () => {
    const summary = await runP6SourceStaleRejection(
      config,
      deps({ resolveShippedSources: undefined, probeSourceUrls: undefined }),
    )
    expect(summary.selectedForWrite).toBe(0)
    expect(summary.shippedSourceResolution.attempted).toBe(1)
    expect(summary.shippedSourceResolution.resolved).toBe(0)
    expect(summary.applyBlockers.join(' ')).toMatch(/shipped-source class is unavailable/)
    expect(summary.classCounts.shipped_source_unresolved).toBe(1)
  })

  it('apply writes the shipped reason with the extra source_slug CAS fence', async () => {
    const writes: Array<Record<string, unknown>> = []
    const summary = await runP6SourceStaleRejection(
      { ...config, apply: true, confirm: P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN },
      deps({
        applyRejection: async (write) => {
          writes.push({ patch: write.patch, fence: write.fence })
          return { affected: 0 }
        },
      }),
    )
    expect(summary.casSkips).toBe(1)
    expect(summary.rejectedWrites).toBe(0)
    expect(writes).toHaveLength(1)
    expect(writes[0].patch).toMatchObject({
      status: 'rejected',
      gate_reason: P6_SOURCE_STALE_REASON_HTTP_404,
      gate_actor: P6_SOURCE_STALE_GATE_ACTOR,
    })
    const fence = writes[0].fence as Array<{ op: string; column: string; value: unknown }>
    expect(fence[fence.length - 1]).toEqual({
      op: 'eq',
      column: 'source_slug',
      value: SHIPPED_SLUG,
    })
  })
})

describe('E) CLI boundary refuses unauthorized writes before any client', () => {
  const baseDeps = {
    argv: [] as string[],
    readSupabaseUrl: () => 'https://example.supabase.co',
    resolveReadKey: () => 'read-key',
    resolveApplyAuthority: () => ({ ok: false as const, error: 'supabaseAuthMode()=degraded-anon' }),
    createClient: () => {
      throw new Error('client must not be created')
    },
    readCandidates: async () => ({ rows: [], truncated: false }),
    readMissionPlans: async () => ({ plans: {} }),
    readLiveEstateUrls: async () => ({ urls: [] }),
    probeMissionJobIdentity: async () => ({ ok: true, resolvedSlugs: {} }),
    resolveShippedSources: async () => ({}),
    probeSourceUrls: async () => ({}),
    observeTargets: async () => ({}),
    applyRejection: async () => ({ affected: 0 }),
    countStatuses: async () => null,
  }

  it('refuses bad argv with exit 2 and zero clients', async () => {
    const result = await runP6SourceStaleCliBoundary({
      ...baseDeps,
      argv: ['--apply', '--confirm', 'WRONG'],
      stdout: () => {},
      stderr: () => {},
    })
    expect(result.exitCode).toBe(2)
    expect(result.summary).toBeNull()
  })

  it('refuses apply without service-role authority with exit 1 and zero clients', async () => {
    const result = await runP6SourceStaleCliBoundary({
      ...baseDeps,
      argv: ['--apply', '--confirm', P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN],
      stdout: () => {},
      stderr: () => {},
    })
    expect(result.exitCode).toBe(1)
    expect(result.summary).toBeNull()
  })

  it('runs a dry run through the injected client', async () => {
    const lines: string[] = []
    const result = await runP6SourceStaleCliBoundary({
      ...baseDeps,
      createClient: () => ({}),
      stdout: (line) => lines.push(line),
      stderr: () => {},
    })
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(lines[0]).tool).toBe('p6-source-stale-rejection')
  })

  it('prints usage for --help without resolving anything', async () => {
    const lines: string[] = []
    const result = await runP6SourceStaleCliBoundary({
      ...baseDeps,
      argv: ['--help'],
      resolveReadKey: () => {
        throw new Error('must not resolve a key')
      },
      stdout: (line) => lines.push(line),
      stderr: () => {},
    })
    expect(result.exitCode).toBe(0)
    expect(lines[0]).toMatch(/P6 Batch B/)
  })

  it('wires the shipped-source lane through the boundary (dry run, no writes)', async () => {
    const lines: string[] = []
    const result = await runP6SourceStaleCliBoundary({
      ...baseDeps,
      argv: ['--limit', '200'],
      createClient: () => ({}),
      readCandidates: async () => ({
        rows: [row({ id: 'shipped-1', source_slug: SHIPPED_SLUG })],
        truncated: false,
      }),
      readMissionPlans: async () => ({ plans: { [SHIPPED_SLUG]: shippedPlan } }),
      resolveShippedSources: async () => ({ [SHIPPED_SLUG]: shippedResolution }),
      probeSourceUrls: async () => ({ [SHIPPED_SOURCE]: { status: 404, ok: false } }),
      observeTargets: async () => ({ [LIVE_TARGET]: liveObservation }),
      stdout: (line) => lines.push(line),
      stderr: () => {},
    })
    expect(result.exitCode).toBe(0)
    const summary = JSON.parse(lines[0])
    expect(summary.selectionByReason).toEqual({ [P6_SOURCE_STALE_REASON_HTTP_404]: 1 })
    expect(summary.attemptedWrites).toBe(0)
  })
})

describe('F) static contract: no write verb, no applied/proof fabrication, bounded', () => {
  const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

  it('the pure module and the runner contain no DB/write surface at all', () => {
    for (const file of [
      'scripts/p6SourceStaleRejection.ts',
      'scripts/p6SourceStaleRejectionRunner.ts',
      'scripts/p6SourceStaleCliBoundary.ts',
    ]) {
      const body = read(file)
      expect(body).not.toMatch(/@supabase\/supabase-js/)
      expect(body).not.toMatch(/\.(update|upsert|insert|delete|rpc)\s*\(/)
      // No environment read at all (the doc text may *say* `process.env`).
      expect(body).not.toMatch(/process\.env\s*(?:\.|\[)/)
      expect(body).not.toMatch(/status:\s*'applied'/)
    }
  })

  it('the CLI wrapper writes only the fenced rejected disposition', () => {
    const body = read('scripts/p6-source-stale-rejection.mts')
    expect(body).toMatch(/update\(write\.patch\)/)
    expect(body).toContain(".select('id')")
    expect(body).toMatch(
      /entry\.op === 'eq' \? query\.eq\(entry\.column, entry\.value\) : query\.is\(entry\.column, null\)/,
    )
    expect(body).not.toMatch(/status:\s*'applied'/)
    expect(body).not.toMatch(/\.(upsert|insert|delete|rpc)\s*\(/)
    expect(body).not.toMatch(/retarget\s*\(/)
    expect(body).toContain('does not retarget')
    expect(body).toContain('stale_source_unshipped_mission')
    // Apply authority is the SHARED P6 decision, not a second implementation.
    expect(body).toContain('resolveP6BatchAApplyAuthority')
    // The durable exclusion probe must fail apply closed when incomplete.
    expect(body).toMatch(/exclusion proof incomplete/)
  })

  it('the CLI wrapper wires the REAL deterministic resolver and the GET-only source authority', () => {
    const body = read('scripts/p6-source-stale-rejection.mts')
    // Deterministic ownership resolution: the repository resolver, fed exactly
    // the durable mission inputs, fail-closed on every non-canonical outcome.
    expect(body).toContain("from '../lib/seoFactory/ownership'")
    expect(body).toMatch(/resolveOwner\(\{\s*primaryKeyword,\s*contentType,\s*region\s*\}\)/)
    expect(body).toContain('ownership resolver returned no canonical source URL')
    expect(body).toContain('ownership resolver resolved outside the estate host set')
    expect(body).toContain('isEstateUrl')
    // Fresh GET-only proof of the resolved source URL: no shared HEAD cache, no
    // URL synthesis — a raw 404/410 is the only thing that can select.
    expect(body).toContain('verifyUrlsLiveGet')
    expect(body).toMatch(/const results = await verifyUrlsLiveGet\(urls\)/)
    // The mission read carries the resolver inputs (nothing inferred from slug).
    expect(body).toContain('P6_SOURCE_STALE_MISSION_COLUMNS')
  })

  it('the hard maximum and the exact confirmation token are pinned', () => {
    const body = read('scripts/p6SourceStaleRejection.ts')
    expect(P6_SOURCE_STALE_HARD_MAX_ROWS).toBe(200)
    expect(P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN).toBe('REJECT-BATCH-B-SOURCE-STALE')
    expect(body).toContain("P6_SOURCE_STALE_APPLY_CONFIRM_TOKEN = 'REJECT-BATCH-B-SOURCE-STALE'")
  })
})

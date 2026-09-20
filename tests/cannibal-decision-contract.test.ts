/**
 * P4 destructive decision contract — pure validator coverage.
 *
 * Locks the fail-closed rules that keep the historical destructive path (winner
 * by impressions, zero-metric inventory evidence, broad/unrelated loser sets)
 * from ever reaching a Git write again.
 */

import {
  ABSENT_FILE_SHA,
  MAX_P4_LOSERS,
  cannibalIdentity,
  cannibalIdentityFamily,
  cannibalIdentityRelation,
  computeCannibalEvidenceHash,
  sameCannibalIdentity,
  validateCannibalDecision,
  type CannibalCompetitorEvidence,
  type CannibalDecisionRecord,
} from '@/lib/seoFactory/cannibalDecision'
import type { OwnershipRow } from '@/lib/seoFactory/ownership'

const OWNER = 'https://legal.yousafeconsultancy.com/au/english-language-requirements-student-485/'
const LOSER = 'https://legal.yousafeconsultancy.com/au/485-visa-ielts-general-or-academic/'
const REDIRECT_SHA = '0123456789abcdef0123456789abcdef01234567'

const ownerRow: OwnershipRow = {
  id: 59,
  primary_keyword: 'australia 485 english requirements',
  intent_class: 'procedural',
  owner_host: 'legal',
  owner_url: OWNER,
  supporting_urls: [],
  action: 'expand',
  market_destination: null,
  status: 'confirmed',
  notes: 'fixture',
}

const shared = { query: '485 english requirements australia', impressions: 20, clicks: 1, position: 8 }

function competitor(overrides: Partial<CannibalCompetitorEvidence> = {}): CannibalCompetitorEvidence {
  return {
    url: LOSER,
    impressions: 20,
    clicks: 1,
    position: 9,
    primaryIntent: 'Australia subclass 485 IELTS English requirements',
    sharedQueries: [shared],
    ...overrides,
  }
}

/** Build a decision whose evidence hash matches its contents. */
function decision(overrides: Partial<CannibalDecisionRecord> = {}): CannibalDecisionRecord {
  const base = {
    clusterId: 'p4-au-485-english',
    term: 'australia 485 english requirements',
    evidenceSource: 'persisted_qualified_gsc',
    evidenceWindow: {
      startDate: '2026-06-22',
      endDate: '2026-09-19',
      capturedAt: '2026-09-20T05:39:02Z',
    },
    evidenceHash: '',
    competitors: [
      {
        url: OWNER,
        impressions: 45,
        clicks: 2,
        position: 7,
        primaryIntent: 'Australia subclass 485 English requirements',
        sharedQueries: [shared],
      },
      competitor(),
    ],
    primaryIntentComparison: 'Both pages answer the same subclass 485 English-test requirement intent.',
    authoritativeOwner: {
      registryRowId: 59,
      ownerUrl: OWNER,
      status: 'confirmed',
      action: 'expand',
      intentClass: 'procedural',
    },
    winnerUrl: OWNER,
    backlinks: { status: 'unknown', note: 'No backlink snapshot available.' },
    internalLinks: { status: 'known', count: 2 },
    loserActions: [{ url: LOSER, action: 'redirect_301', target: OWNER }],
    rollback: {
      files: [{ repo: 'caseworks', path: 'public/_redirects', sha: REDIRECT_SHA }],
      restoreInstructions: 'Revert the PR commit and restore the recorded file SHA.',
    },
    decidedBy: 'seo-supervisor',
    decidedAt: '2026-09-20T08:00:00Z',
    ...overrides,
  } as CannibalDecisionRecord
  base.evidenceHash = computeCannibalEvidenceHash(base)
  return base
}

function blockersOf(d: CannibalDecisionRecord, rows: OwnershipRow[] = [ownerRow]): string {
  return validateCannibalDecision(d, rows).blockers.join(' ')
}

describe('P4 cannibal decision contract', () => {
  it('accepts a complete evidence record whose winner is the authoritative owner', () => {
    expect(validateCannibalDecision(decision(), [ownerRow])).toMatchObject({ ok: true, blockers: [] })
  })

  it('requires a decision object', () => {
    expect(validateCannibalDecision(null, [ownerRow]).blockers).toEqual(['decision_required'])
    expect(validateCannibalDecision(undefined, [ownerRow]).blockers).toEqual(['decision_required'])
  })

  it('never coerces missing metrics to zero — unavailable metrics block', () => {
    const d = decision()
    d.competitors[1] = competitor({ impressions: null as unknown as number })
    expect(blockersOf(d)).toContain('metrics_unavailable')
    expect(blockersOf(d)).not.toContain('real_impressions_required')
    expect(validateCannibalDecision(d, [ownerRow]).ok).toBe(false)
  })

  it('blocks zero impressions and zero position as real-evidence violations', () => {
    const zeroImpressions = decision()
    zeroImpressions.competitors[1] = competitor({ impressions: 0 })
    expect(blockersOf(zeroImpressions)).toContain('real_impressions_required')
    const zeroPosition = decision()
    zeroPosition.competitors[1] = competitor({ position: 0 })
    expect(blockersOf(zeroPosition)).toContain('real_position_required')
  })

  it('requires qualified GSC evidence source and an explicit window', () => {
    expect(blockersOf(decision({ evidenceSource: 'content_inventory' as never }))).toContain('qualified_gsc_evidence_required')
    const noWindow = decision()
    noWindow.evidenceWindow = { startDate: '', endDate: '', capturedAt: '' }
    expect(blockersOf(noWindow)).toContain('evidence_window_required')
    const inverted = decision({ evidenceWindow: { startDate: '2026-09-19', endDate: '2026-06-22', capturedAt: '2026-09-20T05:39:02Z' } })
    expect(blockersOf(inverted)).toContain('evidence_window_inverted')
    const futureCapture = decision({ evidenceWindow: { startDate: '2026-06-22', endDate: '2026-09-19', capturedAt: '2026-09-21T05:39:02Z' } })
    expect(blockersOf(futureCapture)).toContain('evidence_captured_after_decision')
  })

  it('rejects unqualified shared queries even when a second page exists', () => {
    const d = decision()
    d.competitors = d.competitors.map((c) => ({
      ...c,
      sharedQueries: [{ query: 'random parking', impressions: 1, clicks: 0, position: 90 }],
    }))
    const blockers = blockersOf(d)
    expect(validateCannibalDecision(d, [ownerRow]).ok).toBe(false)
    expect(blockers).toMatch(/unqualified_shared_query_evidence|winner_has_no_qualified_shared_query/)
  })

  it('requires exact qualified query overlap, not merely two pages per term', () => {
    const d = decision()
    d.competitors[1] = competitor({
      sharedQueries: [{ query: 'subclass 485 english test requirements', impressions: 30, clicks: 2, position: 6 }],
    })
    expect(blockersOf(d)).toContain('no_exact_qualified_query_overlap')
  })

  it('blocks a non-authoritative P3 owner row (build/proposed/section root)', () => {
    expect(blockersOf(decision(), [{ ...ownerRow, action: 'build' }])).toContain('authoritative_p3_owner_required')
    expect(blockersOf(decision(), [{ ...ownerRow, status: 'proposed' }])).toContain('authoritative_p3_owner_required')
    expect(blockersOf(decision(), [{ ...ownerRow, owner_url: 'https://legal.yousafeconsultancy.com/au/' }]))
      .toContain('authoritative_p3_owner_required')
  })

  it('never lets impressions pick the winner — winner must equal the P3 owner', () => {
    const d = decision()
    d.competitors[1] = competitor({ impressions: 900, clicks: 40, position: 3 })
    d.winnerUrl = LOSER
    d.loserActions = [{ url: LOSER, action: 'redirect_301', target: OWNER }]
    const blockers = blockersOf(d)
    expect(blockers).toContain('winner_must_equal_authoritative_owner')
    expect(validateCannibalDecision(d, [ownerRow]).ok).toBe(false)
  })

  it('requires the winner to be a competitor with qualified shared evidence', () => {
    const d = decision({ winnerUrl: 'https://legal.yousafeconsultancy.com/au/other-page/' })
    expect(blockersOf(d)).toContain('winner_must_be_competitor')
  })

  it('requires rollback files, restore instructions, and full SHAs', () => {
    const missing = decision()
    missing.rollback = { files: [], restoreInstructions: 'x' }
    expect(blockersOf(missing)).toContain('rollback_snapshot_required')
    const noInstructions = decision()
    noInstructions.rollback = { files: [{ repo: 'caseworks', path: 'public/_redirects', sha: REDIRECT_SHA }], restoreInstructions: '' }
    expect(blockersOf(noInstructions)).toContain('rollback_snapshot_required')
    const shortSha = decision()
    shortSha.rollback = { files: [{ repo: 'caseworks', path: 'public/_redirects', sha: 'deadbeef' }], restoreInstructions: 'revert' }
    expect(blockersOf(shortSha)).toContain('rollback_sha_invalid:caseworks:public/_redirects')
    const absent = decision()
    absent.rollback = { files: [{ repo: 'caseworks', path: 'public/_redirects', sha: ABSENT_FILE_SHA }], restoreInstructions: 'revert' }
    absent.evidenceHash = computeCannibalEvidenceHash(absent)
    expect(validateCannibalDecision(absent, [ownerRow]).ok).toBe(true)
  })

  it('rejects an unactionable loser target (no redirect convention / no editable source)', () => {
    const marketLoser = 'https://market.yousafeconsultancy.com/gigs/f1-resume-review'
    const d = decision({
      loserActions: [{ url: marketLoser, action: 'redirect_301', target: OWNER }],
    })
    d.competitors[1] = competitor({ url: marketLoser, primaryIntent: 'subclass 485 English requirements' })
    expect(blockersOf(d)).toContain('unactionable_loser')
    const noindexLegal = decision({
      loserActions: [{ url: LOSER, action: 'noindex_canonical', target: OWNER }],
    })
    expect(blockersOf(noindexLegal)).toContain('unactionable_loser')
  })

  it('requires every loser to carry an explicit action targeting the winner', () => {
    const missingAction = decision({ loserActions: [] })
    expect(blockersOf(missingAction)).toContain('loser_actions_required')
    const wrongTarget = decision({ loserActions: [{ url: LOSER, action: 'redirect_301', target: LOSER }] })
    expect(blockersOf(wrongTarget)).toContain('loser_target_must_equal_winner')
  })

  it('caps a single decision at MAX_P4_LOSERS reviewable losers', () => {
    const losers = Array.from({ length: MAX_P4_LOSERS + 1 }, (_, index) => `https://legal.yousafeconsultancy.com/au/485-english-loser-${index}/`)
    const d = decision({
      competitors: [
        { url: OWNER, impressions: 45, clicks: 2, position: 7, primaryIntent: 'Australia subclass 485 English requirements', sharedQueries: [shared] },
        ...losers.map((url, index) => competitor({ url, impressions: 10 + index, clicks: 0, position: 10 + index })),
      ],
      loserActions: losers.map((url) => ({ url, action: 'redirect_301' as const, target: OWNER })),
    })
    expect(blockersOf(d)).toContain(`loser_set_exceeds_review_cap:${MAX_P4_LOSERS}`)
  })

  it('detects evidence tampering via the evidence hash', () => {
    const d = decision()
    d.competitors[1].impressions = 5000
    expect(blockersOf(d)).toContain('evidence_hash_mismatch')
    const missingHash = decision()
    missingHash.evidenceHash = ''
    expect(blockersOf(missingHash)).toContain('evidence_hash_required')
  })

  it('requires a human operator identity and a decision timestamp', () => {
    expect(blockersOf(decision({ decidedBy: 'auto' }))).toContain('operator_identity_required')
    expect(blockersOf(decision({ decidedBy: '' }))).toContain('decided_by_required')
    expect(blockersOf(decision({ decidedAt: '' }))).toContain('decided_at_required')
  })

  it('represents backlink/internal-link evidence as honestly known or unknown', () => {
    expect(blockersOf(decision({ backlinks: undefined as never }))).toContain('backlinks_evidence_required')
    expect(blockersOf(decision({ backlinks: { status: 'known' } }))).toContain('backlinks_count_required')
    expect(validateCannibalDecision(decision({ backlinks: { status: 'unknown' } }), [ownerRow]).ok).toBe(true)
  })

  it('rejects junk terms', () => {
    expect(blockersOf(decision({ term: 'rates final.pdf pacific.edu/sites/default/files' }))).toContain('term_not_actionable')
  })
})

describe('P4 unique P3 authority across the competitor set', () => {
  const row = (overrides: Partial<OwnershipRow>): OwnershipRow => ({
    ...ownerRow,
    id: 90,
    owner_url: LOSER,
    ...overrides,
  })

  it('accepts exactly one authoritative row that owns a competing URL', () => {
    const r = validateCannibalDecision(decision(), [ownerRow])
    expect(r.ok).toBe(true)
    expect(r.blockers).not.toContain('p3_authority_missing')
    expect(r.blockers).not.toContain('p3_authority_ambiguous')
  })

  it('fails closed with p3_authority_missing when no authoritative row applies', () => {
    const empty = validateCannibalDecision(decision(), [])
    expect(empty.ok).toBe(false)
    expect(empty.blockers).toContain('p3_authority_missing')

    // A registry that only knows unrelated rows is still "missing" authority
    // for this competitor set — an operator cannot borrow another row's mandate.
    const unrelated = validateCannibalDecision(decision(), [
      row({ id: 91, owner_url: 'https://legal.yousafeconsultancy.com/au/other-page/' }),
    ])
    expect(unrelated.ok).toBe(false)
    expect(unrelated.blockers).toContain('p3_authority_missing')
  })

  it('fails closed with p3_authority_ambiguous when two authoritative rows claim the set', () => {
    const secondOwner = row({ id: 92, primary_keyword: 'australia 485 ielts', action: 'keep' })
    const r = validateCannibalDecision(decision(), [ownerRow, secondOwner])
    expect(r.ok).toBe(false)
    expect(r.blockers).toContain('p3_authority_ambiguous')
    expect(r.blockers).not.toContain('p3_authority_missing')
  })

  it('counts supporting-url claims as competing authority', () => {
    const supportingClaim = row({ id: 93, supporting_urls: [OWNER] })
    const r = validateCannibalDecision(decision(), [ownerRow, supportingClaim])
    expect(r.ok).toBe(false)
    expect(r.blockers).toContain('p3_authority_ambiguous')
  })

  it('ignores non-authoritative duplicates — proposed/build rows never contest authority', () => {
    const proposed = row({ id: 94, status: 'proposed' })
    const build = row({ id: 95, action: 'build' })
    expect(validateCannibalDecision(decision(), [ownerRow, proposed, build]).ok).toBe(true)
  })

  it('requires the winner to equal the unique authority owner even when the declared row differs', () => {
    // The only authoritative row for this competitor set owns the LOSER page,
    // while the decision declares an unrelated authoritative row and keeps the
    // original winner: the unique authority wins the argument and blocks it.
    const declared = row({ id: 96, owner_url: 'https://legal.yousafeconsultancy.com/au/unrelated-authoritative-page/' })
    const authority = row({ id: 59 })
    const d = decision({
      authoritativeOwner: {
        registryRowId: 96,
        ownerUrl: declared.owner_url,
        status: 'confirmed',
        action: 'expand',
        intentClass: 'procedural',
      },
    })
    const r = validateCannibalDecision(d, [declared, authority])
    expect(r.ok).toBe(false)
    expect(r.blockers).toContain('winner_must_equal_unique_p3_authority')
    expect(r.blockers).toContain('authoritative_owner_must_be_unique_p3_authority')
    expect(r.blockers).not.toContain('p3_authority_ambiguous')
  })
})

describe('P4 historical regression — Canada spouse over-expansion', () => {
  it('rejects the historical broad loser set spanning unrelated markets and intents', () => {
    const canadaOwner = 'https://ca.yousafeconsultancy.com/canada-spouse-visa/'
    const canadaRow: OwnershipRow = {
      ...ownerRow,
      id: 71,
      owner_host: 'ca',
      owner_url: canadaOwner,
      primary_keyword: 'canada spouse visa',
      intent_class: 'procedural',
    }
    const unrelatedLosers = [
      'https://legal.yousafeconsultancy.com/au/485-visa-ielts-general-or-academic/',
      'https://usa.yousafeconsultancy.com/opt-application/',
      'https://uk.yousafeconsultancy.com/dependent-visa-guide/',
      'https://yousafeconsultancy.com/blog/f1-visa-requirements-2026/',
      'https://ca.yousafeconsultancy.com/express-entry-draws-2026/',
      'https://legal.yousafeconsultancy.com/uk/skilled-worker-dependants/',
    ]
    const d = decision({
      clusterId: 'cluster_canada_spouse',
      term: 'canada spouse visa',
      competitors: [
        { url: canadaOwner, impressions: 300, clicks: 12, position: 5, primaryIntent: 'Canada spousal sponsorship', sharedQueries: [{ query: 'canada spouse visa requirements', impressions: 300, clicks: 12, position: 5 }] },
        ...unrelatedLosers.map((url, index) => competitor({
          url,
          impressions: 20 + index,
          clicks: 1,
          position: 9 + index,
          primaryIntent: 'unrelated immigration intent',
          sharedQueries: [{ query: `canada spouse visa requirements ${index}`, impressions: 20, clicks: 1, position: 9 }],
        })),
      ],
      authoritativeOwner: { registryRowId: 71, ownerUrl: canadaOwner, status: 'confirmed', action: 'expand', intentClass: 'procedural' },
      winnerUrl: canadaOwner,
      loserActions: unrelatedLosers.map((url) => ({ url, action: 'redirect_301' as const, target: canadaOwner })),
      rollback: { files: [{ repo: 'caseworks', path: 'public/_redirects', sha: REDIRECT_SHA }], restoreInstructions: 'revert' },
    })
    const validation = validateCannibalDecision(d, [canadaRow])
    expect(validation.ok).toBe(false)
    expect(validation.blockers.join(' ')).toMatch(/no_exact_qualified_query_overlap/)
    expect(validation.blockers.join(' ')).toMatch(/loser_set_exceeds_review_cap/)
    expect(validation.blockers.join(' ')).toMatch(/unactionable_loser/)
  })
})

describe('P4 identity separation — AU 485 vs US I-485, UK routes, and the F-1/OPT/STEM family', () => {
  it('keeps AU subclass 485 separate from US I-485 adjustment of status', () => {
    expect(sameCannibalIdentity('Australia subclass 485 temporary graduate', 'US I-485 adjustment of status')).toBe(false)
    expect(sameCannibalIdentity('485 visa english requirements australia', 'us i-485 adjustment of status')).toBe(false)
    expect(cannibalIdentity('Australia subclass 485 temporary graduate')).toBe('au_485')
    expect(cannibalIdentity('US I-485 adjustment of status')).toBe('us_i485')
    expect(cannibalIdentityRelation('australia subclass 485 english', 'us i-485 adjustment of status')).toBe('unrelated')
  })

  it('keeps Express Entry/CRS separate from UK and AU intents', () => {
    expect(sameCannibalIdentity('express entry crs draw', 'uk skilled worker visa')).toBe(false)
    expect(sameCannibalIdentity('express entry crs draw', 'australia subclass 485 english')).toBe(false)
  })

  it('recognises F-1/CPT, OPT and STEM OPT as related but destructive-distinct', () => {
    expect(cannibalIdentity('f-1 cpt sevis rules')).toBe('us_f1')
    expect(cannibalIdentity('optional practical training application')).toBe('us_opt')
    expect(cannibalIdentity('stem opt i-983 training plan')).toBe('us_stem_opt')
    // Related (one handoff family) …
    expect(cannibalIdentityFamily('us_f1')).toBe('us_student_work')
    expect(cannibalIdentityFamily('us_opt')).toBe('us_student_work')
    expect(cannibalIdentityFamily('us_stem_opt')).toBe('us_student_work')
    expect(cannibalIdentityRelation('f-1 visa rights', 'opt application guide')).toBe('related_distinct')
    // … but never interchangeable in a destructive consolidation.
    expect(sameCannibalIdentity('f-1 opt extension', 'stem opt i-983')).toBe(false)
    expect(sameCannibalIdentity('opt application', 'f-1 cpt sevis')).toBe(false)
    expect(sameCannibalIdentity('opt application', 'stem opt i-983')).toBe(false)
    expect(sameCannibalIdentity('f-1 cpt sevis', 'f-1 visa rights')).toBe(true)
  })

  it('treats a blob that names two US student-work sub-intents at once as ambiguous', () => {
    expect(cannibalIdentity('f-1 visa rights and opt eligibility')).toBe('us_student_work_mixed')
    expect(sameCannibalIdentity('f-1 visa rights and opt eligibility', 'optional practical training application')).toBe(false)
    expect(cannibalIdentityRelation('f-1 visa rights and opt eligibility', 'optional practical training')).toBe('ambiguous')
  })

  it('treats UK Student / Graduate / Skilled Worker / dependant as destructive-distinct', () => {
    expect(cannibalIdentity('uk student visa requirements')).toBe('uk_student')
    expect(cannibalIdentity('uk graduate visa route')).toBe('uk_graduate')
    expect(cannibalIdentity('uk skilled worker visa')).toBe('uk_skilled_worker')
    expect(cannibalIdentity('uk skilled worker dependant visa')).toBe('uk_dependant')
    expect(cannibalIdentityRelation('uk skilled worker visa', 'uk skilled worker dependant visa')).toBe('related_distinct')
    expect(sameCannibalIdentity('uk skilled worker dependant visa', 'uk skilled worker visa')).toBe(false)
    expect(sameCannibalIdentity('uk student visa requirements', 'uk graduate visa route')).toBe(false)
  })

  it('never lets an unrecognised identity act as a wildcard', () => {
    const unknown = 'international student storage in austin'
    expect(cannibalIdentity(unknown)).toBe('other')
    expect(cannibalIdentityRelation(unknown, unknown)).toBe('unrecognized')
    expect(sameCannibalIdentity(unknown, unknown)).toBe(false)

    const d = decision({ term: unknown })
    d.competitors[0] = { ...d.competitors[0], primaryIntent: unknown }
    d.competitors[1] = competitor({ primaryIntent: unknown })
    d.evidenceHash = computeCannibalEvidenceHash(d)
    const result = validateCannibalDecision(d, [ownerRow])
    expect(result.ok).toBe(false)
    expect(result.blockers.join(' ')).toContain('identity_unrecognized')
  })

  it('blocks a decision whose competitor intent contradicts the term identity', () => {
    const d = decision({
      term: 'us i-485 adjustment of status',
      primaryIntentComparison: 'both cover adjustment of status',
    })
    d.competitors[0] = {
      ...d.competitors[0],
      primaryIntent: 'US I-485 adjustment of status filing',
      sharedQueries: [{ query: 'i-485 adjustment of status filing', impressions: 40, clicks: 2, position: 6 }],
    }
    d.competitors[1] = competitor({
      primaryIntent: 'Australia subclass 485 temporary graduate visa',
      sharedQueries: [{ query: 'i-485 adjustment of status filing', impressions: 20, clicks: 1, position: 9 }],
    })
    expect(blockersOf(d)).toContain('identity_mismatch')
  })
})

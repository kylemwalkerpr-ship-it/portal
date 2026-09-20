/**
 * P4 cluster ownership regressions — the five priority families from the P4
 * handoff.
 *
 * These lock the ownership half of the destructive contract: a cluster may only
 * be consolidated when EXACTLY ONE authoritative P3 registry row applies to the
 * competing URLs, and the winner equals that row's owner. Sub-intents (CRS /
 * STEM-category / draw pages, Graduate/Student routes, regional F-1 pages) do
 * not inherit a neighbour's or hub's authority unless the registry ratifies
 * them with their own confirmed row.
 *
 * The checked-in ownership registry is the source of truth wherever it is
 * stable; fixture rows/URLs are used only where the contract must stay
 * deterministic (missing or deliberately unratified authority).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  cannibalIdentity,
  cannibalIdentityFamily,
  cannibalIdentityRelation,
  computeCannibalEvidenceHash,
  p3AuthorityRowsForCompetingUrls,
  sameCannibalIdentity,
  validateCannibalDecision,
  type CannibalDecisionRecord,
} from '@/lib/seoFactory/cannibalDecision'
import { isAuthoritativeOwnershipRow, type OwnershipRow } from '@/lib/seoFactory/ownership'

const REGISTRY = (
  JSON.parse(
    readFileSync(join(process.cwd(), 'public/seo-data/ownership-registry.json'), 'utf8'),
  ) as { rows: OwnershipRow[] }
).rows

const REDIRECT_SHA = '0123456789abcdef0123456789abcdef01234567'

function registryRow(id: number): OwnershipRow {
  const row = REGISTRY.find((candidate) => candidate.id === id)
  if (!row) throw new Error(`ownership registry row ${id} is missing`)
  return row
}

function authorityRef(row: OwnershipRow) {
  return {
    registryRowId: row.id,
    ownerUrl: row.owner_url,
    status: String(row.status),
    action: String(row.action),
    intentClass: String(row.intent_class),
  }
}

/** Truthful rollback file for a redirect loser host (mirrors the executor). */
function redirectFileFor(url: string): { repo: string; path: string; sha: string } {
  const host = new URL(url).hostname
  if (host === 'legal.yousafeconsultancy.com') {
    return { repo: 'caseworks', path: 'public/_redirects', sha: REDIRECT_SHA }
  }
  const sub = host.split('.')[0]
  return { repo: 'yousafe-consultancy', path: `${sub}/public/_redirects`, sha: REDIRECT_SHA }
}

/** Complete two-page decision; callers override ownership and identity fields. */
function decisionFor(opts: {
  clusterId: string
  term: string
  winner: { url: string; intent: string }
  loser: { url: string; intent: string }
  query: string
  authority: { registryRowId: number; ownerUrl: string; status: string; action: string; intentClass: string }
}): CannibalDecisionRecord {
  const shared = { query: opts.query, impressions: 24, clicks: 1, position: 8 }
  const base: CannibalDecisionRecord = {
    clusterId: opts.clusterId,
    term: opts.term,
    evidenceSource: 'persisted_qualified_gsc',
    evidenceWindow: {
      startDate: '2026-06-22',
      endDate: '2026-09-19',
      capturedAt: '2026-09-20T05:39:02Z',
    },
    evidenceHash: '',
    competitors: [
      {
        url: opts.winner.url,
        impressions: 45,
        clicks: 2,
        position: 7,
        primaryIntent: opts.winner.intent,
        sharedQueries: [shared],
      },
      {
        url: opts.loser.url,
        impressions: 20,
        clicks: 1,
        position: 9,
        primaryIntent: opts.loser.intent,
        sharedQueries: [shared],
      },
    ],
    primaryIntentComparison: 'Both pages answer the same intent and share one qualified GSC query.',
    authoritativeOwner: opts.authority,
    winnerUrl: opts.winner.url,
    backlinks: { status: 'unknown' },
    internalLinks: { status: 'unknown' },
    loserActions: [{ url: opts.loser.url, action: 'redirect_301', target: opts.winner.url }],
    rollback: {
      files: [redirectFileFor(opts.loser.url)],
      restoreInstructions: 'Revert the review PR and restore the recorded file SHA.',
    },
    decidedBy: 'seo-supervisor',
    decidedAt: '2026-09-20T08:00:00Z',
  }
  base.evidenceHash = computeCannibalEvidenceHash(base)
  return base
}

function blockersOf(d: CannibalDecisionRecord, rows: OwnershipRow[]): string {
  return validateCannibalDecision(d, rows).blockers.join(' ')
}

/** Blocker URLs are the normalised form (no trailing slash). */
function bare(url: string): string {
  return url.replace(/\/$/, '')
}

describe('P4 family 1 — Canada spousal sponsorship', () => {
  const canada = registryRow(66)
  const loser = {
    url: 'https://legal.yousafeconsultancy.com/ca/family/spousal-sponsorship-application-guide/',
    intent: 'Canada spousal sponsorship application guide',
  }

  it('keeps the spousal row authoritative and consolidatable under exactly one owner', () => {
    expect(isAuthoritativeOwnershipRow(canada)).toBe(true)
    const d = decisionFor({
      clusterId: 'cluster_canada_spousal',
      term: 'canada spousal sponsorship document checklist',
      winner: { url: canada.owner_url, intent: 'Canada spousal sponsorship document checklist' },
      loser,
      query: 'canada spousal sponsorship checklist requirements',
      authority: authorityRef(canada),
    })
    expect(validateCannibalDecision(d, REGISTRY)).toMatchObject({ ok: true, blockers: [] })
  })

  it('does not let a neighbouring confirmed row authorize the spousal cluster', () => {
    const studyPermit = registryRow(26)
    const d = decisionFor({
      clusterId: 'cluster_canada_spousal',
      term: 'canada spousal sponsorship document checklist',
      winner: { url: canada.owner_url, intent: 'Canada spousal sponsorship document checklist' },
      loser,
      query: 'canada spousal sponsorship checklist requirements',
      authority: authorityRef(studyPermit),
    })
    const blockers = blockersOf(d, REGISTRY)
    expect(blockers).toContain('winner_must_equal_authoritative_owner')
    expect(blockers).toContain('authoritative_owner_must_be_unique_p3_authority')
    expect(validateCannibalDecision(d, REGISTRY).ok).toBe(false)
  })

  it('treats a registry supporting-url claim as competing authority', () => {
    const supportingUrl = canada.supporting_urls[0]
    expect(p3AuthorityRowsForCompetingUrls([supportingUrl], REGISTRY).map((row) => row.id)).toEqual([
      canada.id,
    ])
  })

  it('recognises spousal sponsorship as its own identity, not a UK/US spouse wildcard', () => {
    expect(cannibalIdentity(canada.owner_url)).toBe('ca_spouse')
    expect(sameCannibalIdentity('Canada spousal sponsorship document checklist', 'Canada spousal sponsorship application guide')).toBe(true)
    expect(sameCannibalIdentity('Canada spousal sponsorship document checklist', 'UK spouse visa document checklist')).toBe(false)
    expect(cannibalIdentityRelation('Canada spousal sponsorship document checklist', 'uk spouse visa document checklist')).toBe(
      'unrelated',
    )
  })
})

describe('P4 family 2 — US F-1 / CPT, OPT and STEM OPT as distinct destructive identities', () => {
  const f1 = registryRow(1)
  const opt = registryRow(11)
  const stemOpt = registryRow(9)
  const f1Intent = 'F-1 visa rights and SEVIS rules'
  const f1Loser = {
    url: 'https://legal.yousafeconsultancy.com/us/student-visas/f1-status-maintenance-guide-2026/',
    intent: 'F-1 status maintenance rules',
  }
  const optLoser = {
    url: 'https://usa.yousafeconsultancy.com/opt-application-guide-2026/',
    intent: 'OPT application guide and timeline',
  }

  it('fails closed against the checked-in registry when regional rows co-claim the F-1 owner', () => {
    const d = decisionFor({
      clusterId: 'cluster_us_f1_opt',
      term: 'f-1 visa rights international students',
      winner: { url: f1.owner_url, intent: f1Intent },
      loser: optLoser,
      query: 'f-1 visa opt application requirements',
      authority: authorityRef(f1),
    })
    const r = validateCannibalDecision(d, REGISTRY)
    expect(r.ok).toBe(false)
    // Rows 31/32 (usa /from/ pages) declare the F-1 owner as a supporting URL,
    // so more than one authoritative row applies: consolidation must not run.
    expect(r.blockers).toContain('p3_authority_ambiguous')
    expect(p3AuthorityRowsForCompetingUrls([f1.owner_url], REGISTRY).length).toBeGreaterThan(1)
  })

  it('consolidates only inside one subtype — a clean F-1 pair with exactly one authority row', () => {
    const d = decisionFor({
      clusterId: 'cluster_us_f1',
      term: 'f-1 visa rights international students',
      winner: { url: f1.owner_url, intent: f1Intent },
      loser: f1Loser,
      query: 'f-1 visa rights international students',
      authority: authorityRef(f1),
    })
    expect(validateCannibalDecision(d, [f1])).toMatchObject({ ok: true, blockers: [] })
  })

  it('fails closed across F-1, OPT and STEM OPT in both directions', () => {
    const cases = [
      { winner: { url: f1.owner_url, intent: f1Intent }, loser: optLoser, rows: [f1], term: 'f-1 visa rights international students' },
      { winner: { url: opt.owner_url, intent: 'OPT 90 day unemployment cap' }, loser: f1Loser, rows: [opt], term: 'opt 90 day unemployment cap' },
      { winner: { url: stemOpt.owner_url, intent: 'STEM OPT extension requirements' }, loser: optLoser, rows: [stemOpt], term: 'stem opt extension requirements' },
      { winner: { url: opt.owner_url, intent: 'OPT 90 day unemployment cap' }, loser: { url: stemOpt.owner_url, intent: 'STEM OPT extension requirements' }, rows: [opt], term: 'opt 90 day unemployment cap' },
    ]
    for (const [index, item] of cases.entries()) {
      const d = decisionFor({
        clusterId: `cluster_us_subtype_${index}`,
        term: item.term,
        winner: item.winner,
        loser: item.loser,
        query: item.term,
        authority: authorityRef(item.rows[0]),
      })
      const result = validateCannibalDecision(d, item.rows)
      const joined = result.blockers.join(' ')
      expect(result.ok).toBe(false)
      expect(joined).toContain('winner_loser_identity_mismatch')
      expect(joined).toContain('winner_loser_identity_related_but_distinct')
    }
  })

  it('protects distinct US intents from the F-1 family', () => {
    expect(cannibalIdentityFamily('f-1 visa requirements')).toBe('us_student_work')
    expect(cannibalIdentityFamily('stem opt i-983')).toBe('us_student_work')
    expect(sameCannibalIdentity('f-1 opt extension', 'stem opt i-983')).toBe(false)
    expect(sameCannibalIdentity('f-1 visa requirements', 'i-485 adjustment of status')).toBe(false)

    const d = decisionFor({
      clusterId: 'cluster_us_f1_opt',
      term: 'f-1 visa rights international students',
      winner: { url: f1.owner_url, intent: f1Intent },
      loser: {
        url: 'https://legal.yousafeconsultancy.com/us/green-cards/i-485-adjustment-of-status-2026/',
        intent: 'US I-485 adjustment of status filing',
      },
      query: 'f-1 visa opt application requirements',
      authority: authorityRef(f1),
    })
    expect(blockersOf(d, [f1])).toContain('identity_mismatch')
  })
})

describe('P4 family 3 — Australia subclass 485 with US I-485 separation', () => {
  const au485 = registryRow(59)
  const graduate485 = registryRow(76)

  it('fails closed when two AU 485 rows each claim the competing pair', () => {
    const d = decisionFor({
      clusterId: 'cluster_au_485',
      term: 'australia 485 english requirements',
      winner: { url: au485.owner_url, intent: 'Australia subclass 485 English requirements' },
      loser: { url: graduate485.owner_url, intent: 'Australia subclass 485 temporary graduate visa' },
      query: '485 visa english requirements australia',
      authority: authorityRef(au485),
    })
    const r = validateCannibalDecision(d, REGISTRY)
    expect(r.ok).toBe(false)
    expect(r.blockers).toContain('p3_authority_ambiguous')
  })

  it('separates AU subclass 485 from US Form I-485', () => {
    expect(sameCannibalIdentity('australia subclass 485 temporary graduate', 'US I-485 adjustment of status')).toBe(false)
    const d = decisionFor({
      clusterId: 'cluster_au_485',
      term: 'australia 485 english requirements',
      winner: { url: au485.owner_url, intent: 'Australia subclass 485 English requirements' },
      loser: {
        url: 'https://legal.yousafeconsultancy.com/us/green-cards/i-485-adjustment-of-status-2026/',
        intent: 'US I-485 adjustment of status filing',
      },
      query: '485 visa english requirements australia',
      authority: authorityRef(au485),
    })
    expect(blockersOf(d, [au485])).toContain('identity_mismatch')
  })

  it('keeps both directions closed between AU subclass 485 and US Form I-485', () => {
    const i485Url = 'https://legal.yousafeconsultancy.com/us/green-cards/i-485-adjustment-of-status-2026/'
    const i485Row: OwnershipRow = {
      id: 9101,
      primary_keyword: 'us i-485 adjustment of status',
      intent_class: 'procedural',
      owner_host: 'legal',
      owner_url: i485Url,
      supporting_urls: [],
      action: 'keep',
      market_destination: null,
      status: 'confirmed',
      notes: 'ratified P4 fixture for the US I-485 owner',
    }
    const auWinner = decisionFor({
      clusterId: 'cluster_au_485',
      term: 'australia 485 english requirements',
      winner: { url: au485.owner_url, intent: 'Australia subclass 485 English requirements' },
      loser: { url: i485Url, intent: 'US I-485 adjustment of status filing' },
      query: '485 visa english requirements australia',
      authority: authorityRef(au485),
    })
    const usWinner = decisionFor({
      clusterId: 'cluster_us_i485',
      term: 'us i-485 adjustment of status',
      winner: { url: i485Url, intent: 'US I-485 adjustment of status filing' },
      loser: { url: au485.owner_url, intent: 'Australia subclass 485 English requirements' },
      query: 'us i-485 adjustment of status',
      authority: authorityRef(i485Row),
    })
    const auBlockers = blockersOf(auWinner, [au485])
    expect(auBlockers).toContain(`winner_loser_identity_mismatch:${bare(i485Url)}`)
    expect(auBlockers).toContain('identity_mismatch')
    expect(validateCannibalDecision(auWinner, [au485]).ok).toBe(false)

    const usBlockers = blockersOf(usWinner, [i485Row])
    expect(usBlockers).toContain(`winner_loser_identity_mismatch:${bare(au485.owner_url)}`)
    expect(usBlockers).toContain('identity_mismatch')
    expect(validateCannibalDecision(usWinner, [i485Row]).ok).toBe(false)
  })

  it('allows an AU 485 consolidation when exactly one authority row applies', () => {
    const d = decisionFor({
      clusterId: 'cluster_au_485',
      term: 'australia 485 english requirements',
      winner: { url: au485.owner_url, intent: 'Australia subclass 485 English requirements' },
      loser: {
        url: 'https://legal.yousafeconsultancy.com/au/485-visa-ielts-general-or-academic/',
        intent: 'Australia subclass 485 IELTS English requirements',
      },
      query: '485 visa english requirements australia',
      authority: authorityRef(au485),
    })
    expect(validateCannibalDecision(d, [au485])).toMatchObject({ ok: true, blockers: [] })
  })
})

describe('P4 family 4 — UK Student / Graduate / Skilled Worker / dependants', () => {
  const skilledWorker = registryRow(61)
  const graduate = {
    url: 'https://uk.yousafeconsultancy.com/graduate-visa-2026-guide/',
    intent: 'UK Graduate visa requirements',
  }
  const student = {
    url: 'https://uk.yousafeconsultancy.com/student-visa-2026-guide/',
    intent: 'UK Student visa requirements',
  }

  it('fails closed when the registry has no Graduate/Student authority for the competitors', () => {
    expect(p3AuthorityRowsForCompetingUrls([graduate.url, student.url], REGISTRY)).toEqual([])
    const d = decisionFor({
      clusterId: 'cluster_uk_graduate_student',
      term: 'uk graduate visa requirements',
      winner: graduate,
      loser: student,
      query: 'uk graduate visa requirements 2026',
      authority: authorityRef(skilledWorker),
    })
    const blockers = blockersOf(d, REGISTRY)
    expect(blockers).toContain('p3_authority_missing')
    expect(blockers).toContain('winner_must_equal_authoritative_owner')
    // Student and Graduate are distinct intents; neither inherits the other.
    expect(blockers).toContain('identity_mismatch')
    expect(validateCannibalDecision(d, REGISTRY).ok).toBe(false)
  })

  it('keeps Student, Graduate, Skilled Worker and dependant intents distinct', () => {
    expect(sameCannibalIdentity('uk student visa requirements', 'uk skilled worker visa')).toBe(false)
    expect(sameCannibalIdentity('uk graduate visa route', 'uk skilled worker visa')).toBe(false)
    expect(sameCannibalIdentity('uk student visa requirements', 'uk graduate visa route')).toBe(false)
    // A dependant never inherits the route it depends on — even though both
    // belong to the same UK immigration family.
    expect(sameCannibalIdentity('uk skilled worker dependant visa', 'uk skilled worker visa')).toBe(false)
    expect(cannibalIdentity('uk skilled worker dependant visa')).toBe('uk_dependant')
    expect(cannibalIdentity('uk skilled worker visa')).toBe('uk_skilled_worker')
    expect(cannibalIdentityFamily('uk_dependant')).toBe('uk_immigration')
    expect(cannibalIdentityRelation('uk skilled worker visa', 'uk skilled worker dependant visa')).toBe('related_distinct')
    expect(sameCannibalIdentity('uk dependant visa requirements', 'uk dependent visa requirements')).toBe(true)
    expect(sameCannibalIdentity('uk graduate visa route', 'uk post-study work visa')).toBe(true)
  })

  it('blocks Skilled Worker against dependants in both directions', () => {
    const dependantsUrl = 'https://legal.yousafeconsultancy.com/uk/skilled-worker-dependants-guide-2026/'
    const dependantIntent = 'UK Skilled Worker dependant visa guide'
    const skilledIntent = 'UK Skilled Worker visa healthcare pathway'

    const skilledWinner = decisionFor({
      clusterId: 'cluster_uk_skilled_worker',
      term: 'uk skilled worker visa requirements',
      winner: { url: skilledWorker.owner_url, intent: skilledIntent },
      loser: { url: dependantsUrl, intent: dependantIntent },
      query: 'uk skilled worker visa requirements',
      authority: authorityRef(skilledWorker),
    })
    const forward = blockersOf(skilledWinner, [skilledWorker])
    expect(forward).toContain(`winner_loser_identity_mismatch:${bare(dependantsUrl)}`)
    expect(forward).toContain('winner_loser_identity_related_but_distinct')
    expect(validateCannibalDecision(skilledWinner, [skilledWorker]).ok).toBe(false)

    const dependantWinner = decisionFor({
      clusterId: 'cluster_uk_dependant',
      term: 'uk dependant visa requirements',
      winner: { url: dependantsUrl, intent: dependantIntent },
      loser: { url: skilledWorker.owner_url, intent: skilledIntent },
      query: 'uk dependant visa requirements',
      authority: authorityRef(skilledWorker),
    })
    const reverse = blockersOf(dependantWinner, [skilledWorker])
    expect(reverse).toContain(`winner_loser_identity_mismatch:${bare(skilledWorker.owner_url)}`)
    expect(reverse).toContain('winner_loser_identity_related_but_distinct')
    expect(validateCannibalDecision(dependantWinner, [skilledWorker]).ok).toBe(false)
  })

  it('consolidates a dependant sub-intent only through its own ratified row', () => {
    const dependantsUrl = 'https://legal.yousafeconsultancy.com/uk/skilled-worker-dependants-guide-2026/'
    const childUrl = 'https://uk.yousafeconsultancy.com/dependent-child-visa-guide-2026/'
    const ratified: OwnershipRow = {
      id: 9002,
      primary_keyword: 'uk skilled worker dependant visa',
      intent_class: 'procedural',
      owner_host: 'legal',
      owner_url: dependantsUrl,
      supporting_urls: [],
      action: 'keep',
      market_destination: null,
      status: 'confirmed',
      notes: 'ratified P4 fixture for the UK dependant owner',
    }
    const d = decisionFor({
      clusterId: 'cluster_uk_dependant',
      term: 'uk dependant visa requirements',
      winner: { url: dependantsUrl, intent: 'UK Skilled Worker dependant visa guide' },
      loser: { url: childUrl, intent: 'UK dependent child visa requirements' },
      query: 'uk dependant visa requirements',
      authority: authorityRef(ratified),
    })
    expect(validateCannibalDecision(d, [ratified])).toMatchObject({ ok: true, blockers: [] })
  })
})

describe('P4 family 5 — Express Entry checklist vs CRS / STEM-category / draw sub-intents', () => {
  const checklist = registryRow(28)
  const crsPage = 'https://legal.yousafeconsultancy.com/ca/express-entry-crs-draw-cutoffs-2026/'
  const drawPage = 'https://legal.yousafeconsultancy.com/ca/express-entry-stem-category-draw/'

  it('does not let the checklist row claim CRS / STEM-category / draw URLs', () => {
    expect(p3AuthorityRowsForCompetingUrls([crsPage, drawPage], REGISTRY)).toEqual([])
  })

  it('fails closed with missing authority when the declared row is the checklist owner', () => {
    const d = decisionFor({
      clusterId: 'cluster_ca_express_entry_crs',
      term: 'express entry crs draw cutoff scores',
      winner: { url: crsPage, intent: 'Express Entry CRS draw cut-off scores' },
      loser: { url: drawPage, intent: 'Express Entry STEM category draw results' },
      query: 'express entry crs draw cutoff scores',
      authority: authorityRef(checklist),
    })
    const blockers = blockersOf(d, REGISTRY)
    expect(blockers).toContain('p3_authority_missing')
    expect(blockers).toContain('winner_must_equal_authoritative_owner')
  })

  it('never lets a checklist-owned competitor set elect a CRS/draw winner', () => {
    const d = decisionFor({
      clusterId: 'cluster_ca_express_entry_crs',
      term: 'express entry crs draw cutoff scores',
      winner: { url: crsPage, intent: 'Express Entry CRS draw cut-off scores' },
      loser: { url: checklist.owner_url, intent: 'Express Entry document checklist' },
      query: 'express entry crs draw cutoff scores',
      authority: authorityRef(checklist),
    })
    const blockers = blockersOf(d, REGISTRY)
    expect(blockers).toContain('winner_must_equal_unique_p3_authority')
    expect(blockers).toContain('winner_must_equal_authoritative_owner')
    // CRS/draw can never be absorbed into the ratified checklist owner.
    expect(blockers).toContain(`winner_loser_identity_mismatch:${bare(checklist.owner_url)}`)
    expect(blockers).toContain('winner_loser_identity_related_but_distinct')
    expect(validateCannibalDecision(d, REGISTRY).ok).toBe(false)
  })

  it('does not let the checklist winner absorb CRS/draw sub-intents in the reverse direction', () => {
    const d = decisionFor({
      clusterId: 'cluster_ca_express_entry_checklist_vs_crs',
      term: 'express entry document checklist',
      winner: { url: checklist.owner_url, intent: 'Express Entry document checklist' },
      loser: { url: crsPage, intent: 'Express Entry CRS draw cut-off scores' },
      query: 'express entry document checklist',
      authority: authorityRef(checklist),
    })
    const blockers = blockersOf(d, REGISTRY)
    expect(blockers).toContain(`winner_loser_identity_mismatch:${bare(crsPage)}`)
    expect(blockers).toContain('winner_loser_identity_related_but_distinct')
    expect(blockers).toContain('identity_mismatch')
    expect(validateCannibalDecision(d, REGISTRY).ok).toBe(false)
  })

  it('keeps Express Entry checklist/general, CRS/draw and FSW as separate identities', () => {
    expect(cannibalIdentity('express entry document checklist')).toBe('ca_express_entry_core')
    expect(cannibalIdentity('express entry eligibility requirements')).toBe('ca_express_entry_core')
    expect(cannibalIdentity('express entry crs draw cut-off scores')).toBe('ca_express_entry_draws')
    expect(cannibalIdentity('express entry stem category draw results')).toBe('ca_express_entry_draws')
    expect(cannibalIdentity('express entry federal skilled worker requirements')).toBe('ca_express_entry_fsw')
    // Checklist/general is one ratified group …
    expect(sameCannibalIdentity('express entry document checklist', 'express entry eligibility requirements')).toBe(true)
    // … but none of the three groups inherits another's authority.
    expect(sameCannibalIdentity('express entry document checklist', 'express entry crs draw cut-off scores')).toBe(false)
    expect(sameCannibalIdentity('express entry document checklist', 'express entry federal skilled worker requirements')).toBe(false)
    expect(sameCannibalIdentity('express entry crs draw cut-off scores', 'express entry federal skilled worker requirements')).toBe(false)
    expect(cannibalIdentityRelation('express entry document checklist', 'express entry federal skilled worker requirements')).toBe(
      'related_distinct',
    )
  })

  it('allows a sub-intent decision only after the registry ratifies that owner', () => {
    const ratified: OwnershipRow = {
      id: 9001,
      primary_keyword: 'express entry crs draw cutoff scores',
      intent_class: 'procedural',
      owner_host: 'legal',
      owner_url: crsPage,
      supporting_urls: [],
      action: 'keep',
      market_destination: null,
      status: 'confirmed',
      notes: 'ratified P4 fixture for the CRS draw owner',
    }
    const d = decisionFor({
      clusterId: 'cluster_ca_express_entry_crs',
      term: 'express entry crs draw cutoff scores',
      winner: { url: crsPage, intent: 'Express Entry CRS draw cut-off scores' },
      loser: { url: drawPage, intent: 'Express Entry STEM category draw results' },
      query: 'express entry crs draw cutoff scores',
      authority: authorityRef(ratified),
    })
    expect(p3AuthorityRowsForCompetingUrls([crsPage, drawPage], [...REGISTRY, ratified]).map((row) => row.id)).toEqual([
      9001,
    ])
    expect(validateCannibalDecision(d, [...REGISTRY, ratified])).toMatchObject({ ok: true, blockers: [] })
  })
})

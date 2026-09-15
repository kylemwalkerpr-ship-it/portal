import {
  hashEvidenceContent,
  verifyContractEvidenceRows,
} from '@/lib/seoFactory/researchEvidenceStore'
import {
  releaseOpportunityReservation,
  reserveOpportunityJob,
} from '@/lib/seoFactory/writingContractStore'

function evidenceDb(row: Record<string, unknown>) {
  const q: any = {
    select: jest.fn(() => q),
    in: jest.fn(async () => ({ data:[row], error:null })),
  }
  return { from: jest.fn(() => q) } as any
}

describe('persisted evidence verification', () => {
  const base = {
    sourceKind:'official', sourceUrl:'https://www.uscis.gov/example', publisher:'USCIS',
    observedAt:'2026-09-14T10:00:00.000Z', jurisdiction:'US', locale:'en-US', query:'OPT timing',
    observation:'USCIS states the filing window in the observed page.', excerpt:'Observed excerpt.',
    authority:'authoritative' as const, claimSupport:'verified' as const,
    confidence:'observed', verification:'verified' as const,
  }
  const hash = hashEvidenceContent(base)
  const ref: any = {
    id:'ev_1', runId:'run_1', sourceKind:base.sourceKind, sourceUrl:base.sourceUrl,
    observedAt:base.observedAt, jurisdiction:base.jurisdiction, authority:base.authority,
    claimSupport:base.claimSupport, confidence:base.confidence, verification:base.verification,
    contentHash:hash,
  }
  const row = {
    id:'ev_1', source_kind:base.sourceKind, source_url:base.sourceUrl, publisher:base.publisher,
    observed_at:base.observedAt, jurisdiction:base.jurisdiction, locale:base.locale, query:base.query,
    observation:base.observation, excerpt:base.excerpt, content_hash:hash,
    confidence:base.confidence, verification:base.verification,
  }

  it('accepts an unchanged persisted evidence payload', async () => {
    await expect(verifyContractEvidenceRows(evidenceDb(row), [ref])).resolves.toBeUndefined()
  })

  it('rejects changed observation text even when the stored hash column was not changed', async () => {
    await expect(verifyContractEvidenceRows(evidenceDb({ ...row, observation:'tampered factual claim' }), [ref]))
      .rejects.toThrow(/payload hash mismatch/i)
  })
})

type ReservationState = { inserted: boolean; id: string; opportunityId?: string; contractId?: string | null; contractHash?: string | null; stage?: string; status?: string }

function reservationDb(state: ReservationState) {
  const calls: Array<{ op:string; filters:Record<string, unknown> }> = []
  const from = jest.fn((_table: string) => {
    const filters: Record<string, unknown> = {}
    let op = 'select'
    let duplicate = false
    const q: any = {
      insert: jest.fn((row: any) => {
        op = 'insert'
        if (state.inserted) duplicate = true
        else {
          state.inserted = true
          state.opportunityId = row.opportunity_id
          state.status = row.status
          state.stage = row.execution_stage
        }
        return q
      }),
      update: jest.fn((_patch: any) => { op = 'update'; return q }),
      select: jest.fn(() => q),
      eq: jest.fn((key:string, value:unknown) => { filters[key]=value; return q }),
      is: jest.fn((key:string, value:unknown) => { filters[key]=value; return q }),
      in: jest.fn((key:string, value:unknown) => { filters[key]=value; return q }),
      order: jest.fn(() => q), limit: jest.fn(() => q),
      single: jest.fn(async () => {
        calls.push({ op, filters:{...filters} })
        return duplicate
          ? { data:null, error:{ code:'23505', message:'duplicate key' } }
          : { data:{ id:state.id }, error:null }
      }),
      maybeSingle: jest.fn(async () => {
        calls.push({ op, filters:{...filters} })
        if (op === 'select') return { data:state.inserted ? { id:state.id } : null, error:null }
        const matches = filters.id === state.id
          && filters.opportunity_id === state.opportunityId
          && (filters.contract_id === undefined || filters.contract_id === state.contractId)
          && (filters.contract_hash === undefined || filters.contract_hash === state.contractHash)
          && (filters.execution_stage === undefined || filters.execution_stage === state.stage)
        return { data:matches ? { id:state.id } : null, error:null }
      }),
    }
    return q
  })
  return { db:{ from } as any, calls }
}

const reserveInput = {
  topic:'F-1 OPT timing', primaryKeyword:'F-1 OPT timing', title:'F-1 OPT timing', userId:'admin',
  contentType:'legal_guide', tone:'educational', region:'US', targetRepo:'caseworks', ownerHost:'legal',
  canonicalUrl:'https://legal.yousafeconsultancy.com/us/f1-opt-timing/', audienceStage:'OPT applicant',
}

describe('atomic opportunity reservation ownership', () => {
  it('gives ownership only to the insert winner under concurrent attempts', async () => {
    const state: ReservationState = { inserted:false, id:'job-owner' }
    const fake = reservationDb(state)
    const [a,b] = await Promise.all([
      reserveOpportunityJob(fake.db, reserveInput),
      reserveOpportunityJob(fake.db, reserveInput),
    ])
    expect([a.ownsReservation,b.ownsReservation].sort()).toEqual([false,true])
    expect(a.jobId).toBe('job-owner')
    expect(b.jobId).toBe('job-owner')
    expect(a.identity.id).toBe(b.identity.id)
  })

  it('never releases a reservation owned by the duplicate contender', async () => {
    const state: ReservationState = { inserted:true, id:'job-owner', opportunityId:'opp', status:'pending', stage:'researching' }
    const fake = reservationDb(state)
    await expect(releaseOpportunityReservation(fake.db, {
      jobId:'job-owner', reason:'contender failed', opportunityId:'opp', ownsReservation:false,
      executionStage:'brief_invalid',
    })).resolves.toBe(false)
    expect(fake.db.from).not.toHaveBeenCalled()
  })

  it('conditions owner release on exact contract identity once a contract exists', async () => {
    const state: ReservationState = {
      inserted:true, id:'job-owner', opportunityId:'opp', contractId:'wc-new', contractHash:'hash-new',
      status:'drafting', stage:'drafting',
    }
    const fake = reservationDb(state)
    const released = await releaseOpportunityReservation(fake.db, {
      jobId:'job-owner', reason:'stale execution failed', opportunityId:'opp', ownsReservation:true,
      contractId:'wc-old', contractHash:'hash-old', expectedStage:'drafting', executionStage:'revision_required',
    })
    expect(released).toBe(false)
  })
})

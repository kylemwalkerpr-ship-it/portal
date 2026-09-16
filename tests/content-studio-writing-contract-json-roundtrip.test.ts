/**
 * Regression: Supabase/PostgreSQL jsonb follows JSON persistence semantics and
 * drops optional keys whose in-memory value is `undefined`. The canonical
 * writing-contract hashing must follow the same semantics, or a fresh contract
 * validates before insert and then fails with
 * "evidenceHash: evidence payload mismatch; contractHash: payload mismatch"
 * once the stored jsonb payload is re-verified.
 */
import {
  buildWritingContract,
  hashContractPayload,
  verifyWritingContract,
  type ContractEvidenceRef,
  type WritingContractV2,
} from '@/lib/seoFactory/writingContract'
import { hashEvidenceContent } from '@/lib/seoFactory/researchEvidenceStore'
import { loadWritingContract } from '@/lib/seoFactory/writingContractStore'

const OBSERVED_AT = '2026-09-15T12:00:00.000Z'

function jsonbRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const persistedObservation = {
  sourceKind: 'official',
  publisher: 'USCIS',
  observedAt: OBSERVED_AT,
  jurisdiction: null,
  locale: 'en-US',
  query: 'F-1 OPT filing timing',
  observation: 'USCIS describes the OPT filing window as tied to the DSO recommendation date.',
  excerpt: 'The 90-day window begins when the DSO enters the recommendation in SEVIS.',
  authority: 'authoritative' as const,
  claimSupport: 'unknown' as const,
  confidence: 'unverified',
  verification: 'pending' as const,
}
const evidenceContentHash = hashEvidenceContent(persistedObservation)

const evidenceRef: ContractEvidenceRef = {
  id: 'ev_roundtrip_1',
  runId: 'run_roundtrip_1',
  checkpointId: undefined,
  sourceKind: persistedObservation.sourceKind,
  sourceUrl: undefined,
  observedAt: OBSERVED_AT,
  jurisdiction: undefined,
  authority: persistedObservation.authority,
  contentHash: evidenceContentHash,
  claimSupport: persistedObservation.claimSupport,
  confidence: persistedObservation.confidence,
  verification: persistedObservation.verification,
}

const persistedEvidenceRow = {
  id: evidenceRef.id,
  source_kind: persistedObservation.sourceKind,
  source_url: null,
  publisher: persistedObservation.publisher,
  observed_at: persistedObservation.observedAt,
  jurisdiction: null,
  locale: persistedObservation.locale,
  query: persistedObservation.query,
  observation: persistedObservation.observation,
  excerpt: persistedObservation.excerpt,
  content_hash: evidenceContentHash,
  confidence: persistedObservation.confidence,
  verification: persistedObservation.verification,
}

function sealedBrief() {
  return {
    thesis: 'F-1 OPT filing timing depends on the I-20 recommendation date, not the graduation date.',
    takeaways: [
      'The 90-day filing window opens when the DSO recommendation is entered, not when classes end.',
      'Filing before the window opens risks rejection and a lost filing fee.',
      'Late filing can put the applicant out of status between graduation and the receipt date.',
    ],
    lede: 'Plan the OPT filing around the I-20 recommendation date so the packet reaches USCIS inside the 90-day window.',
    outline: [
      { heading: 'Eligibility', purpose: 'State who can request OPT and when the window opens.', bridgeFrom: '', coverTopics: [], format: 'prose' as const },
      { heading: 'Timing', purpose: 'Explain the 90-day filing window and the dates that control it.', bridgeFrom: 'Continue from “Eligibility” without restarting the argument.', coverTopics: [], format: 'prose' as const },
      { heading: 'Documents', purpose: 'List the documents USCIS expects with the I-765 packet.', bridgeFrom: 'Continue from “Timing” without restarting the argument.', coverTopics: [], format: 'bullets' as const },
      { heading: 'Process', purpose: 'Walk through the filing and receipt steps in order.', bridgeFrom: 'Continue from “Documents” without restarting the argument.', coverTopics: [], format: 'steps' as const },
    ],
    faqQuestions: [
      'Does the 90-day clock start on the graduation date or the I-20 recommendation date?',
      'Can an applicant file before the window opens and keep the earlier receipt date?',
      'What happens if the packet arrives after the window closes?',
      'Which office issues the OPT recommendation on the I-20?',
    ],
    unresolved: [],
  }
}

function buildTestContract() {
  return buildWritingContract({
    opportunityTopic: 'F-1 OPT filing timing',
    jurisdiction: 'US',
    audienceStage: 'OPT applicant',
    host: 'legal',
    contentType: 'legal_guide',
    primaryKeyword: 'F-1 OPT filing timing',
    ownership: {
      host: 'legal',
      repo: 'caseworks',
      filePath: 'content/us/f1-opt-timing.mdx',
      canonicalUrl: 'https://legal.yousafeconsultancy.com/us/f1-opt-timing/',
    },
    reader: {
      audience: 'F-1 students preparing to graduate',
      stage: undefined,
      primaryQuestion: 'When can I file for OPT?',
    },
    queryCoverage: {
      requiredShortKeywords: ['f-1 opt filing timing'],
      requiredLongTailKeywords: ['when to file for opt after graduation'],
      shortKeywordTerms: [],
      longTailKeywordTerms: [],
    },
    wordBudget: { minWords: 1200, targetWords: 1600, maxWords: 2000 },
    links: {
      sources: ['https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt'],
      interlinks: [],
    },
    metadata: {
      title: 'F-1 OPT Filing Timing',
      targetSlug: 'f1-opt-timing',
      metaDescription: undefined,
      tone: undefined,
    },
    brief: sealedBrief(),
    evidence: [evidenceRef],
    sourceHealth: [
      {
        source: 'gsc',
        state: 'unavailable',
        observedAt: OBSERVED_AT,
        runId: undefined,
        checkpointId: undefined,
        reason: 'GSC metrics were not connected for this run.',
      },
    ],
    researchGaps: ['Observed GSC metrics were unavailable; demand is not measured as zero.'],
    researchRunId: 'run_roundtrip_1',
    requestedModel: undefined,
    jobId: 'job-roundtrip',
    contractVersion: 1,
    createdAt: OBSERVED_AT,
  })
}

/** Fake Supabase client whose jsonb payload column behaves like Postgres jsonb. */
function jsonbContractStore(contract: WritingContractV2, evidenceRows: Array<Record<string, unknown>>) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'content_studio_writing_contracts') {
        const q: any = {
          select: jest.fn(() => q),
          eq: jest.fn(() => q),
          maybeSingle: jest.fn(async () => ({
            data: {
              contract_id: contract.contractId,
              job_id: 'job-roundtrip',
              contract_version: contract.contractVersion,
              contract_hash: contract.contractHash,
              payload: jsonbRoundTrip(contract),
              created_at: contract.createdAt,
            },
            error: null,
          })),
        }
        return q
      }
      if (table === 'content_studio_evidence_items') {
        return { select: jest.fn(() => ({ in: jest.fn(async () => ({ data: evidenceRows, error: null })) })) }
      }
      throw new Error(`unexpected table ${table}`)
    }),
  } as any
}

describe('writing contract hashing across a jsonb persistence round-trip', () => {
  it('hashes optional undefined object properties with JSON semantics', () => {
    const payload = {
      researchRunId: undefined,
      evidence: [
        {
          id: 'ev_1',
          sourceKind: 'official',
          sourceUrl: undefined,
          checkpointId: undefined,
          observedAt: OBSERVED_AT,
          authority: 'authoritative',
          contentHash: 'a'.repeat(64),
          claimSupport: 'unknown',
        },
      ],
      sourceHealth: [{ source: 'gsc', state: 'unavailable', observedAt: OBSERVED_AT, runId: undefined }],
      researchGaps: [],
    }
    expect(hashContractPayload(payload)).toBe(hashContractPayload(jsonbRoundTrip(payload)))
  })

  it('maps undefined array entries to JSON null instead of dropping them', () => {
    const payload = { researchGaps: ['Observed GSC metrics were unavailable.', undefined] }
    expect(hashContractPayload(payload)).toBe(hashContractPayload({ researchGaps: ['Observed GSC metrics were unavailable.', null] }))
    expect(hashContractPayload(payload)).toBe(hashContractPayload(jsonbRoundTrip(payload)))
  })

  it('keeps deterministic hashing for fully defined JSON-safe payloads', () => {
    const payload = {
      schemaVersion: 2,
      contractVersion: 1,
      host: 'legal',
      primaryKeyword: 'F-1 OPT filing timing',
      wordBudget: { minWords: 1200, targetWords: 1600, maxWords: 2000 },
      links: { sources: ['https://www.uscis.gov/example'], interlinks: [{ label: 'guide', url: '/guide', placement: 'body' }] },
      researchGaps: ['gap'],
      researchRunId: 'run_1',
      requestedModel: 'grok-4.6',
    }
    const hash = hashContractPayload(payload)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hashContractPayload(jsonbRoundTrip(payload))).toBe(hash)
  })

  it('verifies a contract after jsonb drops its optional undefined keys', () => {
    const built = buildTestContract()
    expect(built.ok).toBe(true)
    expect(built.contract).not.toBeNull()

    const inMemory = built.contract as WritingContractV2
    const storedPayload = jsonbRoundTrip(inMemory)
    expect(Object.prototype.hasOwnProperty.call(inMemory.evidence[0], 'sourceUrl')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(storedPayload.evidence[0], 'sourceUrl')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(storedPayload.metadata, 'tone')).toBe(false)

    const verified = verifyWritingContract(storedPayload)
    expect(verified.issues).toEqual([])
    expect(verified.ok).toBe(true)
  })

  it('loads a jsonb-persisted contract without an evidenceHash/contractHash mismatch', async () => {
    const built = buildTestContract()
    expect(built.ok).toBe(true)
    const contract = built.contract as WritingContractV2

    const db = jsonbContractStore(contract, [persistedEvidenceRow])
    await expect(
      loadWritingContract(db, { contractId: contract.contractId, contractHash: contract.contractHash, jobId: 'job-roundtrip' }),
    ).resolves.toMatchObject({ contractId: contract.contractId, contractHash: contract.contractHash })
  })

  it('still rejects a genuine payload tamper after the JSON round-trip', async () => {
    const built = buildTestContract()
    expect(built.ok).toBe(true)
    const contract = built.contract as WritingContractV2

    const tampered = jsonbRoundTrip(contract)
    tampered.evidence[0].claimSupport = 'verified'
    const direct = verifyWritingContract(tampered)
    expect(direct.ok).toBe(false)
    expect(direct.issues.join('; ')).toMatch(/evidenceHash: evidence payload mismatch/)

    const titleTampered = jsonbRoundTrip(contract)
    titleTampered.metadata.title = 'Tampered title'
    const titleCheck = verifyWritingContract(titleTampered)
    expect(titleCheck.ok).toBe(false)
    expect(titleCheck.issues.join('; ')).toMatch(/contractHash: payload mismatch/)

    const db = jsonbContractStore(tampered, [persistedEvidenceRow])
    await expect(
      loadWritingContract(db, { contractId: tampered.contractId, contractHash: tampered.contractHash }),
    ).rejects.toThrow(/payload mismatch/i)
  })
})

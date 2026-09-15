import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ContractClaimSupport,
  ContractEvidenceAuthority,
  ContractEvidenceRef,
} from './writingContract'

export type ResearchEvidenceDb = Pick<SupabaseClient, 'from'>

export type ResearchEvidenceInput = {
  id?: string
  runId: string
  checkpointId?: string
  jobId?: string | null
  sourceKind: string
  sourceUrl?: string | null
  publisher?: string | null
  observedAt: string
  jurisdiction?: string | null
  locale?: string | null
  categoryIds?: string[]
  query?: string | null
  observation: string
  excerpt?: string | null
  authority: ContractEvidenceAuthority
  claimSupport: ContractClaimSupport
  confidence?: string
  verification?: 'verified' | 'pending' | 'unverified' | 'failed'
}

export function hashEvidenceContent(input: Pick<
  ResearchEvidenceInput,
  | 'sourceKind'
  | 'sourceUrl'
  | 'publisher'
  | 'observedAt'
  | 'jurisdiction'
  | 'locale'
  | 'query'
  | 'observation'
  | 'excerpt'
  | 'authority'
  | 'claimSupport'
  | 'confidence'
  | 'verification'
>): string {
  const stable = JSON.stringify({
    sourceKind: String(input.sourceKind || ''),
    sourceUrl: String(input.sourceUrl || ''),
    publisher: String(input.publisher || ''),
    observedAt: String(input.observedAt || ''),
    jurisdiction: String(input.jurisdiction || ''),
    locale: String(input.locale || ''),
    query: String(input.query || ''),
    observation: String(input.observation || ''),
    excerpt: String(input.excerpt || ''),
    authority: input.authority,
    claimSupport: input.claimSupport,
    confidence: String(input.confidence || 'unverified'),
    verification: String(input.verification || 'pending'),
  })
  return createHash('sha256').update(stable).digest('hex')
}

function evidenceId(input: ResearchEvidenceInput, contentHash: string): string {
  if (input.id) return String(input.id)
  return `ev_${createHash('sha256')
    .update(`${input.runId}|${input.checkpointId || ''}|${input.sourceKind}|${input.sourceUrl || ''}|${contentHash}`)
    .digest('hex')
    .slice(0, 24)}`
}

export async function persistResearchEvidence(
  db: ResearchEvidenceDb,
  items: ResearchEvidenceInput[],
): Promise<ContractEvidenceRef[]> {
  const refs: ContractEvidenceRef[] = []
  for (const item of items) {
    const observation = String(item.observation || '').trim()
    if (!observation) continue
    const contentHash = hashEvidenceContent(item)
    const id = evidenceId(item, contentHash)
    const row = {
      id,
      run_id: item.runId,
      job_id: item.jobId || null,
      source_kind: item.sourceKind,
      source_url: item.sourceUrl || null,
      publisher: item.publisher || null,
      observed_at: item.observedAt,
      jurisdiction: item.jurisdiction || null,
      locale: item.locale || null,
      category_ids: item.categoryIds || [],
      query: item.query || null,
      observation,
      excerpt: item.excerpt || null,
      content_hash: contentHash,
      confidence: item.confidence || 'unverified',
      verification: item.verification || 'pending',
    }
    const inserted = await db.from('content_studio_evidence_items').insert(row)
    if (inserted.error && inserted.error.code !== '23505' && !/duplicate|unique/i.test(inserted.error.message || '')) {
      throw new Error(`evidence persistence failed: ${inserted.error.message}`)
    }
    refs.push({
      id,
      runId: item.runId,
      checkpointId: item.checkpointId,
      sourceKind: item.sourceKind,
      sourceUrl: item.sourceUrl || undefined,
      observedAt: item.observedAt,
      jurisdiction: item.jurisdiction || undefined,
      authority: item.authority,
      contentHash,
      claimSupport: item.claimSupport,
      confidence: item.confidence || 'unverified',
      verification: item.verification || 'pending',
    })
  }
  return refs
}

export async function verifyContractEvidenceRows(
  db: ResearchEvidenceDb,
  refs: ContractEvidenceRef[],
): Promise<void> {
  const expected = refs.filter((ref) => ref.id)
  if (!expected.length) {
    if (refs.length) throw new Error('writing contract evidence has no persisted evidence ids')
    return
  }
  const ids = expected.map((ref) => String(ref.id))
  const result = await db
    .from('content_studio_evidence_items')
    .select('id,source_kind,source_url,publisher,observed_at,jurisdiction,locale,query,observation,excerpt,content_hash,confidence,verification')
    .in('id', ids)
  if (result.error) throw new Error(`evidence verification load failed: ${result.error.message}`)
  const rows = new Map(
    ((result.data || []) as Array<Record<string, unknown>>).map((row) => [String(row.id || ''), row]),
  )
  for (const ref of expected) {
    const row = rows.get(String(ref.id))
    if (!row) throw new Error(`writing contract evidence row missing: ${ref.id}`)
    if (String(row.content_hash || '') !== ref.contentHash) {
      throw new Error(`writing contract evidence hash mismatch: ${ref.id}`)
    }
    if (String(row.source_kind || '') !== ref.sourceKind) {
      throw new Error(`writing contract evidence source kind mismatch: ${ref.id}`)
    }
    if (String(row.source_url || '') !== String(ref.sourceUrl || '')) {
      throw new Error(`writing contract evidence URL mismatch: ${ref.id}`)
    }
    if (String(row.observed_at || '') !== String(ref.observedAt || '')) {
      throw new Error(`writing contract evidence observation date mismatch: ${ref.id}`)
    }
    if (String(row.jurisdiction || '') !== String(ref.jurisdiction || '')) {
      throw new Error(`writing contract evidence jurisdiction mismatch: ${ref.id}`)
    }

    // Do not trust the content_hash column by itself. Recompute it from the
    // persisted observation/excerpt and row provenance. Authority/claimSupport
    // live in the immutable contract payload and are themselves protected by
    // contract_hash, so both halves must agree for this check to pass.
    const recomputed = hashEvidenceContent({
      sourceKind: String(row.source_kind || ''),
      sourceUrl: row.source_url ? String(row.source_url) : null,
      publisher: row.publisher ? String(row.publisher) : null,
      observedAt: String(row.observed_at || ''),
      jurisdiction: row.jurisdiction ? String(row.jurisdiction) : null,
      locale: row.locale ? String(row.locale) : null,
      query: row.query ? String(row.query) : null,
      observation: String(row.observation || ''),
      excerpt: row.excerpt ? String(row.excerpt) : null,
      authority: ref.authority,
      claimSupport: ref.claimSupport,
      confidence: String(row.confidence || 'unverified'),
      verification: String(row.verification || 'pending') as ResearchEvidenceInput['verification'],
    })
    if (recomputed !== ref.contentHash) {
      throw new Error(`writing contract evidence payload hash mismatch: ${ref.id}`)
    }
  }
}

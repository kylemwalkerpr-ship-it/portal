import {
  runSeoFactoryPipeline,
  type PipelineInput,
  type PipelineResult,
} from './pipeline'
import { runContentStudioPipeline } from './contentStudioPipeline'

export type StoredContentJob = {
  id: string
  title?: string | null
  topic?: string | null
  primary_keyword?: string | null
  region?: string | null
  content_type?: string | null
  tone?: string | null
  content?: string | null
  ship_mode?: string | null
  user_id?: string | null
  opportunity_id?: string | null
  contract_id?: string | null
  contract_version?: number | null
  contract_hash?: string | null
  evidence_hash?: string | null
  required_short_keywords?: string[] | null
  required_long_tail_keywords?: string[] | null
  short_keyword_terms?: PipelineInput['shortKeywordTerms'] | null
  long_tail_keyword_terms?: PipelineInput['longTailKeywordTerms'] | null
}

export async function runStoredContentJob(
  job: StoredContentJob,
  overrides: Partial<PipelineInput> = {},
): Promise<PipelineResult> {
  const topic = String(job.topic || job.title || '').trim()
  if (!topic) throw new Error('stored job has no topic')
  const contentType = job.content_type === 'article'
    ? 'legal_guide'
    : String(job.content_type || 'legal_guide')
  const input: PipelineInput & Record<string, unknown> = {
    topic,
    title: String(job.title || topic),
    primaryKeyword: String(job.primary_keyword || topic),
    region: String(job.region || 'US'),
    contentType,
    tone: String(job.tone || 'educational'),
    resumeContent: job.content ? String(job.content) : undefined,
    shipMode: (job.ship_mode || 'pr') as PipelineResult['shipMode'],
    userId: job.user_id || 'system:stored-job',
    existingJobId: job.id,
    requiredShortKeywords: Array.isArray(job.required_short_keywords) ? job.required_short_keywords.map(String) : undefined,
    requiredLongTailKeywords: Array.isArray(job.required_long_tail_keywords) ? job.required_long_tail_keywords.map(String) : undefined,
    shortKeywordTerms: Array.isArray(job.short_keyword_terms) ? job.short_keyword_terms : undefined,
    longTailKeywordTerms: Array.isArray(job.long_tail_keyword_terms) ? job.long_tail_keyword_terms : undefined,
    ...overrides,
  }

  if (!job.contract_id) return runSeoFactoryPipeline(input)

  return runContentStudioPipeline({
    ...input,
    writingContractRequired: true,
    contractId: String(job.contract_id),
    contractHash: String(job.contract_hash || ''),
    contractVersion: job.contract_version ?? null,
    evidenceHash: String(job.evidence_hash || ''),
    opportunityId: String(job.opportunity_id || ''),
  } as Parameters<typeof runContentStudioPipeline>[0])
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { generateContentText } from '@/lib/contentAiProvider'
import { DEFAULT_REVIEW_PIN } from '@/lib/contentAiCatalog'
import { auditContent } from '@/lib/seoFactory/audit'
import { acceptRewriteCandidate } from '@/lib/seoFactory/rewriteAcceptance'
import { clampBriefWordBudget, countBodyWords } from '@/lib/seoFactory/contentDepth'
import { DRAFT_HARD_MAX_CHARS } from '@/lib/seoFactory/draftIntegrity'
import { type CohesionFinding } from '@/lib/seoFactory/cohesionCritique'
import { runThroughline } from '@/lib/seoFactory/throughline'
import { runFactoryMaskedDenoise } from '@/lib/seoFactory/maskedDenoise'
import type { EditorSeoHint } from '@/lib/editorMetrics'
import { loadWritingContract, WritingContractMismatchError } from '@/lib/seoFactory/writingContractStore'
import {
  createContentStudioExecutionState,
  markBoundedRevisionCompleted,
  markBoundedRevisionFailed,
  markBoundedRevisionRunning,
  runInContentStudioExecution,
} from '@/lib/seoFactory/contentStudioExecutionContext'

export const maxDuration = 180

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = await request.json()
    const jobId = String(body.jobId || body.existingJobId || '').trim()
    const requestedContractId = String(body.contractId || body.contract_id || '').trim()
    const requestedContractHash = String(body.contractHash || body.contract_hash || '').trim()
    const contractBound = Boolean(requestedContractId || body.writingContractRequired === true)
    const clientContent = typeof body.content === 'string' ? body.content : ''

    let content = clientContent
    let contentType = 'legal_guide'
    let primaryKeyword: string | undefined
    let thesis = typeof body.thesis === 'string' ? body.thesis.trim() : ''
    let requiredShortKeywords: string[] = []
    let requiredLongTailKeywords: string[] = []
    let shortKeywordTerms: any[] = []
    let longTailKeywordTerms: any[] = []
    let minWords: number
    let maxWords: number
    let contractId: string | null = null
    let contractHash: string | null = null
    let opportunityId: string | null = null
    let db: ReturnType<typeof createSupabaseAdminClient> | null = null
    let priorAuditJson: Record<string, unknown> = {}

    if (contractBound) {
      if (!jobId || !requestedContractId || !requestedContractHash) {
        throw new WritingContractMismatchError('contract-bound revision requires jobId + contractId + contractHash')
      }
      db = createSupabaseAdminClient()
      const jobResult = await db
        .from('content_jobs')
        .select('id,content,audit_json,opportunity_id,contract_id,contract_version,contract_hash,evidence_hash')
        .eq('id', jobId)
        .single()
      if (jobResult.error || !jobResult.data) {
        throw new WritingContractMismatchError(`revision job not found: ${jobResult.error?.message || jobId}`)
      }
      const job = jobResult.data as Record<string, any>
      if (String(job.contract_id || '') !== requestedContractId || String(job.contract_hash || '') !== requestedContractHash) {
        throw new WritingContractMismatchError('revision request does not match job contract identity')
      }
      const contract = await loadWritingContract(db, {
        contractId: requestedContractId,
        contractHash: requestedContractHash,
        jobId,
      })
      if (!contract) throw new WritingContractMismatchError('revision writing contract not found')

      const storedContent = String(job.content || '')
      if (!storedContent.trim()) throw new Error('revision job has no accepted draft')
      if (clientContent && clientContent !== storedContent) {
        throw new WritingContractMismatchError('client draft is stale; reload the accepted job revision before revising')
      }
      content = storedContent
      contentType = contract.contentType
      primaryKeyword = contract.primaryKeyword
      thesis = contract.brief.thesis
      requiredShortKeywords = contract.queryCoverage.requiredShortKeywords
      requiredLongTailKeywords = contract.queryCoverage.requiredLongTailKeywords
      shortKeywordTerms = contract.queryCoverage.shortKeywordTerms
      longTailKeywordTerms = contract.queryCoverage.longTailKeywordTerms
      minWords = contract.wordBudget.minWords
      maxWords = contract.wordBudget.maxWords
      contractId = contract.contractId
      contractHash = contract.contractHash
      opportunityId = contract.opportunity.id
      priorAuditJson = job.audit_json && typeof job.audit_json === 'object' ? job.audit_json : {}
    } else {
      const hint: EditorSeoHint = body.hint || {}
      contentType = typeof hint.contentType === 'string' ? hint.contentType : 'legal_guide'
      primaryKeyword = typeof hint.primaryKeyword === 'string' ? hint.primaryKeyword : undefined
      requiredShortKeywords = hint.requiredShortKeywords || []
      requiredLongTailKeywords = hint.requiredLongTailKeywords || []
      shortKeywordTerms = hint.shortKeywordTerms || []
      longTailKeywordTerms = hint.longTailKeywordTerms || []
      const budget = clampBriefWordBudget(contentType)
      minWords = budget.minWords
      maxWords = budget.maxWords
    }

    if (content.length > DRAFT_HARD_MAX_CHARS || countBodyWords(content) < 40) {
      return NextResponse.json({
        error: `Author revise needs 40+ body words and at most ${DRAFT_HARD_MAX_CHARS.toLocaleString()} characters; no partial rewrite is marked complete.`,
      }, { status: 400 })
    }

    const eeatDirectives = Array.isArray(body.eeatDirectives)
      ? body.eeatDirectives.map((d: unknown) => String(d || '').trim()).filter(Boolean)
      : []
    const cohesionFindings: CohesionFinding[] = Array.isArray(body.cohesionFindings)
      ? body.cohesionFindings
          .filter((f: unknown) => f && typeof f === 'object')
          .map((f: { code?: unknown; message?: unknown; evidence?: unknown }) => ({
            code: String(f.code || ''),
            message: String(f.message || ''),
            evidence: f.evidence != null ? String(f.evidence) : undefined,
          }))
          .filter((f: CohesionFinding) => f.code || f.message)
      : []
    const reviewPin = typeof body.reviewModel === 'string' && body.reviewModel.trim()
      ? body.reviewModel.trim()
      : DEFAULT_REVIEW_PIN

    const runAudit = (draft: string) => auditContent({
      content: draft,
      contentType,
      primaryKeyword,
      requiredShortKeywords,
      requiredLongTailKeywords,
      shortKeywordTerms,
      longTailKeywordTerms,
    })
    const validateRevision = (original: string, revised: string) => acceptRewriteCandidate({
      previous: original,
      next: revised,
      previousAudit: runAudit(original),
      nextAudit: runAudit(revised),
      requiredKeywords: [...requiredShortKeywords, ...requiredLongTailKeywords],
      minWords,
      maxWords,
    })

    const state = createContentStudioExecutionState(contractBound)
    const result = await runInContentStudioExecution(state, async () => {
      if (contractBound) markBoundedRevisionRunning(content)
      try {
        const throughline = await runThroughline({
          minWords,
          maxWords,
          validateRevision,
          content,
          thesis,
          contentType,
          primaryKeyword,
          cohesionFindings,
          eeatDirectives,
          generateText: async (system, prompt) => {
            const response = await generateContentText({
              aiProvider: reviewPin,
              exclusive: true,
              cascadeOnCapacity: false,
              system,
              prompt,
              maxTokens: 16384,
              timeoutMs: 180_000,
              strictTimeout: false,
              skipQualityContract: false,
              disableThinking: true,
              reasoningEffort: 'low',
            })
            return response.text
          },
        })

        if (throughline.rejected) {
          if (contractBound) markBoundedRevisionFailed(throughline.reason || 'throughline candidate rejected')
          return { content, rejected: true, reason: throughline.reason, denoiseApplied: false }
        }

        const denoise = await runFactoryMaskedDenoise({
          minWords,
          maxWords,
          validateRevision,
          content: throughline.content,
          contentType,
          indexable: true,
          thesis,
          primaryKeyword,
          generateText: async (system, prompt) => {
            const response = await generateContentText({
              aiProvider: reviewPin,
              exclusive: true,
              cascadeOnCapacity: false,
              system,
              prompt,
              maxTokens: 4096,
              timeoutMs: 90_000,
              strictTimeout: false,
              skipQualityContract: true,
              disableThinking: true,
              reasoningEffort: 'low',
            })
            return response.text
          },
        })
        const accepted = denoise.applied ? denoise.content : throughline.content
        if (contractBound) markBoundedRevisionCompleted(accepted)
        return { content: accepted, rejected: false, reason: undefined, denoiseApplied: denoise.applied }
      } catch (error) {
        if (contractBound) markBoundedRevisionFailed(error)
        throw error
      }
    })

    if (contractBound && db && jobId && contractId && contractHash && opportunityId) {
      if (result.rejected) {
        await db.from('content_jobs').update({
          execution_stage: 'revision_required',
          error_message: String(result.reason || 'revision candidate rejected').slice(0, 1000),
          audit_json: {
            ...priorAuditJson,
            lastRejectedRevision: {
              at: new Date().toISOString(),
              reason: result.reason || 'revision candidate rejected',
              contractId,
            },
          },
        })
          .eq('id', jobId)
          .eq('opportunity_id', opportunityId)
          .eq('contract_id', contractId)
          .eq('contract_hash', contractHash)
        return NextResponse.json({ content, rejected: true, reason: result.reason }, { status: 422 })
      }

      const audit = runAudit(result.content)
      const update = await db.from('content_jobs').update({
        content: result.content,
        word_count: audit.wordCount,
        seo_score: audit.score,
        audit_json: {
          ...priorAuditJson,
          ...audit,
          acceptedRevision: {
            at: new Date().toISOString(),
            contractId,
            model: reviewPin,
          },
        },
        actual_model: reviewPin,
        execution_stage: audit.blockers.length ? 'revision_required' : 'ready_for_approval',
        error_message: audit.blockers.length ? 'Revision accepted but publishing blockers remain.' : null,
      })
        .eq('id', jobId)
        .eq('opportunity_id', opportunityId)
        .eq('contract_id', contractId)
        .eq('contract_hash', contractHash)
        .select('id')
        .maybeSingle()
      if (update.error || !update.data?.id) {
        throw new WritingContractMismatchError(`accepted revision was not persisted to the exact contract job: ${update.error?.message || 'identity changed'}`)
      }
    }

    return NextResponse.json({
      content: result.content,
      rejected: false,
      denoiseApplied: result.denoiseApplied,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Author revise failed'
    const contractError = /writing contract|contract identity|client draft is stale|evidence.*mismatch/i.test(message)
    return NextResponse.json({ error: message }, { status: contractError ? 409 : 502 })
  }
}

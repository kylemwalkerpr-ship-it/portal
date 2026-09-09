import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { generateContentText } from '@/lib/contentAiProvider'
import { DEFAULT_REVIEW_PIN } from '@/lib/contentAiCatalog'
import { countBodyWords } from '@/lib/seoFactory/contentDepth'
import { DRAFT_HARD_MAX_CHARS } from '@/lib/seoFactory/draftIntegrity'
import { type CohesionFinding } from '@/lib/seoFactory/cohesionCritique'
import { runThroughline } from '@/lib/seoFactory/throughline'
import { runFactoryMaskedDenoise } from '@/lib/seoFactory/maskedDenoise'
import type { EditorSeoHint } from '@/lib/editorMetrics'

export const maxDuration = 180

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const body = await request.json()
    const content = typeof body.content === 'string' ? body.content : ''
    if (content.length > DRAFT_HARD_MAX_CHARS || countBodyWords(content) < 40) {
      return NextResponse.json({
        error: `Author revise needs 40+ body words and at most ${DRAFT_HARD_MAX_CHARS.toLocaleString()} characters; no partial rewrite is marked complete.`,
      }, { status: 400 })
    }

    const hint: EditorSeoHint = body.hint || {}
    const thesis = typeof body.thesis === 'string' ? body.thesis.trim() : ''
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

    const hintType = typeof hint.contentType === 'string' ? hint.contentType : undefined
    const hintKeyword = typeof hint.primaryKeyword === 'string' ? hint.primaryKeyword : undefined

    const result = await runThroughline({
      content,
      thesis,
      contentType: hintType,
      primaryKeyword: hintKeyword,
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

    if (result.rejected) {
      return NextResponse.json({
        content,
        rejected: true,
        reason: result.reason,
      }, { status: 422 })
    }

    const denoise = await runFactoryMaskedDenoise({
      content: result.content,
      contentType: hintType || 'legal_guide',
      indexable: true,
      thesis,
      primaryKeyword: hintKeyword,
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

    return NextResponse.json({
      content: denoise.applied ? denoise.content : result.content,
      rejected: false,
      denoiseApplied: denoise.applied,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Author revise failed' }, { status: 502 })
  }
}

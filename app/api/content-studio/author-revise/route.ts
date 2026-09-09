import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { generateContentText } from '@/lib/contentAiProvider'
import { DEFAULT_REVIEW_PIN } from '@/lib/contentAiCatalog'
import { countBodyWords, unwrapWholeDocumentFence } from '@/lib/seoFactory/contentDepth'
import { DRAFT_HARD_MAX_CHARS } from '@/lib/seoFactory/draftIntegrity'
import { factsWerePreserved, type CohesionFinding } from '@/lib/seoFactory/cohesionCritique'
import type { EditorSeoHint } from '@/lib/editorMetrics'

export const maxDuration = 180

const AUTHOR_SYSTEM = `You are a senior specialist revising ONE article so it is a coherent argument. Full markdown document in, full markdown document out. Preserve facts, URLs, numbers, legal qualifiers, disclaimer, sources, JSON-LD. Merge overlapping sections. Do not invent experience. Execute eeatDirectives and cohesion findings. Return ONLY the markdown document (no JSON wrapper, no fences).`

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

    const response = await generateContentText({
      aiProvider: reviewPin,
      exclusive: true,
      cascadeOnCapacity: false,
      system: AUTHOR_SYSTEM,
      prompt: JSON.stringify({
        document: content,
        brief: hint,
        thesis: thesis || undefined,
        eeatDirectives,
        cohesionFindings,
      }),
      maxTokens: 16384,
      timeoutMs: 180_000,
      strictTimeout: false,
      skipQualityContract: false,
    })

    const revised = unwrapWholeDocumentFence(String(response.text || '')).trim()
    if (countBodyWords(revised) < 40) {
      return NextResponse.json({
        content,
        rejected: true,
        reason: 'Revised body was empty or too thin after fence strip',
      }, { status: 422 })
    }

    const preserved = factsWerePreserved(content, revised)
    if (!preserved.ok) {
      return NextResponse.json({
        content,
        rejected: true,
        reason: preserved.reason,
      }, { status: 422 })
    }

    return NextResponse.json({ content: revised, rejected: false })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Author revise failed' }, { status: 502 })
  }
}

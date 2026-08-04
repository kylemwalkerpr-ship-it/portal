import { NextRequest, NextResponse } from 'next/server'
import { generateContentText } from '@/lib/contentAiProvider'
import { evaluateContentQuality, type QualityFinding } from '@/lib/seoFactory/contentQualityGate'
import { buildTargetedSweepPrompt } from '@/lib/seoFactory/contentQualityGate'

export type InlineAnnotation = {
  id: string; line: number; col: number; endLine: number; endCol: number
  length: number; severity: 'blocker' | 'warning'; code: string
  message: string; fix: string; highlightedText: string
}

export type ReauditResponse = {
  ok: boolean; score: number; summary: string
  annotations: InlineAnnotation[]; blockers: number; warnings: number
  fixedContent?: string
}

function indexToLineCol(content: string, index: number) {
  const before = content.slice(0, index)
  const line = (before.match(/\n/g) || []).length + 1
  const lastNl = before.lastIndexOf('\n')
  return { line, col: lastNl === -1 ? index + 1 : index - lastNl }
}

function findingToAnnotations(content: string, f: QualityFinding): InlineAnnotation[] {
  const results: InlineAnnotation[] = []
  const evidence = (f as any).evidence || ''
  const search = evidence.slice(0, 80) || f.message.split(':')[0] || ''

  if (f.code === 'sentence_start_repetition' && evidence) {
    const prefix = evidence.replace(/\u2026$/, '').trim()
    if (prefix.length >= 3) {
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(
        `(?:^|[.!?]\\s+)(${escaped}\\S*(?:\\s+\\S+){0,5})`, 'gim'
      )
      let m: RegExpExecArray | null; let n = 0
      while ((m = regex.exec(content)) !== null && n < 12) {
        const si = m.index + m[0].indexOf(m[1])
        const ht = m[1].slice(0, 80)
        const { line, col } = indexToLineCol(content, si)
        const ep = indexToLineCol(content, si + ht.length)
        results.push({
          id: `${f.code}-${n}`, line, col, endLine: ep.line, endCol: ep.col,
          length: ht.length, severity: 'blocker', code: f.code,
          message: f.message, fix: f.fix || 'Vary this sentence opening.',
          highlightedText: ht,
        })
        n++
      }
    }
  } else if (evidence && evidence.length >= 3) {
    const lower = content.toLowerCase(); const le = evidence.toLowerCase()
    let idx = 0; let n = 0
    while (idx < lower.length && n < 6) {
      const found = lower.indexOf(le, idx)
      if (found === -1) break
      const ht = content.slice(found, found + evidence.length)
      const { line, col } = indexToLineCol(content, found)
      const ep = indexToLineCol(content, found + evidence.length)
      results.push({
        id: `${f.code}-${n}`, line, col, endLine: ep.line, endCol: ep.col,
        length: evidence.length, severity: f.severity || 'warning', code: f.code,
        message: f.message, fix: f.fix || 'Review and fix.',
        highlightedText: ht,
      })
      n++; idx = found + 1
    }
  }
  return results
}

// ---------- AI-powered fix endpoints ----------

/**
 * AI fix through the canonical content AI provider chain
 * (NVIDIA DeepSeek V4 Pro → Cloudflare → Groq → Gemini → OpenRouter → …).
 * Same engine the generator uses, so fix prompts get the same model
 * routing, retries and fallbacks as first-pass generation.
 */
async function callAiFix(sys: string, prompt: string): Promise<string> {
  const result = await generateContentText({
    system: sys,
    prompt,
    maxTokens: 4096,
    temperature: 0.2,
  })
  const text = (result?.text || '').trim()
  if (!text) throw new Error('AI fix returned empty content')
  return text
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      content: string; contentType?: string; primaryKeyword?: string; indexable?: boolean
    }
    const { content, contentType, primaryKeyword, indexable } = body
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content string required' }, { status: 400 })
    }
    const result = evaluateContentQuality({ content, contentType, primaryKeyword, indexable })
    const annotations: InlineAnnotation[] = []
    for (const b of result.blockers) annotations.push(...findingToAnnotations(content, b))
    for (const w of result.warnings) annotations.push(
      ...findingToAnnotations(content, { ...w, severity: 'warning' as const }),
    )
    return NextResponse.json({
      ok: result.ok, score: result.humanScore, summary: result.summary,
      annotations: annotations.slice(0, 60), blockers: result.blockers.length,
      warnings: result.warnings.length,
    } as ReauditResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Re-audit failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}


export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      action: 'fix_all' | 'fix_one'
      content: string
      annotations?: InlineAnnotation[]
      annotation?: InlineAnnotation
      contentType?: string
      primaryKeyword?: string
    }
    const { action, content, annotations, annotation, contentType, primaryKeyword } = body
    if (!content || !action) {
      return NextResponse.json({ error: 'content and action required' }, { status: 400 })
    }

    let fixedContent: string

    if (action === 'fix_all' && annotations && annotations.length > 0) {
      // Build a comprehensive fix prompt listing every issue
      const blockerList = annotations
        .filter((a) => a.severity === 'blocker')
        .map((a) => `Line ${a.line}: [${a.code}] ${a.message} -> "${a.highlightedText}" -> Fix: ${a.fix}`)
        .join('\n')
      const warningList = annotations
        .filter((a) => a.severity === 'warning')
        .map((a) => `Line ${a.line}: [${a.code}] ${a.message} -> "${a.highlightedText}"`)
        .join('\n')

      const sys = 'You are a master SEO content editor. Fix ALL quality issues in the provided article while preserving its structure, facts, headings, and interlinks. Return ONLY the complete fixed article. Do not add explanations.'
      const prompt = `## Original Article

${content}

## QUALITY ISSUES TO FIX (BLOCKERS - MUST FIX)
${blockerList}

## WARNINGS (FIX WHERE POSSIBLE)
${warningList}

## INSTRUCTIONS
1. Fix EVERY blocker listed above - these are mandatory
2. Vary sentence openings: no more than 2 consecutive sentences starting with the same word
3. Replace AI cliches like "delve", "unlock", "In today's digital landscape" with natural language
4. Add specific data, examples, or concrete details where the article is vague
5. Keep all original headings, interlinks, and key facts intact
6. Return the COMPLETE fixed article, nothing else`

      fixedContent = await callAiFix(sys, prompt)

    } else if (action === 'fix_one' && annotation) {
      const sys = 'You are a surgical content editor. Fix ONLY the specified issue. Return ONLY the full article with that one fix applied. Do not change anything else.'
      const prompt = `## Article

${content}

## Issue to Fix
- Line ${annotation.line}: [${annotation.code}] ${annotation.message}
- Problematic text: "${annotation.highlightedText}"
- Suggested fix: ${annotation.fix}

## Instructions
Fix ONLY this specific issue. Keep everything else exactly the same. Return the COMPLETE article.`

      fixedContent = await callAiFix(sys, prompt)

    } else {
      return NextResponse.json({ error: 'Invalid action or missing annotations' }, { status: 400 })
    }

    // Re-evaluate the fixed content
    const reResult = evaluateContentQuality({
      content: fixedContent, contentType, primaryKeyword,
    })
    const reAnnotations: InlineAnnotation[] = []
    for (const b of reResult.blockers) reAnnotations.push(...findingToAnnotations(fixedContent, b))
    for (const w of reResult.warnings) reAnnotations.push(
      ...findingToAnnotations(fixedContent, { ...w, severity: 'warning' as const }),
    )

    return NextResponse.json({
      ok: reResult.ok,
      score: reResult.humanScore,
      summary: reResult.summary,
      annotations: reAnnotations.slice(0, 60),
      blockers: reResult.blockers.length,
      warnings: reResult.warnings.length,
      fixedContent,
    } as ReauditResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI fix failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
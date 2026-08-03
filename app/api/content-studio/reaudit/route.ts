import { NextRequest, NextResponse } from 'next/server'
import { evaluateContentQuality, type QualityFinding } from '@/lib/seoFactory/contentQualityGate'

export type InlineAnnotation = {
  id: string; line: number; col: number; endLine: number; endCol: number
  length: number; severity: 'blocker' | 'warning'; code: string
  message: string; fix: string; highlightedText: string
}

export type ReauditResponse = {
  ok: boolean; score: number; summary: string
  annotations: InlineAnnotation[]; blockers: number; warnings: number
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
    const prefix = evidence.replace(/…$/, '').trim()
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

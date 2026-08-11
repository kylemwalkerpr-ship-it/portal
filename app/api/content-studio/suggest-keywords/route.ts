export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { generateContentText } from '@/lib/contentAiProvider'

/**
 * POST /api/content-studio/suggest-keywords
 *
 * Digest all available signals — topic, region, content type, GSC data,
 * competitor landscape — and return the optimal set of short-tail and
 * long-tail keywords with reasoning. Uses GPT-5.6 Luna for deep analysis.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const topic = String(body.topic || '').trim()
    const region = String(body.region || 'US')
    const contentType = String(body.contentType || 'article')
    const primaryKeyword = String(body.primaryKeyword || topic)
    const audience = String(body.audience || '')
    const gscImpressions = Number(body.gscImpressions) || 0
    const gscPosition = Number(body.gscPosition) || 0
    const gscClicks = Number(body.gscClicks) || 0
    const competitorTerms = Array.isArray(body.competitorTerms) ? body.competitorTerms.map(String) : [] as string[]
    const existingCoverage = Array.isArray(body.existingCoverage) ? body.existingCoverage.map(String) : [] as string[]

    if (!topic) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 })
    }

    const contentTypeLabels: Record<string, string> = {
      blog_post: 'blog post (~1,000 words)',
      article: 'long-form legal guide (~2,200 words)',
      regional_page: 'regional landing page (~1,600 words)',
    }

    const system = [
      'You are the master SEO keyword strategist for an immigration legal marketplace.',
      'Your job: given a topic and signals, suggest the optimal set of keywords that will drive the highest qualified traffic.',
      '',
      'RULES:',
      '- Short-tail keywords: 1-3 words each. Suggest exactly 8-10.',
      '- Long-tail keywords: 4+ words each. Suggest exactly 6-8.',
      '- Prefer keywords with clear search intent (informational or commercial).',
      '- Avoid overly broad terms that cannibalize existing pages.',
      '- Favor specific, actionable queries real immigrants would search.',
      '- Consider the region — use region-specific terminology where relevant.',
      '- If GSC position data shows the page already ranks for a term, deprioritize it.',
      '- If competitor terms are listed, suggest variations that differentiate.',
      '- Consider the content type: blogs need conversational keywords; guides need technical/legal terms.',
      '',
      'Return ONLY valid JSON — no explanations outside the JSON:',
      '{',
      '  "shortTail": ["keyword 1", "keyword 2", ...],',
      '  "longTail": ["longer keyword phrase 1", "longer keyword phrase 2", ...],',
      '  "reasoning": "2-3 sentences explaining the strategy: why these keywords, what gap they fill, how they avoid cannibalization.",',
      '  "suggestedH1": "An SEO-optimized H1 title for this content",',
      '  "suggestedH2s": ["H2 section 1", "H2 section 2", ...]',
      '}',
    ].join('\n')

    const prompt = [
      `TOPIC: ${topic}`,
      `PRIMARY KEYWORD: ${primaryKeyword}`,
      `REGION: ${region}`,
      `CONTENT TYPE: ${contentTypeLabels[contentType] || contentType}`,
      audience ? `TARGET AUDIENCE: ${audience}` : '',
      gscImpressions > 0 ? `GSC DATA: ${gscImpressions.toLocaleString()} impressions, ${gscClicks.toLocaleString()} clicks, position #${Math.round(gscPosition)}` : '',
      competitorTerms.length > 0 ? `COMPETITOR TERMS: ${competitorTerms.join(', ')}` : '',
      existingCoverage.length > 0 ? `EXISTING COVERAGE (DO NOT duplicate): ${existingCoverage.join(', ')}` : '',
      '',
      'Suggest the optimal keyword strategy for this piece of content.',
    ].filter(Boolean).join('\n')

    const ai = await generateContentText({
      aiProvider: 'auto',
      system,
      prompt,
      maxTokens: 900,
      temperature: 0.4,
    })

    // Strip markdown code fences (```json ... ```) that some models wrap JSON in
    let rawText = (ai.text || '').trim()
    rawText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
    const parsed = JSON.parse(rawText || '{}')
    if (!Array.isArray(parsed.shortTail) || !Array.isArray(parsed.longTail)) {
      return NextResponse.json({
        error: 'AI returned invalid format',
        raw: ai.text?.slice(0, 200),
      }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      shortTail: parsed.shortTail.slice(0, 10),
      longTail: parsed.longTail.slice(0, 8),
      reasoning: String(parsed.reasoning || ''),
      suggestedH1: String(parsed.suggestedH1 || ''),
      suggestedH2s: Array.isArray(parsed.suggestedH2s) ? parsed.suggestedH2s.slice(0, 8) : [],
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

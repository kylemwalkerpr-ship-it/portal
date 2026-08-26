export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { generateEngineText } from '@/lib/seoEngine/engineAi'
import { detectRegionFromText, filterKeywordsByRegion, formatResearchPromptBlock, loadResearchDemandContext, pickResearchKeywords } from '@/lib/seoEngine/researchDemand'

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
    let region = String(body.region || 'US')
    const contentType = String(body.contentType || 'article')
    const primaryKeyword = String(body.primaryKeyword || topic)

    // ── REGION AUTO-SELECT ──────────────────────────────────────────────
    // A topic like "Australia student visa fee" names its own country. When
    // the topic text confidently points at a DIFFERENT region than the
    // picker's (default-US) value, the topic wins — a US-keyword brief for an
    // Australian topic is exactly the mixed-region failure we are preventing.
    const detected = detectRegionFromText(`${topic} ${primaryKeyword}`)
    let regionAutoSelected = false
    if (detected && detected.region !== region.toUpperCase().slice(0, 2)) {
      region = detected.region
      regionAutoSelected = true
    }
    const audience = String(body.audience || '')
    const gscImpressions = Number(body.gscImpressions) || 0
    const gscPosition = Number(body.gscPosition) || 0
    const gscClicks = Number(body.gscClicks) || 0
    const competitorTerms = Array.isArray(body.competitorTerms) ? body.competitorTerms.map(String) : [] as string[]
    const existingCoverage = Array.isArray(body.existingCoverage) ? body.existingCoverage.map(String) : [] as string[]

    if (!topic) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 })
    }

    const researchCtx = await loadResearchDemandContext(topic, primaryKeyword, region)
    const picked = pickResearchKeywords(researchCtx, topic)
    const researchBlock = formatResearchPromptBlock(researchCtx, picked)

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
      '- Prefer MASTER ENGINE and UBERSUGGEST terms from the live context. Never invent a sibling of a SHIPPED canonical URL.',
      '- Favor specific, actionable queries real immigrants would search.',
      '- CRITICAL: Only suggest keywords relevant to the specified REGION. Never include keywords from other countries (e.g. do not include "canada study permit" or "uk graduate visa" in a US article).',
      '- Use region-specific terminology: for US use USCIS/H-1B/Green Card; for CA use IRCC/Express Entry/Study Permit; for UK use UCAS/Graduate Route; for AU use DHA/Subclass/Student Visa.',
      '- The MASTER ENGINE and UBERSUGGEST terms in the context are already filtered to the selected region.',
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
      researchBlock,
      '',
      'Suggest the optimal keyword strategy for this piece of content.',
    ].filter(Boolean).join('\n')

    const ai = await generateEngineText({
      aiProvider: 'auto',
      system,
      prompt,
      maxTokens: 900,
      temperature: 0.4,
    })

    // Strip markdown code fences + extract JSON object from model response.
    let rawText = (ai.text || '').trim()
    const firstBrace = rawText.indexOf('{')
    const lastBrace = rawText.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      rawText = rawText.slice(firstBrace, lastBrace + 1)
    }
    rawText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '')
    const parsed = JSON.parse(rawText || '{}')
    if (!Array.isArray(parsed.shortTail) || !Array.isArray(parsed.longTail)) {
      return NextResponse.json({
        error: 'AI returned invalid format',
        raw: ai.text?.slice(0, 200),
      }, { status: 502 })
    }

    // ── REGION HARD FILTER (deterministic backstop) ─────────────────────
    // The prompt tells the model to stay in-region; this PROVES it. Any
    // cross-region keyword the model echoes (or that leaked from a stale
    // signal) is dropped here, no matter how the model behaved.
    const modelShortRaw = parsed.shortTail.map(String)
    const modelLongRaw = parsed.longTail.map(String)
    const shortFilter = filterKeywordsByRegion(modelShortRaw, region)
    const longFilter = filterKeywordsByRegion(modelLongRaw, region)
    const droppedOffRegion = [...shortFilter.dropped, ...longFilter.dropped]

    const shortTail = [...picked.shortTail, ...shortFilter.kept].filter((v, i, a) => a.indexOf(v) === i).slice(0, 10)
    const longTail = [...picked.longTail, ...longFilter.kept].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8)
    return NextResponse.json({
      ok: true,
      region,
      regionAutoSelected,
      droppedOffRegion,
      shortTail,
      longTail,
      reasoning: String(parsed.reasoning || ''),
      suggestedH1: String(parsed.suggestedH1 || ''),
      suggestedH2s: Array.isArray(parsed.suggestedH2s) ? parsed.suggestedH2s.slice(0, 8) : [],
      fromEngine: researchCtx.engineTerms.slice(0, 16),
      fromUbersuggest: researchCtx.uberTerms.slice(0, 16),
      blockedCanonicals: picked.skippedCanonicals,
      competing: researchCtx.competing.competing.slice(0, 8),
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

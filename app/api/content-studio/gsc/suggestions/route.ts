import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { buildGscContentBrief, buildKeywordPortfolio } from '@/lib/gscContentBrief'

export const runtime = 'nodejs'

/**
 * POST /api/content-studio/gsc/suggestions
 *
 * Returns AI-curated topic suggestions for Quick Create.
 * Powered by the GSC keyword portfolio + SEO canon framework.
 *
 * Body: { region?, topic?, limit? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const region = typeof body.region === 'string' ? body.region : 'US'
    const seedTopic = typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim() : ''
    const limit = typeof body.limit === 'number' ? Math.min(12, Math.max(3, body.limit)) : 6

    // Build the GSC content brief for the region
    const brief = await buildGscContentBrief({
      topic: seedTopic || 'immigration international students visas housing jobs',
      region,
    })

    // Build keyword portfolio — merges primary, opportunity, and long-tail keywords
    const portfolio = buildKeywordPortfolio(brief)

    // Build suggestions from the portfolio and primary keywords
    const suggestions: Array<{
      topic: string
      title: string
      primaryKeyword: string
      keywords: string[]
      audience: string
      impressions: number
      demandScore: number
      intentCategory: string
      profitability: 'high' | 'medium' | 'low'
      reason: string
    }> = []

    // Intent labels from keyword signals
    const intentLabels: Record<string, string> = {
      transactional: '🛒 Transactional',
      commercial: '🔍 Commercial',
      informational: '📖 Informational',
      navigational: '🧭 Navigational',
      local: '📍 Local',
    }

    // Region-specific audience defaults
    const audienceMap: Record<string, string> = {
      US: 'international students, H-1B professionals, green card applicants',
      CA: 'international students, Express Entry candidates, PGWP holders',
      AU: 'international students, skilled migrants, 485 visa holders',
      UK: 'international students, Skilled Worker applicants, family visa seekers',
      COMPARE: 'international students comparing immigration pathways, professionals seeking options',
    }

    // Build suggestions from primary GSC keywords
    const primaryPool = brief.primaryKeywords.slice(0, limit * 2)
    for (let i = 0; i < primaryPool.length && suggestions.length < limit; i++) {
      const kw = primaryPool[i]
      const impLog = Math.log10(Math.max(1, kw.impressions) + 9)
      const demandScore = Math.min(100, Math.round(impLog * 30 + Math.min(kw.clicks, 50) * 0.5))
      const posLabel = kw.position <= 3 ? 'top-3' : kw.position <= 10 ? 'page-1' : kw.position <= 20 ? 'page-2' : 'deep'

      // Derive intent from keyword pattern
      let intentCategory = 'informational'
      const term = kw.term.toLowerCase()
      if (/apply|fee|cost|price|buy|hire|book|register|sign.up/i.test(term)) intentCategory = 'transactional'
      else if (/best|top|vs|versus|compar|review|alternative/i.test(term)) intentCategory = 'commercial'
      else if (/near|location|office|embassy|consulate/i.test(term)) intentCategory = 'local'
      else if (/login|portal|account|status/i.test(term)) intentCategory = 'navigational'

      const profitability: 'high' | 'medium' | 'low' =
        intentCategory === 'transactional' ? 'high' :
        intentCategory === 'commercial' ? 'high' :
        kw.impressions > 500 ? 'medium' : 'low'

      // Build a compelling title from the keyword
      const titleCase = kw.term.replace(/\b\w/g, c => c.toUpperCase())
      const yearLabel = new Date().getFullYear()
      const titlePrefixes: Record<string, string> = {
        informational: `Complete Guide: ${titleCase} ${yearLabel}`,
        transactional: `How to Apply for ${titleCase} — ${yearLabel} Step-by-Step`,
        commercial: `Best ${titleCase} Options in ${yearLabel} — Compared`,
        local: `${titleCase} Near You — ${yearLabel} Locations & Info`,
        navigational: `${titleCase} — Official Portal & Status Guide ${yearLabel}`,
      }

      // Related keywords from portfolio
      const related = [
        ...(portfolio.primary || []).filter((k: string) => k !== kw.term && k.length > 5).slice(0, 2),
        ...(portfolio.secondary || []).slice(0, 2),
      ].filter(Boolean).slice(0, 5)

      suggestions.push({
        topic: kw.term,
        title: titlePrefixes[intentCategory] || titlePrefixes.informational,
        primaryKeyword: kw.term,
        keywords: related.length > 0 ? related : [kw.term],
        audience: audienceMap[region] || audienceMap.US,
        impressions: kw.impressions,
        demandScore,
        intentCategory,
        profitability,
        reason: `${posLabel} · ${kw.impressions.toLocaleString()} imp/mo · ${intentLabels[intentCategory] || '📖 Informational'}`,
      })
    }

    // Fill remaining slots with opportunity keywords if needed
    if (suggestions.length < limit) {
      for (const kw of brief.opportunityKeywords) {
        if (suggestions.length >= limit) break
        const alreadyIn = suggestions.some(s => s.topic === kw.term)
        if (alreadyIn) continue
        suggestions.push({
          topic: kw.term,
          title: `Target: ${kw.term.replace(/\b\w/g, c => c.toUpperCase())} — High-Opportunity Topic`,
          primaryKeyword: kw.term,
          keywords: [kw.term],
          audience: audienceMap[region] || audienceMap.US,
          impressions: kw.impressions,
          demandScore: Math.min(100, Math.round(Math.log10(Math.max(1, kw.impressions) + 9) * 25)),
          intentCategory: 'informational',
          profitability: kw.impressions > 300 ? 'medium' : 'low',
          reason: `opportunity · ${kw.impressions.toLocaleString()} imp/mo · low competition`,
        })
      }
    }

    return NextResponse.json({
      region,
      suggestions,
      source: brief.source,
      strategyHints: brief.strategyHints ?? [],
      portfolioSnapshot: {
        primaryCount: portfolio.primary?.length ?? 0,
        secondaryCount: portfolio.secondary?.length ?? 0,
        longTailCount: portfolio.longTail?.length ?? 0,
      },
    })
  } catch (err) {
    console.error('[content-studio/gsc/suggestions]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to build suggestions' },
      { status: 500 },
    )
  }
}

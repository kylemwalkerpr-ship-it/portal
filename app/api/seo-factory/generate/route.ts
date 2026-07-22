import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveOwner } from '@/lib/seoFactory/ownership'
import { auditContent } from '@/lib/seoFactory/audit'
import { shipContent, type ShipMode } from '@/lib/seoFactory/ship'
import { buildGscContentBrief, formatGscBriefForPrompt } from '@/lib/gscContentBrief'
import { generateContentText } from '@/lib/contentAiProvider'

/**
 * POST /api/seo-factory/generate
 * Full factory generate: plan → GSC brief → Cloudflare AI → audit → optional ship
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const topic = String(body.topic || '').trim()
    const title = String(body.title || topic).trim()
    const region = String(body.region || 'US').toUpperCase()
    const contentType = String(body.contentType || body.content_type || 'legal_guide')
    const tone = String(body.tone || 'educational')
    const primaryKeyword = String(body.primaryKeyword || body.primary_keyword || topic).trim()
    const shipMode = (body.shipMode || body.ship_mode || 'pr') as ShipMode | 'none'
    const indexable = body.indexable !== false
    const autoShip = shipMode === 'pr' || shipMode === 'autodeploy'

    if (!topic) {
      return NextResponse.json({ error: 'topic required' }, { status: 400 })
    }

    const plan = await resolveOwner({
      primaryKeyword,
      contentType,
      region,
      indexable,
      slug: body.slug,
    })

    const gscBrief = await buildGscContentBrief({
      topic,
      region,
      keywords: Array.isArray(body.keywords) ? body.keywords : [primaryKeyword],
    })
    const gscBlock = formatGscBriefForPrompt(gscBrief)

    const system = [
      'You are an SEO content factory for YouSafe / MyCaseworks immigration estate.',
      'Write authoritative, plain-English content. No banned marketing fluff.',
      'ZERO outcome promises. Cite .gov/.edu authorities.',
      'Output raw markdown with YAML front matter including: title, description, primaryKeyword, robots, date.',
      plan.indexable
        ? 'robots: index,follow — include TL;DR, FAQ section, Article+FAQPage JSON-LD.'
        : 'robots: noindex,follow — supporting/thin page.',
      `Canonical must be: ${plan.canonicalUrl}`,
      `Owner host: ${plan.host}. Do not cannibalize other estate hosts.`,
      'Target length: legal_guide/article ≥1200 words; blog ≥700; regional ≥800.',
      'Do NOT wrap output in ``` fences. Emit raw markdown only.',
    ].join('\n')

    const prompt = [
      `Title hint: ${title}`,
      `Topic: ${topic}`,
      `Primary keyword: ${primaryKeyword}`,
      `Region: ${region}`,
      `Content type: ${contentType}`,
      `Tone: ${tone}`,
      body.audience ? `Audience: ${body.audience}` : '',
      '',
      gscBlock,
      '',
      'Write the full page now. Use GSC primary keywords in title/H2/FAQ when accurate.',
    ]
      .filter(Boolean)
      .join('\n')

    const ai = await generateContentText({ system, prompt, maxTokens: 5000 })
    const content = ai.text

    const audit = auditContent({
      content,
      contentType,
      primaryKeyword,
      indexable: plan.indexable,
      ownershipBlockers: plan.blockers,
    })

    let shipResult = null
    if (autoShip) {
      try {
        shipResult = await shipContent({
          mode: shipMode as ShipMode,
          plan,
          content,
          title: title || primaryKeyword,
          region,
          contentType,
          primaryKeyword,
          audit,
          dryRun: Boolean(body.dryRun),
        })
      } catch (shipErr) {
        return NextResponse.json(
          {
            ok: false,
            error: shipErr instanceof Error ? shipErr.message : 'Ship failed',
            content,
            plan,
            audit,
            gsc: gscBrief,
            provider: ai.provider,
            model: ai.model,
          },
          { status: 422 },
        )
      }
    }

    let jobId: string | null = null
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const { data: job } = await supabase
        .from('content_jobs')
        .insert({
          user_id:
            (auth as { profile?: { clerk_user_id?: string }; profileId?: string }).profile
              ?.clerk_user_id ||
            (auth as { profileId?: string }).profileId ||
            'admin',
          title,
          topic,
          content_type: contentType === 'legal_guide' ? 'article' : contentType,
          tone,
          region,
          target_repo: plan.repo,
          status:
            shipResult?.status === 'deployed'
              ? 'merged'
              : shipResult?.status === 'pr_created'
                ? 'pr_created'
                : 'drafting',
          slug: plan.filePath.split('/').filter(Boolean).slice(-2, -1)[0] || null,
          content,
          branch_name: shipResult?.branch || null,
          content_path: shipResult?.path || plan.filePath,
          pr_url: shipResult?.prUrl || null,
          pr_number: shipResult?.prNumber || null,
          ai_provider: ai.provider,
          word_count: audit.wordCount,
          seo_score: audit.score,
          ship_mode: autoShip ? shipMode : 'pr',
          indexable: plan.indexable,
          canonical_url: plan.canonicalUrl,
          owner_host: plan.host,
          primary_keyword: primaryKeyword,
          audit_json: audit,
          gsc_json: {
            source: gscBrief.source,
            mode: gscBrief.mode,
            primaryKeywords: gscBrief.primaryKeywords.slice(0, 8),
          },
          deploy_sha: shipResult?.commitSha || null,
          deployed_at: shipResult?.status === 'deployed' ? new Date().toISOString() : null,
          llms_included: audit.llmsRecommended,
        })
        .select('id')
        .single()
      jobId = job?.id ?? null
    } catch (e) {
      console.warn('[seo-factory/generate] job persist skipped', e)
    }

    return NextResponse.json({
      ok: true,
      jobId,
      content,
      plan,
      audit,
      ship: shipResult,
      gsc: {
        source: gscBrief.source,
        mode: gscBrief.mode,
        primaryKeywords: gscBrief.primaryKeywords.slice(0, 8),
        opportunityKeywords: gscBrief.opportunityKeywords.slice(0, 6),
        warnings: gscBrief.warnings,
      },
      provider: ai.provider,
      model: ai.model,
    })
  } catch (err) {
    console.error('[seo-factory/generate]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generate failed' },
      { status: 500 },
    )
  }
}

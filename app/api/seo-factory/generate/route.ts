import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveOwner } from '@/lib/seoFactory/ownership'
import { auditContent } from '@/lib/seoFactory/audit'
import { shipContent, type ShipMode } from '@/lib/seoFactory/ship'
import { buildGscContentBrief, formatGscBriefForPrompt } from '@/lib/gscContentBrief'

// Reuse lightweight chat from content-studio generate (inline to avoid circular deps)
async function chatComplete(opts: {
  baseURL: string
  apiKey: string
  model: string
  system: string
  prompt: string
}): Promise<string> {
  const url = opts.baseURL.replace(/\/$/, '') + '/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.65,
      max_tokens: 6000,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`AI provider error ${res.status}: ${body.slice(0, 400)}`)
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const text = json.choices?.[0]?.message?.content
  if (!text?.trim()) throw new Error('AI provider returned empty content')
  return text.trim()
}

function resolveProvider() {
  if (process.env.CUSTOM_AI_BASE_URL && process.env.CUSTOM_AI_API_KEY) {
    return {
      baseURL: process.env.CUSTOM_AI_BASE_URL,
      apiKey: process.env.CUSTOM_AI_API_KEY,
      model: process.env.CUSTOM_AI_MODEL ?? 'gpt-4o-mini',
      label: 'custom',
    }
  }
  if (process.env.XAI_API_KEY) {
    return {
      baseURL: process.env.XAI_BASE_URL ?? 'https://api.x.ai/v1',
      apiKey: process.env.XAI_API_KEY,
      model: process.env.XAI_MODEL ?? 'grok-3',
      label: 'grok',
    }
  }
  if ((process.env.AI_PROVIDER || '').toLowerCase() === 'openai' && process.env.OPENAI_API_KEY) {
    return {
      baseURL: 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      label: 'openai',
    }
  }
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('No AI provider configured (XAI_API_KEY / DEEPSEEK_API_KEY / OPENAI_API_KEY)')
  return {
    baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    label: 'deepseek',
  }
}

/**
 * POST /api/seo-factory/generate
 * Full factory generate: plan → GSC brief → AI → audit → optional ship
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

    const plan = resolveOwner({
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

    const provider = resolveProvider()
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

    const content = await chatComplete({
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
      model: provider.model,
      system,
      prompt,
    })

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
        // Return content + audit even if ship fails
        return NextResponse.json(
          {
            ok: false,
            error: shipErr instanceof Error ? shipErr.message : 'Ship failed',
            content,
            plan,
            audit,
            gsc: gscBrief,
            provider: provider.label,
          },
          { status: 422 },
        )
      }
    }

    // Persist job (best-effort)
    let jobId: string | null = null
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const { data: job } = await supabase
        .from('content_jobs')
        .insert({
          user_id: (auth as { profile?: { clerk_user_id?: string }; profileId?: string }).profile?.clerk_user_id
            || (auth as { profileId?: string }).profileId
            || 'admin',
          title,
          topic,
          content_type: contentType === 'legal_guide' ? 'article' : contentType,
          tone,
          region,
          target_repo: plan.repo,
          status: shipResult?.status === 'deployed' ? 'merged' : shipResult?.status === 'pr_created' ? 'pr_created' : 'drafting',
          slug: plan.filePath.split('/').filter(Boolean).slice(-2, -1)[0] || null,
          content,
          branch_name: shipResult?.branch || null,
          content_path: shipResult?.path || plan.filePath,
          pr_url: shipResult?.prUrl || null,
          pr_number: shipResult?.prNumber || null,
          ai_provider: provider.label,
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
      provider: provider.label,
    })
  } catch (err) {
    console.error('[seo-factory/generate]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generate failed' },
      { status: 500 },
    )
  }
}

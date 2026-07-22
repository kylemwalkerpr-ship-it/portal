import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { isCloudflareAiConfigured, generateContentText } from '@/lib/contentAiProvider'
import { getGscAccess } from '@/lib/gscAuth'
import { createClient } from '@supabase/supabase-js'
import { loadStrategiesIndex, loadStrategyPromptPack } from '@/lib/seoDataLoaders'

/**
 * GET /api/seo-factory/health
 * Operator checklist: AI, GitHub, GSC, Supabase readiness.
 */
export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const checks: Array<{
      id: string
      label: string
      ok: boolean
      detail: string
    }> = []

    // Cloudflare AI
    const cfOk = isCloudflareAiConfigured()
    let cfDetail = cfOk
      ? 'CLOUDFLARE_ACCOUNT_ID + AI token present'
      : 'Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_AI_TOKEN'
    if (cfOk) {
      try {
        const r = await generateContentText({
          system: 'Reply with exactly: ok',
          prompt: 'ok',
          maxTokens: 8,
          temperature: 0,
        })
        cfDetail = `Live OK · ${r.provider} · ${r.model}`
        checks.push({ id: 'cloudflare_ai', label: 'Cloudflare Workers AI', ok: true, detail: cfDetail })
      } catch (e) {
        checks.push({
          id: 'cloudflare_ai',
          label: 'Cloudflare Workers AI',
          ok: false,
          detail: e instanceof Error ? e.message.slice(0, 180) : 'AI call failed',
        })
      }
    } else {
      checks.push({ id: 'cloudflare_ai', label: 'Cloudflare Workers AI', ok: false, detail: cfDetail })
    }

    // GitHub
    const ghToken = process.env.GITHUB_TOKEN || process.env.CONTENT_STUDIO_GITHUB_TOKEN
    if (!ghToken) {
      checks.push({
        id: 'github',
        label: 'GitHub ship token',
        ok: false,
        detail: 'GITHUB_TOKEN not set',
      })
    } else {
      try {
        const res = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'yousafe-portal-seo-factory-health',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        })
        if (!res.ok) {
          const t = await res.text()
          checks.push({
            id: 'github',
            label: 'GitHub ship token',
            ok: false,
            detail: `${res.status}: ${t.slice(0, 120)}`,
          })
        } else {
          const u = (await res.json()) as { login?: string }
          checks.push({
            id: 'github',
            label: 'GitHub ship token',
            ok: true,
            detail: `Authenticated as ${u.login || 'user'}`,
          })
        }
      } catch (e) {
        checks.push({
          id: 'github',
          label: 'GitHub ship token',
          ok: false,
          detail: e instanceof Error ? e.message : 'GitHub check failed',
        })
      }
    }

    // GSC
    try {
      const access = await getGscAccess()
      if (access?.accessToken && access.siteUrl) {
        checks.push({
          id: 'gsc',
          label: 'Google Search Console',
          ok: true,
          detail: `${access.mode} · ${access.siteUrl}`,
        })
      } else {
        checks.push({
          id: 'gsc',
          label: 'Google Search Console',
          ok: false,
          detail: 'No live credentials — snapshot fallback only',
        })
      }
    } catch (e) {
      checks.push({
        id: 'gsc',
        label: 'Google Search Console',
        ok: false,
        detail: e instanceof Error ? e.message.slice(0, 140) : 'GSC error',
      })
    }

    // Supabase content_jobs
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const { count, error } = await supabase
        .from('content_jobs')
        .select('id', { count: 'exact', head: true })
      if (error) throw error
      checks.push({
        id: 'supabase',
        label: 'content_jobs table',
        ok: true,
        detail: `OK · ${count ?? 0} jobs`,
      })
    } catch (e) {
      checks.push({
        id: 'supabase',
        label: 'content_jobs table',
        ok: false,
        detail: e instanceof Error ? e.message.slice(0, 140) : 'DB error',
      })
    }

    // Fallbacks
    const fallbacks = ['XAI_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GROQ_API_KEY'].filter(
      (k) => Boolean((process.env[k] || '').trim()),
    )
    checks.push({
      id: 'ai_fallbacks',
      label: 'AI fallbacks',
      ok: fallbacks.length > 0 || cfOk,
      detail: fallbacks.length ? fallbacks.join(', ') : 'None (CF AI only)',
    })

    // SEO strategies corpus
    try {
      const index = await loadStrategiesIndex()
      const pack = await loadStrategyPromptPack()
      const docs = index.documents?.length || 0
      const rules = pack.standingRules?.length || 0
      checks.push({
        id: 'seo_strategies',
        label: 'SEO strategies corpus',
        ok: docs > 0 && rules > 0,
        detail: `${docs} docs · ${index.ownershipRows ?? 0} ownership rows · prompt-pack ${rules} rules · synced ${index.updatedAt || '—'}`,
      })
    } catch (e) {
      checks.push({
        id: 'seo_strategies',
        label: 'SEO strategies corpus',
        ok: false,
        detail: e instanceof Error ? e.message.slice(0, 140) : 'Not loaded — run npm run sync:seo-strategies',
      })
    }

    const ready = checks
      .filter((c) => ['cloudflare_ai', 'github', 'supabase'].includes(c.id))
      .every((c) => c.ok)

    return NextResponse.json({
      ok: ready,
      ready,
      checkedAt: new Date().toISOString(),
      checks,
    })
  } catch (err) {
    console.error('[seo-factory/health]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Health check failed' },
      { status: 500 },
    )
  }
}

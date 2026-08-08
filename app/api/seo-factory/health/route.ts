import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  isCloudflareAiConfigured,
  generateContentText,
  listConfiguredContentProviders,
  refreshAiVault,
} from '@/lib/contentAiProvider'
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

    // Admin-pasted vault keys (Supabase) take priority over Worker secrets.
    await refreshAiVault()

    const checks: Array<{
      id: string
      label: string
      ok: boolean
      detail: string
    }> = []

    // Content AI chain: DeepSeek (NVIDIA) primary → Cloudflare fallback → free tiers
    const providers = listConfiguredContentProviders()
    const anyAi = providers.some((p) => p.configured)
    if (!anyAi) {
      checks.push({
        id: 'content_ai',
        label: 'Content AI chain',
        ok: false,
        detail:
          'No providers configured. Set XAI_API_KEY (Grok primary), OPENAI_API_KEY (secondary), NVIDIA_API_KEY, or Cloudflare AI token.',
      })
    } else {
      try {
        const r = await generateContentText({
          system: 'Reply with exactly: ok',
          prompt: 'ok',
          maxTokens: 8,
          temperature: 0,
        })
        checks.push({
          id: 'content_ai',
          label: 'Content AI chain',
          ok: true,
          detail: `Live OK · ${r.provider} · ${r.model}`,
        })
      } catch (e) {
        checks.push({
          id: 'content_ai',
          label: 'Content AI chain',
          ok: false,
          detail: e instanceof Error ? e.message.slice(0, 220) : 'AI call failed',
        })
      }
    }
    for (const p of providers) {
      checks.push({
        id: `ai_${p.id}`,
        label: `AI · ${p.label}`,
        ok: p.configured,
        detail: p.configured
          ? `${p.role === 'primary' ? 'Primary' : 'Fallback'} · credentials present`
          : 'Not configured',
      })
    }
    // Keep legacy id for UI that still looks for cloudflare_ai
    checks.push({
      id: 'cloudflare_ai',
      label: 'Cloudflare Workers AI (fallback)',
      ok: isCloudflareAiConfigured(),
      detail: isCloudflareAiConfigured()
        ? 'Configured as first fallback after DeepSeek'
        : 'Missing CLOUDFLARE_ACCOUNT_ID or AI token (optional if NVIDIA_API_KEY is set)',
    })

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

    // Gig-style fallbacks summary (credentials present)
    const fb = listConfiguredContentProviders().filter((p) => p.role === 'fallback' && p.configured)
    checks.push({
      id: 'ai_fallbacks',
      label: 'AI fallbacks (gig chain)',
      ok: fb.length > 0 || isCloudflareAiConfigured(),
      detail: fb.length
        ? fb.map((p) => p.id).join(', ')
        : isCloudflareAiConfigured()
          ? 'None configured — CF AI only (add GROQ/GEMINI/OPENROUTER like gigs)'
          : 'None',
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

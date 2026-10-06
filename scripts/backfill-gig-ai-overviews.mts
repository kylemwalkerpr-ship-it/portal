/**
 * Backfill public.gigs.ai_overview with curated buyer-facing overviews.
 *
 * Prefer Content Studio live models already authenticated in this estate:
 *   1. Grok (XAI_API_KEY / grok-4.6) — default
 *   2. DeepSeek first-party (DEEPSEEK_API_KEY / deepseek-flash)
 *
 * Usage:
 *   GIG_AI_OVERVIEW_BACKFILL=1 npx tsx scripts/backfill-gig-ai-overviews.mts
 *   GIG_AI_OVERVIEW_BACKFILL=1 GIG_AI_OVERVIEW_LIMIT=20 npx tsx scripts/backfill-gig-ai-overviews.mts
 *   GIG_AI_OVERVIEW_BACKFILL=1 GIG_AI_OVERVIEW_SLUGS=slug-a,slug-b npx tsx scripts/backfill-gig-ai-overviews.mts
 *   GIG_AI_OVERVIEW_BACKFILL=1 GIG_AI_OVERVIEW_DRY_RUN=1 ...
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_JWT (or _KEY)
 * and at least one of XAI_API_KEY / DEEPSEEK_API_KEY.
 * Apply migration 20261006151708_gigs_ai_overview.sql before writing.
 */
import { createClient } from '@supabase/supabase-js'
import {
  buildGigAiOverviewSystemPrompt,
  buildGigAiOverviewUserPrompt,
  gigAiOverviewQualityIssues,
  isValidGigAiOverview,
  sanitizeGigAiOverview,
  type GigOverviewSource,
} from '../lib/gigAiOverview'

if (process.env.GIG_AI_OVERVIEW_BACKFILL !== '1') {
  console.log('[gig-ai-overview] disabled; set GIG_AI_OVERVIEW_BACKFILL=1 to run')
  process.exit(0)
}

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const serviceKey = String(
  process.env.SUPABASE_SERVICE_ROLE_JWT || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
).trim()
if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase production credentials')

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const XAI_KEY = String(process.env.XAI_API_KEY || '').trim()
const XAI_MODEL = String(process.env.XAI_MODEL || 'grok-4.6').trim()
const DEEPSEEK_KEY = String(process.env.DEEPSEEK_API_KEY || '').trim()
const DEEPSEEK_MODEL = String(process.env.DEEPSEEK_MODEL || 'deepseek-flash').trim()
const DEEPSEEK_BASE = String(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '')

if (!XAI_KEY && !DEEPSEEK_KEY) {
  throw new Error('No overview model configured (need XAI_API_KEY and/or DEEPSEEK_API_KEY)')
}

const DRY = process.env.GIG_AI_OVERVIEW_DRY_RUN === '1'
const LIMIT = Math.max(1, Number(process.env.GIG_AI_OVERVIEW_LIMIT || 50) || 50)
const FORCE = process.env.GIG_AI_OVERVIEW_FORCE === '1'
const SLUGS = String(process.env.GIG_AI_OVERVIEW_SLUGS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function post(url: string, key: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as any
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(data).slice(0, 400)}`)
  const content = data?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') throw new Error('empty model content')
  return content
}

async function generateOverview(source: GigOverviewSource): Promise<string> {
  const role = source.provider_type === 'consultant' ? 'consultant' : 'attorney'
  const system = buildGigAiOverviewSystemPrompt(role)
  const user = buildGigAiOverviewUserPrompt(source)
  const errors: string[] = []

  if (XAI_KEY) {
    try {
      return await post('https://api.x.ai/v1/chat/completions', XAI_KEY, {
        model: XAI_MODEL,
        temperature: 0.4,
        max_tokens: 500,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })
    } catch (e) {
      errors.push(`grok: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (DEEPSEEK_KEY) {
    try {
      return await post(`${DEEPSEEK_BASE}/chat/completions`, DEEPSEEK_KEY, {
        model: DEEPSEEK_MODEL,
        temperature: 0.4,
        max_tokens: 500,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })
    } catch (e) {
      errors.push(`deepseek: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  throw new Error(errors.join(' | ') || 'no providers')
}

async function loadGigs() {
  let query = db
    .from('gigs')
    .select(
      'id, slug, title, pitch, tagline, description, seo_description, ai_overview, category, subcategory, jurisdiction, tags, requirements, faq, provider_type, status, tiers:gig_tiers(tier, title, description, price, delivery_days, features, is_active)',
    )
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(LIMIT)

  if (SLUGS.length) query = query.in('slug', SLUGS)
  if (!FORCE) query = query.or('ai_overview.is.null,ai_overview.eq.')

  const { data, error } = await query
  if (error) throw error
  return data || []
}

async function main() {
  const gigs = await loadGigs()
  console.log(`[gig-ai-overview] candidates=${gigs.length} dry=${DRY} force=${FORCE}`)

  let ok = 0
  let skip = 0
  let fail = 0

  for (const gig of gigs as Array<GigOverviewSource & { id: string; slug: string; ai_overview?: string | null }>) {
    const existing = sanitizeGigAiOverview(String(gig.ai_overview || ''))
    if (!FORCE && isValidGigAiOverview(existing) && gigAiOverviewQualityIssues(existing).length === 0) {
      skip += 1
      continue
    }

    try {
      const raw = await generateOverview(gig)
      const cleaned = sanitizeGigAiOverview(raw)
      if (!isValidGigAiOverview(cleaned)) {
        throw new Error(`invalid overview length=${cleaned.length}`)
      }
      const issues = gigAiOverviewQualityIssues(cleaned)
      if (issues.includes('opens as provider mini-bio') || issues.includes('contains summary label')) {
        throw new Error(`quality gate: ${issues.join(', ')}`)
      }

      console.log(`[ok] ${gig.slug} (${cleaned.length} chars) ${cleaned.slice(0, 100)}…`)
      if (!DRY) {
        const { error } = await db
          .from('gigs')
          .update({ ai_overview: cleaned, updated_at: new Date().toISOString() })
          .eq('id', gig.id)
        if (error) throw error
      }
      ok += 1
      await sleep(400)
    } catch (e) {
      fail += 1
      console.error(`[fail] ${gig.slug}: ${e instanceof Error ? e.message : String(e)}`)
      await sleep(600)
    }
  }

  console.log(`[gig-ai-overview] done ok=${ok} skip=${skip} fail=${fail}`)
  if (fail && !ok) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

/**
 * lib/seoEngine/backlinkEngine.ts
 *
 * BACKLINK & KNOWLEDGE-RADAR ENGINE
 *
 * Half of the estate's link graph lives OUTSIDE our own properties:
 * inbound referrals from high-authority third-party sites are what move
 * strategy-grade metrics (topical authority, E-E-A-T, citation share of
 * voice in LLMs). This module:
 *
 *   1. Discovers external opportunities  → curated target list in seo_backlink_targets
 *   2. Tracks outreach attempts           → seo_backlink_outreach
 *   3. Analyzes OUR content for gaps      → inbound + outbound gaps derived from
 *                                            anchor_ledger and seo_interlinks
 *   4. Drafts outreach messages          → best-effort via the AI cascade, with
 *                                            a deterministic 4-paragraph template
 *                                            fallback so the operator can ship
 *                                            without waiting on the model.
 *
 * Every result is auditable: writes are CRUD against the dedicated
 * Backlink tables joined with seo_engine_runs for observability.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { generateContentText } from '@/lib/contentAiProvider'
import { getStage, type Country, type LifecycleStageDef } from './ontology'

// ── Types ────────────────────────────────────────────────────────────────────

export type BacklinkKind = 'media' | 'gov' | 'edu' | 'ngo' | 'industry_blog' | 'partner' | 'directory' | 'forum'
export type BacklinkLane =
  | 'editorial' | 'guest_post' | 'resource_page' | 'directory'
  | 'podcast_interview' | 'broken_outreach' | 'community' | 'partner'

export type TargetStatus =
  | 'identified' | 'researching' | 'qualified' | 'drafting' | 'sent'
  | 'awaiting_reply' | 'responded' | 'won' | 'lost' | 'skipped'

export type OutreachStatus =
  | 'drafted' | 'queued' | 'sent' | 'bounced'
  | 'responded' | 'replied_positive' | 'replied_negative' | 'replied_neutral'
  | 'follow_up_due' | 'follow_up_sent'
  | 'won' | 'lost' | 'withdrawn'

export interface BacklinkTarget {
  id: string
  domain: string
  target_url: string | null
  title: string | null
  kind: BacklinkKind
  lane: BacklinkLane
  authority_score: number
  traffic_estimate: number | null
  contact_name: string | null
  contact_email: string | null
  contact_handle: string | null
  countries: string[]
  stages: string[]
  topics: string[]
  rationale: string | null
  status: TargetStatus
  first_seen_at: string
  last_touched_at: string
  won_at: string | null
  lost_at: string | null
  won_backlink_url: string | null
  notes: string | null
}

export interface OutreachTouch {
  id: string
  target_id: string
  channel: 'email' | 'linkedin_dm' | 'twitter_dm' | 'twitter_reply' | 'contact_form' | 'phone' | 'in_person'
  direction: 'outbound' | 'inbound' | 'internal'
  subject: string | null
  message_body: string
  status: OutreachStatus
  drafted_at: string
  sent_at: string | null
  first_reply_at: string | null
  follow_up_due_at: string | null
  follow_up_count: number
  replied_summary: string | null
  reply_text: string | null
  lost_reason: string | null
  operator_id: string | null
  source_brief: Record<string, unknown>
}

export interface InboundGap {
  source_slug: string
  inbound_links: number
  inbound_anchors: string[]
  inbound_sources: string[]   // distinct source_slug that point at us
  recommendation:
    | 'boost_internal'        // low inbound \u2192 schedule a Brief from a high-authority neighbor
    | 'update_or_republish'   // dead or thin page
    | 'add_to_marketplace'    // candidate marketplace CTA
}

export interface OutboundGap {
  source_slug: string
  outbound_links: number
  distinct_targets: string[]
  recommendation:
    | 'add_internal_links'    // < 3 outbound \u2192 enrich cross-domain graph
    | 'add_marketplace_cta'   // bottom-funnel opportunity missing marketplace CTA
    | 'defer'
}

// ── 1. Inbound gap analyzer ─────────────────────────────────────────────────
/**
 * "Orphan" detection: pages we have published that receive too few internal
 * inbound links. Threshold is configurable. We index by `source_slug` because
 * the planner writes that slug into `anchor_ledger` and `seo_interlinks`.
 */
export async function listInboundGaps(opts: {
  minInbound?: number       // default 3
  limit?: number            // default 50
  country?: Country | null
  stage?: LifecycleStage | null
} = {}): Promise<InboundGap[]> {
  const minInbound = opts.minInbound ?? 3
  const limit = opts.limit ?? 50
  try {
    const supabase = createSupabaseAdminClient()
    const { data: anchors } = await supabase
      .from('anchor_ledger')
      .select('source_slug, target_url, anchor')
      .order('created_at', { ascending: false })
      .limit(2000)
    const { data: interlinks } = await supabase
      .from('seo_interlinks')
      .select('source_slug, target_url, anchor_text')
      .limit(2000)

    // Build inbound view: for each source_slug, count incoming edges.
    const inbound = new Map<string, { count: number; anchors: Set<string>; sources: Set<string> }>()
    for (const a of (anchors || []) as Array<{ source_slug: string; target_url: string; anchor: string }>) {
      const k = a.target_url || a.source_slug
      if (!k) continue
      const e = inbound.get(k) || { count: 0, anchors: new Set<string>(), sources: new Set<string>() }
      e.count += 1
      if (a.anchor) e.anchors.add(a.anchor)
      e.sources.add(a.source_slug)
      inbound.set(k, e)
    }
    // seo_interlinks also count toward inbound (planned/applied)
    for (const l of (interlinks || []) as Array<{ source_slug: string; target_url: string; anchor_text: string }>) {
      const k = l.target_url
      if (!k) continue
      const e = inbound.get(k) || { count: 0, anchors: new Set<string>(), sources: new Set<string>() }
      e.count += 1
      if (l.anchor_text) e.anchors.add(l.anchor_text)
      e.sources.add(l.source_slug)
      inbound.set(k, e)
    }

    const gaps: InboundGap[] = []
    for (const [slug, e] of inbound.entries()) {
      if (e.count >= minInbound) continue
      const recommendation: InboundGap['recommendation'] =
        e.count === 0 ? 'boost_internal'
        : (e.count === 1 ? 'update_or_republish' : 'add_to_marketplace')
      gaps.push({
        source_slug: slug,
        inbound_links: e.count,
        inbound_anchors: [...e.anchors].slice(0, 5),
        inbound_sources: [...e.sources].slice(0, 5),
        recommendation,
      })
    }
    return gaps.sort((a, b) => a.inbound_links - b.inbound_links).slice(0, limit)
  } catch {
    return []
  }
}

// ── 2. Outbound gap analyzer ────────────────────────────────────────────────
/**
 * Pages that under-link OUT (too few outbound targets). These are the
 * candidates for the interlink engine's stage-aware edges.
 */
export async function listOutboundGaps(opts: {
  minOutbound?: number  // default 3
  limit?: number        // default 50
} = {}): Promise<OutboundGap[]> {
  const minOutbound = opts.minOutbound ?? 3
  const limit = opts.limit ?? 50
  try {
    const supabase = createSupabaseAdminClient()
    const { data: anchors } = await supabase
      .from('anchor_ledger')
      .select('source_slug, target_url')
      .limit(2000)
    const { data: interlinks } = await supabase
      .from('seo_interlinks')
      .select('source_slug, target_url, reason')
      .in('status', ['planned', 'applied'])

    // For each source_slug, count distinct outbound targets.
    const outbound = new Map<string, { count: number; targets: Set<string> }>()
    for (const a of (anchors || []) as Array<{ source_slug: string; target_url: string }>) {
      if (!a.source_slug) continue
      const e = outbound.get(a.source_slug) || { count: 0, targets: new Set<string>() }
      e.count += 1
      e.targets.add(a.target_url)
      outbound.set(a.source_slug, e)
    }
    for (const l of (interlinks || []) as Array<{ source_slug: string; target_url: string; reason: string }>) {
      if (!l.source_slug) continue
      const e = outbound.get(l.source_slug) || { count: 0, targets: new Set<string>() }
      e.count += 1
      e.targets.add(l.target_url)
      outbound.set(l.source_slug, e)
    }
    const gaps: OutboundGap[] = []
    for (const [slug, e] of outbound.entries()) {
      if (e.count >= minOutbound) continue
      const recommendation: OutboundGap['recommendation'] =
        e.count === 0 ? 'add_internal_links' : (e.count === 1 ? 'add_marketplace_cta' : 'defer')
      gaps.push({
        source_slug: slug,
        outbound_links: e.count,
        distinct_targets: [...e.targets].slice(0, 6),
        recommendation,
      })
    }
    return gaps.sort((a, b) => a.outbound_links - b.outbound_links).slice(0, limit)
  } catch {
    return []
  }
}

// ── 3. Target opportunities ─────────────────────────────────────────────────
/**
 * Curated list of external sites we want a backlink FROM. Filterable by
 * country, stage, kind, lane, and status. Sorted by authority_score desc.
 */
export async function listTargetOpportunities(opts: {
  country?: Country
  stage?: LifecycleStage
  kind?: BacklinkKind
  lane?: BacklinkLane
  status?: TargetStatus
  limit?: number
} = {}): Promise<BacklinkTarget[]> {
  const limit = opts.limit ?? 100
  try {
    const supabase = createSupabaseAdminClient()
    let q = supabase
      .from('seo_backlink_targets')
      .select('*')
      .order('authority_score', { ascending: false })
      .limit(limit)
    if (opts.country) q = q.contains('countries', [opts.country])
    if (opts.stage) q = q.contains('stages', [opts.stage])
    if (opts.kind) q = q.eq('kind', opts.kind)
    if (opts.lane) q = q.eq('lane', opts.lane)
    if (opts.status) q = q.eq('status', opts.status)
    const { data } = await q
    return ((data as Array<Record<string, unknown>>) || []).map(rowToTarget)
  } catch {
    return []
  }
}

function rowToTarget(r: Record<string, unknown>): BacklinkTarget {
  return {
    id: String(r.id || ''),
    domain: String(r.domain || ''),
    target_url: (r.target_url as string) || null,
    title: (r.title as string) || null,
    kind: (r.kind as BacklinkKind) || 'media',
    lane: (r.lane as BacklinkLane) || 'editorial',
    authority_score: Number(r.authority_score || 0),
    traffic_estimate: r.traffic_estimate != null ? Number(r.traffic_estimate) : null,
    contact_name: (r.contact_name as string) || null,
    contact_email: (r.contact_email as string) || null,
    contact_handle: (r.contact_handle as string) || null,
    countries: (r.countries as string[]) || [],
    stages: (r.stages as string[]) || [],
    topics: (r.topics as string[]) || [],
    rationale: (r.rationale as string) || null,
    status: (r.status as TargetStatus) || 'identified',
    first_seen_at: String(r.first_seen_at || new Date().toISOString()),
    last_touched_at: String(r.last_touched_at || new Date().toISOString()),
    won_at: (r.won_at as string) || null,
    lost_at: (r.lost_at as string) || null,
    won_backlink_url: (r.won_backlink_url as string) || null,
    notes: (r.notes as string) || null,
  }
}

// ── 4. Outreach timeline + persistence ─────────────────────────────────────
export async function recordOutreach(input: {
  target_id: string
  channel?: OutreachTouch['channel']
  direction?: OutreachTouch['direction']
  subject?: string
  message_body: string
  status?: OutreachStatus
  operator_id?: string
  source_brief?: Record<string, unknown>
}): Promise<OutreachTouch | null> {
  try {
    const supabase = createSupabaseAdminClient()
    const now = new Date().toISOString()
    const row = {
      target_id: input.target_id,
      channel: input.channel || 'email',
      direction: input.direction || 'outbound',
      subject: input.subject || null,
      message_body: input.message_body,
      status: input.status || 'drafted',
      drafted_at: now,
      operator_id: input.operator_id || null,
      source_brief: input.source_brief || {},
    }
    const { data, error } = await supabase
      .from('seo_backlink_outreach')
      .insert(row)
      .select('*')
      .single()
    if (error || !data) return null
    // Bump the parent target's last_touched_at so dashboards stay fresh.
    await supabase
      .from('seo_backlink_targets')
      .update({ last_touched_at: now })
      .eq('id', input.target_id)
    return rowToOutreach(data as Record<string, unknown>)
  } catch {
    return null
  }
}

export async function listOutreachForTarget(targetId: string): Promise<OutreachTouch[]> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('seo_backlink_outreach')
      .select('*')
      .eq('target_id', targetId)
      .order('drafted_at', { ascending: false })
    return ((data as Array<Record<string, unknown>>) || []).map(rowToOutreach)
  } catch {
    return []
  }
}

function rowToOutreach(r: Record<string, unknown>): OutreachTouch {
  return {
    id: String(r.id || ''),
    target_id: String(r.target_id || ''),
    channel: (r.channel as OutreachTouch['channel']) || 'email',
    direction: (r.direction as OutreachTouch['direction']) || 'outbound',
    subject: (r.subject as string) || null,
    message_body: String(r.message_body || ''),
    status: (r.status as OutreachStatus) || 'drafted',
    drafted_at: String(r.drafted_at || new Date().toISOString()),
    sent_at: (r.sent_at as string) || null,
    first_reply_at: (r.first_reply_at as string) || null,
    follow_up_due_at: (r.follow_up_due_at as string) || null,
    follow_up_count: Number(r.follow_up_count || 0),
    replied_summary: (r.replied_summary as string) || null,
    reply_text: (r.reply_text as string) || null,
    lost_reason: (r.lost_reason as string) || null,
    operator_id: (r.operator_id as string) || null,
    source_brief: (r.source_brief as Record<string, unknown>) || {},
  }
}

// ── 5. Outreach-message drafter ─────────────────────────────────────────────
/**
 * Generates a 4-paragraph outreach email. Best-effort via the AI cascade —
 * if the model is unavailable, falls back to a deterministic template that
 * the operator can ship manually.
 */
export async function draftOutreachMessage(opts: {
  target: BacklinkTarget
  briefContext?: { topic?: string; stage?: LifecycleStage; country?: Country; url?: string }
  whyWeFit?: string
}): Promise<{ subject: string; body: string; model: string | null }> {
  const { target, briefContext, whyWeFit } = opts
  const fitLine = whyWeFit || target.rationale ||
    `We publish ${((target.stages && target.stages.length) ? target.stages.join(', ') : 'comprehensive life-cycle coverage')} for ${((target.countries && target.countries.length) ? target.countries.join(' / ') : 'the global immigration audience')} and have a strong track record of citing primary sources like ${target.domain}.`
  const briefLine = briefContext
    ? `Our most recent casework in this space: ${briefContext.topic} \u2014 ${briefContext.url || 'available on our caseworks hub'}.`
    : `Our editorial team maintains a deep library of policy-accurate, citation-rich guides on this topic.`

  const prompt = `Write a concise 4-paragraph outreach email from the marketing team at "YouSafe Consultancy" (an immigration-focused content + marketplace business) to an editor at ${target.domain}.

Reason for reach-out:
${fitLine}

Context about us:
${briefLine}

Style rules:
- Paragraph 1: introduce yourself and the reason for the email (1 sentence).
- Paragraph 2: explain why ${target.domain} is the right home for this material (specific, no puffery).
- Paragraph 3: a specific, low-friction ask (e.g. a citation, a resource-page addition, a guest column, an interview).
- Paragraph 4: thank them, sign off with a single sentence.

Hard rules:
- Under 220 words.
- No emojis, no marketing hype.
- Plain text only \u2014 no HTML, no markdown bolding.
- Output a JSON object with \`subject\` and \`body\`.

Return ONLY JSON. No commentary.`

  try {
    const res = await generateContentText({
      aiProvider: 'openai',
      system: 'You are a senior outreach copywriter who writes short, honest, copy-edit-ready outreach emails. Output strict JSON: { "subject", "body" }. Return ONLY JSON, no commentary.',
      prompt,
      maxTokens: 600,
      temperature: 0.35,
    })
    const parsed = JSON.parse(res.text || '{}')
    if (parsed && typeof parsed.body === 'string' && parsed.body.length > 80) {
      return { subject: String(parsed.subject || `Resource for ${target.domain}`), body: String(parsed.body), model: res.model }
    }
  } catch {
    // continue to template fallback
  }

  // Deterministic fallback \u2014 operator can ship without waiting on the model.
  const subject = `Resource on ${target.stages[0] || 'immigration'} for ${target.domain}`
  const body = `Hi ${target.contact_name || 'team'},

I'm reaching out on behalf of YouSafe Consultancy, an immigration-content and -marketplace business. We publish casework-grade guides on ${(target.stages || []).slice(0, 2).join(' and ')} for ${(target.countries || []).slice(0, 2).join(' / ')}, and ${target.domain} is exactly the kind of precise, citation-rich outlet we love being referenced by.

${briefLine}

Would you consider adding one of our guides as a citation on a relevant resource page, or commissioning a short guest column from us? Either is straightforward \u2014 no fees, no SEO-swap ask, and we can format the embed however your CMS prefers.

Either way, thank you for the work you do \u2014 keep it up,
YouSafe editorial team`
  return { subject, body, model: 'template' }
}

// ── Dashboard read ──────────────────────────────────────────────────────────
export async function getTargetDashboard(opts: {
  country?: Country
  stage?: LifecycleStage
  status?: TargetStatus
  limit?: number
} = {}): Promise<Array<Record<string, unknown>>> {
  try {
    const supabase = createSupabaseAdminClient()
    let q = supabase
      .from('seo_backlink_dashboard')
      .select('*')
      .order('authority_score', { ascending: false })
      .limit(opts.limit ?? 100)
    if (opts.country) q = q.contains('countries', [opts.country])
    if (opts.stage) q = q.contains('stages', [opts.stage])
    if (opts.status) q = q.eq('target_status', opts.status)
    const { data } = await q
    return (data as Array<Record<string, unknown>>) || []
  } catch {
    return []
  }
}

// ── High-level wrapper used by the API route ────────────────────────────────
export async function runBacklinkReport(opts: {
  country?: Country
  stage?: LifecycleStage
} = {}): Promise<{
  inboundGaps: InboundGap[]
  outboundGaps: OutboundGap[]
  targets: BacklinkTarget[]
  summary: {
    inbound_avg: number
    outbound_avg: number
    target_total: number
    target_won: number
  }
}> {
  const [inboundGaps, outboundGaps, targets] = await Promise.all([
    listInboundGaps({ minInbound: 3, limit: 50, country: opts.country, stage: opts.stage }),
    listOutboundGaps({ minOutbound: 3, limit: 50 }),
    listTargetOpportunities({ country: opts.country, stage: opts.stage, limit: 100 }),
  ])
  const target_won = targets.filter((t) => t.status === 'won').length
  const inbound_avg = inboundGaps.length ? inboundGaps.reduce((s, g) => s + g.inbound_links, 0) / inboundGaps.length : 0
  const outbound_avg = outboundGaps.length ? outboundGaps.reduce((s, g) => s + g.outbound_links, 0) / outboundGaps.length : 0
  return {
    inboundGaps,
    outboundGaps,
    targets,
    summary: {
      inbound_avg: Number(inbound_avg.toFixed(1)),
      outbound_avg: Number(outbound_avg.toFixed(1)),
      target_total: targets.length,
      target_won,
    },
  }
}

export type LifecycleStage = LifecycleStageDef

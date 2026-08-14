/**
 * POST /api/cron/daily-digest
 *
 * Cron endpoint that assembles a morning health digest from the system-health
 * and model-calibration endpoints and POSTs it to Slack and/or Discord.
 *
 * Environment variables:
 *   SLACK_WEBHOOK_URL  — Slack Incoming Webhook URL (optional)
 *   DISCORD_WEBHOOK_URL — Discord Webhook URL (optional)
 *
 * Called by a daily GitHub Actions schedule or Cloudflare cron trigger.
 * Protected by CRON_SECRET header matching.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getGscConfig } from '@/lib/gscConfig'
import { createClient } from '@supabase/supabase-js'

// ── Data fetching (direct Supabase queries, no admin-auth endpoints) ────────

async function fetchSystemHealth(): Promise<HealthData> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { count: apiKeysCount } = await supabase
    .from('ai_provider_keys')
    .select('*', { count: 'exact', head: true })
    .eq('enabled', true)
    .not('api_key', 'is', null)

  const gscCfg = await getGscConfig()
  const gscMode =
    gscCfg.refreshToken && gscCfg.clientId && gscCfg.clientSecret
      ? 'oauth'
      : gscCfg.serviceAccountKey
        ? 'service_account'
        : null
  const gscConnected = gscMode !== null && Boolean(gscCfg.siteUrl)

  const { count: interlinkCount } = await supabase
    .from('seo_interlinks')
    .select('*', { count: 'exact', head: true })

  const { count: activeInterlinks } = await supabase
    .from('seo_interlinks')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  const { data: lastAudit } = await supabase
    .from('content_jobs')
    .select('updated_at')
    .not('audit_json', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)

  const { count: shippedCount } = await supabase
    .from('content_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'merged')

  return {
    apiKeysConfigured: apiKeysCount ?? 0,
    gscConnected: !!gscConnected,
    gscMode,
    interlinkTotal: interlinkCount ?? 0,
    interlinkActive: activeInterlinks ?? 0,
    lastSiteScan: (lastAudit && lastAudit.length > 0) ? lastAudit[0].updated_at : null,
    totalShipped: shippedCount ?? 0,
  }
}

async function fetchModelCalibration(): Promise<CalibrationData> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: cal } = await supabase
    .from('seo_model_calibration')
    .select('model_version, events_count, recalibrated_at')
    .order('recalibrated_at', { ascending: false })
    .limit(1)

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { count: recentRuns } = await supabase
    .from('seo_forecast_runs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', thirtyDaysAgo)

  const { data: rewardEvents } = await supabase
    .from('seo_reward_events')
    .select('direction_match')
    .gte('observed_at', thirtyDaysAgo)

  let accuracy: number | null = null
  if (rewardEvents && rewardEvents.length > 0) {
    const agree = rewardEvents.filter((e: any) => e.direction_match === true).length
    const disagree = rewardEvents.filter((e: any) => e.direction_match === false).length
    const total = agree + disagree
    if (total > 0) accuracy = Math.round((agree / total) * 100)
  }

  const latest = cal?.[0] ?? null

  return {
    lastCalibratedAt: latest?.recalibrated_at ?? null,
    modelVersion: latest?.model_version ?? 'unknown',
    eventsCount: latest?.events_count ?? 0,
    accuracy,
    accuracyTrend: null, // derived heuristically from notes in the full endpoint
    recentRuns: recentRuns ?? 0,
  }
}

interface HealthData {
  apiKeysConfigured: number
  gscConnected: boolean
  gscMode: string | null
  interlinkTotal: number
  interlinkActive: number
  lastSiteScan: string | null
  totalShipped: number
}

interface CalibrationData {
  lastCalibratedAt: string | null
  modelVersion: string
  eventsCount: number
  accuracy: number | null
  accuracyTrend: 'improving' | 'stable' | 'declining' | null
  recentRuns: number
}

// ── Message builders ────────────────────────────────────────────────────────

function buildSlackBlocks(health: HealthData, cal: CalibrationData) {
  const statusEmoji = (ok: boolean) => (ok ? '✅' : '❌')
  const trendEmoji = (t: string | null) =>
    t === 'improving' ? '↗' : t === 'declining' ? '↘' : t === 'stable' ? '→' : '—'

  const lastScan = health.lastSiteScan
    ? new Date(health.lastSiteScan).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Never'

  const lastCal = cal.lastCalibratedAt
    ? new Date(cal.lastCalibratedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : 'Never'

  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📋 YouSafe Content Studio · Daily Digest', emoji: true },
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*🔑 API Keys*\n${health.apiKeysConfigured} configured` },
          { type: 'mrkdwn', text: `*🔗 GSC*\n${health.gscConnected ? statusEmoji(true) + ' Connected' : statusEmoji(false) + ' Offline'} · ${health.gscMode?.toUpperCase() || 'none'}` },
          { type: 'mrkdwn', text: `*🩺 Last Audit*\n${lastScan}` },
          { type: 'mrkdwn', text: `*🕸️ Interlinks*\n${health.interlinkTotal} total · ${health.interlinkActive} active` },
          { type: 'mrkdwn', text: `*📦 Shipped*\n${health.totalShipped} merged jobs` },
          { type: 'mrkdwn', text: `*🧠 Model*\n${cal.accuracy ?? '—'}% accuracy ${trendEmoji(cal.accuracyTrend)} · ${cal.eventsCount} events` },
        ],
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🕐 ${new Date().toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · v${cal.modelVersion} · auto-calibrates weekly`,
          },
        ],
      },
    ],
  }
}

function buildDiscordEmbed(health: HealthData, cal: CalibrationData) {
  const statusEmoji = (ok: boolean) => (ok ? '🟢' : '🔴')
  const trendEmoji = (t: string | null) =>
    t === 'improving' ? '↗' : t === 'declining' ? '↘' : t === 'stable' ? '→' : '—'

  const lastScan = health.lastSiteScan
    ? new Date(health.lastSiteScan).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'Never'

  return {
    embeds: [
      {
        title: '📋 YouSafe Content Studio · Daily Digest',
        color: health.gscConnected ? 0x3f6f3f : 0xdc2626,
        fields: [
          { name: '🔑 API Keys', value: `${health.apiKeysConfigured} configured`, inline: true },
          {
            name: '🔗 GSC',
            value: `${statusEmoji(health.gscConnected)} ${health.gscConnected ? 'Connected' : 'Offline'} · ${health.gscMode?.toUpperCase() || 'none'}`,
            inline: true,
          },
          { name: '🩺 Last Audit', value: lastScan, inline: true },
          { name: '🕸️ Interlinks', value: `${health.interlinkTotal} total · ${health.interlinkActive} active`, inline: true },
          { name: '📦 Shipped', value: `${health.totalShipped} merged`, inline: true },
          {
            name: '🧠 Model',
            value: `${cal.accuracy ?? '—'}% ${trendEmoji(cal.accuracyTrend)} · ${cal.eventsCount} events`,
            inline: true,
          },
        ],
        footer: {
          text: `v${cal.modelVersion} · auto-calibrates weekly · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        },
      },
    ],
  }
}

// ── POST handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Auth: require CRON_SECRET header match.
    const cronSecret = request.headers.get('x-cron-secret')
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch data directly from Supabase (no admin-auth endpoint dependency).
    const [healthData, calData] = await Promise.all([
      fetchSystemHealth(),
      fetchModelCalibration().catch(() => ({
        lastCalibratedAt: null,
        modelVersion: 'unknown',
        eventsCount: 0,
        accuracy: null,
        accuracyTrend: null,
        recentRuns: 0,
      })),
    ])

    const results: { slack?: string; discord?: string } = {}

    // ── Send to Slack ──
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        const slackPayload = buildSlackBlocks(healthData, calData)
        const sr = await fetch(process.env.SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(slackPayload),
        })
        results.slack = sr.ok ? 'sent' : `HTTP ${sr.status}`
      } catch (e: any) {
        results.slack = `error: ${e.message}`
      }
    }

    // ── Send to Discord ──
    if (process.env.DISCORD_WEBHOOK_URL) {
      try {
        const discordPayload = buildDiscordEmbed(healthData, calData)
        const dr = await fetch(
          `${process.env.DISCORD_WEBHOOK_URL}?wait=true`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(discordPayload),
          },
        )
        results.discord = dr.ok ? 'sent' : `HTTP ${dr.status}`
      } catch (e: any) {
        results.discord = `error: ${e.message}`
      }
    }

    const sent = Object.values(results).filter((v) => v === 'sent').length

    return NextResponse.json({
      ok: true,
      sent: sent > 0,
      results,
      health: {
        apiKeys: healthData.apiKeysConfigured,
        gsc: healthData.gscConnected ? 'connected' : 'offline',
        interlinks: healthData.interlinkTotal,
        shipped: healthData.totalShipped,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

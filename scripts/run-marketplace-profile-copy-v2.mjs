import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_JWT || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase production credentials')

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const XAI_API_BASE = 'https://api.x.ai/v1'
const XAI_AUTH_BASE = 'https://auth.x.ai'
const XAI_OAUTH_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828'
const XAI_MODEL = 'grok-4.6'
const REFRESH_SKEW_MS = 10 * 60 * 1000

async function setAiSetting(key, value) {
  const { error } = await db.from('ai_settings').upsert({
    key,
    value: String(value),
    updated_by: 'marketplace-profile-v2-supergrok-refresh',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  if (error) throw new Error(`Unable to persist ${key}: ${error.message}`)
}

async function readOauth() {
  const keys = ['xai_oauth_access_token', 'xai_oauth_refresh_token', 'xai_oauth_expires_at']
  const { data, error } = await db.from('ai_settings').select('key,value').in('key', keys)
  if (error) throw new Error(`Unable to read SuperGrok OAuth settings: ${error.message}`)
  const values = new Map((data || []).map((row) => [row.key, String(row.value || '').trim()]))
  return {
    access: values.get('xai_oauth_access_token') || '',
    refresh: values.get('xai_oauth_refresh_token') || '',
    expiresAt: Number(values.get('xai_oauth_expires_at') || 0),
  }
}

async function refreshOauth(refreshToken) {
  const response = await fetch(`${XAI_AUTH_BASE}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'YouSafe-MarketplaceProfileV2/1.0 (SuperGrok OAuth)',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: XAI_OAUTH_CLIENT_ID,
    }).toString(),
  })
  const text = await response.text()
  let payload = {}
  try { payload = text ? JSON.parse(text) : {} } catch {}
  if (!response.ok || !String(payload?.access_token || '').trim()) {
    throw new Error(`SuperGrok OAuth refresh failed: HTTP ${response.status} ${String(payload?.error_description || payload?.error || text).slice(0, 180)}`)
  }

  const access = String(payload.access_token).trim()
  const refresh = String(payload.refresh_token || refreshToken).trim()
  const expiresAt = Date.now() + Math.max(30, Number(payload.expires_in || 3600)) * 1000
  await Promise.all([
    setAiSetting('xai_oauth_access_token', access),
    setAiSetting('xai_oauth_refresh_token', refresh),
    setAiSetting('xai_oauth_expires_at', String(expiresAt)),
    setAiSetting('xai_oauth_token_type', String(payload.token_type || 'Bearer')),
  ])
  return { access, refresh, expiresAt }
}

async function getFreshOauth(force = false) {
  const oauth = await readOauth()
  if (!force && oauth.access && Number.isFinite(oauth.expiresAt) && oauth.expiresAt > Date.now() + REFRESH_SKEW_MS) return oauth
  if (!oauth.refresh) throw new Error('SuperGrok OAuth refresh token is unavailable')
  return refreshOauth(oauth.refresh)
}

async function probe(access) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45_000)
  try {
    const response = await fetch(`${XAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: XAI_MODEL,
        messages: [
          { role: 'system', content: 'Return JSON only.' },
          { role: 'user', content: 'Return {"ok":true}.' },
        ],
        reasoning_effort: 'low',
        temperature: 0,
        max_tokens: 64,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`SuperGrok probe failed: HTTP ${response.status} ${text.slice(0, 180)}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

function runProfileRewrite(access) {
  return new Promise((resolve) => {
    const existingNodeOptions = String(process.env.NODE_OPTIONS || '').trim()
    const preload = '--import=./scripts/marketplace-xai-low-preload.mjs'
    const child = spawn(process.execPath, ['scripts/rewrite-marketplace-profiles-fiverr-v2.mjs'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        MARKETPLACE_PROFILE_COPY_V2: '1',
        XAI_API_KEY: access,
        XAI_MODEL,
        MARKETPLACE_XAI_REASONING: 'low',
        NODE_OPTIONS: `${existingNodeOptions} ${preload}`.trim(),
      },
    })
    child.on('exit', (code, signal) => resolve({ code: Number(code ?? 1), signal }))
    child.on('error', () => resolve({ code: 1, signal: null }))
  })
}

async function main() {
  let oauth = await getFreshOauth(false)
  await probe(oauth.access)
  console.log('[marketplace-profile-v2] SuperGrok OAuth ready; starting Grok 4.6 low-reasoning profile pass')
  let result = await runProfileRewrite(oauth.access)
  if (result.code === 0) return

  console.warn('[marketplace-profile-v2] first pass did not finish; refreshing OAuth and resuming stamped rows once')
  oauth = await getFreshOauth(true)
  await probe(oauth.access)
  result = await runProfileRewrite(oauth.access)
  if (result.code !== 0) throw new Error(`Profile v2 migration did not complete after OAuth refresh retry (code ${result.code})`)
}

main().catch((error) => {
  console.error('[marketplace-profile-v2] RUNNER FATAL', error)
  process.exit(1)
})

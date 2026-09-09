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
const OAUTH_REFRESH_SKEW_MS = 10 * 60 * 1000

const preferred = [
  {
    id: 'entrim-deepseek',
    baseUrl: 'https://api.entrim.ai/v1',
    model: 'deepseek-ai/DeepSeek-V4-Flash',
  },
  {
    id: 'entrim-qwen-27b',
    baseUrl: 'https://api.entrim.ai/v1',
    model: 'Qwen/Qwen3.6-27B',
  },
  {
    id: 'runbios-glm-53',
    baseUrl: 'https://api.runbios.ai/v1',
    model: 'glm-5.3',
  },
  {
    id: 'runbios-glm-53-flash',
    baseUrl: 'https://api.runbios.ai/v1',
    model: 'glm-5.3-flash',
  },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function setAiSetting(key, value) {
  const { error } = await db.from('ai_settings').upsert({
    key,
    value: String(value),
    updated_by: 'marketplace-copy-supergrok-refresh',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  if (error) throw new Error(`Unable to persist ${key}: ${error.message}`)
}

async function refreshSuperGrok(refreshToken) {
  const response = await fetch(`${XAI_AUTH_BASE}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'YouSafe-MarketplaceRewrite/1.0 (SuperGrok OAuth)',
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
    console.warn(`[marketplace-copy] SuperGrok refresh unavailable: HTTP ${response.status} ${String(payload?.error_description || payload?.error || text).slice(0, 180)}`)
    return null
  }

  const accessToken = String(payload.access_token).trim()
  const nextRefresh = String(payload.refresh_token || refreshToken).trim()
  const expiresIn = Math.max(30, Number(payload.expires_in || 3600))
  const expiresAt = Date.now() + expiresIn * 1000
  await Promise.all([
    setAiSetting('xai_oauth_access_token', accessToken),
    setAiSetting('xai_oauth_refresh_token', nextRefresh),
    setAiSetting('xai_oauth_expires_at', String(expiresAt)),
    setAiSetting('xai_oauth_token_type', String(payload.token_type || 'Bearer')),
  ])
  return {
    id: 'supergrok-oauth',
    kind: 'xai',
    key: accessToken,
    baseUrl: XAI_API_BASE,
    model: XAI_MODEL,
  }
}

async function loadSuperGrokCandidate() {
  const keys = [
    'xai_oauth_access_token',
    'xai_oauth_refresh_token',
    'xai_oauth_expires_at',
  ]
  const { data, error } = await db.from('ai_settings').select('key,value').in('key', keys)
  if (error) throw new Error(`Unable to read SuperGrok OAuth settings: ${error.message}`)
  const settings = new Map((data || []).map((row) => [row.key, String(row.value || '').trim()]))
  const access = settings.get('xai_oauth_access_token') || ''
  const refresh = settings.get('xai_oauth_refresh_token') || ''
  const expiresAt = Number(settings.get('xai_oauth_expires_at') || 0)

  if (access && Number.isFinite(expiresAt) && expiresAt > Date.now() + OAUTH_REFRESH_SKEW_MS) {
    return {
      id: 'supergrok-oauth',
      kind: 'xai',
      key: access,
      baseUrl: XAI_API_BASE,
      model: XAI_MODEL,
    }
  }
  if (refresh) return refreshSuperGrok(refresh)
  return null
}

async function loadCandidates() {
  const candidates = []
  const superGrok = await loadSuperGrokCandidate()
  if (superGrok) candidates.push(superGrok)

  const ids = preferred.map((item) => item.id)
  const { data, error } = await db
    .from('ai_provider_keys')
    .select('provider,api_key,base_url,model,enabled')
    .in('provider', ids)
    .eq('enabled', true)

  if (error) throw new Error(`Unable to read AI vault: ${error.message}`)
  const byId = new Map((data || []).map((row) => [row.provider, row]))

  for (const spec of preferred) {
    const row = byId.get(spec.id)
    const key = String(row?.api_key || '').trim()
    if (!key) continue
    candidates.push({
      id: spec.id,
      kind: 'openai-compat',
      key,
      baseUrl: String(row?.base_url || spec.baseUrl).replace(/\/$/, ''),
      model: String(row?.model || spec.model).trim(),
    })
  }

  const envEntrim = String(process.env.ENTRIM_API_KEY || '').trim()
  if (envEntrim && !candidates.some((candidate) => candidate.id === 'entrim-env')) {
    candidates.push({
      id: 'entrim-env',
      kind: 'openai-compat',
      key: envEntrim,
      baseUrl: String(process.env.ENTRIM_BASE_URL || 'https://api.entrim.ai/v1').replace(/\/$/, ''),
      model: String(process.env.ENTRIM_MARKETPLACE_MODEL || process.env.ENTRIM_MODEL || 'deepseek-ai/DeepSeek-V4-Flash').trim(),
    })
  }

  return candidates
}

async function probe(candidate) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45_000)
  try {
    const body = {
      model: candidate.model,
      messages: [
        { role: 'system', content: 'Return valid JSON only.' },
        { role: 'user', content: 'Return {"ok":true}.' },
      ],
      temperature: 0,
      max_tokens: 64,
    }
    if (candidate.kind === 'xai') body.reasoning_effort = 'low'

    const response = await fetch(`${candidate.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${candidate.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const text = await response.text()
      console.warn(`[marketplace-copy] provider probe failed ${candidate.id}: HTTP ${response.status} ${text.slice(0, 160)}`)
      return false
    }
    console.log(`[marketplace-copy] provider ready: ${candidate.id} (${candidate.model})`)
    return true
  } catch (error) {
    console.warn(`[marketplace-copy] provider probe failed ${candidate.id}: ${error?.message || error}`)
    return false
  } finally {
    clearTimeout(timer)
  }
}

function runRewrite(candidate) {
  return new Promise((resolve) => {
    const xai = candidate.kind === 'xai'
    const preload = '--import=./scripts/marketplace-xai-low-preload.mjs'
    const existingNodeOptions = String(process.env.NODE_OPTIONS || '').trim()
    const child = spawn(process.execPath, ['scripts/rewrite-marketplace-copy.mjs'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        XAI_API_KEY: xai ? candidate.key : '',
        XAI_MODEL: xai ? candidate.model : XAI_MODEL,
        XAI_AUTH_MODE: xai ? 'supergrok' : '',
        MARKETPLACE_XAI_REASONING: 'low',
        NODE_OPTIONS: xai ? `${existingNodeOptions} ${preload}`.trim() : existingNodeOptions,
        ENTRIM_API_KEY: xai ? '' : candidate.key,
        ENTRIM_BASE_URL: xai ? '' : candidate.baseUrl,
        ENTRIM_MARKETPLACE_MODEL: xai ? '' : candidate.model,
        MARKETPLACE_REWRITE_PROVIDER: candidate.id,
      },
    })
    child.on('exit', (code, signal) => resolve({ code: Number(code ?? 1), signal }))
    child.on('error', () => resolve({ code: 1, signal: null }))
  })
}

async function main() {
  if (process.env.MARKETPLACE_COPY_REWRITE !== '1') {
    console.log('[marketplace-copy] wrapper disabled; no-op')
    return
  }

  const candidates = await loadCandidates()
  if (!candidates.length) throw new Error('No usable Marketplace rewrite provider found in the AI vault or SuperGrok OAuth')

  let attempted = 0
  for (const candidate of candidates) {
    if (!(await probe(candidate))) continue
    attempted += 1
    const result = await runRewrite(candidate)
    if (result.code === 0) {
      console.log(`[marketplace-copy] migration completed with ${candidate.id}`)
      return
    }
    console.warn(`[marketplace-copy] ${candidate.id} did not finish the estate; switching providers and resuming completed rows`)
    await sleep(1500)
  }

  throw new Error(`Marketplace copy migration did not complete after ${attempted} healthy provider attempt(s)`)
}

main().catch((error) => {
  console.error('[marketplace-copy] RUNNER FATAL', error)
  process.exit(1)
})

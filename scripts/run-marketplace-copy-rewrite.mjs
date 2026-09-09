import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_JWT || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase production credentials')

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

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

async function loadCandidates() {
  const ids = preferred.map((item) => item.id)
  const { data, error } = await db
    .from('ai_provider_keys')
    .select('provider,api_key,base_url,model,enabled')
    .in('provider', ids)
    .eq('enabled', true)

  if (error) throw new Error(`Unable to read AI vault: ${error.message}`)
  const byId = new Map((data || []).map((row) => [row.provider, row]))
  const candidates = []

  for (const spec of preferred) {
    const row = byId.get(spec.id)
    const key = String(row?.api_key || '').trim()
    if (!key) continue
    candidates.push({
      id: spec.id,
      key,
      baseUrl: String(row?.base_url || spec.baseUrl).replace(/\/$/, ''),
      model: String(row?.model || spec.model).trim(),
    })
  }

  // A deployment env key is still usable as a final Entrim fallback, but the
  // Supabase vault remains authoritative when both are present.
  const envEntrim = String(process.env.ENTRIM_API_KEY || '').trim()
  if (envEntrim && !candidates.some((candidate) => candidate.id === 'entrim-env')) {
    candidates.push({
      id: 'entrim-env',
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
    const response = await fetch(`${candidate.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${candidate.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: candidate.model,
        messages: [
          { role: 'system', content: 'Return valid JSON only.' },
          { role: 'user', content: 'Return {"ok":true}.' },
        ],
        temperature: 0,
        max_tokens: 64,
      }),
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
    const child = spawn(process.execPath, ['scripts/rewrite-marketplace-copy.mjs'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        // xAI API billing is deliberately excluded from this bulk migration.
        // The live Marketplace assistant may still use SuperGrok separately.
        XAI_API_KEY: '',
        ENTRIM_API_KEY: candidate.key,
        ENTRIM_BASE_URL: candidate.baseUrl,
        ENTRIM_MARKETPLACE_MODEL: candidate.model,
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
  if (!candidates.length) throw new Error('No usable Marketplace rewrite provider found in the AI vault')

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

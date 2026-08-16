/**
 * Sync AI provider API keys from CI env (GitHub secrets) into the Supabase
 * AI Key Vault (ai_provider_keys).
 *
 * WHY THIS EXISTS
 * ---------------
 * The runtime chain (lib/contentAiProvider.ts) reads the vault overlay FIRST
 * and Worker secrets second (env() → vaultOverlay → process.env). When a key
 * is rotated in GitHub secrets and redeployed, a STALE vault row still wins
 * and returns auth/payment errors — e.g. Baseten 402 "please check your
 * current payment status" even though the freshly-rotated Worker secret
 * returns 200. This script makes the vault match the Worker secret so the two
 * sources of truth cannot drift.
 *
 * TRANSPORT
 * ---------
 * Supabase Management API (projects/{ref}/database/query) — the same proven
 * path as apply-seo-factory-migrations.yml. It bypasses RLS (ai_provider_keys
 * is REVOKE ALL + USING(false)) and accepts both legacy eyJ and sb_secret_
 * service keys, so it works regardless of the SUPABASE_SERVICE_ROLE_KEY
 * format the runtime happens to use.
 *
 * ENV
 * ---
 * SUPABASE_ACCESS_TOKEN  (required — management API bearer)
 * SUPABASE_PROJECT_REF   (optional, defaults to the YouSafe project ref)
 * plus the provider key env vars below.
 *
 * Only writes api_key/enabled — never clobbers an admin's base_url/model
 * override. Never prints secret material.
 */

const SYNC_MAP = {
  // env var name → ai_provider_keys.provider ids it should populate
  BASETEN_API_KEY: ['baseten-deepseek', 'baseten-glm-fast'],
  OPENAI_API_KEY: ['openai'],
  AIHUBMIX_API_KEY: ['aihubmix-glm-fast'],
  NVIDIA_API_KEY: ['nvidia-nemotron', 'nvidia-glm', 'nvidia-deepseek'],
  XAI_API_KEY: ['grok'],
  GROQ_API_KEY: ['groq'],
  GEMINI_API_KEY: ['gemini'],
  DEEPSEEK_API_KEY: ['deepseek'],
  OPENROUTER_API_KEY: ['openrouter'],
  CLOUDFLARE_AI_TOKEN: ['cloudflare-ai'],
  CUSTOM_AI_API_KEY: ['custom'],
}

const REF = (process.env.SUPABASE_PROJECT_REF || 'krggzrxxnqfsbbklatxl').trim()
const TOKEN = (process.env.SUPABASE_ACCESS_TOKEN || '').trim()

function escapeSql(s) {
  return String(s).replace(/'/g, "''")
}

async function runSql(query) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`SQL endpoint HTTP ${res.status}: ${body.slice(0, 400)}`)
  }
  return res
}

async function main() {
  if (!TOKEN) {
    console.log('SUPABASE_ACCESS_TOKEN not set — skipping AI vault sync.')
    return
  }
  let synced = 0
  for (const [envName, providerIds] of Object.entries(SYNC_MAP)) {
    const value = (process.env[envName] || '').trim()
    if (!value) continue
    for (const providerId of providerIds) {
      const sql = `INSERT INTO public.ai_provider_keys (provider, api_key, enabled, updated_by, updated_at)
VALUES ('${providerId}', '${escapeSql(value)}', TRUE, 'deploy-sync', now())
ON CONFLICT (provider) DO UPDATE
SET api_key = EXCLUDED.api_key, enabled = EXCLUDED.enabled,
    updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;`
      await runSql(sql)
      synced++
      console.log(`vault: ${providerId} <- ${envName}`)
    }
  }
  console.log(`AI vault sync complete (${synced} provider row(s)).`)
}

main().catch((e) => {
  console.error('AI vault sync failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})

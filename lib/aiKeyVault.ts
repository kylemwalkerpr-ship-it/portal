/**
 * AI Key Vault — admin-pasted provider keys stored in Supabase.
 *
 * The Content Studio / SEO Factory AI chain used to read credentials only from
 * Worker secrets (process.env). This module lets the admin paste any provider
 * key straight from the Command Center dashboard; the chain reads vault keys
 * at runtime with a short TTL, falling back to env vars when a key is not in
 * the vault (so existing deployments keep working untouched).
 *
 * Tables (supabase/migrations/ai_provider_keys.sql):
 *   ai_provider_keys(provider PK, api_key, base_url, model, enabled, updated_by, updated_at)
 *   ai_settings(key PK, value, updated_by, updated_at)
 */
import { createClient } from '@supabase/supabase-js'

export interface AiProviderDef {
  id: string
  label: string
  /** env var name for the API key (used by contentAiProvider) */
  keyEnv: string
  /** optional env var for the base URL override */
  baseUrlEnv?: string
  /** optional env var for the model override */
  modelEnv?: string
  /** fixed endpoint when the provider has one */
  fixedBaseUrl?: string
  /** default model label shown in the UI */
  defaultModel: string
  role: 'primary' | 'fallback'
  /** short copy for UI hint */
  hint?: string
}

export const AI_PROVIDERS: AiProviderDef[] = [
  {
    id: 'nvidia-glm',
    label: 'NVIDIA GLM 5.2 · z-ai/glm-5.2',
    keyEnv: 'NVIDIA_API_KEY',
    baseUrlEnv: 'NVIDIA_BASE_URL',
    modelEnv: 'NVIDIA_GLM_MODEL',
    fixedBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'z-ai/glm-5.2',
    role: 'primary',
    hint: 'Preferred lead — verified NVIDIA Integrate endpoint',
  },
  {
    id: 'nvidia-deepseek',
    label: 'DeepSeek V4 Pro · NVIDIA',
    keyEnv: 'NVIDIA_API_KEY',
    baseUrlEnv: 'NVIDIA_BASE_URL',
    modelEnv: 'NVIDIA_DEEPSEEK_MODEL',
    fixedBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'deepseek-ai/deepseek-v4-pro',
    role: 'primary',
    hint: 'NVIDIA fallback — long-form depth',
  },
  {
    id: 'cloudflare-ai',
    label: 'Cloudflare Workers AI',
    keyEnv: 'CLOUDFLARE_AI_TOKEN',
    baseUrlEnv: 'CLOUDFLARE_AI_BASE_URL',
    modelEnv: 'CLOUDFLARE_AI_MODEL',
    fixedBaseUrl: 'https://api.cloudflare.com/client/v4',
    defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    role: 'fallback',
    hint: 'First fallback — also needs CLOUDFLARE_ACCOUNT_ID',
  },
  {
    id: 'groq',
    label: 'Groq',
    keyEnv: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL',
    fixedBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    role: 'fallback',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    keyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    defaultModel: 'gemini-2.5-flash',
    role: 'fallback',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    keyEnv: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_MODEL',
    fixedBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    role: 'fallback',
  },
  {
    id: 'custom',
    label: 'Custom OpenAI-compatible',
    keyEnv: 'CUSTOM_AI_API_KEY',
    baseUrlEnv: 'CUSTOM_AI_BASE_URL',
    modelEnv: 'CUSTOM_AI_MODEL',
    defaultModel: 'gpt-5.6-luna',
    role: 'fallback',
    hint: 'Bring your own endpoint — base URL required',
  },
  {
    id: 'grok',
    label: 'xAI Grok',
    keyEnv: 'XAI_API_KEY',
    baseUrlEnv: 'XAI_BASE_URL',
    modelEnv: 'XAI_MODEL',
    fixedBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3',
    role: 'fallback',
    hint: 'Current default primary when auto',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    keyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
    fixedBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.6-luna',
    role: 'fallback',
    hint: 'GPT-5.6 Luna',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek.com API',
    keyEnv: 'DEEPSEEK_API_KEY',
    baseUrlEnv: 'DEEPSEEK_BASE_URL',
    modelEnv: 'DEEPSEEK_MODEL',
    fixedBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    role: 'fallback',
  },
]

export const providerDef = (id: string): AiProviderDef | undefined =>
  AI_PROVIDERS.find((p) => p.id === id)

/** Safe default cascade; Settings can override it without a redeploy. */
export const DEFAULT_PROVIDER_ORDER = [
  'nvidia-glm', 'nvidia-deepseek', 'grok', 'openai', 'cloudflare-ai',
  'groq', 'gemini', 'openrouter', 'custom', 'deepseek',
] as const

export interface VaultKeyRow {
  provider: string
  api_key: string | null
  base_url: string | null
  model: string | null
  enabled: boolean | null
  updated_by: string | null
  updated_at: string | null
}

export interface VaultStatusRow {
  id: string
  label: string
  role: 'primary' | 'fallback'
  configured: boolean
  source: 'vault' | 'env' | 'none'
  maskedKey: string | null
  baseUrl: string | null
  model: string | null
  defaultModel: string
  hint?: string
  envKey: string
  baseUrlEnv?: string
  modelEnv?: string
}

export interface AiSettings {
  default_provider?: string | null
  default_model?: string | null
  max_providers?: string | null
  /** JSON array of provider ids, highest priority first. */
  provider_order?: string | null
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export function maskKey(key: string): string {
  const k = String(key || '').trim()
  if (!k) return ''
  if (k.length <= 10) return '••••••'
  return `${k.slice(0, 4)}…${k.slice(-4)}`
}

// ── Cached vault reads (short TTL — keys change rarely, chain hits often) ──
const VAULT_TTL_MS = 45_000
let vaultCache: VaultKeyRow[] | null = null
let vaultCacheAt = 0
let settingsCache: AiSettings | null = null
let settingsCacheAt = 0

export async function getVaultKeys(force = false): Promise<VaultKeyRow[]> {
  if (!force && vaultCache && Date.now() - vaultCacheAt < VAULT_TTL_MS) {
    return vaultCache
  }
  const { data, error } = await sb()
    .from('ai_provider_keys')
    .select('provider, api_key, base_url, model, enabled, updated_by, updated_at')
    .eq('enabled', true)
    .order('provider')
  if (error) {
    console.warn('[aiKeyVault] read failed (vault may not be migrated yet)', error.message)
    return vaultCache ?? []
  }
  vaultCache = (data || []) as VaultKeyRow[]
  vaultCacheAt = Date.now()
  return vaultCache
}

export async function getAiSettings(force = false): Promise<AiSettings> {
  if (!force && settingsCache && Date.now() - settingsCacheAt < VAULT_TTL_MS) {
    return settingsCache
  }
  const { data, error } = await sb()
    .from('ai_settings')
    .select('key, value')
  if (error) {
    console.warn('[aiKeyVault] settings read failed', error.message)
    return settingsCache ?? {}
  }
  const out: AiSettings = {}
  for (const row of data || []) {
    if (row && typeof row.key === 'string') {
      out[row.key as keyof AiSettings] = String(row.value)
    }
  }
  settingsCache = out
  settingsCacheAt = Date.now()
  return out
}

/**
 * Env-name → value overlay built from vault rows. The AI chain's env() helper
 * consults this first, then falls back to process.env. Keys stored in the
 * vault therefore win over Worker secrets for the same provider.
 */
export async function buildVaultEnvOverrides(force = false): Promise<Record<string, string>> {
  const rows = await getVaultKeys(force)
  const settings = await getAiSettings(force)
  const out: Record<string, string> = {}
  for (const row of rows) {
    const def = providerDef(row.provider)
    if (!def) continue
    if (row.api_key) out[def.keyEnv] = row.api_key
    if (row.base_url && def.baseUrlEnv) out[def.baseUrlEnv] = row.base_url
    if (row.model && def.modelEnv) out[def.modelEnv] = row.model
  }
  // Default provider / model pins
  if (settings.default_provider) out['CONTENT_AI_PROVIDER'] = settings.default_provider
  if (settings.default_model) out['CONTENT_AI_DEFAULT_MODEL'] = settings.default_model
  if (settings.max_providers) out['CONTENT_AI_MAX_PROVIDERS'] = settings.max_providers
  if (settings.provider_order) out['CONTENT_AI_PROVIDER_ORDER'] = settings.provider_order
  return out
}

export async function upsertVaultKey(
  providerId: string,
  patch: { apiKey?: string; baseUrl?: string | null; model?: string | null; enabled?: boolean },
  updatedBy = 'admin',
): Promise<VaultKeyRow> {
  const def = providerDef(providerId)
  if (!def) throw new Error(`Unknown provider: ${providerId}`)
  const row = {
    provider: def.id,
    api_key: patch.apiKey != null && patch.apiKey.trim() ? patch.apiKey.trim() : undefined,
    base_url: patch.baseUrl != null ? patch.baseUrl.trim() || null : undefined,
    model: patch.model != null ? patch.model.trim() || null : undefined,
    enabled: patch.enabled ?? true,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await sb()
    .from('ai_provider_keys')
    .upsert(row, { onConflict: 'provider' })
    .select('provider, api_key, base_url, model, enabled, updated_by, updated_at')
    .single()
  if (error) throw new Error(error.message)
  vaultCache = null // bust TTL so the chain sees the new key immediately
  return data as VaultKeyRow
}

export async function deleteVaultKey(providerId: string): Promise<void> {
  const def = providerDef(providerId)
  if (!def) throw new Error(`Unknown provider: ${providerId}`)
  const { error } = await sb().from('ai_provider_keys').delete().eq('provider', def.id)
  if (error) throw new Error(error.message)
  vaultCache = null
}

export async function setAiSetting(key: string, value: string, updatedBy = 'admin'): Promise<void> {
  if (!key.trim()) throw new Error('Setting key required')
  const { error } = await sb()
    .from('ai_settings')
    .upsert(
      { key: key.trim(), value: String(value).trim(), updated_by: updatedBy, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
  if (error) throw new Error(error.message)
  settingsCache = null
}

/**
 * Operator-facing status list: every provider with configured state from the
 * vault AND env, so the UI can show where each key lives.
 */
export async function listVaultStatus(): Promise<VaultStatusRow[]> {
  const rows = await getVaultKeys(true)
  const byProvider = new Map(rows.map((r) => [r.provider, r]))
  return AI_PROVIDERS.map((def) => {
    const row = byProvider.get(def.id)
    const envKey = process.env[def.keyEnv] || ''
    const baseUrl = row?.base_url || process.env[def.baseUrlEnv || ''] || def.fixedBaseUrl || null
    const model = row?.model || process.env[def.modelEnv || ''] || def.defaultModel
    const fromVault = Boolean(row?.api_key)
    const fromEnv = Boolean(envKey)
    const maskedKey = fromVault
      ? maskKey(row!.api_key!)
      : fromEnv
        ? maskKey(envKey)
        : null
    return {
      id: def.id,
      label: def.label,
      role: def.role,
      configured: fromVault || fromEnv,
      source: fromVault ? 'vault' : fromEnv ? 'env' : 'none',
      maskedKey,
      baseUrl,
      model,
      defaultModel: def.defaultModel,
      hint: def.hint,
      envKey: def.keyEnv,
      baseUrlEnv: def.baseUrlEnv,
      modelEnv: def.modelEnv,
    } satisfies VaultStatusRow
  })
}

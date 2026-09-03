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
import { resolveSupabaseKey } from './supabaseKey'

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
  /** Shared vault card — one paste field for hosts that share a key. */
  vaultGroup?: string
  vaultGroupLabel?: string
  /** Selectable model ids for the host's model dropdown(s). */
  modelOptions?: string[]
}

/** Curated model choices per host for the vault's model dropdowns. */
const HOST_MODEL_OPTIONS: Record<string, string[]> = {
  grok: [
    'grok-4.6',
    'grok-4.5',
    'grok-4',
  ],
  entrim: [
    'deepseek-ai/DeepSeek-V4-Flash',
    'Qwen/Qwen3.6-27B',
  ],
}

export const AI_PROVIDERS: AiProviderDef[] = [
  {
    id: 'grok',
    label: 'xAI Grok',
    keyEnv: 'XAI_API_KEY',
    baseUrlEnv: 'XAI_BASE_URL',
    modelEnv: 'XAI_MODEL',
    fixedBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.6',
    role: 'primary',
    hint: 'Grok 4.6 — connect SuperGrok (no API key) or paste XAI_API_KEY',
    modelOptions: HOST_MODEL_OPTIONS.grok,
  },
  {
    id: 'entrim-deepseek',
    label: 'DeepSeek V4 Flash · Entrim (api.entrim.ai/v1)',
    keyEnv: 'ENTRIM_API_KEY',
    baseUrlEnv: 'ENTRIM_BASE_URL',
    modelEnv: 'ENTRIM_MODEL',
    fixedBaseUrl: 'https://api.entrim.ai/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V4-Flash',
    role: 'primary',
    hint: 'Entrim-hosted DeepSeek V4 Flash — selectable in every lane. Paste ENTRIM_API_KEY; base URL fixed to api.entrim.ai/v1',
    vaultGroup: 'entrim',
    vaultGroupLabel: 'Entrim · api.entrim.ai',
    modelOptions: HOST_MODEL_OPTIONS.entrim,
  },
  {
    id: 'entrim-qwen-27b',
    label: 'Qwen3.6 27B · Entrim (api.entrim.ai/v1)',
    keyEnv: 'ENTRIM_API_KEY',
    baseUrlEnv: 'ENTRIM_BASE_URL',
    // Lane-isolated env: the Qwen row must NEVER write its model id into
    // ENTRIM_MODEL (the DeepSeek lane reads that) — otherwise the last
    // alphabetically-sorted vault row overwrites the DeepSeek pin with
    // Qwen/Qwen3.6-27B. Qwen stays on its own ENTRIM_QWEN_MODEL lane.
    modelEnv: 'ENTRIM_QWEN_MODEL',
    fixedBaseUrl: 'https://api.entrim.ai/v1',
    defaultModel: 'Qwen/Qwen3.6-27B',
    role: 'primary',
    hint: 'Entrim-hosted Qwen3.6 27B — selectable in every lane (shares the ENTRIM_API_KEY row).',
    vaultGroup: 'entrim',
    vaultGroupLabel: 'Entrim · api.entrim.ai',
    modelOptions: ['Qwen/Qwen3.6-27B'],
  },
]

export const providerDef = (id: string): AiProviderDef | undefined =>
  AI_PROVIDERS.find((p) => p.id === id)

/** Safe default cascade; Settings can override it without a redeploy.
 *  Entrim (Qwen3.6 27B first, DeepSeek flash second) fronts the auto
 *  cascade, with Grok third — the three live providers. */
export const DEFAULT_PROVIDER_ORDER = [
  'entrim-qwen-27b', 'entrim-deepseek', 'grok',
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
  source: 'vault' | 'env' | 'oauth' | 'none'
  maskedKey: string | null
  /** True when BOTH a vault key and a Worker env secret exist — the env key is
   *  shadowed (vault wins) and would only take effect if the vault row is
   *  removed. Lets the operator see the precedence at a glance. */
  envShadowed?: boolean
  /** Masked form of the Worker env secret when one exists (sk-…abcd). */
  envMasked?: string | null
  baseUrl: string | null
  model: string | null
  defaultModel: string
  hint?: string
  envKey: string
  baseUrlEnv?: string
  modelEnv?: string
  vaultGroup?: string
  vaultGroupLabel?: string
  modelOptions?: string[]
}

export interface AiSettings {
  default_provider?: string | null
  default_model?: string | null
  max_providers?: string | null
  /** JSON array of provider ids, highest priority first. */
  provider_order?: string | null
  xai_oauth_access_token?: string | null
  xai_oauth_refresh_token?: string | null
  xai_oauth_expires_at?: string | null
  xai_oauth_token_type?: string | null
  xai_oauth_pending?: string | null
}

function sb() {
  // Supabase now issues `sb_secret_...` keys, but supabase-js v2 only
  // accepts legacy JWT keys. Use the centralized resolver so the vault panel
  // and runtime overlay do not fail silently when the service key format
  // changes; the legacy service/anon key is selected when available.
  const key = resolveSupabaseKey()
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key!)
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
    // Several lanes intentionally share one host credential/base URL
    // (NVIDIA, Baseten, Parasail). First row wins deterministically instead
    // of the last alphabetically sorted row silently overwriting the key or
    // endpoint selected by another lane. Model envs remain lane-specific.
    if (row.api_key && !(def.keyEnv in out)) out[def.keyEnv] = row.api_key
    if (row.base_url && def.baseUrlEnv && !(def.baseUrlEnv in out)) out[def.baseUrlEnv] = row.base_url
    if (row.model && def.modelEnv) out[def.modelEnv] = row.model
  }
  // Default provider / model pins. A provider-specific model wins; otherwise
  // the admin's default model is applied to the selected primary provider.
  const defaultProvider = String(settings.default_provider || '').trim()
  out['CONTENT_AI_PROVIDER'] = !defaultProvider || STALE_DEFAULT_PROVIDERS.has(defaultProvider) || !isLiveDefaultProvider(defaultProvider)
    ? 'entrim-qwen-27b'
    : defaultProvider
  if (settings.default_model) out['CONTENT_AI_DEFAULT_MODEL'] = settings.default_model
  if (settings.max_providers) out['CONTENT_AI_MAX_PROVIDERS'] = settings.max_providers
  if (settings.provider_order) out['CONTENT_AI_PROVIDER_ORDER'] = settings.provider_order
  if (settings.default_model) {
    let primary = settings.default_provider || ''
    if (!primary && settings.provider_order) {
      try {
        const order = JSON.parse(settings.provider_order)
        primary = Array.isArray(order) ? String(order[0] || '') : ''
      } catch { /* malformed order falls back to the runtime default */ }
    }
    const primaryDef = providerDef(primary) || providerDef('grok')
    if (primaryDef?.modelEnv && !out[primaryDef.modelEnv]) {
      out[primaryDef.modelEnv] = settings.default_model
    }
  }
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

/** Delete every vault key so only Worker env secrets remain active. */
export async function purgeAllVaultKeys(): Promise<number> {
  const { data, error } = await sb()
    .from('ai_provider_keys')
    .delete()
    .neq('provider', '__none__')
    .select('provider')
  if (error) throw new Error(error.message)
  vaultCache = null
  return (data || []).length
}

/** Delete vault keys for a specific list of provider ids (host group purge). */
export async function purgeGroupVaultKeys(providerIds: string[]): Promise<number> {
  if (!providerIds.length) return 0
  const { data, error } = await sb()
    .from('ai_provider_keys')
    .delete()
    .in('provider', providerIds)
    .select('provider')
  if (error) throw new Error(error.message)
  vaultCache = null
  return (data || []).length
}

const LIVE_PROVIDERS = new Set(['entrim-qwen-27b', 'entrim-deepseek', 'grok'])

export function isLiveDefaultProvider(value: string): boolean {
  return LIVE_PROVIDERS.has(String(value || '').trim())
}

/**
 * STALE_DEFAULT_PROVIDERS — retired drafting defaults that must resolve to the
 * Entrim Qwen default. Kept as an explicit set for readability; the stricter
 * gate in buildVaultEnvOverrides treats EVERY pin not in the three live
 * providers as stale.
 */
const STALE_DEFAULT_PROVIDERS = new Set([
  '',
  'auto',
  'nvidia-minimax',
  'runbios-glm-53-flash',
  'nvidia-nemotron',
  'baseten-deepseek',
  'baseten-glm-fast',
  'parasail-deepseek',
  'nvidia-deepseek',
  'openai',
  'groq',
  'gemini',
  'openrouter',
  'custom',
  'deepseek',
  'zai-glm',
  'aihubmix-glm-fast',
])

/** Move Run BiOS GLM 5.3 Flash to the front of a saved provider-order JSON/CSV. */
export function runbiosFirstProviderOrder(raw?: string | null): string {
  const fallback = JSON.stringify(DEFAULT_PROVIDER_ORDER)
  if (!raw || !String(raw).trim()) return fallback
  let values: unknown
  try { values = JSON.parse(raw) } catch { values = String(raw).split(',') }
  if (!Array.isArray(values)) return fallback
  const order = values.map((v) => String(v).trim()).filter(Boolean)
  const pin = 'runbios-glm-53-flash'
  const at = order.indexOf(pin)
  if (at < 0) order.unshift(pin)
  else if (at > 0) {
    order.splice(at, 1)
    order.unshift(pin)
  }
  return JSON.stringify(order)
}

/** Move NVIDIA MiniMax to the front of a saved provider-order JSON/CSV.
 *  Retained for backward compatibility with older callers/tests; the persisted
 *  default no longer uses it (Entrim Qwen is the live draft lead). */
export function minimaxFirstProviderOrder(raw?: string | null): string {
  const fallback = JSON.stringify(DEFAULT_PROVIDER_ORDER)
  if (!raw || !String(raw).trim()) return fallback
  let values: unknown
  try { values = JSON.parse(raw) } catch { values = String(raw).split(',') }
  if (!Array.isArray(values)) return fallback
  const order = values.map((v) => String(v).trim()).filter(Boolean)
  const pin = 'nvidia-minimax'
  const at = order.indexOf(pin)
  if (at < 0) order.unshift(pin)
  else if (at > 0) {
    order.splice(at, 1)
    order.unshift(pin)
  }
  return JSON.stringify(order)
}

/** Move Entrim Qwen3.6 27B to the front of a saved provider-order JSON/CSV —
 *  the live-entrim persist default (matches DEFAULT_PROVIDER_ORDER[0]). */
export function entrimFirstProviderOrder(raw?: string | null): string {
  const fallback = JSON.stringify(DEFAULT_PROVIDER_ORDER)
  if (!raw || !String(raw).trim()) return fallback
  let values: unknown
  try { values = JSON.parse(raw) } catch { values = String(raw).split(',') }
  if (!Array.isArray(values)) return fallback
  const order = values.map((v) => String(v).trim()).filter(Boolean)
  const pin = 'entrim-qwen-27b'
  const at = order.indexOf(pin)
  if (at < 0) order.unshift(pin)
  else if (at > 0) {
    order.splice(at, 1)
    order.unshift(pin)
  }
  return JSON.stringify(order)
}

/** Move NVIDIA Nemotron to the front of a saved provider-order JSON/CSV. */
export function nemotronFirstProviderOrder(raw?: string | null): string {
  const fallback = JSON.stringify(DEFAULT_PROVIDER_ORDER)
  if (!raw || !String(raw).trim()) return fallback
  let values: unknown
  try { values = JSON.parse(raw) } catch { values = String(raw).split(',') }
  if (!Array.isArray(values)) return fallback
  const order = values.map((v) => String(v).trim()).filter(Boolean)
  const pin = 'nvidia-nemotron'
  const at = order.indexOf(pin)
  if (at < 0) order.unshift(pin)
  else if (at > 0) {
    order.splice(at, 1)
    order.unshift(pin)
  }
  return JSON.stringify(order)
}

/** Backward-compatible helper for callers that intentionally prioritize Parasail. */
export function parasailFirstProviderOrder(raw?: string | null): string {
  const fallback = JSON.stringify(DEFAULT_PROVIDER_ORDER)
  if (!raw || !String(raw).trim()) return fallback
  let values: unknown
  try { values = JSON.parse(raw) } catch { values = String(raw).split(',') }
  if (!Array.isArray(values)) return fallback
  const order = values.map((v) => String(v).trim()).filter(Boolean)
  const pin = 'parasail-deepseek'
  const at = order.indexOf(pin)
  if (at < 0) order.unshift(pin)
  else if (at > 0) {
    order.splice(at, 1)
    order.unshift(pin)
  }
  return JSON.stringify(order)
}

let draftDefaultsEnsured = false

/** Persist Entrim Qwen3.6 27B as the drafting default when the saved pin is
 *  missing or belongs to a previous Run BiOS GLM / NVIDIA MiniMax / Nemotron /
 *  Parasail / Baseten default. The UI Draft default is `entrim-qwen-27b`; the
 *  backend must match. */
export async function ensureDraftDefaultSettings(updatedBy = 'draft-default'): Promise<void> {
  if (draftDefaultsEnsured) return
  draftDefaultsEnsured = true
  const settings = await getAiSettings(true)
  const current = String(settings.default_provider || '').trim()
  if (STALE_DEFAULT_PROVIDERS.has(current)) {
    await setAiSetting('default_provider', 'entrim-qwen-27b', updatedBy)
  }
  const nextOrder = entrimFirstProviderOrder(settings.provider_order)
  if (nextOrder !== settings.provider_order) {
    await setAiSetting('provider_order', nextOrder, updatedBy)
  }
}

/** Legacy export retained for older test/module mocks; new runtime callers use
 * ensureDraftDefaultSettings so the name reflects the actual default. */
export async function ensureParasailDefaultSettings(updatedBy = 'draft-default'): Promise<void> {
  return ensureDraftDefaultSettings(updatedBy)
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

export async function deleteAiSetting(key: string): Promise<void> {
  if (!key.trim()) throw new Error('Setting key required')
  const { error } = await sb().from('ai_settings').delete().eq('key', key.trim())
  if (error) throw new Error(error.message)
  settingsCache = null
}

/**
 * Operator-facing status list: every provider with configured state from the
 * vault AND env, so the UI can show where each key lives.
 */
export async function listVaultStatus(): Promise<VaultStatusRow[]> {
  const rows = await getVaultKeys(true)
  const settings = await getAiSettings(true)
  const grokOauth = Boolean(
    settings.xai_oauth_access_token?.trim() || settings.xai_oauth_refresh_token?.trim(),
  )
  const byProvider = new Map(rows.map((r) => [r.provider, r]))
  return AI_PROVIDERS.map((def) => {
    const row = byProvider.get(def.id)
    const envKey = process.env[def.keyEnv] || ''
    const baseUrl = row?.base_url || process.env[def.baseUrlEnv || ''] || def.fixedBaseUrl || null
    const model = row?.model || process.env[def.modelEnv || ''] || def.defaultModel
    const fromVault = Boolean(row?.api_key)
    const fromEnv = Boolean(envKey)
    const fromOauth = def.id === 'grok' && grokOauth
    const maskedKey = fromOauth
      ? 'SuperGrok · connected'
      : fromVault
        ? maskKey(row!.api_key!)
        : fromEnv
          ? maskKey(envKey)
          : null
    return {
      id: def.id,
      label: def.label,
      role: def.role,
      configured: fromVault || fromEnv || fromOauth,
      source: fromOauth ? 'oauth' : fromVault ? 'vault' : fromEnv ? 'env' : 'none',
      maskedKey,
      // Diagnostic: when both exist, the vault row wins and the env secret is
      // shadowed — surface it so the operator sees the effective source.
      envShadowed: fromVault && fromEnv,
      envMasked: fromEnv ? maskKey(envKey) : null,
      baseUrl,
      model,
      defaultModel: def.defaultModel,
      hint: def.hint,
      envKey: def.keyEnv,
      baseUrlEnv: def.baseUrlEnv,
      modelEnv: def.modelEnv,
      vaultGroup: def.vaultGroup,
      vaultGroupLabel: def.vaultGroupLabel,
      modelOptions: def.modelOptions,
    } satisfies VaultStatusRow
  })
}

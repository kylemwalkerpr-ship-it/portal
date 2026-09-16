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
import {
  COMMISSIONED_PINS,
  DEEPSEEK_FIRST_PARTY_BASE_URL,
  DEEPSEEK_V41_FLASH_API_MODEL,
  GROK_API_MODEL,
  GROK_XAI_BASE_URL,
  LANE_DEFAULT_PIN,
} from './contentAiRegistry'

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

/**
 * Curated model choices per host for the vault's model dropdowns.
 * Registry-derived: only the commissioned model ids are selectable.
 */
const HOST_MODEL_OPTIONS: Record<string, string[]> = {
  grok: [GROK_API_MODEL],
}

/**
 * Vault catalog — exactly the two commissioned providers (registry identity).
 *
 *   grok              — Grok 4.6 via the retained xAI transport (api.x.ai only)
 *   deepseek-v41-flash — DeepSeek V4.1 Flash, first-party api.deepseek.com only
 *
 * The DeepSeek row has no base-URL or model override surface: its destination
 * and upstream model are hard-pinned in the registry. Historical
 * `ai_provider_keys` rows are read-only audit data (see listLegacyVaultRows)
 * and never appear here.
 */
export const AI_PROVIDERS: AiProviderDef[] = [
  {
    id: 'grok',
    label: 'Grok 4.6',
    keyEnv: 'XAI_API_KEY',
    baseUrlEnv: 'XAI_BASE_URL',
    modelEnv: 'XAI_MODEL',
    fixedBaseUrl: GROK_XAI_BASE_URL,
    defaultModel: GROK_API_MODEL,
    role: 'primary',
    hint: 'Grok 4.6 — connect SuperGrok (no API key) or paste XAI_API_KEY; xAI (api.x.ai) only',
    modelOptions: HOST_MODEL_OPTIONS.grok,
  },
  {
    id: 'deepseek-v41-flash',
    label: 'DeepSeek V4.1 Flash (first-party)',
    keyEnv: 'DEEPSEEK_API_KEY',
    fixedBaseUrl: DEEPSEEK_FIRST_PARTY_BASE_URL,
    defaultModel: DEEPSEEK_V41_FLASH_API_MODEL,
    role: 'primary',
    hint: 'DeepSeek V4.1 Flash — first-party api.deepseek.com only; paste DEEPSEEK_API_KEY (model is pinned to deepseek-flash)',
  },
]

export const providerDef = (id: string): AiProviderDef | undefined =>
  AI_PROVIDERS.find((p) => p.id === id)

/** Safe default cascade — the commissioned stable pins, highest priority first. */
export const DEFAULT_PROVIDER_ORDER: readonly string[] = [...COMMISSIONED_PINS]

/**
 * Host-only base-URL guard for a vault row. Returns the trimmed URL when it is
 * an HTTPS URL on the provider's literal commissioned host, else null — a
 * retired/intermediary host is never emitted into the runtime overlay.
 */
export function vaultBaseUrlOrNull(def: AiProviderDef, baseUrl: string | null | undefined): string | null {
  const raw = baseUrl != null ? String(baseUrl).trim() : ''
  if (!raw || !def.baseUrlEnv || !def.fixedBaseUrl) return null
  let expectedHost = ''
  try { expectedHost = new URL(def.fixedBaseUrl).hostname.toLowerCase() } catch { return null }
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:') return null
    if (parsed.hostname.toLowerCase() !== expectedHost) return null
  } catch {
    return null
  }
  return raw
}

/** Model-only guard: only the provider's commissioned model options may be stored. */
export function vaultModelOrNull(def: AiProviderDef, model: string | null | undefined): string | null {
  const raw = model != null ? String(model).trim() : ''
  if (!raw || !def.modelEnv || !def.modelOptions?.length) return null
  return def.modelOptions.includes(raw) ? raw : null
}

/**
 * Exact stable commissioned pin — `grok` | `deepseek-v41-flash` with no case or
 * alias normalization. Route validation uses this so a submitted value like
 * `GROK`, `grok-4.6`, `xai`, or `deepseek-flash` stays invalid instead of being
 * folded into an executable provider pin.
 */
export function isExactCommissionedPin(value: unknown): value is string {
  const raw = String(value ?? '').trim()
  return (COMMISSIONED_PINS as readonly string[]).includes(raw)
}

/**
 * Commissioned model identity from the registry. The optional pin binds the
 * value to that provider's own model options, so a stale or cross-provider
 * string (`gpt-5.6-terra`, `grok-4`, `deepseek-ai/...`) is never returned —
 * and therefore can never reach `XAI_MODEL`, the DeepSeek request, or
 * `CONTENT_AI_DEFAULT_MODEL`. Without a pin, only an unambiguous single
 * option is accepted (the lane default provider's commissioned model).
 */
export function commissionedModelIdentity(model: string | null | undefined, pin?: string | null): string | null {
  const raw = String(model ?? '').trim()
  if (!raw || raw === 'auto') return null
  const def = pin ? providerDef(String(pin).trim()) : providerDef(LANE_DEFAULT_PIN)
  if (!def?.modelOptions?.length) return null
  return def.modelOptions.includes(raw) ? raw : null
}

/**
 * Validate admin input against the commissioned provider definition. Returns a
 * human-readable error, or null when the input is acceptable. Used by the
 * ai-keys routes so a retired host / unknown model never reaches the vault or
 * a live probe.
 */
export function vaultProviderInputError(
  def: AiProviderDef,
  patch: { baseUrl?: string | null; model?: string | null },
): string | null {
  const baseUrl = patch.baseUrl != null ? String(patch.baseUrl).trim() : ''
  if (baseUrl) {
    if (!def.baseUrlEnv || !def.fixedBaseUrl) {
      return `${def.label} is hard-pinned to ${def.fixedBaseUrl || 'its commissioned endpoint'} — base URL overrides are not accepted`
    }
    const expected = vaultBaseUrlOrNull(def, baseUrl)
    if (!expected) return `${def.label} is locked to ${def.fixedBaseUrl} — "${baseUrl}" is not accepted`
  }
  const model = patch.model != null ? String(patch.model).trim() : ''
  if (model) {
    if (!def.modelEnv || !def.modelOptions?.length) {
      return `${def.label} is hard-pinned to model ${def.defaultModel} — model overrides are not accepted`
    }
    if (!def.modelOptions.includes(model)) {
      return `Unsupported model for ${def.label}: ${model}`
    }
  }
  return null
}

/**
 * Parse a saved provider-order value (JSON array or CSV) into the EXACT
 * commissioned stable pins only, deduped, with any missing commissioned pins
 * appended in registry order. Aliases and upstream model ids (`grok-4.6`,
 * `xai`, `deepseek-flash`, …) are not provider pins: they are dropped, never
 * canonicalized into the order, and never executed.
 */
export function commissionedProviderOrder(raw?: string | null): string {
  const fallback = JSON.stringify(DEFAULT_PROVIDER_ORDER)
  if (!raw || !String(raw).trim()) return fallback
  let values: unknown
  try { values = JSON.parse(String(raw)) } catch { values = String(raw).split(',') }
  if (!Array.isArray(values)) return fallback
  const seen = new Set<string>()
  const order: string[] = []
  for (const value of values) {
    const pin = String(value).trim()
    if (!isExactCommissionedPin(pin) || seen.has(pin)) continue
    seen.add(pin)
    order.push(pin)
  }
  for (const pin of COMMISSIONED_PINS) {
    if (!seen.has(pin)) order.push(pin)
  }
  return JSON.stringify(order)
}

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
  // The sanitized commissioned order also seeds the model-identity binding
  // when no default_provider is explicitly saved.
  let orderedPins: string[] = []
  if (settings.provider_order) {
    try {
      const parsed: unknown = JSON.parse(commissionedProviderOrder(settings.provider_order))
      if (Array.isArray(parsed)) orderedPins = parsed.map((value) => String(value))
    } catch { /* malformed order falls back to the lane default */ }
  }
  for (const row of rows) {
    const def = providerDef(row.provider)
    // Historical/retired rows are read-only audit data: they contribute no
    // credential, base URL, or model to the runtime overlay.
    if (!def) continue
    // First row wins deterministically instead of the last alphabetically
    // sorted row silently overwriting the key or endpoint selected by another
    // lane. Model envs remain lane-specific.
    if (row.api_key && !(def.keyEnv in out)) out[def.keyEnv] = row.api_key
    const baseUrl = vaultBaseUrlOrNull(def, row.base_url)
    if (baseUrl && def.baseUrlEnv && !(def.baseUrlEnv in out)) out[def.baseUrlEnv] = baseUrl
    const model = vaultModelOrNull(def, row.model)
    if (model && def.modelEnv) out[def.modelEnv] = model
  }
  // Default provider / model pins. Empty/auto uses the lane default; an
  // explicitly saved legacy value is NEVER emitted — it stays visibly
  // invalid in operator state and requires re-selection. Identity is exact:
  // a mixed-case spelling (`GROK`, `DeepSeek-V41-Flash`) is NOT a pin.
  const defaultProvider = String(settings.default_provider || '').trim()
  if (!defaultProvider || defaultProvider === 'auto') {
    out['CONTENT_AI_PROVIDER'] = LANE_DEFAULT_PIN
  } else if (isExactCommissionedPin(defaultProvider)) {
    out['CONTENT_AI_PROVIDER'] = defaultProvider
  }
  if (settings.max_providers) out['CONTENT_AI_MAX_PROVIDERS'] = settings.max_providers
  if (settings.provider_order) out['CONTENT_AI_PROVIDER_ORDER'] = commissionedProviderOrder(settings.provider_order)
  // `default_model` is constrained to the commissioned registry identity: a
  // stale/arbitrary value (gpt-5.6-terra, grok-4, a retired host's model id)
  // is never written to a model env or the global default. The model binds to
  // the selected provider — the lane default when no pin is explicitly saved —
  // and a provider without a model override surface (DeepSeek) contributes no
  // model env at all.
  const explicitPrimary = defaultProvider && defaultProvider !== 'auto' ? defaultProvider : ''
  let primaryPin: string = LANE_DEFAULT_PIN
  if (explicitPrimary) {
    primaryPin = explicitPrimary
  } else {
    const firstPin = orderedPins[0]
    if (firstPin) primaryPin = firstPin
  }
  const modelIdentity = commissionedModelIdentity(settings.default_model, primaryPin)
  if (modelIdentity) {
    out['CONTENT_AI_DEFAULT_MODEL'] = modelIdentity
    const primaryDef = providerDef(primaryPin)
    if (primaryDef?.modelEnv && !out[primaryDef.modelEnv]) {
      out[primaryDef.modelEnv] = modelIdentity
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

/**
 * True only for the EXACT commissioned stable pins (`grok`,
 * `deepseek-v41-flash`). Upstream model ids and aliases (`grok-4.6`,
 * `deepseek-flash`, `xai`, `supergrok`, …) are not provider values and are
 * never accepted as a saved default; mixed-case spellings such as `GROK` or
 * `DeepSeek-V41-Flash` are non-exact and stay non-executable.
 */
export function isLiveDefaultProvider(value: string): boolean {
  return isExactCommissionedPin(String(value || '').trim())
}

let draftDefaultsEnsured = false

/**
 * Normalize the persisted provider order to the two commissioned pins.
 *
 * A persisted legacy `default_provider` is deliberately NOT rewritten here:
 * silently redirecting it to a default would hide the invalid value. The
 * operator sees an explicit re-selection state until they pick a commissioned
 * pin through the settings route.
 */
export async function ensureDraftDefaultSettings(updatedBy = 'draft-default'): Promise<void> {
  if (draftDefaultsEnsured) return
  draftDefaultsEnsured = true
  const settings = await getAiSettings(true)
  const nextOrder = commissionedProviderOrder(settings.provider_order)
  if (nextOrder !== settings.provider_order) {
    await setAiSetting('provider_order', nextOrder, updatedBy)
  }
}

/** Compatibility alias retained for older test/module mocks; both names
 *  normalize the commissioned provider order and never rewrite a legacy
 *  default_provider. */
export async function ensureParasailDefaultSettings(updatedBy = 'draft-default'): Promise<void> {
  return ensureDraftDefaultSettings(updatedBy)
}

export interface LegacyVaultRow {
  provider: string
  maskedKey: string | null
  model: string | null
  baseUrl: string | null
  enabled: boolean
  updatedBy: string | null
  updatedAt: string | null
  /** Historical rows are readable for audit only — never executable. */
  legacy: true
  executable: false
}

/**
 * Read every stored vault row (including disabled history) without going
 * through the execution cache. Provider ids come dynamically from the stored
 * rows — no retired id is hard-coded here.
 */
async function readAllVaultKeyRows(): Promise<VaultKeyRow[]> {
  const { data, error } = await sb()
    .from('ai_provider_keys')
    .select('provider, api_key, base_url, model, enabled, updated_by, updated_at')
    .order('provider')
  if (error) {
    console.warn('[aiKeyVault] legacy read failed', error.message)
    return []
  }
  return (data || []) as VaultKeyRow[]
}

/**
 * Historical/retired `ai_provider_keys` rows for audit visibility only. They
 * are masked, marked non-executable, and excluded from save/test/default/order
 * controls; Task 6 never deletes or rewrites them. The ids are derived from
 * the stored rows, not from a hard-coded retired-provider list.
 */
export async function listLegacyVaultRows(): Promise<LegacyVaultRow[]> {
  const rows = await readAllVaultKeyRows()
  return rows
    .filter((row) => !providerDef(row.provider))
    .map((row) => ({
      provider: row.provider,
      maskedKey: row.api_key ? maskKey(row.api_key) : null,
      model: row.model,
      baseUrl: row.base_url,
      enabled: row.enabled === true,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
      legacy: true as const,
      executable: false as const,
    }))
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

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
import { RUNBIOS_API_MODELS, RUNBIOS_SLOTS } from './runbiosCatalog'

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
  baseten: [
    'deepseek-ai/DeepSeek-V4-Flash-0731',
    'deepseek-ai/DeepSeek-V4-Pro-0813',
    'deepseek-ai/DeepSeek-V4-Pro',
    'zai-org/GLM-5.2-Fast',
    'zai-org/GLM-5.3-Flash',
    'zai-org/GLM-5.2',
    'zai-org/GLM-4.7',
    'moonshotai/Kimi-K3',
    'openai/gpt-oss-120b',
    'nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B',
  ],
  parasail: [
    'deepseek-ai/DeepSeek-V4-Flash-0731',
    'deepseek-ai/DeepSeek-V4-Pro-0813',
    'z-ai/glm-5.2',
  ],
  nvidia: [
    'minimaxai/minimax-m3',
    'nvidia/nemotron-3-ultra-550b-a55b',
    'z-ai/glm-5.2',
    'deepseek-ai/deepseek-v4-flash-0731',
  ],
  openai: [
    'gpt-5.6-terra',
    'gpt-5.6-sol',
    'gpt-5.6-luna',
  ],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-405b',
  ],
  gemini: [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
  ],
  openrouter: [
    'meta-llama/llama-3.3-70b-instruct:free',
  ],
  'cloudflare-ai': [
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    '@cf/meta/m2m100-1.2b',
  ],
  custom: [
    'gpt-5.6-luna',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
  ],
  grok: [
    'grok-4.6',
    'grok-4.5',
    'grok-4',
  ],
  deepseek: [
    'deepseek-ai/DeepSeek-V4-Flash-0731',
    'deepseek-ai/DeepSeek-V4-Pro-0813',
    'deepseek-ai/DeepSeek-V4-Pro',
  ],
  entrim: [
    'deepseek-ai/DeepSeek-V4-Flash',
    'Qwen/Qwen3.8-27B',
  ],
  'zai-glm': [
    'glm-5.2',
    'glm-5.2-fast',
  ],
  'aihubmix-glm-fast': [
    'glm-5.2-fast-preview',
    'glm-5.2-fast',
    'glm-5.2',
  ],
  runbios: RUNBIOS_API_MODELS,
}

export const AI_PROVIDERS: AiProviderDef[] = [
  ...RUNBIOS_SLOTS.map((slot) => ({
    id: slot.id,
    label: slot.label,
    keyEnv: 'RUNBIOS_API_KEY',
    baseUrlEnv: 'RUNBIOS_BASE_URL',
    modelEnv: slot.id === 'runbios-glm-53-flash' ? 'RUNBIOS_GLM_MODEL' : undefined,
    fixedBaseUrl: 'https://api.runbios.ai/v1',
    defaultModel: slot.apiModel,
    role: slot.role,
    hint: slot.hint,
    vaultGroup: 'runbios',
    vaultGroupLabel: 'Run BiOS · api.runbios.ai',
    modelOptions: HOST_MODEL_OPTIONS.runbios,
  })),
  {
    id: 'nvidia-minimax',
    label: 'NVIDIA MiniMax M3 · minimaxai/minimax-m3',
    keyEnv: 'NVIDIA_API_KEY',
    baseUrlEnv: 'NVIDIA_BASE_URL',
    modelEnv: 'NVIDIA_MINIMAX_MODEL',
    fixedBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'minimaxai/minimax-m3',
    role: 'primary',
    hint: 'Drafting lead — validated on long-form SEO briefs via NVIDIA Integrate',
    vaultGroup: 'nvidia',
    vaultGroupLabel: 'NVIDIA · integrate.api.nvidia.com',
    modelOptions: HOST_MODEL_OPTIONS.nvidia,
  },
  {
    id: 'nvidia-nemotron',
    label: 'NVIDIA Nemotron 3 Ultra · nvidia/nemotron-3-ultra-550b-a55b',
    keyEnv: 'NVIDIA_API_KEY',
    baseUrlEnv: 'NVIDIA_BASE_URL',
    modelEnv: 'NVIDIA_NEMOTRON_MODEL',
    fixedBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b',
    role: 'primary',
    hint: 'Reasoning-enabled NVIDIA Integrate model; uses the shared NVIDIA API key',
    vaultGroup: 'nvidia',
    vaultGroupLabel: 'NVIDIA · integrate.api.nvidia.com',
    modelOptions: HOST_MODEL_OPTIONS.nvidia,
  },
  {
    id: 'nvidia-glm',
    label: 'NVIDIA GLM 5.2 · z-ai/glm-5.2',
    keyEnv: 'NVIDIA_API_KEY',
    baseUrlEnv: 'NVIDIA_BASE_URL',
    modelEnv: 'NVIDIA_GLM_MODEL',
    fixedBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'z-ai/glm-5.2',
    role: 'primary',
    hint: 'Selectable NVIDIA fallback — verified NVIDIA Integrate endpoint',
    vaultGroup: 'nvidia',
    vaultGroupLabel: 'NVIDIA · integrate.api.nvidia.com',
    modelOptions: HOST_MODEL_OPTIONS.nvidia,
  },
  {
    id: 'nvidia-deepseek',
    label: 'DeepSeek V4 Flash · NVIDIA',
    keyEnv: 'NVIDIA_API_KEY',
    baseUrlEnv: 'NVIDIA_BASE_URL',
    modelEnv: 'NVIDIA_DEEPSEEK_MODEL',
    fixedBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'deepseek-ai/deepseek-v4-flash-0731',
    role: 'primary',
    hint: 'NVIDIA fallback — long-form depth',
    vaultGroup: 'nvidia',
    vaultGroupLabel: 'NVIDIA · integrate.api.nvidia.com',
    modelOptions: HOST_MODEL_OPTIONS.nvidia,
  },
  {
    id: 'baseten-deepseek',
    label: 'DeepSeek V4 Flash · Baseten',
    keyEnv: 'BASETEN_API_KEY',
    baseUrlEnv: 'BASETEN_BASE_URL',
    modelEnv: 'BASETEN_MODEL',
    fixedBaseUrl: 'https://inference.baseten.co/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    role: 'primary',
    hint: 'Baseten Flash fallback — same model id as the Parasail default.',
    vaultGroup: 'baseten',
    vaultGroupLabel: 'Baseten · inference.baseten.co',
    modelOptions: HOST_MODEL_OPTIONS.baseten,
  },
  {
    id: 'baseten-deepseek-pro',
    label: 'DeepSeek V4 Pro 0813 · Baseten',
    keyEnv: 'BASETEN_API_KEY',
    baseUrlEnv: 'BASETEN_BASE_URL',
    modelEnv: 'BASETEN_PRO_MODEL',
    fixedBaseUrl: 'https://inference.baseten.co/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V4-Pro-0813',
    role: 'fallback',
    hint: 'Research + Review — same Baseten key, Pro-0813 model id',
    vaultGroup: 'baseten',
    vaultGroupLabel: 'Baseten · inference.baseten.co',
    modelOptions: HOST_MODEL_OPTIONS.baseten,
  },
  {
    id: 'baseten-glm-53-flash',
    label: 'GLM 5.3 Flash · Baseten',
    keyEnv: 'BASETEN_API_KEY',
    baseUrlEnv: 'BASETEN_BASE_URL',
    modelEnv: 'BASETEN_GLM_53_MODEL',
    fixedBaseUrl: 'https://inference.baseten.co/v1',
    defaultModel: 'zai-org/GLM-5.3-Flash',
    role: 'fallback',
    hint: 'Efficient Baseten fallback for brief, writing, audit, and editor stages.',
    vaultGroup: 'baseten',
    vaultGroupLabel: 'Baseten · inference.baseten.co',
    modelOptions: HOST_MODEL_OPTIONS.baseten,
  },
  {
    id: 'baseten-glm-fast',
    label: 'GLM 5.2 Fast · Baseten',
    keyEnv: 'BASETEN_API_KEY',
    baseUrlEnv: 'BASETEN_BASE_URL',
    modelEnv: 'BASETEN_GLM_MODEL',
    fixedBaseUrl: 'https://inference.baseten.co/v1',
    defaultModel: 'zai-org/GLM-5.2-Fast',
    role: 'fallback',
    hint: 'Efficient high-volume drafting partner — also the brief fallback when GPT is unconfigured',
    vaultGroup: 'baseten',
    vaultGroupLabel: 'Baseten · inference.baseten.co',
    modelOptions: HOST_MODEL_OPTIONS.baseten,
  },
  {
    id: 'parasail-deepseek',
    label: 'DeepSeek V4 Flash · Parasail (draft)',
    keyEnv: 'PARASAIL_API_KEY',
    baseUrlEnv: 'PARASAIL_BASE_URL',
    modelEnv: 'PARASAIL_DEEPSEEK_MODEL',
    fixedBaseUrl: 'https://api.parasail.io/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    role: 'primary',
    hint: 'Default host ($25 credit). Drafting — deepseek-ai/DeepSeek-V4-Flash-0731. Same psk- key as Pro + GLM.',
    vaultGroup: 'parasail',
    vaultGroupLabel: 'Parasail · api.parasail.io',
    modelOptions: HOST_MODEL_OPTIONS.parasail,
  },
  {
    id: 'parasail-deepseek-pro',
    label: 'DeepSeek V4 Pro 0813 · Parasail (research/review)',
    keyEnv: 'PARASAIL_API_KEY',
    baseUrlEnv: 'PARASAIL_BASE_URL',
    modelEnv: 'PARASAIL_DEEPSEEK_PRO_MODEL',
    fixedBaseUrl: 'https://api.parasail.io/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V4-Pro-0813',
    role: 'fallback',
    hint: 'Research + Review — Pro-0813 at reasoning_effort low (cap medium). Same psk- key.',
    vaultGroup: 'parasail',
    vaultGroupLabel: 'Parasail · api.parasail.io',
    modelOptions: HOST_MODEL_OPTIONS.parasail,
  },
  {
    id: 'parasail-glm',
    label: 'GLM 5.2 · Parasail',
    keyEnv: 'PARASAIL_API_KEY',
    baseUrlEnv: 'PARASAIL_BASE_URL',
    modelEnv: 'PARASAIL_GLM_MODEL',
    fixedBaseUrl: 'https://api.parasail.io/v1',
    defaultModel: 'z-ai/glm-5.2',
    role: 'fallback',
    hint: 'Calls z-ai/glm-5.2 on api.parasail.io (NVFP4 id 404s). Master Engine complement at medium effort. Same psk- key.',
    vaultGroup: 'parasail',
    vaultGroupLabel: 'Parasail · api.parasail.io',
    modelOptions: HOST_MODEL_OPTIONS.parasail,
  },
  {
    id: 'zai-glm',
    label: 'GLM 5.2 · Zai',
    keyEnv: 'ZAI_API_KEY',
    baseUrlEnv: 'ZAI_BASE_URL',
    modelEnv: 'ZAI_GLM_MODEL',
    fixedBaseUrl: 'https://api.z.ai/api/paas/v4',
    defaultModel: 'glm-5.2',
    role: 'fallback',
    hint: 'Official Z.ai / Zhipu GLM 5.2 — paste ZAI_API_KEY',
    modelOptions: HOST_MODEL_OPTIONS['zai-glm'],
  },
  {
    id: 'aihubmix-glm-fast',
    label: 'GLM 5.2 Fast · AIHubmix (glm-5.2-fast-preview)',
    keyEnv: 'AIHUBMIX_API_KEY',
    baseUrlEnv: 'AIHUBMIX_BASE_URL',
    modelEnv: 'AIHUBMIX_GLM_MODEL',
    fixedBaseUrl: 'https://aihubmix.com/v1',
    defaultModel: 'glm-5.2-fast-preview',
    role: 'fallback',
    hint: 'GLM 5.2 Fast via the AIHubmix OpenAI-compatible aggregator — selectable in drafting, brief and review',
    modelOptions: HOST_MODEL_OPTIONS['aihubmix-glm-fast'],
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
    modelOptions: HOST_MODEL_OPTIONS['cloudflare-ai'],
  },
  {
    id: 'groq',
    label: 'Groq',
    keyEnv: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL',
    fixedBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    role: 'fallback',
    modelOptions: HOST_MODEL_OPTIONS.groq,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    keyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    defaultModel: 'gemini-2.5-flash',
    role: 'fallback',
    modelOptions: HOST_MODEL_OPTIONS.gemini,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    keyEnv: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_MODEL',
    fixedBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    role: 'fallback',
    modelOptions: HOST_MODEL_OPTIONS.openrouter,
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
    modelOptions: HOST_MODEL_OPTIONS.custom,
  },
  {
    id: 'grok',
    label: 'xAI Grok',
    keyEnv: 'XAI_API_KEY',
    baseUrlEnv: 'XAI_BASE_URL',
    modelEnv: 'XAI_MODEL',
    fixedBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.6',
    role: 'fallback',
    hint: 'Default fallback for Master Engine, Discover, Research, and Draft — connect SuperGrok (no API key) or paste XAI_API_KEY',
    modelOptions: HOST_MODEL_OPTIONS.grok,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    keyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
    fixedBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.6-terra',
    role: 'fallback',
    hint: 'GPT-5.6 Terra (Research/Plan) · Sol (flagship) · Luna (high-volume)',
    modelOptions: HOST_MODEL_OPTIONS.openai,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek.com API',
    keyEnv: 'DEEPSEEK_API_KEY',
    baseUrlEnv: 'DEEPSEEK_BASE_URL',
    modelEnv: 'DEEPSEEK_MODEL',
    fixedBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    role: 'fallback',
    hint: 'Official DeepSeek.com — Flash-0731 / Pro-0813 via the DeepSeek host on each model',
    modelOptions: HOST_MODEL_OPTIONS.deepseek,
  },
  {
    id: 'entrim-deepseek',
    label: 'DeepSeek V4 Flash · Entrim (api.entrim.ai/v1)',
    keyEnv: 'ENTRIM_API_KEY',
    baseUrlEnv: 'ENTRIM_BASE_URL',
    modelEnv: 'ENTRIM_MODEL',
    fixedBaseUrl: 'https://api.entrim.ai/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V4-Flash',
    role: 'fallback',
    hint: 'Entrim-hosted DeepSeek V4 Flash — selectable in Draft and Command Center. Paste ENTRIM_API_KEY; base URL fixed to api.entrim.ai/v1',
    vaultGroup: 'entrim',
    vaultGroupLabel: 'Entrim · api.entrim.ai',
    modelOptions: HOST_MODEL_OPTIONS.entrim,
  },
  {
    id: 'entrim-qwen-27b',
    label: 'Qwen3.8 27B · Entrim (api.entrim.ai/v1)',
    keyEnv: 'ENTRIM_API_KEY',
    baseUrlEnv: 'ENTRIM_BASE_URL',
    modelEnv: 'ENTRIM_MODEL',
    fixedBaseUrl: 'https://api.entrim.ai/v1',
    defaultModel: 'Qwen/Qwen3.8-27B',
    role: 'fallback',
    hint: 'Entrim-hosted Qwen3.8 27B — selectable in Discover, Brief, and Reviewer lanes (shares the ENTRIM_API_KEY row).',
    vaultGroup: 'entrim',
    vaultGroupLabel: 'Entrim · api.entrim.ai',
    modelOptions: ['Qwen/Qwen3.8-27B'],
  },
]

export const providerDef = (id: string): AiProviderDef | undefined =>
  AI_PROVIDERS.find((p) => p.id === id)

/** Safe default cascade; Settings can override it without a redeploy.
 *  Draft's lead (MiniMax M3 via NVIDIA) fronts the auto cascade. */
export const DEFAULT_PROVIDER_ORDER = [
  'nvidia-minimax', 'runbios-glm-53-flash', 'nvidia-nemotron', 'grok', 'nvidia-glm', 'nvidia-deepseek', 'baseten-deepseek',
  'parasail-deepseek', 'deepseek-flash', 'parasail-glm', 'baseten-glm-fast', 'openai',
  'cloudflare-ai', 'groq', 'gemini', 'openrouter', 'custom', 'deepseek',
  'aihubmix-glm-fast', 'baseten-glm-53-flash', 'parasail-deepseek-pro', 'baseten-deepseek-pro', 'deepseek-pro', 'zai-glm',
  'entrim-deepseek', 'entrim-qwen-27b',
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
  chatgpt_oauth_access_token?: string | null
  chatgpt_oauth_refresh_token?: string | null
  chatgpt_oauth_expires_at?: string | null
  chatgpt_oauth_token_type?: string | null
  chatgpt_oauth_pending?: string | null
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
  out['CONTENT_AI_PROVIDER'] = !defaultProvider || STALE_DEFAULT_PROVIDERS.has(defaultProvider)
    ? 'nvidia-minimax'
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

const STALE_DEFAULT_PROVIDERS = new Set([
  '',
  'auto',
  'runbios-glm-53-flash',
  'nvidia-nemotron',
  'baseten-deepseek',
  'baseten-glm-fast',
  'parasail-deepseek',
  'nvidia-deepseek',
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

/** Move NVIDIA MiniMax to the front of a saved provider-order JSON/CSV. */
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

/** Persist NVIDIA MiniMax M3 as the drafting default when the saved pin is
 *  missing or belongs to a previous Run BiOS GLM/Nemotron/Parasail/Baseten
 *  default. The UI Draft default is `nvidia-minimax`; the backend must match. */
export async function ensureDraftDefaultSettings(updatedBy = 'draft-default'): Promise<void> {
  if (draftDefaultsEnsured) return
  draftDefaultsEnsured = true
  const settings = await getAiSettings(true)
  const current = String(settings.default_provider || '').trim()
  if (STALE_DEFAULT_PROVIDERS.has(current)) {
    await setAiSetting('default_provider', 'nvidia-minimax', updatedBy)
  }
  const nextOrder = minimaxFirstProviderOrder(settings.provider_order)
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
  const chatgptOauth = Boolean(
    settings.chatgpt_oauth_access_token?.trim() || settings.chatgpt_oauth_refresh_token?.trim(),
  )
  const byProvider = new Map(rows.map((r) => [r.provider, r]))
  return AI_PROVIDERS.map((def) => {
    const row = byProvider.get(def.id)
    const envKey = process.env[def.keyEnv] || ''
    const baseUrl = row?.base_url || process.env[def.baseUrlEnv || ''] || def.fixedBaseUrl || null
    const model = row?.model || process.env[def.modelEnv || ''] || def.defaultModel
    const fromVault = Boolean(row?.api_key)
    const fromEnv = Boolean(envKey)
    const fromOauth = (def.id === 'grok' && grokOauth) || (def.id === 'openai' && chatgptOauth)
    const maskedKey = fromOauth
      ? def.id === 'grok'
        ? 'SuperGrok · connected'
        : 'ChatGPT Plus · connected'
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

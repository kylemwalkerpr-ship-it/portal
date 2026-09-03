/**
 * Studio model × host catalog.
 *
 * The factory still wires a single pin (`entrim-qwen-27b`, `entrim-deepseek`…).
 * The UI splits that into two choices: which model family, then which host
 * serves it. One catalog keeps drafting, brief, review, and Command Center
 * in agreement.
 *
 * Lane policy (single source of truth for UI pickers AND server defaults),
 * mirroring the Entrim-only live provider policy in contentAiProvider.ts:
 *   Draft  — Entrim Qwen3.6 27B (default) + Entrim DeepSeek V4 Flash.
 *   Brief  — Entrim Qwen3.6 27B (default) + Entrim DeepSeek V4 Flash.
 *   Review — Entrim Qwen3.6 27B (default).
 *   Command — Auto (resolves to the Entrim default) + the two Entrim families.
 * Retired families (Grok, Claude, GLM, MiniMax, Nemotron, GPT-5.6, …) are no
 * longer selectable — a saved legacy pin renders as Auto and the server gate
 * routes it to the Entrim default.
 */

export type StudioLane = 'draft' | 'brief' | 'review' | 'command'

export type StudioModelId =
  | 'auto'
  | 'minimax-m3'
  | 'deepseek-v4-flash'
  | 'deepseek-v4-pro'
  | 'glm-5.2'
  | 'glm-5.3'
  | 'glm-5.3-flash'
  | 'glm-5.2-fast'
  | 'kimi-k2.7-code'
  | 'qwen3.5'
  | 'bios-adaptive'
  | 'claude-sonnet-5'
  | 'claude-opus-5'
  | 'grok-4.6'
  | 'gpt-5.6-terra'
  | 'gpt-5.6-sol'
  | 'gpt-5.6-luna'
  | 'nemotron-3-ultra'
  | 'cloudflare-llama'
  | 'groq-llama'
  | 'gemini'
  | 'openrouter'
  | 'qwen3.6-27b'

export type StudioHostId =
  | 'auto'
  | 'runbios'
  | 'baseten'
  | 'parasail'
  | 'nvidia'
  | 'deepseek'
  | 'entrim'
  | 'zai'
  | 'aihubmix'
  | 'xai'
  | 'openai'
  | 'cloudflare'
  | 'groq'
  | 'google'
  | 'openrouter'

export interface StudioHostOption {
  id: StudioHostId
  label: string
  pin: string
}

export interface StudioModelOption {
  id: StudioModelId
  label: string
  /** Exact upstream model id — shown on Review/Editor so the call is unambiguous. */
  apiModel?: string
  lanes: StudioLane[]
  hosts: StudioHostOption[]
}

export const DEEPSEEK_V4_FLASH_ID = 'deepseek-ai/DeepSeek-V4-Flash-0731'
export const DEEPSEEK_V4_PRO_ID = 'deepseek-ai/DeepSeek-V4-Pro-0813'
/** Entrim-hosted DeepSeek V4 Flash — the catalog model id is the EXACT
 *  upstream id Entrim serves (no -0731 suffix); never canonicalize it. */
export const ENTRIM_DEEPSEEK_FLASH_PIN = 'entrim-deepseek'
export const ENTRIM_DEEPSEEK_MODEL = 'deepseek-ai/DeepSeek-V4-Flash'

/** Entrim-hosted Qwen3.6 27B — served verbatim as `Qwen/Qwen3.6-27B` on
 *  api.entrim.ai/v1 (same rule as the flash: upstream ids, never
 *  canonicalize). Usable in the Discover, Brief, and Reviewer lanes. */
export const ENTRIM_QWEN_PIN = 'entrim-qwen-27b'
export const ENTRIM_QWEN_MODEL = 'Qwen/Qwen3.6-27B'

/** Draft lead: Entrim Qwen3.6 27B — graduated to the drafting default
 *  (api.entrim.ai/v1, ENTRIM_API_KEY). Falls back through the auto cascade. */
export const DEFAULT_DRAFT_PIN = ENTRIM_QWEN_PIN
/** Research / Generate Full Brief lead: Entrim Qwen3.6 27B. */
export const DEFAULT_BRIEF_PIN = ENTRIM_QWEN_PIN
/** Reviewer / Editor lead: Entrim Qwen3.6 27B. */
export const DEFAULT_REVIEW_PIN = ENTRIM_QWEN_PIN

/**
 * Lane host allowlists — a lane can only select or execute a pin whose host
 * serves that lane. Draft is Run BiOS + NVIDIA only; Brief is Run BiOS,
 * Baseten, xAI (Grok), and OpenAI (API key); Review is
 * Run BiOS + xAI + OpenAI. Command Center keeps the full host set. `auto`
 * stays a command-only host.
 */
export const LANE_HOSTS: Record<StudioLane, StudioHostId[]> = {
  // Live policy: Entrim is the only commissioned host. `auto` remains a
  // command-only choice (it resolves to the Entrim default at runtime).
  draft: ['entrim'],
  brief: ['entrim'],
  review: ['entrim'],
  command: ['entrim', 'auto'],
}

/** Host picker order — skip a host when that model is not served there. */
export const STUDIO_HOST_ORDER: StudioHostId[] = [
  'runbios',
  'parasail',
  'baseten',
  'nvidia',
  'deepseek',
  'entrim',
  'zai',
  'aihubmix',
  'xai',
  'openai',
  'cloudflare',
  'groq',
  'google',
  'openrouter',
  'auto',
]

const LANE_MODEL_ORDER: Record<StudioLane, StudioModelId[]> = {
  // Live policy: the two Entrim families are the only selectable models.
  // The lead is Qwen3.6 27B; DeepSeek V4 Flash is the complement family.
  draft: [
    'qwen3.6-27b',
    'deepseek-v4-flash',
  ],
  brief: [
    'qwen3.6-27b',
    'deepseek-v4-flash',
  ],
  review: [
    'qwen3.6-27b',
  ],
  command: [
    'auto',
    'qwen3.6-27b',
    'deepseek-v4-flash',
  ],
}

export const STUDIO_MODELS: StudioModelOption[] = [
  {
    id: 'auto',
    label: 'Auto (cascade)',
    lanes: ['command'],
    hosts: [{ id: 'auto', label: 'Auto', pin: 'auto' }],
  },
  {
    id: 'deepseek-v4-flash',
    // Live-policy host: Entrim serves the EXACT upstream id (no -0731
    // suffix) — the label names it so the wire payload is unambiguous.
    label: ENTRIM_DEEPSEEK_MODEL,
    apiModel: ENTRIM_DEEPSEEK_MODEL,
    lanes: ['draft', 'brief', 'command'],
    hosts: [{ id: 'entrim', label: 'Entrim', pin: ENTRIM_DEEPSEEK_FLASH_PIN }],
  },
  {
    id: 'qwen3.6-27b',
    label: 'Qwen3.6 27B',
    apiModel: ENTRIM_QWEN_MODEL,
    lanes: ['draft', 'brief', 'review', 'command'],
    hosts: [{ id: 'entrim', label: 'Entrim', pin: ENTRIM_QWEN_PIN }],
  },
]

const PIN_ALIASES: Record<string, string> = {
  auto: 'auto',
  default: 'auto',
  primary: 'auto',
  parasail: 'parasail-deepseek',
  'parasail-deepseek-v4-flash': 'parasail-deepseek',
  'parasail-deepseek-pro': 'parasail-deepseek-pro',
  'parasail-pro': 'parasail-deepseek-pro',
  'deepseek-v4-pro': 'parasail-deepseek-pro',
  'deepseek-ai/deepseek-v4-pro-0813': 'parasail-deepseek-pro',
  'baseten-deepseek-pro': 'baseten-deepseek-pro',
  'deepseek-pro': 'deepseek-pro',
  'deepseek-flash': 'deepseek-flash',
  'parasail-glm-52': 'parasail-glm',
  'parasail-glm-5.2': 'parasail-glm',
  'nvidia/glm-5.2-nvfp4': 'parasail-glm',
  entrim: ENTRIM_DEEPSEEK_FLASH_PIN,
  [ENTRIM_DEEPSEEK_FLASH_PIN]: ENTRIM_DEEPSEEK_FLASH_PIN,
  'entrim-deepseek-v4-flash': ENTRIM_DEEPSEEK_FLASH_PIN,
  'entrim-deepseek-v4-flash-0731': ENTRIM_DEEPSEEK_FLASH_PIN,
  [ENTRIM_QWEN_PIN]: ENTRIM_QWEN_PIN,
  'qwen3.6-27b': ENTRIM_QWEN_PIN,
  qwen: ENTRIM_QWEN_PIN,
  'entrim-deepseek-v4-pro': 'entrim-deepseek',
  'zai-glm': 'zai-glm',
  'zai': 'zai-glm',
  grok: 'grok',
  'grok-4.6': 'grok',
  xai: 'grok',
  supergrok: 'grok',
  'super-grok': 'grok',
  'glm-fast': 'baseten-glm-fast',
  'runbios': 'runbios-glm-53-flash',
  'runbios-glm': 'runbios-glm-53-flash',
  'runbios-glm-53-flash': 'runbios-glm-53-flash',
  'runbios-glm-52': 'runbios-glm-52',
  'runbios-deepseek-flash': 'runbios-deepseek-flash',
  'runbios-deepseek-pro': 'runbios-deepseek-pro',
  'runbios-minimax': 'runbios-minimax',
  'runbios-kimi': 'runbios-kimi',
  'runbios-qwen': 'runbios-qwen',
  'runbios-adaptive': 'runbios-adaptive',
  'bios-adaptive': 'runbios-adaptive',
  'runbios-claude-sonnet': 'runbios-claude-sonnet',
  'runbios-claude-opus': 'runbios-claude-opus',
  'claude-sonnet-5': 'runbios-claude-sonnet',
  'claude-opus-5': 'runbios-claude-opus',
  'kimi-k2.7-code': 'runbios-kimi',
  'qwen3.5-397b-a17b': 'runbios-qwen',
  'baseten-glm-53-flash': 'baseten-glm-53-flash',
  'glm-5.3': 'runbios-glm-53',
  'glm-5.3-flash': 'runbios-glm-53-flash',
  'zai-org/glm-5.3-flash': 'baseten-glm-53-flash',
  'baseten-glm': 'baseten-glm-fast',
  'aihubmix-glm': 'aihubmix-glm-fast',
  'glm-fast-aihubmix': 'aihubmix-glm-fast',
  'minimax': 'nvidia-minimax',
  'minimax-m3': 'nvidia-minimax',
  'minimaxai/minimax-m3': 'nvidia-minimax',
  'glm-5.2-fast': 'baseten-glm-fast',
  nvidia: 'nvidia-deepseek',
  nim: 'nvidia-deepseek',
  'gpt-5.6': 'gpt-5.6-sol',
  openai: 'gpt-5.6-sol',
  chatgpt: 'gpt-5.6-sol',
  'chatgpt-plus': 'gpt-5.6-sol',
}

export function modelsForLane(lane: StudioLane): StudioModelOption[] {
  const list = STUDIO_MODELS.filter((m) =>
    m.lanes.includes(lane) && hostsForModel(m.id, lane).length > 0,
  )
  if (lane === 'draft') {
    // Draft lane sorts model families alphabetically by display label.
    return [...list].sort((a, b) => a.label.localeCompare(b.label))
  }
  const order = LANE_MODEL_ORDER[lane]
  if (!order?.length) return list
  return [...list].sort((a, b) => {
    const ia = order.indexOf(a.id)
    const ib = order.indexOf(b.id)
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
  })
}

export function findModel(modelId: string): StudioModelOption | undefined {
  return STUDIO_MODELS.find((m) => m.id === modelId)
}

export function canonicalizePin(raw?: string | null): string {
  const pin = String(raw || '').trim().toLowerCase()
  if (!pin) return 'auto'
  return PIN_ALIASES[pin] || pin
}

export function parseStudioPin(raw?: string | null): { model: StudioModelOption; host: StudioHostOption } {
  const pin = canonicalizePin(raw)
  for (const model of STUDIO_MODELS) {
    const host = model.hosts.find((h) => h.pin === pin)
    if (host) return { model, host }
  }
  const auto = STUDIO_MODELS[0]
  return { model: auto, host: auto.hosts[0] }
}

export function pinFor(modelId: StudioModelId, hostId: StudioHostId): string {
  const model = findModel(modelId)
  if (!model) return 'auto'
  const host = model.hosts.find((h) => h.id === hostId) || model.hosts[0]
  return host.pin
}

/** Hosts for a model, optionally narrowed to the hosts a lane may use. */
export function hostsForModel(modelId: StudioModelId, lane?: StudioLane): StudioHostOption[] {
  let hosts = findModel(modelId)?.hosts ?? []
  if (lane) {
    const allowed = new Set(LANE_HOSTS[lane] || [])
    hosts = hosts.filter((h) => allowed.has(h.id))
  }
  return [...hosts].sort((a, b) => {
    const ia = STUDIO_HOST_ORDER.indexOf(a.id)
    const ib = STUDIO_HOST_ORDER.indexOf(b.id)
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
  })
}

export function defaultHostFor(modelId: StudioModelId): StudioHostOption {
  const hosts = hostsForModel(modelId)
  return hosts[0] || { id: 'auto', label: 'Auto', pin: 'auto' }
}

/** Every stage shows the dated checkpoint id so Flash-0731 vs Pro-0813 cannot be confused. */
export function modelPickerLabel(model: StudioModelOption, _lane?: StudioLane): string {
  return model.apiModel || model.label
}

/** Flat list used by health / command-center fallbacks. */
export function catalogPins(): Array<{ id: string; label: string; model: string }> {
  const out: Array<{ id: string; label: string; model: string }> = []
  for (const model of STUDIO_MODELS) {
    for (const host of model.hosts) {
      if (host.pin === 'auto') continue
      out.push({
        id: host.pin,
        label: `${model.label} · ${host.label}`,
        model: host.pin,
      })
    }
  }
  return out
}

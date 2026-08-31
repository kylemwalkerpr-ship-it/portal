/**
 * Studio model × host catalog.
 *
 * The factory still wires a single pin (`baseten-deepseek`, `parasail-glm`…).
 * The UI splits that into two choices: which model family, then which host
 * serves it. One catalog keeps drafting, brief, review, and Command Center
 * in agreement.
 *
 * Lane policy (single source of truth for UI pickers AND server defaults):
 *   Draft  — Run BiOS + NVIDIA hosts only; families sorted alphabetically;
 *            default MiniMax M3 via NVIDIA (`nvidia-minimax`).
 *   Brief  — exactly three families: Claude Opus 5 (Run BiOS, default),
 *            Grok (xAI), DeepSeek V4 Flash (Run BiOS + Baseten).
 *   Review — exactly four: Grok, Claude Opus 5, Claude Sonnet 5 (Run BiOS),
 *            GLM 5.3 Flash (Run BiOS, default).
 * Host dropdown order (when the host actually serves that model):
 *   Run BiOS → Parasail → Baseten → NVIDIA → DeepSeek.com → Zai
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
  | 'nemotron-3-ultra'
  | 'cloudflare-llama'
  | 'groq-llama'
  | 'gemini'
  | 'openrouter'

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

/** Draft lead: MiniMax M3 via NVIDIA Integrate — drafting default pin. */
export const DEFAULT_DRAFT_PIN = 'nvidia-minimax'
/** Research / Generate Full Brief lead: Claude Opus 5 via Run BiOS. */
export const DEFAULT_BRIEF_PIN = 'runbios-claude-opus'
/** Reviewer / Editor lead: Run BiOS GLM 5.3 Flash. */
export const DEFAULT_REVIEW_PIN = 'runbios-glm-53-flash'

/**
 * Lane host allowlists — a lane can only select or execute a pin whose host
 * serves that lane. Draft is Run BiOS + NVIDIA only; Brief is Run BiOS,
 * Baseten, and xAI (Grok); Review is Run BiOS + xAI. Command Center keeps the
 * full host set. `auto` stays a command-only host.
 */
export const LANE_HOSTS: Record<StudioLane, StudioHostId[]> = {
  draft: ['runbios', 'nvidia', 'entrim'],
  brief: ['runbios', 'baseten', 'xai'],
  review: ['runbios', 'xai'],
  command: ['runbios', 'parasail', 'baseten', 'nvidia', 'deepseek', 'entrim', 'zai', 'aihubmix', 'xai', 'openai', 'cloudflare', 'groq', 'google', 'openrouter', 'auto'],
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
  // Draft lane is sorted alphabetically by display label in modelsForLane —
  // this list is the fallback tiebreaker only.
  draft: [
    'glm-5.2',
    'glm-5.3-flash',
    'kimi-k2.7-code',
    'minimax-m3',
    'nemotron-3-ultra',
    'qwen3.5',
    'bios-adaptive',
    'deepseek-v4-flash',
  ],
  // Brief: exactly three families — Claude Opus 5 (default), Grok,
  // DeepSeek V4 Flash (Run BiOS + Baseten hosts only).
  brief: [
    'claude-opus-5',
    'grok-4.6',
    'deepseek-v4-flash',
  ],
  // Review/Editor: exactly four — Grok, Claude Opus 5, Claude Sonnet 5,
  // GLM 5.3 Flash (default).
  review: [
    'grok-4.6',
    'claude-opus-5',
    'claude-sonnet-5',
    'glm-5.3-flash',
  ],
  command: [
    'auto',
    'minimax-m3',
    'glm-5.3-flash',
    'deepseek-v4-pro',
    'glm-5.2',
    'deepseek-v4-flash',
    'bios-adaptive',
    'kimi-k2.7-code',
    'qwen3.5',
    'claude-sonnet-5',
    'grok-4.6',
    'glm-5.2-fast',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
    'claude-opus-5',
    'nemotron-3-ultra',
    'cloudflare-llama',
    'groq-llama',
    'gemini',
    'openrouter',
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
    id: 'deepseek-v4-pro',
    label: 'deepseek-ai/DeepSeek-V4-Pro-0813',
    apiModel: DEEPSEEK_V4_PRO_ID,
    lanes: ['command'],
    hosts: [
      { id: 'runbios', label: 'Run BiOS', pin: 'runbios-deepseek-pro' },
      { id: 'parasail', label: 'Parasail', pin: 'parasail-deepseek-pro' },
      { id: 'baseten', label: 'Baseten', pin: 'baseten-deepseek-pro' },
      { id: 'deepseek', label: 'DeepSeek', pin: 'deepseek-pro' },
    ],
  },
  {
    id: 'glm-5.2',
    label: 'GLM 5.2',
    lanes: ['draft', 'command'],
    hosts: [
      { id: 'runbios', label: 'Run BiOS', pin: 'runbios-glm-52' },
      { id: 'parasail', label: 'Parasail', pin: 'parasail-glm' },
      { id: 'nvidia', label: 'NVIDIA', pin: 'nvidia-glm' },
      { id: 'zai', label: 'Zai', pin: 'zai-glm' },
    ],
  },
  {
    id: 'deepseek-v4-flash',
    label: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    apiModel: DEEPSEEK_V4_FLASH_ID,
    lanes: ['draft', 'brief', 'command'],
    hosts: [
      { id: 'runbios', label: 'Run BiOS', pin: 'runbios-deepseek-flash' },
      { id: 'parasail', label: 'Parasail', pin: 'parasail-deepseek' },
      { id: 'baseten', label: 'Baseten', pin: 'baseten-deepseek' },
      { id: 'nvidia', label: 'NVIDIA', pin: 'nvidia-deepseek' },
      { id: 'entrim', label: 'Entrim', pin: ENTRIM_DEEPSEEK_FLASH_PIN },
      { id: 'deepseek', label: 'DeepSeek', pin: 'deepseek-flash' },
    ],
  },
  {
    id: 'grok-4.6',
    label: 'Grok 4.6',
    lanes: ['brief', 'review', 'command'],
    hosts: [{ id: 'xai', label: 'SuperGrok / xAI', pin: 'grok' }],
  },
  {
    id: 'glm-5.3',
    label: 'GLM 5.3',
    apiModel: 'glm-5.3',
    lanes: ['command'],
    hosts: [{ id: 'runbios', label: 'Run BiOS', pin: 'runbios-glm-53' }],
  },
  {
    id: 'glm-5.3-flash',
    label: 'GLM 5.3 Flash',
    apiModel: 'glm-5.3-flash',
    lanes: ['draft', 'review', 'command'],
    hosts: [
      { id: 'runbios', label: 'Run BiOS', pin: 'runbios-glm-53-flash' },
      { id: 'baseten', label: 'Baseten', pin: 'baseten-glm-53-flash' },
    ],
  },
  {
    id: 'kimi-k2.7-code',
    label: 'Kimi K2.7 Code',
    apiModel: 'kimi-k2.7-code',
    lanes: ['draft', 'command'],
    hosts: [{ id: 'runbios', label: 'Run BiOS', pin: 'runbios-kimi' }],
  },
  {
    id: 'qwen3.5',
    label: 'Qwen3.5 397B',
    apiModel: 'qwen3.5-397b-a17b',
    lanes: ['draft', 'command'],
    hosts: [{ id: 'runbios', label: 'Run BiOS', pin: 'runbios-qwen' }],
  },
  {
    id: 'bios-adaptive',
    label: 'Run BiOS Adaptive',
    apiModel: 'bios-adaptive',
    lanes: ['draft', 'command'],
    hosts: [{ id: 'runbios', label: 'Run BiOS', pin: 'runbios-adaptive' }],
  },
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    apiModel: 'claude-sonnet-5',
    lanes: ['review', 'command'],
    hosts: [{ id: 'runbios', label: 'Run BiOS', pin: 'runbios-claude-sonnet' }],
  },
  {
    id: 'claude-opus-5',
    label: 'Claude Opus 5',
    apiModel: 'claude-opus-5',
    lanes: ['brief', 'review', 'command'],
    hosts: [{ id: 'runbios', label: 'Run BiOS', pin: 'runbios-claude-opus' }],
  },
  {
    id: 'glm-5.2-fast',
    label: 'GLM 5.2 Fast',
    lanes: ['command'],
    hosts: [
      { id: 'baseten', label: 'Baseten', pin: 'baseten-glm-fast' },
      { id: 'aihubmix', label: 'AIHubmix', pin: 'aihubmix-glm-fast' },
    ],
  },
  {
    id: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    lanes: ['command'],
    hosts: [{ id: 'openai', label: 'OpenAI', pin: 'gpt-5.6-terra' }],
  },
  {
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    lanes: ['command'],
    hosts: [{ id: 'openai', label: 'OpenAI', pin: 'gpt-5.6-sol' }],
  },
  {
    id: 'minimax-m3',
    label: 'MiniMax M3',
    apiModel: 'minimax-m3',
    lanes: ['draft', 'command'],
    hosts: [
      { id: 'runbios', label: 'Run BiOS', pin: 'runbios-minimax' },
      { id: 'nvidia', label: 'NVIDIA', pin: 'nvidia-minimax' },
    ],
  },
  {
    id: 'nemotron-3-ultra',
    label: 'Nemotron 3 Ultra',
    lanes: ['draft', 'command'],
    hosts: [{ id: 'nvidia', label: 'NVIDIA', pin: 'nvidia-nemotron' }],
  },
  {
    id: 'cloudflare-llama',
    label: 'Llama 3.3 70B',
    lanes: ['draft', 'command'],
    hosts: [{ id: 'cloudflare', label: 'Cloudflare Workers AI', pin: 'cloudflare-ai' }],
  },
  {
    id: 'groq-llama',
    label: 'Llama 3.3 70B',
    lanes: ['command'],
    hosts: [{ id: 'groq', label: 'Groq', pin: 'groq' }],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    lanes: ['draft', 'command'],
    hosts: [{ id: 'google', label: 'Google', pin: 'gemini' }],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter free models',
    lanes: ['draft', 'command'],
    hosts: [{ id: 'openrouter', label: 'OpenRouter', pin: 'openrouter' }],
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

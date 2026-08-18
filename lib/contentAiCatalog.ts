/**
 * Studio model × host catalog.
 *
 * The factory still wires a single pin (`baseten-deepseek`, `parasail-glm`…).
 * The UI splits that into two choices: which model family, then which host
 * serves it. One catalog keeps drafting, brief, review, and Command Center
 * in agreement.
 *
 * Host dropdown order (when the host actually serves that model):
 *   Parasail (default — $25 credit) → Baseten → NVIDIA → DeepSeek.com → Zai
 */

export type StudioLane = 'draft' | 'brief' | 'review' | 'command'

export type StudioModelId =
  | 'auto'
  | 'deepseek-v4-flash'
  | 'deepseek-v4-pro'
  | 'glm-5.2'
  | 'glm-5.2-fast'
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
  | 'baseten'
  | 'parasail'
  | 'nvidia'
  | 'deepseek'
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

/** Draft lead: Flash-0731 via Parasail ($25 credit host — same model id on Baseten / NVIDIA / DeepSeek.com). */
export const DEFAULT_DRAFT_PIN = 'parasail-deepseek'
/** Research / Generate Full Brief lead: Pro-0813 via Parasail. */
export const DEFAULT_BRIEF_PIN = 'parasail-deepseek-pro'
/** Reviewer / Editor lead: same Pro-0813 pin so the API id is what we send. */
export const DEFAULT_REVIEW_PIN = 'parasail-deepseek-pro'

/** Host picker order — skip a host when that model is not served there. */
export const STUDIO_HOST_ORDER: StudioHostId[] = [
  'parasail',
  'baseten',
  'nvidia',
  'deepseek',
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
  draft: [
    'auto',
    'deepseek-v4-flash',
    'grok-4.6',
    'glm-5.2',
    'glm-5.2-fast',
    'nemotron-3-ultra',
    'cloudflare-llama',
    'gemini',
    'openrouter',
  ],
  brief: [
    'deepseek-v4-pro',
    'glm-5.2',
    'deepseek-v4-flash',
    'grok-4.6',
    'glm-5.2-fast',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
  ],
  review: [
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'glm-5.2',
    'grok-4.6',
    'glm-5.2-fast',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
  ],
  command: [
    'auto',
    'deepseek-v4-pro',
    'glm-5.2',
    'deepseek-v4-flash',
    'grok-4.6',
    'glm-5.2-fast',
    'gpt-5.6-terra',
    'gpt-5.6-sol',
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
    lanes: ['draft', 'command'],
    hosts: [{ id: 'auto', label: 'Auto', pin: 'auto' }],
  },
  {
    id: 'deepseek-v4-pro',
    label: 'deepseek-ai/DeepSeek-V4-Pro-0813',
    apiModel: DEEPSEEK_V4_PRO_ID,
    lanes: ['brief', 'review', 'command'],
    hosts: [
      { id: 'parasail', label: 'Parasail', pin: 'parasail-deepseek-pro' },
      { id: 'baseten', label: 'Baseten', pin: 'baseten-deepseek-pro' },
      { id: 'deepseek', label: 'DeepSeek', pin: 'deepseek-pro' },
    ],
  },
  {
    id: 'glm-5.2',
    label: 'GLM 5.2',
    lanes: ['draft', 'brief', 'review', 'command'],
    hosts: [
      { id: 'parasail', label: 'Parasail', pin: 'parasail-glm' },
      { id: 'nvidia', label: 'NVIDIA', pin: 'nvidia-glm' },
      { id: 'zai', label: 'Zai', pin: 'zai-glm' },
    ],
  },
  {
    id: 'deepseek-v4-flash',
    label: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    apiModel: DEEPSEEK_V4_FLASH_ID,
    lanes: ['draft', 'brief', 'review', 'command'],
    hosts: [
      { id: 'parasail', label: 'Parasail', pin: 'parasail-deepseek' },
      { id: 'baseten', label: 'Baseten', pin: 'baseten-deepseek' },
      { id: 'nvidia', label: 'NVIDIA', pin: 'nvidia-deepseek' },
      { id: 'deepseek', label: 'DeepSeek', pin: 'deepseek-flash' },
    ],
  },
  {
    id: 'grok-4.6',
    label: 'Grok 4.6',
    lanes: ['draft', 'brief', 'review', 'command'],
    hosts: [{ id: 'xai', label: 'SuperGrok / xAI', pin: 'grok' }],
  },
  {
    id: 'glm-5.2-fast',
    label: 'GLM 5.2 Fast',
    lanes: ['draft', 'brief', 'review', 'command'],
    hosts: [
      { id: 'baseten', label: 'Baseten', pin: 'baseten-glm-fast' },
      { id: 'aihubmix', label: 'AIHubmix', pin: 'aihubmix-glm-fast' },
    ],
  },
  {
    id: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    lanes: ['brief', 'review', 'command'],
    hosts: [{ id: 'openai', label: 'OpenAI', pin: 'gpt-5.6-terra' }],
  },
  {
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    lanes: ['brief', 'review', 'command'],
    hosts: [{ id: 'openai', label: 'OpenAI', pin: 'gpt-5.6-sol' }],
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
  'zai-glm': 'zai-glm',
  'zai': 'zai-glm',
  grok: 'grok',
  'grok-4.6': 'grok',
  xai: 'grok',
  supergrok: 'grok',
  'super-grok': 'grok',
  'glm-fast': 'baseten-glm-fast',
  'baseten-glm': 'baseten-glm-fast',
  'aihubmix-glm': 'aihubmix-glm-fast',
  'glm-fast-aihubmix': 'aihubmix-glm-fast',
  'glm-5.2-fast': 'baseten-glm-fast',
  nvidia: 'nvidia-deepseek',
  nim: 'nvidia-deepseek',
}

export function modelsForLane(lane: StudioLane): StudioModelOption[] {
  const list = STUDIO_MODELS.filter((m) => m.lanes.includes(lane))
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

export function hostsForModel(modelId: StudioModelId): StudioHostOption[] {
  const hosts = findModel(modelId)?.hosts ?? []
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

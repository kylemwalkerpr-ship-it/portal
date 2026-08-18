/**
 * Studio model × host catalog.
 *
 * The factory still wires a single pin (`baseten-deepseek`, `parasail-glm`…).
 * The UI splits that into two choices: which model family, then which host
 * serves it. One catalog keeps drafting, brief, review, and Command Center
 * in agreement.
 */

export type StudioLane = 'draft' | 'brief' | 'review' | 'command'

export type StudioModelId =
  | 'auto'
  | 'deepseek-v4-flash'
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
  | 'nvidia'
  | 'parasail'
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
  lanes: StudioLane[]
  hosts: StudioHostOption[]
}

export const STUDIO_MODELS: StudioModelOption[] = [
  {
    id: 'auto',
    label: 'Auto (cascade)',
    lanes: ['draft', 'command'],
    hosts: [{ id: 'auto', label: 'Auto', pin: 'auto' }],
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
    id: 'glm-5.2',
    label: 'GLM 5.2',
    lanes: ['draft', 'brief', 'review', 'command'],
    hosts: [
      { id: 'nvidia', label: 'NVIDIA', pin: 'nvidia-glm' },
      { id: 'parasail', label: 'Parasail', pin: 'parasail-glm' },
    ],
  },
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    lanes: ['draft', 'brief', 'review', 'command'],
    hosts: [
      { id: 'baseten', label: 'Baseten', pin: 'baseten-deepseek' },
      { id: 'nvidia', label: 'NVIDIA', pin: 'nvidia-deepseek' },
      { id: 'parasail', label: 'Parasail', pin: 'parasail-deepseek' },
    ],
  },
  {
    id: 'grok-4.6',
    label: 'Grok 4.6',
    lanes: ['draft', 'brief', 'review', 'command'],
    hosts: [{ id: 'xai', label: 'SuperGrok / xAI', pin: 'grok' }],
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
  'parasail-glm-52': 'parasail-glm',
  'parasail-glm-5.2': 'parasail-glm',
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
  return STUDIO_MODELS.filter((m) => m.lanes.includes(lane))
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
  return findModel(modelId)?.hosts ?? []
}

export function defaultHostFor(modelId: StudioModelId): StudioHostOption {
  const hosts = hostsForModel(modelId)
  return hosts[0] || { id: 'auto', label: 'Auto', pin: 'auto' }
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

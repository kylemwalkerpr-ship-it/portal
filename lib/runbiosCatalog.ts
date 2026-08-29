/**
 * Run BiOS model library — one OpenAI-compatible host, many model ids.
 * Source: https://runbios.ai/models/ plus glm-5.3-flash (verified live).
 * One RUNBIOS_API_KEY unlocks every slot.
 */

export const RUNBIOS_BASE_URL = 'https://api.runbios.ai/v1'

export interface RunbiosSlot {
  /** Factory / vault / picker pin */
  id: string
  /** Exact model string sent to api.runbios.ai */
  apiModel: string
  label: string
  /** Studio catalog model family */
  studioModelId: string
  role: 'primary' | 'fallback'
  hint: string
  /** Send reasoning_effort: low (GLM 5.3 Flash defaults to max otherwise). */
  reasoningLow?: boolean
}

export const RUNBIOS_SLOTS: RunbiosSlot[] = [
  {
    id: 'runbios-glm-53-flash',
    apiModel: 'glm-5.3-flash',
    label: 'GLM 5.3 Flash · Run BiOS',
    studioModelId: 'glm-5.3-flash',
    role: 'primary',
    hint: 'Default for Discover, brief, draft, audit, editor',
    reasoningLow: true,
  },
  {
    id: 'runbios-glm-52',
    apiModel: 'glm-5.2',
    label: 'GLM 5.2 · Run BiOS',
    studioModelId: 'glm-5.2',
    role: 'primary',
    hint: 'Long-context GLM 5.2 on the same Run BiOS key',
  },
  {
    id: 'runbios-deepseek-flash',
    apiModel: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash · Run BiOS',
    studioModelId: 'deepseek-v4-flash',
    role: 'primary',
    hint: 'Run BiOS id deepseek-v4-flash',
  },
  {
    id: 'runbios-deepseek-pro',
    apiModel: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro · Run BiOS',
    studioModelId: 'deepseek-v4-pro',
    role: 'fallback',
    hint: 'Research / review weight on Run BiOS',
  },
  {
    id: 'runbios-minimax',
    apiModel: 'minimax-m3',
    label: 'MiniMax M3 · Run BiOS',
    studioModelId: 'minimax-m3',
    role: 'primary',
    hint: 'Drafting default — fastest complete long-form on Run BiOS',
    reasoningLow: true,
  },
  {
    id: 'runbios-kimi',
    apiModel: 'kimi-k2.7-code',
    label: 'Kimi K2.7 Code · Run BiOS',
    studioModelId: 'kimi-k2.7-code',
    role: 'fallback',
    hint: 'Coding / agentic Kimi on Run BiOS',
  },
  {
    id: 'runbios-qwen',
    apiModel: 'qwen3.5-397b-a17b',
    label: 'Qwen3.5 397B · Run BiOS',
    studioModelId: 'qwen3.5',
    role: 'fallback',
    hint: 'Qwen3.5 397B-A17B on Run BiOS',
  },
  {
    id: 'runbios-adaptive',
    apiModel: 'bios-adaptive',
    label: 'Run BiOS Adaptive',
    studioModelId: 'bios-adaptive',
    role: 'fallback',
    hint: 'Router — quality / speed / budget per request',
  },
  {
    id: 'runbios-claude-sonnet',
    apiModel: 'claude-sonnet-5',
    label: 'Claude Sonnet 5 · Run BiOS',
    studioModelId: 'claude-sonnet-5',
    role: 'fallback',
    hint: 'Claude Sonnet 5 billed through Run BiOS',
  },
  {
    id: 'runbios-claude-opus',
    apiModel: 'claude-opus-5',
    label: 'Claude Opus 5 · Run BiOS',
    studioModelId: 'claude-opus-5',
    role: 'fallback',
    hint: 'Claude Opus 5 billed through Run BiOS',
  },
]

export const RUNBIOS_API_MODELS = RUNBIOS_SLOTS.map((s) => s.apiModel)

export function runbiosSlot(id: string): RunbiosSlot | undefined {
  const pin = String(id || '').trim().toLowerCase()
  return RUNBIOS_SLOTS.find((s) => s.id === pin)
}

export function isRunbiosPin(id: string): boolean {
  const pin = String(id || '').trim().toLowerCase()
  if (pin === 'runbios' || pin === 'runbios-glm') return true
  return pin.startsWith('runbios-')
}

export function canonicalizeRunbiosPin(id: string): string {
  const pin = String(id || '').trim().toLowerCase()
  if (pin === 'runbios' || pin === 'runbios-glm') return 'runbios-glm-53-flash'
  const slot = runbiosSlot(pin)
  return slot?.id || pin
}

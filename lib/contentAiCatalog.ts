/**
 * Studio model × host catalog.
 *
 * The factory still wires a single pin (`entrim-qwen-27b`, `entrim-deepseek`,
 * `grok`). The UI splits that into two choices: which model family, then which
 * host serves it. One catalog keeps drafting, brief, review, and Command Center
 * in agreement.
 *
 * Lane policy (single source of truth for UI pickers AND server defaults),
 * mirroring the live provider policy in contentAiProvider.ts:
 *   Draft  — Grok 4.6 (default) + Entrim Qwen3.6 27B + Entrim DeepSeek V4 Flash.
 *   Brief  — Grok 4.6 (default) + Entrim Qwen3.6 27B + Entrim DeepSeek V4 Flash.
 *   Review — Grok 4.6 (default) + Entrim Qwen3.6 27B + Entrim DeepSeek V4 Flash.
 *   Command — the same three models (no Auto).
 * Retired families (Claude, GLM, MiniMax, Nemotron, GPT-5.6, Run BiOS,
 * NVIDIA, Baseten, Parasail, OpenAI, Groq, Gemini, …) are no longer
 * selectable — a saved legacy pin parses to the Grok default and the
 * server gate routes it to `grok`.
 */

export type StudioLane = 'draft' | 'brief' | 'review' | 'command'

export type StudioModelId = 'qwen3.6-27b' | 'deepseek-v4-flash' | 'grok-4.6'

export type StudioHostId = 'entrim' | 'xai'

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

/** xAI Grok 4.6 — paid SuperGrok / XAI_API_KEY pin used across studio defaults. */
export const GROK_PIN = 'grok'

/** Draft lead: Grok 4.6 — paid SuperGrok subscription default
 *  (api.x.ai/v1). Falls back through Entrim in the auto cascade. */
export const DEFAULT_DRAFT_PIN = GROK_PIN
/** Research / Generate Full Brief lead: Grok 4.6. */
export const DEFAULT_BRIEF_PIN = GROK_PIN
/** Reviewer / Editor lead: Grok 4.6. */
export const DEFAULT_REVIEW_PIN = GROK_PIN

/**
 * Lane host allowlists — a lane can only select or execute a pin whose host
 * serves that lane. Every lane offers Entrim (Qwen + DeepSeek) and xAI
 * (Grok). No `auto` model exists in the catalog.
 */
export const LANE_HOSTS: Record<StudioLane, StudioHostId[]> = {
  draft: ['xai', 'entrim'],
  brief: ['xai', 'entrim'],
  review: ['xai', 'entrim'],
  command: ['xai', 'entrim'],
}

/** Host picker order — skip a host when that model is not served there. */
export const STUDIO_HOST_ORDER: StudioHostId[] = ['xai', 'entrim']

const LANE_MODEL_ORDER: Record<StudioLane, StudioModelId[]> = {
  // All lanes list the same three models (Grok lead, then Qwen, then DeepSeek).
  draft: ['grok-4.6', 'qwen3.6-27b', 'deepseek-v4-flash'],
  brief: ['grok-4.6', 'qwen3.6-27b', 'deepseek-v4-flash'],
  review: ['grok-4.6', 'qwen3.6-27b', 'deepseek-v4-flash'],
  command: ['grok-4.6', 'qwen3.6-27b', 'deepseek-v4-flash'],
}

export const STUDIO_MODELS: StudioModelOption[] = [
  {
    id: 'deepseek-v4-flash',
    // Live-policy host: Entrim serves the EXACT upstream id (no -0731
    // suffix) — the label names it so the wire payload is unambiguous.
    label: ENTRIM_DEEPSEEK_MODEL,
    apiModel: ENTRIM_DEEPSEEK_MODEL,
    lanes: ['draft', 'brief', 'review', 'command'],
    hosts: [{ id: 'entrim', label: 'Entrim', pin: ENTRIM_DEEPSEEK_FLASH_PIN }],
  },
  {
    id: 'qwen3.6-27b',
    label: 'Qwen3.6 27B',
    apiModel: ENTRIM_QWEN_MODEL,
    lanes: ['draft', 'brief', 'review', 'command'],
    hosts: [{ id: 'entrim', label: 'Entrim', pin: ENTRIM_QWEN_PIN }],
  },
  {
    id: 'grok-4.6',
    label: 'Grok 4.6',
    apiModel: 'grok-4.6',
    lanes: ['draft', 'brief', 'review', 'command'],
    hosts: [{ id: 'xai', label: 'xAI / Grok', pin: 'grok' }],
  },
]

const PIN_ALIASES: Record<string, string> = {
  entrim: ENTRIM_DEEPSEEK_FLASH_PIN,
  [ENTRIM_DEEPSEEK_FLASH_PIN]: ENTRIM_DEEPSEEK_FLASH_PIN,
  'entrim-deepseek-v4-flash': ENTRIM_DEEPSEEK_FLASH_PIN,
  'entrim-deepseek-v4-flash-0731': ENTRIM_DEEPSEEK_FLASH_PIN,
  [ENTRIM_QWEN_PIN]: ENTRIM_QWEN_PIN,
  'qwen3.6-27b': ENTRIM_QWEN_PIN,
  qwen: ENTRIM_QWEN_PIN,
  grok: 'grok',
  'grok-4.6': 'grok',
  xai: 'grok',
  supergrok: 'grok',
  'super-grok': 'grok',
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
  if (!pin) return GROK_PIN
  return PIN_ALIASES[pin] || GROK_PIN
}

/**
 * Operator / brief pin wins over last-successful cascade/runtime provider.
 * `auto` and empty owner fall through to the runtime pin (then the draft default).
 */
export function resolveOwnerProviderPin(
  ownerProvider?: string | null,
  runtimeProvider?: string | null,
): string {
  const owner = String(ownerProvider || '').trim().toLowerCase()
  if (owner && owner !== 'auto') return canonicalizePin(owner)
  const runtime = String(runtimeProvider || '').trim().toLowerCase()
  if (runtime && runtime !== 'auto') return canonicalizePin(runtime)
  return DEFAULT_DRAFT_PIN
}

/** Job modal / regenerate picker: lineage/audit owner pin, then stored ai_provider. */
export function resolveJobPickerPin(job: {
  ai_provider?: string | null
  lineage?: unknown
  audit_json?: unknown
  owner_provider?: string | null
}): string {
  const lineage = job.lineage && typeof job.lineage === 'object'
    ? (job.lineage as Record<string, unknown>)
    : null
  const audit = job.audit_json && typeof job.audit_json === 'object'
    ? (job.audit_json as Record<string, unknown>)
    : null
  const owner = String(
    job.owner_provider
    || lineage?.ownerProvider
    || audit?.ownerProvider
    || '',
  ).trim()
  return resolveOwnerProviderPin(owner || null, job.ai_provider)
}

export function parseStudioPin(raw?: string | null): { model: StudioModelOption; host: StudioHostOption } {
  const pin = canonicalizePin(raw)
  for (const model of STUDIO_MODELS) {
    const host = model.hosts.find((h) => h.pin === pin)
    if (host) return { model, host }
  }
  const grok = findModel('grok-4.6') || STUDIO_MODELS[0]
  return { model: grok, host: grok.hosts[0] }
}

export function pinFor(modelId: StudioModelId, hostId: StudioHostId): string {
  const model = findModel(modelId)
  if (!model) return GROK_PIN
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
  return hosts[0] || { id: 'xai', label: 'xAI / Grok', pin: GROK_PIN }
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
      out.push({
        id: host.pin,
        label: `${model.label} · ${host.label}`,
        model: host.pin,
      })
    }
  }
  return out
}

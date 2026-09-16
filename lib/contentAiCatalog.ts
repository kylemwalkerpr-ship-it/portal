/**
 * Studio model × host catalog — COMMISSIONED (P2, 2026-09-15).
 *
 * Exactly two commissioned providers exist (design §3.1/§3.7), derived from
 * `lib/contentAiRegistry` so the pickers can never diverge from the server
 * registry:
 *
 *   1. Grok 4.6        — model `grok-4.6`,    host `xai`,      pin `grok`.
 *   2. DeepSeek V4.1 Flash — model `deepseek-v41-flash`, host `deepseek`,
 *      upstream API model id `deepseek-flash` (first-party api.deepseek.com).
 *
 * Lane policy: all four lanes (draft, brief, review, command) offer exactly
 * these two models; Grok 4.6 remains the lane default ONLY when a job has no
 * requested provider (decision §13.2, `resolveExecutionProvider`).
 *
 * Retired families/hosts (Entrim, Qwen, Claude, GLM, GPT, Run BiOS, NVIDIA,
 * Baseten, Parasail, OpenAI, Groq, Gemini, …) are historical, non-selectable
 * and non-executable: `parseStudioPin` returns `{kind:'needs_selection'}` and
 * the picker requires explicit reselection — never a silent Grok coercion.
 */

import {
  COMMISSIONED_PROVIDERS,
  LANE_DEFAULT_PIN,
  canonicalCommissionedPin,
  type CommissionedProvider,
  type CommissionedProviderHost,
  type CommissionedProviderPin,
  type StudioLane,
} from '@/lib/contentAiRegistry'

export type { StudioLane }

/** Stable model ids shown in the pickers. Grok is not the raw pin (`grok`). */
export type StudioModelId = 'grok-4.6' | 'deepseek-v41-flash'

/**
 * Commissioned hosts: xAI (Grok) and first-party DeepSeek. Historical host
 * names stay representable as plain strings for read-only display, but the
 * catalog only ever produces commissioned hosts.
 */
export type StudioHostId = CommissionedProviderHost | (string & {})

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

/** Commissioned draft lead: Grok 4.6 (SuperGrok subscription / XAI_API_KEY). */
export const DEFAULT_DRAFT_PIN: CommissionedProviderPin = LANE_DEFAULT_PIN
/** Research / Generate Full Brief lead: Grok 4.6. */
export const DEFAULT_BRIEF_PIN: CommissionedProviderPin = LANE_DEFAULT_PIN
/** Reviewer / Editor lead: Grok 4.6. */
export const DEFAULT_REVIEW_PIN: CommissionedProviderPin = LANE_DEFAULT_PIN

/** Model id per commissioned pin — the picker value for each provider. */
const MODEL_ID_BY_PIN: Record<CommissionedProviderPin, StudioModelId> = {
  grok: 'grok-4.6',
  'deepseek-v41-flash': 'deepseek-v41-flash',
}

function hostLabelFor(provider: CommissionedProvider): string {
  return provider.hostId === 'xai' ? 'xAI / Grok' : 'DeepSeek (first-party)'
}

/** Picker rows derived directly from the canonical registry. */
export const STUDIO_MODELS: StudioModelOption[] = COMMISSIONED_PROVIDERS.map((provider) => ({
  id: MODEL_ID_BY_PIN[provider.pin],
  label: provider.label,
  apiModel: provider.apiModel,
  lanes: [...provider.lanes],
  hosts: [{ id: provider.hostId, label: hostLabelFor(provider), pin: provider.pin }],
}))

const MODEL_BY_ID = new Map<string, StudioModelOption>(STUDIO_MODELS.map((model) => [model.id, model]))
const MODEL_BY_PIN = new Map<string, StudioModelOption>(
  STUDIO_MODELS.flatMap((model) => model.hosts.map((host) => [host.pin, model] as const)),
)

/** All four lanes allow exactly the two commissioned hosts (registry-derived). */
const COMMISSIONED_HOSTS: StudioHostId[] = COMMISSIONED_PROVIDERS.map((provider) => provider.hostId)

export const LANE_HOSTS: Record<StudioLane, StudioHostId[]> = {
  draft: [...COMMISSIONED_HOSTS],
  brief: [...COMMISSIONED_HOSTS],
  review: [...COMMISSIONED_HOSTS],
  command: [...COMMISSIONED_HOSTS],
}

/** Host picker order — skip a host when that model is not served there. */
export const STUDIO_HOST_ORDER: StudioHostId[] = [...COMMISSIONED_HOSTS]

const LANE_MODEL_ORDER: Record<StudioLane, StudioModelId[]> = {
  // Grok leads every lane; first-party DeepSeek V4.1 Flash is the peer choice.
  draft: ['grok-4.6', 'deepseek-v41-flash'],
  brief: ['grok-4.6', 'deepseek-v41-flash'],
  review: ['grok-4.6', 'deepseek-v41-flash'],
  command: ['grok-4.6', 'deepseek-v41-flash'],
}

export function modelsForLane(lane: StudioLane): StudioModelOption[] {
  const list = STUDIO_MODELS.filter((m) =>
    m.lanes.includes(lane) && hostsForModel(m.id, lane).length > 0,
  )
  const order = LANE_MODEL_ORDER[lane]
  if (!order?.length) return list
  return [...list].sort((a, b) => {
    const ia = order.indexOf(a.id)
    const ib = order.indexOf(b.id)
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
  })
}

export function findModel(modelId: string): StudioModelOption | undefined {
  return MODEL_BY_ID.get(modelId)
}

/**
 * Owner / brief pin wins over the last-successful runtime provider. A
 * commissioned value canonicalizes (Grok aliases included); a legacy value is
 * returned verbatim so it stays auditable and forces re-selection — it is
 * never silently coerced to a default. `auto`/empty fall to the next source
 * and finally the draft default.
 */
export function resolveOwnerProviderPin(
  ownerProvider?: string | null,
  runtimeProvider?: string | null,
): string {
  const owner = String(ownerProvider || '').trim()
  if (owner && owner.toLowerCase() !== 'auto') return canonicalCommissionedPin(owner) ?? owner
  const runtime = String(runtimeProvider || '').trim()
  if (runtime && runtime.toLowerCase() !== 'auto') return canonicalCommissionedPin(runtime) ?? runtime
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

export type StudioPinParse =
  | { kind: 'commissioned'; pin: CommissionedProviderPin; model: StudioModelOption; host: StudioHostOption }
  | { kind: 'needs_selection'; legacyValue: string }

/**
 * Parse a saved/selected pin for the pickers. Commissioned pins (Grok aliases
 * included) resolve to the model × host row; missing/empty/`auto` use the lane
 * default (Grok 4.6, decision §13.2); every legacy/unknown value is an
 * explicit `needs_selection` state — never a hidden Grok coercion.
 */
export function parseStudioPin(raw?: string | null): StudioPinParse {
  const trimmed = String(raw ?? '').trim()
  const pin = trimmed && trimmed.toLowerCase() !== 'auto'
    ? canonicalCommissionedPin(trimmed)
    : LANE_DEFAULT_PIN
  if (!pin) return { kind: 'needs_selection', legacyValue: trimmed }
  const model = MODEL_BY_PIN.get(pin)
  const host = model?.hosts.find((candidate) => candidate.pin === pin)
  if (!model || !host) return { kind: 'needs_selection', legacyValue: trimmed }
  return { kind: 'commissioned', pin, model, host }
}

/**
 * Compose the commissioned pin for a model × host choice. A non-commissioned
 * combination resolves to '' — it is never coerced onto Grok.
 */
export function pinFor(modelId: StudioModelId, hostId: StudioHostId): string {
  const model = findModel(modelId)
  if (!model) return ''
  const host = model.hosts.find((candidate) => candidate.id === hostId)
  return host?.pin ?? ''
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
  return hosts[0] || { id: 'xai', label: 'xAI / Grok', pin: DEFAULT_DRAFT_PIN }
}

/** Every stage shows the upstream model id so pin vs wire model cannot be confused. */
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
        model: model.apiModel || model.label,
      })
    }
  }
  return out
}

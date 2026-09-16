/**
 * Client-safe Content Studio provider registry contract.
 *
 * This module is the single authoritative source for commissioned provider
 * identity metadata (design §3.1): types, pins, models, hosts, lanes,
 * transports, credential env NAMES and pin canonicalization. It is pure —
 * ZERO imports — so client components (the studio pickers via
 * `lib/contentAiCatalog.ts`) can consume it without pulling the runtime
 * registry, the provider execution core, the credential vault or the
 * xAI/undici transports into the client bundle.
 *
 * Exactly two provider identities exist:
 *
 *   1. `grok` — Grok 4.6 over the retained xAI transport (`api.x.ai/v1`).
 *   2. `deepseek-v41-flash` — DeepSeek V4.1 Flash, first-party
 *      `https://api.deepseek.com/v1` ONLY, upstream API model `deepseek-flash`.
 *
 * Pin vs model is deliberate: `deepseek-v41-flash` is the stable internal pin
 * (DB `ai_provider`, contracts, audit, selection); `deepseek-flash` is the
 * upstream request model id and is NEVER a selectable/executable pin.
 *
 * Runtime behavior — credential resolution, adapter construction, destination
 * assertion and selection errors — stays in `lib/contentAiRegistry.ts`, which
 * derives `COMMISSIONED_PROVIDERS` from `COMMISSIONED_PROVIDER_DEFINITIONS`
 * below. No second provider table may exist.
 */

export type StudioLane = 'draft' | 'brief' | 'review' | 'command'

export type CommissionedProviderPin = 'grok' | 'deepseek-v41-flash'

export type CommissionedProviderHost = 'xai' | 'deepseek'

export type CommissionedProviderTransport = 'xai-responses' | 'openai-compatible'

/**
 * Immutable provider identity metadata. Runtime configuration (credential
 * resolution / `isConfigured`) is added by the runtime registry.
 */
export interface CommissionedProviderDefinition {
  pin: CommissionedProviderPin
  label: string
  hostId: CommissionedProviderHost
  /** Upstream API model id sent on the wire — distinct from the pin. */
  apiModel: string
  lanes: StudioLane[]
  streaming: boolean
  transport: CommissionedProviderTransport
  /** Literal destination; asserted before every fetch. */
  baseUrl: string
  baseUrlHost: string
  /** Credential env NAMES only — never credential values. */
  keyEnvs: string[]
}

export const GROK_PIN: CommissionedProviderPin = 'grok'
export const DEEPSEEK_V41_FLASH_PIN: CommissionedProviderPin = 'deepseek-v41-flash'

export const GROK_API_MODEL = 'grok-4.6'
export const DEEPSEEK_V41_FLASH_API_MODEL = 'deepseek-flash'
export const DEEPSEEK_FIRST_PARTY_BASE_URL = 'https://api.deepseek.com/v1'
export const DEEPSEEK_FIRST_PARTY_HOST = 'api.deepseek.com'
export const GROK_XAI_BASE_URL = 'https://api.x.ai/v1'
export const GROK_XAI_HOST = 'api.x.ai'
export const DEEPSEEK_FIRST_PARTY_MAX_TOKENS = 16384

/** The lane default is Grok 4.6 — only for a job with NO requested provider. */
export const LANE_DEFAULT_PIN: CommissionedProviderPin = GROK_PIN

const ALL_LANES: StudioLane[] = ['draft', 'brief', 'review', 'command']

/**
 * The one canonical commissioned provider table. The runtime registry derives
 * its provider objects from these definitions; the client catalog renders
 * directly from them.
 */
export const COMMISSIONED_PROVIDER_DEFINITIONS: readonly CommissionedProviderDefinition[] = Object.freeze([
  Object.freeze({
    pin: GROK_PIN,
    label: 'Grok 4.6',
    hostId: 'xai' as const,
    apiModel: GROK_API_MODEL,
    lanes: Object.freeze([...ALL_LANES]) as StudioLane[],
    streaming: true,
    transport: 'xai-responses' as const,
    baseUrl: GROK_XAI_BASE_URL,
    baseUrlHost: GROK_XAI_HOST,
    keyEnvs: Object.freeze(['XAI_API_KEY']) as string[],
  }),
  Object.freeze({
    pin: DEEPSEEK_V41_FLASH_PIN,
    label: 'DeepSeek V4.1 Flash',
    hostId: 'deepseek' as const,
    apiModel: DEEPSEEK_V41_FLASH_API_MODEL,
    lanes: Object.freeze([...ALL_LANES]) as StudioLane[],
    streaming: true,
    transport: 'openai-compatible' as const,
    baseUrl: DEEPSEEK_FIRST_PARTY_BASE_URL,
    baseUrlHost: DEEPSEEK_FIRST_PARTY_HOST,
    keyEnvs: Object.freeze(['DEEPSEEK_API_KEY']) as string[],
  }),
])

export const COMMISSIONED_PINS: readonly CommissionedProviderPin[] = Object.freeze([
  GROK_PIN,
  DEEPSEEK_V41_FLASH_PIN,
])

const GROK_ALIASES = new Set(['grok', 'grok-4.6', 'grok-latest', 'grok-4', 'xai', 'supergrok', 'super-grok'])

/**
 * Canonicalize a commissioned pin value, including the commissioned Grok
 * aliases (design §7). Returns null for every legacy/retired/unknown value —
 * never a default.
 */
export function canonicalCommissionedPin(value: unknown): CommissionedProviderPin | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (raw === DEEPSEEK_V41_FLASH_PIN) return DEEPSEEK_V41_FLASH_PIN
  if (GROK_ALIASES.has(raw)) return GROK_PIN
  return null
}

export function isCommissionedPin(value: unknown): value is CommissionedProviderPin {
  const raw = String(value ?? '').trim().toLowerCase()
  return (COMMISSIONED_PINS as readonly string[]).includes(raw)
}

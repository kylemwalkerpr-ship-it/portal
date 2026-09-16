/**
 * Canonical Content Studio provider registry — runtime half.
 *
 * Provider identity metadata (types, pins, labels, models, hosts, lanes,
 * transports, literal destinations, credential env NAMES and pin
 * canonicalization) lives in the client-safe
 * `lib/contentAiRegistryContract.ts` and is re-exported here, so every
 * existing runtime consumer keeps one import site while client components
 * consume only the pure contract.
 *
 * Exactly two provider identities exist (design §3.1):
 *
 *   1. `grok` — Grok 4.6 over the retained xAI transport (`api.x.ai/v1`).
 *   2. `deepseek-v41-flash` — DeepSeek V4.1 Flash, first-party
 *      `https://api.deepseek.com/v1` ONLY, upstream API model `deepseek-flash`.
 *
 * Pin vs model is deliberate: `deepseek-v41-flash` is the stable internal pin
 * (DB `ai_provider`, contracts, audit, selection); `deepseek-flash` is the
 * upstream request model id and is NEVER a selectable/executable pin.
 *
 * Contract rules:
 *   - Legacy/retired pins never silently coerce: `assertCommissionedPin`,
 *     `commissionedProvider` and `resolveExecutionProvider` raise a typed
 *     `ProviderSelectionRequiredError` (409, `selection_required`) and make
 *     ZERO outbound provider requests.
 *   - No Grok<->DeepSeek cross-fallback: each adapter targets exactly one host
 *     with one credential. A selected provider's errors stay that provider's.
 *   - The first-party DeepSeek adapter ignores `DEEPSEEK_BASE_URL` and vault
 *     `base_url` overrides and asserts the literal host before every fetch.
 *   - Nothing outside this module may register or construct a provider
 *     transport; `adapterFor` is the only factory.
 *   - `COMMISSIONED_PROVIDERS` is derived from `COMMISSIONED_PROVIDER_DEFINITIONS`;
 *     no second provider table may exist.
 */
import {
  contentAiEnv,
  grokComplete,
  grokResponsesStream,
  looksLikeParasailKey,
  openAiCompatibleComplete,
  openAiCompatibleStream,
  type ContentAiOptions,
  type ContentAiResult,
  type ContentAiStreamEvent,
} from './contentAiProviderCore'
import {
  COMMISSIONED_PROVIDER_DEFINITIONS,
  DEEPSEEK_FIRST_PARTY_MAX_TOKENS,
  DEEPSEEK_V41_FLASH_PIN,
  LANE_DEFAULT_PIN,
  canonicalCommissionedPin,
  isCommissionedPin,
  type CommissionedProviderDefinition,
  type CommissionedProviderPin,
  type CommissionedProviderTransport,
  type StudioLane,
} from './contentAiRegistryContract'

export * from './contentAiRegistryContract'

/**
 * Runtime configuration surface for a commissioned provider: immutable
 * contract metadata plus server-side credential resolution.
 */
export interface CommissionedProvider extends CommissionedProviderDefinition {
  isConfigured(): boolean
}

/**
 * First-party DeepSeek credential. Vault overlay wins over Worker secrets
 * (existing env() precedence). A psk- Parasail key pasted into the DeepSeek
 * slot is never a DeepSeek credential and yields "not configured" instead of
 * a request to api.deepseek.com.
 */
export function resolveDeepseekFirstPartyApiKey(): string {
  const key = contentAiEnv('DEEPSEEK_API_KEY')
  if (!key || looksLikeParasailKey(key)) return ''
  return key
}

/** Server-side credential resolution per commissioned pin — never client code. */
function commissionedDefinitionIsConfigured(definition: CommissionedProviderDefinition): boolean {
  if (definition.pin === DEEPSEEK_V41_FLASH_PIN) return Boolean(resolveDeepseekFirstPartyApiKey())
  return Boolean(contentAiEnv('XAI_API_KEY'))
}

/**
 * Runtime providers derived from the single contract table
 * (`COMMISSIONED_PROVIDER_DEFINITIONS`). Identity metadata is never
 * duplicated here; only credential resolution is added.
 */
export const COMMISSIONED_PROVIDERS: readonly CommissionedProvider[] = COMMISSIONED_PROVIDER_DEFINITIONS.map(
  (definition) => ({
    ...definition,
    isConfigured: () => commissionedDefinitionIsConfigured(definition),
  }),
)

export function assertCommissionedPin(value: unknown): CommissionedProviderPin {
  const pin = canonicalCommissionedPin(value)
  if (!pin) throw new ProviderSelectionRequiredError(String(value ?? '').trim())
  return pin
}

export function commissionedProvider(pin: CommissionedProviderPin): CommissionedProvider {
  const provider = COMMISSIONED_PROVIDERS.find((candidate) => candidate.pin === pin)
  if (!provider) throw new ProviderSelectionRequiredError(String(pin ?? ''))
  return provider
}

export interface ProviderSelectionRequiredPayload {
  code: 'selection_required'
  status: 409
  execution_stage: 'provider_selection_required'
  failureClass: 'selection_required'
  legacyValue: string
  message: string
}

export class ProviderSelectionRequiredError extends Error {
  readonly code = 'selection_required' as const
  readonly status = 409 as const
  readonly failureClass = 'selection_required' as const
  readonly executionStage = 'provider_selection_required' as const
  readonly legacyValue: string

  constructor(legacyValue: string) {
    super(`AI provider "${legacyValue}" is legacy and requires explicit re-selection`)
    this.name = 'ProviderSelectionRequiredError'
    this.legacyValue = legacyValue
  }

  toPayload(): ProviderSelectionRequiredPayload {
    return {
      code: this.code,
      status: this.status,
      execution_stage: this.executionStage,
      failureClass: this.failureClass,
      legacyValue: this.legacyValue,
      message: this.message,
    }
  }
}

export interface ProviderDestinationViolationPayload {
  code: 'destination_violation'
  failureClass: 'destination_violation'
  destination: string
  expectedHost: string
  message: string
}

export class ProviderDestinationViolationError extends Error {
  readonly code = 'destination_violation' as const
  readonly failureClass = 'destination_violation' as const
  readonly destination: string
  readonly expectedHost: string

  constructor(destination: string, expectedHost: string) {
    super(
      `provider destination "${destination}" is not the commissioned host ${expectedHost} (destination_violation)`,
    )
    this.name = 'ProviderDestinationViolationError'
    this.destination = destination
    this.expectedHost = expectedHost
  }

  toPayload(): ProviderDestinationViolationPayload {
    return {
      code: this.code,
      failureClass: this.failureClass,
      destination: this.destination,
      expectedHost: this.expectedHost,
      message: this.message,
    }
  }
}

/**
 * Pre-fetch guard: a commissioned transport may only ever call its literal
 * HTTPS host. Anything else — a pasted base URL, a proxy, an intermediary —
 * fails closed before a request can leave the Worker.
 */
export function assertCommissionedDestination(url: string, expectedHost: string): string {
  const destination = String(url ?? '')
  let parsed: URL
  try {
    parsed = new URL(destination)
  } catch {
    throw new ProviderDestinationViolationError(destination, expectedHost)
  }
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== String(expectedHost).toLowerCase()) {
    throw new ProviderDestinationViolationError(destination, expectedHost)
  }
  return destination
}

export type ProviderDisposition =
  | { legacy: true; executable: false; reason: string }
  | { legacy: false; executable: true; reason: 'commissioned' }

export function legacyProviderDisposition(value: string): ProviderDisposition {
  const raw = String(value ?? '').trim()
  if (canonicalCommissionedPin(raw)) return { legacy: false, executable: true, reason: 'commissioned' }
  return { legacy: true, executable: false, reason: `legacy provider value "${raw}" requires explicit re-selection` }
}

export interface ExecutionProviderJob {
  ai_provider?: string | null
}

export interface ResolveExecutionProviderArgs {
  requestedPin?: string | null
  lane: StudioLane
  existingJob?: ExecutionProviderJob | null
}

export type ExecutionProviderResolution =
  | {
      kind: 'commissioned'
      pin: CommissionedProviderPin
      model: string
      pinSource: 'explicit' | 'lane_default' | 'contract'
      lane: StudioLane
    }
  | {
      kind: 'needs_selection'
      legacyValue: string
      reason: string
      lane: StudioLane
    }

/**
 * The single provider selector (design §3.6): explicit commissioned pin wins;
 * empty/auto resolves to the lane default ONLY when neither the request nor a
 * persisted job carries a provider; every legacy value is `needs_selection`.
 * Never returns a non-commissioned pin and never defaults a persisted legacy
 * value.
 */
export function resolveExecutionProvider(args: ResolveExecutionProviderArgs): ExecutionProviderResolution {
  const lane = args.lane
  const requestedRaw = String(args.requestedPin ?? '').trim()
  const requested = requestedRaw.toLowerCase()
  if (requestedRaw && requested !== 'auto') {
    const pin = canonicalCommissionedPin(requested)
    if (pin) return { kind: 'commissioned', pin, model: commissionedProvider(pin).apiModel, pinSource: 'explicit', lane }
    return { kind: 'needs_selection', legacyValue: requestedRaw, reason: 'legacy_provider_pin', lane }
  }

  const jobRaw = String(args.existingJob?.ai_provider ?? '').trim()
  if (jobRaw && jobRaw.toLowerCase() !== 'auto') {
    const pin = canonicalCommissionedPin(jobRaw)
    if (pin) return { kind: 'commissioned', pin, model: commissionedProvider(pin).apiModel, pinSource: 'contract', lane }
    return { kind: 'needs_selection', legacyValue: jobRaw, reason: 'persisted_legacy_provider', lane }
  }

  return {
    kind: 'commissioned',
    pin: LANE_DEFAULT_PIN,
    model: commissionedProvider(LANE_DEFAULT_PIN).apiModel,
    pinSource: 'lane_default',
    lane,
  }
}

interface CommissionedOpenAiCompatRecord {
  label: string
  baseURL: string
  apiKey: string
  model: string
  maxTokensCap?: number
}

/**
 * First-party DeepSeek record. Built only from registry constants: literal
 * base URL (asserted), literal upstream model, dedicated credential. It never
 * consults `DEEPSEEK_BASE_URL`, never canonicalizes through the Parasail
 * helpers, and has no Grok endpoint in scope.
 */
export function commissionedDeepseekProvider(): CommissionedOpenAiCompatRecord | null {
  const apiKey = resolveDeepseekFirstPartyApiKey()
  if (!apiKey) return null
  const provider = commissionedProvider(DEEPSEEK_V41_FLASH_PIN)
  assertCommissionedDestination(provider.baseUrl, provider.baseUrlHost)
  return {
    label: provider.pin,
    baseURL: provider.baseUrl,
    apiKey,
    model: provider.apiModel,
    maxTokensCap: DEEPSEEK_FIRST_PARTY_MAX_TOKENS,
  }
}

function withoutModelOverride(opts: ContentAiOptions): ContentAiOptions {
  const next: ContentAiOptions = { ...opts }
  delete next.model
  return next
}

export interface ContentProviderAdapter {
  readonly pin: CommissionedProviderPin
  readonly model: string
  readonly provider: CommissionedProvider
  readonly transport: CommissionedProviderTransport
  isConfigured(): boolean
  complete(overrides?: Partial<ContentAiOptions>): Promise<ContentAiResult>
  stream(overrides?: Partial<ContentAiOptions>): AsyncGenerator<ContentAiStreamEvent>
}

/**
 * The only transport factory. Each adapter is single-provider: it can only
 * reach its own literal host with its own credential, so a selected provider's
 * errors stay that provider's errors (no Grok<->DeepSeek cross-fallback).
 */
export function adapterFor(pin: CommissionedProviderPin, opts: ContentAiOptions): ContentProviderAdapter {
  const canonical = assertCommissionedPin(pin)
  const provider = commissionedProvider(canonical)
  const bound: ContentAiOptions = { ...opts }

  if (canonical === DEEPSEEK_V41_FLASH_PIN) {
    return {
      pin: canonical,
      model: provider.apiModel,
      provider,
      transport: provider.transport,
      isConfigured: () => Boolean(resolveDeepseekFirstPartyApiKey()),
      complete: async (overrides) => {
        const record = commissionedDeepseekProvider()
        if (!record) throw new Error('DeepSeek V4.1 Flash is not configured (DEEPSEEK_API_KEY)')
        return openAiCompatibleComplete(record, withoutModelOverride({ ...bound, ...overrides }))
      },
      stream: async function* (overrides) {
        const record = commissionedDeepseekProvider()
        if (!record) throw new Error('DeepSeek V4.1 Flash is not configured (DEEPSEEK_API_KEY)')
        yield* openAiCompatibleStream(record, withoutModelOverride({ ...bound, ...overrides }))
      },
    }
  }

  return {
    pin: canonical,
    model: provider.apiModel,
    provider,
    transport: provider.transport,
    isConfigured: () => Boolean(contentAiEnv('XAI_API_KEY')),
    complete: async (overrides) => grokComplete({ ...bound, ...overrides }),
    stream: async function* (overrides) {
      yield* grokResponsesStream({ ...bound, ...overrides })
    },
  }
}

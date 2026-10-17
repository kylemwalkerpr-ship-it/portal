import { getMethodCapability, getProviderCapability } from './registry'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const COUNTRY_RE = /^[A-Z]{2}$/

export type ProviderChange = {
  provider: string
  enabled?: boolean
  retired?: boolean
  test_mode_owner_only?: boolean
  test_allowlist?: string[]
  priority?: number
  is_default?: boolean
}

export type MethodChange = {
  provider: string
  method: string
  enabled?: boolean
  currencies?: string[] | null
  countries?: string[] | null
  priority?: number
  min_amount_minor?: number | null
  max_amount_minor?: number | null
}

export type PaymentSettingsPatch = {
  expectedVersion: number
  reason: string
  providerChanges: ProviderChange[]
  methodChanges: MethodChange[]
  globalChanges: { country_default_routing_enabled?: boolean; fx_markup_bps?: number }
}

export type PatchValidation = { ok: true; value: PaymentSettingsPatch } | { ok: false; error: string }

function optionalBoolean(source: Record<string, unknown>, key: string): boolean | undefined | null {
  if (!(key in source)) return undefined
  return typeof source[key] === 'boolean' ? source[key] : null
}

function optionalPriority(source: Record<string, unknown>): number | undefined | null {
  if (!('priority' in source)) return undefined
  const value = source.priority
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 100_000 ? Number(value) : null
}

function optionalMinor(source: Record<string, unknown>, key: string): number | null | undefined | false {
  if (!(key in source)) return undefined
  if (source[key] === null) return null
  const value = source[key]
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : false
}

export function parsePaymentSettingsPatch(input: unknown): PatchValidation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'A JSON object is required.' }
  const body = input as Record<string, unknown>
  const expectedVersion = body.expectedVersion
  if (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) < 1) return { ok: false, error: 'A valid expectedVersion is required.' }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason || reason.length > 500) return { ok: false, error: 'A reason of 1 to 500 characters is required.' }

  const rawProviders = body.providerChanges ?? []
  const rawMethods = body.methodChanges ?? []
  const rawGlobal = body.globalChanges ?? {}
  if (!Array.isArray(rawProviders) || !Array.isArray(rawMethods) || !rawGlobal || typeof rawGlobal !== 'object' || Array.isArray(rawGlobal)) {
    return { ok: false, error: 'Settings changes must be arrays and an object.' }
  }
  if (rawProviders.length > 20 || rawMethods.length > 100) return { ok: false, error: 'Too many settings changes in one request.' }

  const providerChanges: ProviderChange[] = []
  const providerIds = new Set<string>()
  for (const raw of rawProviders) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Invalid provider change.' }
    const change = raw as Record<string, unknown>
    const provider = typeof change.provider === 'string' ? change.provider.toLowerCase() : ''
    if (!getProviderCapability(provider)) return { ok: false, error: `Unknown payment provider: ${provider || '(missing)'}.` }
    if (providerIds.has(provider)) return { ok: false, error: `Provider ${provider} appears more than once.` }
    providerIds.add(provider)
    const enabled = optionalBoolean(change, 'enabled')
    const retired = optionalBoolean(change, 'retired')
    const testMode = optionalBoolean(change, 'test_mode_owner_only')
    const isDefault = optionalBoolean(change, 'is_default')
    const priority = optionalPriority(change)
    if (enabled === null || retired === null || testMode === null || isDefault === null || priority === null) return { ok: false, error: `Invalid provider settings for ${provider}.` }

    let test_allowlist: string[] | undefined
    if ('test_allowlist' in change) {
      if (!Array.isArray(change.test_allowlist) || change.test_allowlist.length > 100 || !change.test_allowlist.every((id) => typeof id === 'string' && UUID_RE.test(id))) {
        return { ok: false, error: `Invalid test allowlist for ${provider}.` }
      }
      test_allowlist = Array.from(new Set(change.test_allowlist.map((id) => (id as string).toLowerCase())))
    }

    const parsed: ProviderChange = { provider }
    if (enabled !== undefined) parsed.enabled = enabled
    if (retired !== undefined) parsed.retired = retired
    if (testMode !== undefined) parsed.test_mode_owner_only = testMode
    if (isDefault !== undefined) parsed.is_default = isDefault
    if (priority !== undefined) parsed.priority = priority
    if (test_allowlist !== undefined) parsed.test_allowlist = test_allowlist
    if (Object.keys(parsed).length === 1) return { ok: false, error: `Provider ${provider} has no changes.` }
    providerChanges.push(parsed)
  }

  const methodChanges: MethodChange[] = []
  const methodIds = new Set<string>()
  for (const raw of rawMethods) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Invalid method change.' }
    const change = raw as Record<string, unknown>
    const provider = typeof change.provider === 'string' ? change.provider.toLowerCase() : ''
    const method = typeof change.method === 'string' ? change.method.toLowerCase() : ''
    const capability = getMethodCapability(provider, method)
    if (!capability) return { ok: false, error: `Unknown payment method: ${provider}:${method}.` }
    const key = `${provider}:${method}`
    if (methodIds.has(key)) return { ok: false, error: `Method ${key} appears more than once.` }
    methodIds.add(key)
    const enabled = optionalBoolean(change, 'enabled')
    const priority = optionalPriority(change)
    const min = optionalMinor(change, 'min_amount_minor')
    const max = optionalMinor(change, 'max_amount_minor')
    if (enabled === null || priority === null || min === false || max === false) return { ok: false, error: `Invalid method settings for ${key}.` }

    let currencies: string[] | null | undefined
    if ('currencies' in change) {
      if (change.currencies === null) currencies = null
      else if (Array.isArray(change.currencies) && change.currencies.every((currency) => typeof currency === 'string')) {
        currencies = Array.from(new Set(change.currencies.map((currency) => (currency as string).toUpperCase())))
        if (currencies.some((currency) => !capability.currencies.includes(currency))) return { ok: false, error: `Unsupported currency for ${key}.` }
      } else return { ok: false, error: `Invalid currencies for ${key}.` }
    }

    let countries: string[] | null | undefined
    if ('countries' in change) {
      if (change.countries === null) countries = null
      else if (Array.isArray(change.countries) && change.countries.every((country) => typeof country === 'string')) {
        countries = Array.from(new Set(change.countries.map((country) => (country as string).toUpperCase())))
        if (countries.some((country) => !COUNTRY_RE.test(country))) return { ok: false, error: `Invalid country code for ${key}.` }
      } else return { ok: false, error: `Invalid countries for ${key}.` }
    }

    if (min !== undefined && max !== undefined && min !== null && max !== null && min > max) {
      return { ok: false, error: `Minimum amount exceeds maximum for ${key}.` }
    }
    const parsed: MethodChange = { provider, method }
    if (enabled !== undefined) parsed.enabled = enabled
    if (priority !== undefined) parsed.priority = priority
    if (min !== undefined) parsed.min_amount_minor = min
    if (max !== undefined) parsed.max_amount_minor = max
    if (currencies !== undefined) parsed.currencies = currencies
    if (countries !== undefined) parsed.countries = countries
    if (Object.keys(parsed).length === 2) return { ok: false, error: `Method ${key} has no changes.` }
    methodChanges.push(parsed)
  }

  const globalInput = rawGlobal as Record<string, unknown>
  const countryRouting = optionalBoolean(globalInput, 'country_default_routing_enabled')
  const fxMarkup = 'fx_markup_bps' in globalInput ? globalInput.fx_markup_bps : undefined
  if (countryRouting === null || (fxMarkup !== undefined && (!Number.isInteger(fxMarkup) || Number(fxMarkup) < 0 || Number(fxMarkup) > 10_000))) {
    return { ok: false, error: 'Invalid global payment settings.' }
  }
  const globalChanges: PaymentSettingsPatch['globalChanges'] = {}
  if (countryRouting !== undefined) globalChanges.country_default_routing_enabled = countryRouting
  if (fxMarkup !== undefined) globalChanges.fx_markup_bps = Number(fxMarkup)

  if (providerChanges.length + methodChanges.length + Object.keys(globalChanges).length === 0) {
    return { ok: false, error: 'No payment settings changes were supplied.' }
  }
  return { ok: true, value: { expectedVersion: Number(expectedVersion), reason, providerChanges, methodChanges, globalChanges } }
}

export function parsePaymentSettingsOwnerIds(value = process.env.PAYMENT_SETTINGS_OWNER_IDS || ''): Set<string> {
  return new Set(value.split(',').map((id) => id.trim().toLowerCase()).filter((id) => UUID_RE.test(id)))
}

export function isPaymentSettingsOwner(profileId: string, role: string, value?: string): boolean {
  return role === 'admin' && parsePaymentSettingsOwnerIds(value).has(profileId.toLowerCase())
}

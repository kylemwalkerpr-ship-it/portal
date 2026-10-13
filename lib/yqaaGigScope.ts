import type { ScopeUnitName } from '@/lib/yqaaAdaptivePricing'

const UNIT_NAMES = ['page', 'word', 'document', 'form', 'hour', 'session'] as const satisfies readonly ScopeUnitName[]
const SCOPE_DEPTHS = ['consult', 'review', 'partial', 'full'] as const
const UNIT_PRICING_KEYS = new Set(['unit', 'unit_price_cents', 'included_units', 'min_units', 'base_cents'])

type PatchResult<T> = { ok: true; values: T } | { ok: false; field: string; message: string }

export type GigPricingScopePatch = {
  unit_pricing?: null | {
    unit: ScopeUnitName
    unit_price_cents: number
    included_units?: number
    min_units?: number
    base_cents?: number
  }
  hourly_rate_cents?: number | null
}

export type TierScopePatch = {
  scope_depth?: typeof SCOPE_DEPTHS[number] | null
  scope_units?: number | null
}

export function stripInternalGigPricing<T extends Record<string, unknown>>(gig: T): Omit<T, 'hourly_rate_cents'> {
  const { hourly_rate_cents: _internalRate, ...clientSafeGig } = gig
  return clientSafeGig
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalNonNegativeInteger(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
}

export function normalizeGigPricingScope(body: unknown): PatchResult<GigPricingScopePatch> {
  if (!isRecord(body)) return { ok: false, field: 'body', message: 'Expected an object.' }
  const values: GigPricingScopePatch = {}

  if ('unit_pricing' in body) {
    const raw = body.unit_pricing
    if (raw === null) values.unit_pricing = null
    else {
      if (!isRecord(raw) || Object.keys(raw).some((key) => !UNIT_PRICING_KEYS.has(key))) {
        return { ok: false, field: 'unit_pricing', message: 'Use the supported unit pricing fields only.' }
      }
      if (!UNIT_NAMES.includes(raw.unit as typeof UNIT_NAMES[number])) {
        return { ok: false, field: 'unit_pricing.unit', message: 'Choose a supported unit.' }
      }
      if (typeof raw.unit_price_cents !== 'number' || !Number.isSafeInteger(raw.unit_price_cents) || raw.unit_price_cents < 1) {
        return { ok: false, field: 'unit_pricing.unit_price_cents', message: 'Unit price must be a positive whole number of cents.' }
      }
      const optionalFields = ['included_units', 'min_units', 'base_cents'] as const
      for (const key of optionalFields) {
        if (key in raw && !optionalNonNegativeInteger(raw[key])) {
          return { ok: false, field: `unit_pricing.${key}`, message: `${key} must be a non-negative whole number.` }
        }
      }
      values.unit_pricing = {
        unit: raw.unit as ScopeUnitName,
        unit_price_cents: raw.unit_price_cents,
        ...(raw.included_units == null ? {} : { included_units: raw.included_units as number }),
        ...(raw.min_units == null ? {} : { min_units: raw.min_units as number }),
        ...(raw.base_cents == null ? {} : { base_cents: raw.base_cents as number }),
      }
    }
  }

  if ('hourly_rate_cents' in body) {
    const value = body.hourly_rate_cents
    if (value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)) {
      return { ok: false, field: 'hourly_rate_cents', message: 'Hourly rate must be a positive whole number of cents or inherit.' }
    }
    values.hourly_rate_cents = value as number | null
  }

  return { ok: true, values }
}

export function normalizeTierScope(body: unknown): PatchResult<TierScopePatch> {
  if (!isRecord(body)) return { ok: false, field: 'body', message: 'Expected an object.' }
  if (Object.keys(body).some((key) => key !== 'scope_depth' && key !== 'scope_units')) {
    return { ok: false, field: 'tier_scope', message: 'Use the supported tier scope fields only.' }
  }
  const values: TierScopePatch = {}
  if ('scope_depth' in body) {
    const value = body.scope_depth
    if (value !== null && !SCOPE_DEPTHS.includes(value as typeof SCOPE_DEPTHS[number])) {
      return { ok: false, field: 'scope_depth', message: 'Choose a supported scope depth or inherit.' }
    }
    values.scope_depth = value as TierScopePatch['scope_depth']
  }
  if ('scope_units' in body) {
    const value = body.scope_units
    if (value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)) {
      return { ok: false, field: 'scope_units', message: 'Scope units must be a positive whole number or inherit.' }
    }
    values.scope_units = value as number | null
  }
  return { ok: true, values }
}

export function canEditProviderGig(
  auth: { profileId?: string | null; role?: string | null },
  gig: { provider_id?: string | null; provider_type?: string | null },
): boolean {
  return auth.role === 'admin' || (
    auth.profileId === gig.provider_id && auth.role === gig.provider_type &&
    (auth.role === 'attorney' || auth.role === 'consultant')
  )
}

import { getSupabaseAdminClient } from '@/lib/supabase'
import { PAYMENT_CAPABILITIES } from './registry'
import { listPaymentProviders } from './index'

export type ProviderSetting = {
  provider: string
  enabled: boolean
  retired: boolean
  test_mode_owner_only: boolean
  test_allowlist: string[]
  priority: number
  is_default: boolean
  updated_by: string | null
  updated_at: string | null
  version: number
}

export type MethodSetting = {
  provider: string
  method: string
  enabled: boolean
  currencies: string[] | null
  countries: string[] | null
  priority: number
  min_amount_minor: number | null
  max_amount_minor: number | null
}

export type GlobalPaymentSetting = {
  country_default_routing_enabled: boolean
  fx_markup_bps: number
  version: number
}

export type PaymentSettingsSnapshot = {
  version: number
  providers: ProviderSetting[]
  methods: MethodSetting[]
  global: GlobalPaymentSetting
}

type Db = ReturnType<typeof getSupabaseAdminClient>
type CacheEntry<T> = { version: number; loadedAt: number; value: T; pending?: Promise<T> }

/** A cache that validates the database version on every read and reloads for 30 seconds at most. */
export function createVersionedSettingsCache<T>(ttlMs = 30_000, now: () => number = Date.now) {
  const entries = new WeakMap<object, CacheEntry<T>>()

  return {
    async get(
      key: object,
      readVersion: () => Promise<number>,
      load: (version: number) => Promise<T>,
    ): Promise<T> {
      const version = await readVersion()
      const entry = entries.get(key)
      if (entry && entry.version === version && now() - entry.loadedAt < ttlMs) return entry.value
      if (entry?.version === version && entry.pending) return entry.pending

      const pending = load(version)
      entries.set(key, { version, loadedAt: 0, value: (entry?.value as T) ?? (undefined as T), pending })
      try {
        const value = await pending
        const latest = entries.get(key)
        if (!latest || latest.version <= version) entries.set(key, { version, loadedAt: now(), value })
        return value
      } catch (error) {
        if (entries.get(key)?.pending === pending) entries.delete(key)
        throw error
      }
    },
    clear(key?: object) {
      if (key) entries.delete(key)
      // WeakMap intentionally cannot be enumerated; tests use fresh keys.
    },
  }
}

const cache = createVersionedSettingsCache<PaymentSettingsSnapshot>()

async function readSettingsVersion(db: Db): Promise<number> {
  const { data, error } = await db
    .from('payment_global_settings')
    .select('version')
    .eq('singleton', true)
    .single()
  if (error || !data) throw new Error(`Payment settings version unavailable: ${error?.message || 'row missing'}`)
  return Number(data.version)
}

async function loadSettings(db: Db, version: number): Promise<PaymentSettingsSnapshot> {
  const [providersResult, methodsResult, globalResult] = await Promise.all([
    db.from('payment_provider_settings').select('*').order('priority', { ascending: true }),
    db.from('payment_method_settings').select('*').order('priority', { ascending: true }),
    db.from('payment_global_settings').select('*').eq('singleton', true).single(),
  ])
  const failed = providersResult.error || methodsResult.error || globalResult.error
  if (failed || !globalResult.data) {
    throw new Error(`Payment settings unavailable: ${failed?.message || 'global row missing'}`)
  }
  return {
    version,
    providers: (providersResult.data ?? []) as ProviderSetting[],
    methods: (methodsResult.data ?? []) as MethodSetting[],
    global: globalResult.data as GlobalPaymentSetting,
  }
}

export async function getPaymentSettings(db: Db = getSupabaseAdminClient()): Promise<PaymentSettingsSnapshot> {
  return cache.get(db, () => readSettingsVersion(db), (version) => loadSettings(db, version))
}

/** Resolve the configured default without changing the legacy env fallback used by unrelated callers. */
export async function getConfiguredDefaultGateway(
  profileId: string | null | undefined,
  db: Db = getSupabaseAdminClient(),
): Promise<string> {
  const snapshot = await getPaymentSettings(db)
  const providers = new Map(snapshot.providers.map((row) => [row.provider, row]))
  const methods = new Map(snapshot.methods.map((row) => [`${row.provider}:${row.method}`, row]))
  const runtimeProviders = new Set(listPaymentProviders())
  const eligible = PAYMENT_CAPABILITIES.filter((capability) => {
    const provider = providers.get(capability.provider)
    if (!runtimeProviders.has(capability.provider) || !provider?.enabled || provider.retired) return false
    if (provider.test_mode_owner_only && (!profileId || !provider.test_allowlist?.includes(profileId))) return false
    return capability.methods.some((method) => method.id === 'card' && methods.get(`${capability.provider}:card`)?.enabled)
  }).sort((a, b) => (providers.get(a.provider)?.priority ?? 100) - (providers.get(b.provider)?.priority ?? 100))
  return providers.get(eligible.find((item) => providers.get(item.provider)?.is_default)?.provider || '')?.provider
    || eligible[0]?.provider
    || (process.env.PAYMENT_PROVIDER || 'nmi').toLowerCase()
}

export function clearPaymentSettingsCache(db?: Db) {
  cache.clear(db)
}

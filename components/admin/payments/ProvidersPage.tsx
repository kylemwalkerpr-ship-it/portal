'use client'

import React from 'react'
import styles from './providers-page.module.css'
import { Card, C, Btn } from '@/components/design/shared'

type MethodSettings = {
  provider: string
  method: string
  enabled: boolean
  currencies: string[] | null
  countries: string[] | null
  priority: number
  min_amount_minor: number | null
  max_amount_minor: number | null
}

type ProviderSettings = {
  provider: string
  enabled: boolean
  retired: boolean
  test_mode_owner_only: boolean
  test_allowlist: string[]
  priority: number
  is_default: boolean
  version: number
}

type MethodView = {
  id: string
  label: string
  logoAsset: string
  currencies: string[]
  countries: string[]
  supportsRefund: boolean
  supportsPartialRefund: boolean
  supportsVault: boolean
  settings: MethodSettings
}

type ProviderView = {
  provider: string
  label: string
  mode: string
  logoAsset: string
  settings: ProviderSettings
  health: { openPayments: number | null; lastSuccessfulPaymentAt: string | null; openIncidents: number | null }
  methods: MethodView[]
}

type Snapshot = {
  version: number
  canManage: boolean
  global: { country_default_routing_enabled: boolean; fx_markup_bps: number }
  providers: ProviderView[]
  readiness: { credentialsPresent: boolean; notificationRegistered: boolean; ownerTestPaymentCompleted: boolean }
  audit: Array<{
    id: number
    actor_profile_id: string
    actor_role: string
    action: string
    target: string
    before: unknown
    after: unknown
    reason: string | null
    created_at: string
  }>
}

type MethodRow = { provider: ProviderView; method: MethodView }
type ProviderChange = Partial<Pick<ProviderSettings, 'enabled' | 'retired' | 'test_mode_owner_only' | 'test_allowlist' | 'priority' | 'is_default'>> & { provider: string }
type MethodChange = Partial<Pick<MethodSettings, 'enabled' | 'currencies' | 'countries' | 'priority' | 'min_amount_minor' | 'max_amount_minor'>> & { provider: string; method: string }

const CURRENCY_LABELS: Record<string, string> = { USD: 'US dollar', GBP: 'Pound sterling', CAD: 'Canadian dollar', AUD: 'Australian dollar' }

function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function keyFor(provider: string, method: string) { return `${provider}:${method}` }
function currencyList(value: string[] | null, supported: string[]) { return value ?? supported }
function amountValue(value: number | null) { return value == null ? '' : String((value / 100).toFixed(2)) }
function minorValue(value: string) { return value.trim() === '' ? null : Math.max(0, Math.round(Number(value) * 100)) }
function dateText(value: string | null) {
  if (!value) return 'No completed payment recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'No completed payment recorded' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function flattenMethods(providers: ProviderView[]): MethodRow[] {
  return providers.flatMap((provider) => provider.methods.map((method) => ({ provider, method })))
    .sort((a, b) => a.method.settings.priority - b.method.settings.priority || a.provider.label.localeCompare(b.provider.label))
}

function liveMethodCount(snapshot: Snapshot): number {
  return snapshot.providers.reduce((sum, provider) => {
    if (!provider.settings.enabled || provider.settings.retired || provider.settings.test_mode_owner_only) return sum
    return sum + provider.methods.filter((method) => method.id !== 'invoice' && method.settings.enabled).length
  }, 0)
}

function chooseDefaultProvider(snapshot: Snapshot, excludedProvider: string): string | null {
  const replacement = snapshot.providers
    .filter((provider) => provider.provider !== excludedProvider && provider.provider !== 'pesapal'
      && provider.settings.enabled && !provider.settings.retired && !provider.settings.test_mode_owner_only
      && provider.methods.some((method) => method.id === 'card' && method.settings.enabled))
    .sort((a, b) => a.settings.priority - b.settings.priority)[0]
  return replacement?.provider ?? null
}

function assignDefaultProvider(snapshot: Snapshot, providerId: string | null) {
  snapshot.providers = snapshot.providers.map((provider) => ({
    ...provider,
    settings: { ...provider.settings, is_default: provider.provider === providerId },
  }))
}

function diffSettings(before: Snapshot, after: Snapshot) {
  const providerChanges: ProviderChange[] = []
  for (const current of after.providers) {
    const original = before.providers.find((item) => item.provider === current.provider)
    if (!original) continue
    const change: ProviderChange = { provider: current.provider }
    let changed = false
    for (const field of ['enabled', 'retired', 'test_mode_owner_only', 'priority', 'is_default'] as const) {
      if (current.settings[field] !== original.settings[field]) {
        change[field] = current.settings[field] as never
        changed = true
      }
    }
    if (JSON.stringify(current.settings.test_allowlist) !== JSON.stringify(original.settings.test_allowlist)) {
      change.test_allowlist = current.settings.test_allowlist
      changed = true
    }
    if (changed) providerChanges.push(change)
  }

  const methodChanges: MethodChange[] = []
  for (const { provider, method } of flattenMethods(after.providers)) {
    const originalProvider = before.providers.find((item) => item.provider === provider.provider)
    const original = originalProvider?.methods.find((item) => item.id === method.id)?.settings
    if (!original) continue
    const change: MethodChange = { provider: provider.provider, method: method.id }
    let changed = false
    for (const field of ['enabled', 'priority', 'min_amount_minor', 'max_amount_minor'] as const) {
      if (method.settings[field] !== original[field]) {
        change[field] = method.settings[field] as never
        changed = true
      }
    }
    for (const field of ['currencies', 'countries'] as const) {
      if (JSON.stringify(method.settings[field]) !== JSON.stringify(original[field])) {
        change[field] = method.settings[field] as never
        changed = true
      }
    }
    if (changed) methodChanges.push(change)
  }

  const globalChanges: { country_default_routing_enabled?: boolean; fx_markup_bps?: number } = {}
  if (before.global.country_default_routing_enabled !== after.global.country_default_routing_enabled) {
    globalChanges.country_default_routing_enabled = after.global.country_default_routing_enabled
  }
  if (before.global.fx_markup_bps !== after.global.fx_markup_bps) globalChanges.fx_markup_bps = after.global.fx_markup_bps
  return { providerChanges, methodChanges, globalChanges }
}

function payloadError(payload: any) {
  return payload?.error?.message || payload?.error || 'Payment settings could not be saved.'
}

export default function ProvidersPage({ embedded = false, setActionNotice }: { embedded?: boolean; setActionNotice?: (message: string) => void }) {
  const [saved, setSaved] = React.useState<Snapshot | null>(null)
  const [draft, setDraft] = React.useState<Snapshot | null>(null)
  const [methodOrder, setMethodOrder] = React.useState<string[]>([])
  const [reason, setReason] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [dragged, setDragged] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/payment-settings', { credentials: 'same-origin', cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok || !payload?.data?.providerSettings) throw new Error(payloadError(payload))
      const next = copy(payload.data.providerSettings) as Snapshot
      setSaved(next)
      setDraft(copy(next))
      setMethodOrder(flattenMethods(next.providers).map(({ provider, method }) => keyFor(provider.provider, method.id)))
      setReason('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Payment settings could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void refresh() }, [refresh])

  const hasChanges = React.useMemo(() => {
    if (!saved || !draft) return false
    const diff = diffSettings(saved, draft)
    return diff.providerChanges.length > 0 || diff.methodChanges.length > 0 || Object.keys(diff.globalChanges).length > 0
  }, [saved, draft])

  const patchProvider = (providerId: string, values: Partial<ProviderSettings>) => {
    setDraft((current) => current && ({
      ...current,
      providers: current.providers.map((provider) => provider.provider === providerId
        ? { ...provider, settings: { ...provider.settings, ...values } }
        : provider),
    }))
  }

  const patchMethod = (providerId: string, methodId: string, values: Partial<MethodSettings>) => {
    setDraft((current) => current && ({
      ...current,
      providers: current.providers.map((provider) => provider.provider === providerId
        ? { ...provider, methods: provider.methods.map((method) => method.id === methodId
          ? { ...method, settings: { ...method.settings, ...values } }
          : method) }
        : provider),
    }))
  }

  const setProviderEnabled = (provider: ProviderView, enabled: boolean) => {
    if (!draft || !draft.canManage || provider.settings.retired) return
    const next = copy(draft)
    next.providers = next.providers.map((item) => item.provider === provider.provider
      ? { ...item, settings: { ...item.settings, enabled } }
      : item)
    if (!enabled && provider.settings.is_default) {
      assignDefaultProvider(next, chooseDefaultProvider(next, provider.provider))
    }
    if (liveMethodCount(draft) > 0 && liveMethodCount(next) === 0 && !window.confirm('This is the last live payment method. New orders will use the invoice request path. Turn it off?')) return
    setDraft(next)
  }

  const setMethodEnabled = (provider: ProviderView, method: MethodView, enabled: boolean) => {
    if (!draft || !draft.canManage || provider.settings.retired) return
    const next = copy(draft)
    next.providers = next.providers.map((item) => item.provider === provider.provider
      ? { ...item, methods: item.methods.map((candidate) => candidate.id === method.id
        ? { ...candidate, settings: { ...candidate.settings, enabled } }
        : candidate) }
      : item)
    if (!enabled && method.id === 'card' && provider.settings.is_default) {
      assignDefaultProvider(next, chooseDefaultProvider(next, provider.provider))
    }
    if (liveMethodCount(draft) > 0 && liveMethodCount(next) === 0 && !window.confirm('This is the last live payment method. New orders will use the invoice request path. Turn it off?')) return
    setDraft(next)
  }

  const setDefault = (providerId: string) => {
    if (!draft) return
    const provider = draft.providers.find((item) => item.provider === providerId)
    if (!provider?.settings.enabled || provider.settings.retired || provider.provider === 'pesapal' || !provider.methods.some((method) => method.id === 'card')) return
    setDraft((current) => current && ({
      ...current,
      providers: current.providers.map((item) => ({
        ...item,
        settings: { ...item.settings, is_default: item.provider === providerId },
      })),
    }))
  }

  const retireProvider = (provider: ProviderView) => {
    if (!draft || !draft.canManage) return
    if (!provider.settings.retired && provider.health.openPayments !== 0) return
    const retiring = !provider.settings.retired
    const action = retiring ? 'Retire' : 'Restore'
    if (!window.confirm(`${action} ${provider.label} for new payments? ${retiring ? 'Existing payments and refunds remain supported.' : 'The provider will stay disabled until you turn it on.'}`)) return
    let next = copy(draft)
    if (retiring) {
      const alternatives = next.providers.filter((item) => item.provider !== provider.provider && item.settings.enabled && !item.settings.retired && item.methods.some((method) => method.id === 'card' && method.settings.enabled))
      const replacement = alternatives.find((item) => item.settings.is_default) || alternatives.sort((a, b) => a.settings.priority - b.settings.priority)[0]
      next.providers = next.providers.map((item) => ({
        ...item,
        settings: {
          ...item.settings,
          enabled: item.provider === provider.provider ? false : item.settings.enabled,
          retired: item.provider === provider.provider,
          is_default: item.provider === provider.provider ? false : provider.settings.is_default ? item.provider === replacement?.provider : item.settings.is_default,
        },
      }))
    } else {
      next.providers = next.providers.map((item) => item.provider === provider.provider
        ? { ...item, settings: { ...item.settings, retired: false, enabled: false, is_default: false } }
        : item)
    }
    setDraft(next)
  }

  const moveMethod = (from: string, to: string) => {
    if (!draft || !draft.canManage || from === to) return
    const currentOrder = methodOrder.length ? [...methodOrder] : flattenMethods(draft.providers).map(({ provider, method }) => keyFor(provider.provider, method.id))
    const fromIndex = currentOrder.indexOf(from)
    const toIndex = currentOrder.indexOf(to)
    if (fromIndex < 0 || toIndex < 0) return
    currentOrder.splice(fromIndex, 1)
    currentOrder.splice(toIndex, 0, from)
    setMethodOrder(currentOrder)
    currentOrder.forEach((key, index) => {
      const [providerId, methodId] = key.split(':')
      patchMethod(providerId, methodId, { priority: (index + 1) * 10 })
    })
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!saved || !draft || !draft.canManage || !hasChanges || !reason.trim()) return
    setSaving(true)
    setError('')
    setNotice('')
    const diff = diffSettings(saved, draft)
    try {
      const response = await fetch('/api/admin/payment-settings', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: saved.version, reason: reason.trim(), ...diff }),
      })
      const payload = await response.json()
      if (!response.ok || payload?.error) throw new Error(payloadError(payload))
      if (setActionNotice) setActionNotice('Payment settings saved.')
      else setNotice('Payment settings saved.')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Payment settings could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !draft) {
    return embedded ? <Card><div style={{ fontSize: 12, color: C.textMuted }}>Loading payment provider settings…</div></Card> : <main className={styles.page}><div className={styles.loadingBlock} aria-label="Loading payment settings"><span /><span /><span /></div></main>
  }
  if (!draft || !saved) {
    return <>{embedded ? <Card><div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Payment providers</div><div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>Configure payment providers and checkout methods.</div>{error && <div role="alert">{error}</div>}<Btn variant="primary" size="sm" onClick={() => void refresh()}>Try again</Btn></Card> : <main className={styles.page}>
      <header className={styles.pageHeader}><a className={styles.backLink} href="/dashboard/admin/financials">Back to admin console</a><h1>Payment providers</h1><p>Manage the methods available for portal checkout.</p></header>
      {error && <div className={styles.alertError} role="alert">{error}</div>}
      <button className={styles.secondaryButton} type="button" onClick={() => void refresh()}>Try again</button>
    </main>}</>
  }

  const rows = flattenMethods(draft.providers)
  const methodMap = new Map(rows.map((row) => [keyFor(row.provider.provider, row.method.id), row]))
  const orderedRows = (methodOrder.length ? methodOrder : rows.map(({ provider, method }) => keyFor(provider.provider, method.id)))
    .map((key) => methodMap.get(key)).filter((row): row is MethodRow => Boolean(row))
  const dirtyDiff = diffSettings(saved, draft)
  const hasAnyMethodOrderChange = dirtyDiff.methodChanges.some((change) => change.priority !== undefined)

  const content = <>
    {!embedded && <header className={styles.pageHeader}>
      <a className={styles.backLink} href="/dashboard/admin/financials">Back to admin console</a>
      <div className={styles.headerRow}>
        <div>
          <h1>Payment providers</h1>
          <p>Choose which payment methods new checkouts can use. Existing payments stay tied to their original provider.</p>
        </div>
        <button className={styles.secondaryButton} type="button" onClick={() => void refresh()} disabled={loading || saving}>Refresh</button>
      </div>
      <div className={styles.defaultStrip}>
        <span className={styles.defaultLabel}>Default card provider</span>
        <strong>{draft.providers.find((provider) => provider.settings.is_default)?.label || 'No default selected'}</strong>
        <span className={styles.version}>Settings version {draft.version}</span>
      </div>
    </header>}

    {!draft.canManage && <div className={styles.alertInfo} role="status">You can view payment settings. Only the configured owner admin can change them.</div>}
    {error && <div className={styles.alertError} role="alert">{error}</div>}
    {!embedded && notice && <div className={styles.alertSuccess} role="status">{notice}</div>}

    <Card><section className={styles.section} aria-labelledby="providers-heading">
      <div className={styles.sectionHeading}>
        <div><h2 id="providers-heading">Providers</h2><p>Turn on new payments, set owner testing access and review provider health.</p></div>
      </div>
      <div className={styles.providerList}>
        {draft.providers.map((provider) => {
          const health = provider.health
          const readiness = draft.readiness
          const isPesapal = provider.provider === 'pesapal'
          return <article key={provider.provider} className={styles.providerRow}>
            <div className={styles.providerIdentity}>
              <img src={provider.logoAsset} alt="" width="112" height="30" />
              <div><h3>{provider.label}</h3><span>{provider.mode === 'inline-token' ? 'Card tokenization' : provider.mode === 'manual-invoice' ? 'Wallet and invoice' : 'Hosted checkout'}</span></div>
            </div>
            <div className={styles.providerControls}>
              <label className={styles.checkControl}>
                <input type="checkbox" checked={provider.settings.enabled} disabled={!draft.canManage || provider.settings.retired || saving} onChange={(event) => setProviderEnabled(provider, event.target.checked)} />
                <span>Accept new payments</span>
              </label>
              <label className={styles.checkControl}>
                <input type="checkbox" checked={provider.settings.test_mode_owner_only} disabled={!draft.canManage || saving} onChange={(event) => patchProvider(provider.provider, { test_mode_owner_only: event.target.checked })} />
                <span>Owner-only testing</span>
              </label>
              {provider.settings.test_mode_owner_only && <label className={styles.fieldLabel}>
                Owner allowlist
                <textarea
                  rows={2}
                  value={provider.settings.test_allowlist.join('\n')}
                  disabled={!draft.canManage || saving}
                  onChange={(event) => patchProvider(provider.provider, { test_allowlist: event.target.value.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean) })}
                  placeholder="Profile IDs, one per line"
                  aria-label={`${provider.label} owner test allowlist`}
                />
                <span className={styles.fieldHint}>Use profile IDs. Changes are audited.</span>
              </label>}
              {isPesapal && <div className={styles.readinessNote}>
                <strong>Pesapal is settings-only in P0.</strong>
                <span>No adapter or provider calls are active yet. Owner-only access stays on until all go-live checks pass.</span>
                <ul>
                  <li className={readiness.credentialsPresent ? styles.checkReady : styles.checkPending}>Credentials present: {readiness.credentialsPresent ? 'confirmed' : 'not confirmed'}</li>
                  <li className={readiness.notificationRegistered ? styles.checkReady : styles.checkPending}>Notification registered: {readiness.notificationRegistered ? 'confirmed' : 'not confirmed'}</li>
                  <li className={readiness.ownerTestPaymentCompleted ? styles.checkReady : styles.checkPending}>Owner test payment: {readiness.ownerTestPaymentCompleted ? 'confirmed' : 'not confirmed'}</li>
                </ul>
              </div>}
            </div>
            <div className={styles.health}>
              <label className={styles.defaultChoice}>
                <input type="radio" name="default-provider" checked={provider.settings.is_default} disabled={!draft.canManage || !provider.settings.enabled || provider.settings.retired || provider.provider === 'pesapal' || saving || !provider.methods.some((method) => method.id === 'card')} onChange={() => setDefault(provider.provider)} />
                <span>Default</span>
              </label>
              <div><span className={styles.healthLabel}>Open payments</span><strong>{health.openPayments == null ? 'Unknown' : health.openPayments}</strong></div>
              <div><span className={styles.healthLabel}>Open incidents</span><strong>{health.openIncidents == null ? 'Unknown' : health.openIncidents}</strong></div>
              <div className={styles.lastPayment}><span className={styles.healthLabel}>Last success</span><span>{dateText(health.lastSuccessfulPaymentAt)}</span></div>
              <button
                type="button"
                className={provider.settings.retired ? styles.restoreButton : styles.retireButton}
                disabled={!draft.canManage || saving || (!provider.settings.retired && health.openPayments !== 0)}
                title={!provider.settings.retired && health.openPayments !== 0 ? 'Retirement is blocked until no payments are open or refundable.' : undefined}
                onClick={() => retireProvider(provider)}
              >{provider.settings.retired ? 'Restore' : 'Retire'}</button>
              {!provider.settings.retired && health.openPayments !== 0 && <span className={styles.retireHint}>Retirement waits for open or refundable payments.</span>}
            </div>
          </article>
        })}
      </div>
    </section></Card>

    <Card><section className={styles.section} aria-labelledby="methods-heading">
      <div className={styles.sectionHeading}>
        <div><h2 id="methods-heading">Payment methods</h2><p>Drag to set checkout priority. On smaller screens, use the move buttons.</p></div>
        {hasAnyMethodOrderChange && <span className={styles.orderChanged}>Priority order changed</span>}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.methodTable}>
          <thead><tr><th scope="col">Order</th><th scope="col">Provider</th><th scope="col">Method</th><th scope="col">Available</th><th scope="col">Currencies</th><th scope="col">Countries</th><th scope="col">Minimum (USD)</th><th scope="col">Maximum (USD)</th><th scope="col">Capabilities</th></tr></thead>
          <tbody>
            {orderedRows.map(({ provider, method }, index) => {
              const methodKey = keyFor(provider.provider, method.id)
              const selectedCurrencies = currencyList(method.settings.currencies, method.currencies)
              return <tr
                key={methodKey}
                draggable={draft.canManage && !saving}
                onDragStart={(event) => { setDragged(methodKey); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', methodKey) }}
                onDragEnd={() => setDragged(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); const from = event.dataTransfer.getData('text/plain') || dragged; if (from) moveMethod(from, methodKey); setDragged(null) }}
                className={dragged === methodKey ? styles.draggingRow : undefined}
              >
                <td data-label="Order" className={styles.orderCell}>
                  <span className={styles.orderNumber}>{index + 1}</span>
                  <span className={styles.dragGrip} aria-hidden="true" />
                  <span className={styles.moveButtons}>
                    <button type="button" aria-label={`Move ${method.label} up`} disabled={!draft.canManage || saving || index === 0} onClick={() => moveMethod(methodKey, keyFor(orderedRows[index - 1]?.provider.provider || '', orderedRows[index - 1]?.method.id || ''))}>Up</button>
                    <button type="button" aria-label={`Move ${method.label} down`} disabled={!draft.canManage || saving || index === orderedRows.length - 1} onClick={() => moveMethod(methodKey, keyFor(orderedRows[index + 1]?.provider.provider || '', orderedRows[index + 1]?.method.id || ''))}>Down</button>
                  </span>
                </td>
                <td data-label="Provider"><strong>{provider.label}</strong></td>
                <td data-label="Method"><span className={styles.methodName}>{method.label}</span></td>
                <td data-label="Available"><label className={styles.methodToggle}>
                  <input type="checkbox" checked={method.settings.enabled} disabled={!draft.canManage || provider.settings.retired || saving} onChange={(event) => setMethodEnabled(provider, method, event.target.checked)} />
                  <span>{method.settings.enabled ? 'On' : 'Off'}</span>
                </label></td>
                <td data-label="Currencies"><div className={styles.currencyChoices}>{method.currencies.map((currency) => <label key={currency} title={CURRENCY_LABELS[currency] || currency}>
                  <input type="checkbox" checked={selectedCurrencies.includes(currency)} disabled={!draft.canManage || saving || provider.settings.retired} onChange={(event) => {
                    const next = event.target.checked ? [...selectedCurrencies, currency] : selectedCurrencies.filter((item) => item !== currency)
                    patchMethod(provider.provider, method.id, { currencies: next })
                  }} />{currency}
                </label>)}</div></td>
                <td data-label="Countries"><input className={styles.shortInput} aria-label={`${provider.label} ${method.label} countries`} value={(method.settings.countries ?? method.countries).join(', ')} disabled={!draft.canManage || saving || provider.settings.retired} onChange={(event) => patchMethod(provider.provider, method.id, { countries: event.target.value.split(/[\s,]+/).map((value) => value.toUpperCase()).filter(Boolean) })} placeholder="All" /></td>
                <td data-label="Minimum (USD)"><input className={styles.moneyInput} type="number" min="0" step="0.01" aria-label={`${provider.label} ${method.label} minimum USD equivalent`} value={amountValue(method.settings.min_amount_minor)} disabled={!draft.canManage || saving || provider.settings.retired} onChange={(event) => patchMethod(provider.provider, method.id, { min_amount_minor: minorValue(event.target.value) })} placeholder="5.00 global" /></td>
                <td data-label="Maximum (USD)"><input className={styles.moneyInput} type="number" min="0" step="0.01" aria-label={`${provider.label} ${method.label} maximum USD equivalent`} value={amountValue(method.settings.max_amount_minor)} disabled={!draft.canManage || saving || provider.settings.retired} onChange={(event) => patchMethod(provider.provider, method.id, { max_amount_minor: minorValue(event.target.value) })} placeholder="No limit" /></td>
                <td data-label="Capabilities"><span className={styles.capabilityText}>{method.supportsVault ? 'Saved cards' : 'No vault'}<br />{method.supportsPartialRefund ? 'Partial refunds' : method.supportsRefund ? 'Full refunds' : 'No refunds'}</span></td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.tableNote}>The global minimum is US$5 equivalent. Method limits use USD cents and are checked against server pricing.</p>
    </section></Card>

    <Card><section className={styles.section} aria-labelledby="global-heading">
      <div className={styles.sectionHeading}><div><h2 id="global-heading">Global checkout defaults</h2><p>Currency routing remains off until the owner enables it.</p></div></div>
      <div className={styles.globalFields}>
        <label className={styles.checkControl}>
          <input type="checkbox" checked={draft.global.country_default_routing_enabled} disabled={!draft.canManage || saving} onChange={(event) => setDraft((current) => current && ({ ...current, global: { ...current.global, country_default_routing_enabled: event.target.checked } }))} />
          <span>Use country when choosing a default method</span>
        </label>
        <label className={styles.fieldLabel}>FX markup (basis points)
          <input type="number" min="0" max="10000" step="1" value={draft.global.fx_markup_bps} disabled={!draft.canManage || saving} onChange={(event) => setDraft((current) => current && ({ ...current, global: { ...current.global, fx_markup_bps: Number(event.target.value) } }))} />
          <span className={styles.fieldHint}>Shown in the quoted total. Default: 0 bps.</span>
        </label>
      </div>
    </section></Card>

    <Card><section className={styles.section} aria-labelledby="audit-heading">
      <div className={styles.sectionHeading}><div><h2 id="audit-heading">Change history</h2><p>Recent changes and rejected attempts, with actor, reason and before/after values.</p></div><span className={styles.auditCount}>{draft.audit.length} entries</span></div>
      {draft.audit.length === 0 ? <div className={styles.emptyState}>No payment settings changes have been recorded.</div> : <div className={styles.auditList}>
        {draft.audit.map((entry) => <details key={entry.id} className={styles.auditEntry}>
          <summary><span><strong>{entry.target}</strong><small>{entry.action.replaceAll('_', ' ')}</small></span><span className={styles.auditActor}>{entry.actor_role} · {entry.actor_profile_id.slice(0, 8)}</span><time dateTime={entry.created_at}>{dateText(entry.created_at)}</time></summary>
          <div className={styles.auditDetail}><p><strong>Reason:</strong> {entry.reason || 'No reason recorded'}</p><div className={styles.auditDiff}><div><span>Before</span><pre>{JSON.stringify(entry.before, null, 2) ?? 'null'}</pre></div><div><span>After</span><pre>{JSON.stringify(entry.after, null, 2) ?? 'null'}</pre></div></div></div>
        </details>)}
      </div>}
    </section></Card>

    <form className={styles.saveBar} onSubmit={save}>
      <label className={styles.reasonLabel}>Reason for change
        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={!draft.canManage || saving} placeholder="Required for the audit log" />
      </label>
      {embedded ? <Btn variant="primary" size="sm" type="submit" disabled={!draft.canManage || !hasChanges || !reason.trim() || saving}>{saving ? 'Saving…' : 'Save changes'}</Btn> : <button className={styles.saveButton} type="submit" disabled={!draft.canManage || !hasChanges || !reason.trim() || saving}>{saving ? 'Saving…' : 'Save changes'}</button>}
    </form>
  </>
  return embedded ? <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <Card><div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Payment providers</div><div style={{ fontSize: 12, color: C.textMuted, marginBottom: 16 }}>Choose which payment methods new checkouts can use. Existing payments stay tied to their original provider.</div><div style={{ fontSize: 12, color: C.textMuted }}>Default card provider: <strong>{draft.providers.find((provider) => provider.settings.is_default)?.label || 'No default selected'}</strong> · Settings version {draft.version}</div></Card>
    {content}
  </div> : <main className={styles.page}>{content}</main>
}

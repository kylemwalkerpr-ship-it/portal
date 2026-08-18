'use client'
/**
 * AI Key Vault panel — paste API keys straight from the Command Center to
 * activate any content-AI provider. Keys are stored in Supabase (admin DB)
 * and read by the Worker AI chain at runtime with a short TTL.
 *
 * GET    /api/seo-factory/ai-keys            → status list + settings
 * PUT    /api/seo-factory/ai-keys            → save key (masked response)
 * DELETE /api/seo-factory/ai-keys?provider=  → remove key
 * POST   /api/seo-factory/ai-keys/test       → live probe (inline or saved key)
 * POST   /api/seo-factory/ai-keys/settings   → default provider / model / cap
 */
import React from 'react'

const C = {
  bg: '#F7F8FA', surface: '#FFFFFF', surface2: '#F4F2EE', surface3: '#EBEDF0',
  border: 'rgba(0,0,0,0.08)', border2: 'rgba(0,0,0,0.05)',
  cyan: '#1E1B4B', cyan2: '#3C3B6E', cyanSoft: '#EEF2FF',
  gold: '#9A7B3B', goldSoft: '#FEF3C7', goldBorder: '#FDE68A',
  text: '#111827', textMuted: '#6B7280', textDim: '#9CA3AF', textFaint: '#D1D5DB',
  green: '#065F46', greenSoft: '#ECFDF5', greenBorder: '#A7F3D0',
  red: '#991B1B', redSoft: '#FEF2F2', redBorder: '#FECACA',
  orange: '#9A3412', orangeSoft: '#FFF7ED',
  blue: '#1D4ED8', blueSoft: '#EFF6FF', blueBorder: '#BFDBFE',
  violet: '#6D28D9', violetSoft: '#F5F3FF',
  navy: '#0F172A',
  serif: "var(--portal-font-display, 'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif)",
  mono: "var(--portal-font-mono, 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace)",
  shadowCard: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)',
  shadowHover: '0 4px 12px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)',
  radius: 12, radiusSm: 8, radiusXs: 6,
}

interface VaultStatusRow {
  id: string
  label: string
  role: 'primary' | 'fallback'
  configured: boolean
  source: 'vault' | 'env' | 'oauth' | 'none'
  maskedKey: string | null
  baseUrl: string | null
  model: string | null
  defaultModel: string
  hint?: string
  envKey: string
  baseUrlEnv?: string
  modelEnv?: string
  vaultGroup?: string
  vaultGroupLabel?: string
}

interface AiSettings {
  default_provider?: string | null
  default_model?: string | null
  max_providers?: string | null
  provider_order?: string | null
}

interface GrokOAuthStatus {
  connected?: boolean
  pending?: boolean
  userCode?: string | null
  verificationUri?: string | null
  verificationUriComplete?: string | null
  expiresAt?: number | null
  interval?: number | null
  error?: string
}

interface Draft {
  key: string
  baseUrl: string
  model: string
}

function parseProviderOrder(value: string | null | undefined, fallback: string[]): string[] {
  let raw: unknown = value || ''
  if (typeof raw === 'string' && raw.trim()) {
    const orderString = raw
    try { raw = JSON.parse(orderString) } catch { raw = orderString.split(',') }
  }
  const ids = Array.isArray(raw) ? raw.map((id) => String(id).trim()).filter(Boolean) : []
  const merged = [...new Set([...ids, ...fallback])].filter((id) => fallback.includes(id))
  const grokAt = merged.indexOf('grok')
  if (grokAt < 0 && fallback.includes('grok')) {
    merged.splice(Math.min(1, merged.length), 0, 'grok')
  } else if (grokAt > 1) {
    merged.splice(grokAt, 1)
    merged.splice(1, 0, 'grok')
  }
  return merged
}

const input = (w: string): React.CSSProperties => ({
  width: w, padding: '5px 8px', borderRadius: C.radiusXs, border: `1px solid ${C.border}`,
  background: '#fff', color: C.text, fontSize: 11, fontFamily: C.mono,
})

const btn = (bg?: string, strong?: boolean): React.CSSProperties => ({
  padding: '5px 10px', borderRadius: C.radiusXs, border: 'none', cursor: 'pointer',
  background: bg || C.surface3, color: strong ? '#fff' : C.text, fontSize: 11,
  fontWeight: strong ? 700 : 500, fontFamily: 'inherit', whiteSpace: 'nowrap',
})

function SourceBadge({ source }: { source: VaultStatusRow['source'] }) {
  if (source === 'oauth') {
    return <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 9, fontWeight: 700, background: C.violetSoft, color: C.violet, border: `1px solid #DDD6FE` }}>SUPERGROK</span>
  }
  if (source === 'vault') {
    return <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 9, fontWeight: 700, background: C.greenSoft, color: C.green, border: `1px solid ${C.greenBorder}` }}>VAULT</span>
  }
  if (source === 'env') {
    return <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 9, fontWeight: 700, background: C.blueSoft, color: C.blue, border: `1px solid ${C.blueBorder}` }}>ENV</span>
  }
  return <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 9, fontWeight: 700, background: '#F3F4F6', color: '#6B7280' }}>—</span>
}

export default function AiKeyVaultPanel({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = React.useState<VaultStatusRow[] | null>(null)
  const [settings, setSettings] = React.useState<AiSettings | null>(null)
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({})
  const [defaultProvider, setDefaultProvider] = React.useState('auto')
  const [defaultModel, setDefaultModel] = React.useState('')
  const [maxProviders, setMaxProviders] = React.useState('3')
  const [providerOrder, setProviderOrder] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [probe, setProbe] = React.useState<Record<string, string>>({})
  const [grokOAuth, setGrokOAuth] = React.useState<GrokOAuthStatus | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/seo-factory/ai-keys', { credentials: 'same-origin' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      const nextRows = (d.providers || []) as VaultStatusRow[]
      setRows(nextRows)
      const s = (d.settings || {}) as AiSettings
      setSettings(s)
      setProviderOrder(parseProviderOrder(s.provider_order, nextRows.map((row) => row.id)))
      setDefaultProvider(s.default_provider || 'auto')
      setDefaultModel(s.default_model || ((d.grokOAuth as GrokOAuthStatus | null)?.connected ? 'grok-4.6' : ''))
      setMaxProviders(s.max_providers || '3')
      setGrokOAuth((d.grokOAuth || null) as GrokOAuthStatus | null)
      setNote(null)
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Failed to load AI keys' })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const draft = (id: string): Draft => drafts[id] || { key: '', baseUrl: '', model: '' }

  const save = async (id: string) => {
    const d = draft(id)
    if (!d.key.trim() && !d.model.trim() && !d.baseUrl.trim()) {
      setNote({ ok: false, text: 'Paste an API key (or set a model / base URL) first.' })
      return
    }
    setBusy(`save-${id}`)
    try {
      const res = await fetch('/api/seo-factory/ai-keys', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: id,
          apiKey: d.key.trim() || undefined,
          baseUrl: d.baseUrl.trim() || undefined,
          model: d.model.trim() || undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setDrafts((prev) => ({ ...prev, [id]: { key: '', baseUrl: '', model: '' } }))
      setNote({ ok: true, text: `${j.maskedKey || id} saved${j.model ? ` · model ${j.model}` : ''}` })
      await load()
      onChanged?.()
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setBusy(null)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm(`Remove the saved "${id}" key from the vault? The provider will fall back to Worker env secrets (if any).`)) {
      return
    }
    setBusy(`del-${id}`)
    try {
      const res = await fetch(`/api/seo-factory/ai-keys?provider=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setNote({ ok: true, text: `${id} removed from vault` })
      await load()
      onChanged?.()
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Remove failed' })
    } finally {
      setBusy(null)
    }
  }

  const test = async (id: string) => {
    const d = draft(id)
    setBusy(`test-${id}`)
    setProbe((p) => ({ ...p, [id]: 'probing…' }))
    try {
      const res = await fetch('/api/seo-factory/ai-keys/test', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: id,
          ...(d.key.trim() ? { apiKey: d.key.trim() } : {}),
          ...(d.baseUrl.trim() ? { baseUrl: d.baseUrl.trim() } : {}),
          ...(d.model.trim() ? { model: d.model.trim() } : {}),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (j.ok) {
        setProbe((p) => ({
          ...p,
          [id]: `ok — via ${j.provider}${j.model ? ` · ${j.model}` : ''}${j.reply ? ` — "${String(j.reply).trim()}"` : ''}`,
        }))
        setNote({ ok: true, text: `${id} replied via ${j.provider}${j.model ? ` · ${j.model}` : ''}` })
      } else {
        setProbe((p) => ({ ...p, [id]: `failed — ${j.error || 'no reply'}` }))
        setNote({ ok: false, text: `${id} test failed` })
      }
    } catch (e) {
      setProbe((p) => ({ ...p, [id]: 'request failed' }))
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Test request failed' })
    } finally {
      setBusy(null)
    }
  }

  const grokOAuthAction = async (action: 'start' | 'poll' | 'disconnect') => {
    setBusy(`grok-oauth-${action}`)
    try {
      const res = await fetch('/api/seo-factory/ai-keys/grok-oauth', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setGrokOAuth(j as GrokOAuthStatus)
      if (action === 'start') {
        setNote({ ok: true, text: `Open ${j.verificationUri || 'accounts.x.ai'} and enter ${j.userCode || 'the code'} to connect SuperGrok.` })
        if (j.verificationUriComplete || j.verificationUri) {
          window.open(String(j.verificationUriComplete || j.verificationUri), '_blank', 'noopener,noreferrer')
        }
      } else if (action === 'disconnect') {
        setNote({ ok: true, text: 'SuperGrok disconnected. Grok will need a new login or an API key.' })
        await load()
        onChanged?.()
      } else if (j.connected) {
        setNote({ ok: true, text: 'SuperGrok connected. Grok is now the studio fallback.' })
        await load()
        onChanged?.()
      } else if (j.error) {
        setNote({ ok: false, text: String(j.error) })
      }
      return j as GrokOAuthStatus
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'SuperGrok login failed' })
      return null
    } finally {
      setBusy(null)
    }
  }

  React.useEffect(() => {
    if (!grokOAuth?.pending || grokOAuth.connected) return
    const wait = Math.max(2, Number(grokOAuth.interval || 5)) * 1000
    const timer = window.setInterval(() => {
      void grokOAuthAction('poll')
    }, wait)
    return () => window.clearInterval(timer)
  }, [grokOAuth?.pending, grokOAuth?.connected, grokOAuth?.interval])

  const saveSettings = async () => {
    setBusy('settings')
    try {
      const res = await fetch('/api/seo-factory/ai-keys/settings', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultProvider: defaultProvider === 'auto' ? 'auto' : defaultProvider,
          defaultModel,
          maxProviders,
          providerOrder,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setSettings((j.settings as AiSettings) || settings)
      setNote({ ok: true, text: `Defaults saved — ${defaultProvider === 'auto' ? 'auto' : defaultProvider}${defaultModel ? ` · ${defaultModel}` : ''}` })
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Settings save failed' })
    } finally {
      setBusy(null)
    }
  }

  const setD = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...draft(id), ...patch } }))

  const moveProvider = (id: string, delta: -1 | 1) => {
    setProviderOrder((current) => {
      const index = current.indexOf(id)
      const nextIndex = index + delta
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      if (item) next.splice(nextIndex, 0, item)
      return next
    })
  }

  const orderedRows = React.useMemo(() => {
    const byId = new Map((rows || []).map((row) => [row.id, row]))
    const knownIds = (rows || []).map((row) => row.id)
    const completeOrder = [...providerOrder, ...knownIds.filter((id) => !providerOrder.includes(id))]
    return completeOrder.map((id) => byId.get(id)).filter(Boolean) as VaultStatusRow[]
  }, [rows, providerOrder])

  const parasailRows = (rows || []).filter((r) => r.vaultGroup === 'parasail' || r.id.startsWith('parasail-'))
  const parasailLead = parasailRows.find((r) => r.id === 'parasail-deepseek') || parasailRows[0] || null
  const parasailConfigured = parasailRows.some((r) => r.configured)
  const parasailSource = parasailRows.find((r) => r.source === 'vault')?.source
    || parasailRows.find((r) => r.source === 'env')?.source
    || parasailLead?.source
    || 'none'

  const saveParasail = async () => {
    const d = draft('parasail')
    const key = d.key.trim()
    if (!key && !d.baseUrl.trim()) {
      setNote({ ok: false, text: 'Paste a Parasail psk- key first.' })
      return
    }
    if (key && !/^psk-/i.test(key)) {
      setNote({ ok: false, text: 'Parasail keys start with psk-. Check you copied the full key.' })
      return
    }
    setBusy('save-parasail')
    try {
      const targets = parasailRows.length ? parasailRows.map((r) => r.id) : ['parasail-deepseek', 'parasail-glm']
      for (const id of targets) {
        const res = await fetch('/api/seo-factory/ai-keys', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: id,
            apiKey: key || undefined,
            baseUrl: d.baseUrl.trim() || undefined,
          }),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      }
      setDrafts((prev) => ({ ...prev, parasail: { key: '', baseUrl: '', model: '' } }))
      setNote({ ok: true, text: 'Parasail saved — DeepSeek V4 Flash + GLM 5.2 unlocked' })
      await load()
      onChanged?.()
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Parasail save failed' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: C.mono }}>
            🔑 AI Keys vault
            <span style={{ color: C.textDim, fontWeight: 500 }}> — paste keys to activate models</span>
          </div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
            Stored in Supabase (admin DB) · vault keys override Worker secrets · every save busts the 45s chain cache
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {note && (
            <span style={{
              fontSize: 10, padding: '3px 8px', borderRadius: 999, alignSelf: 'center',
              background: note.ok ? C.greenSoft : C.redSoft, color: note.ok ? C.green : C.red,
              border: `1px solid ${note.ok ? C.greenBorder : C.redBorder}`,
            }}>
              {note.text}
            </span>
          )}
          <button type="button" onClick={() => void load()} disabled={loading} style={btn()}>
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Defaults */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(150px, 1.2fr) minmax(140px, 1fr) 90px auto', gap: 8,
        padding: 10, borderRadius: C.radiusSm, border: `1px solid ${C.border}`, background: C.surface2,
        alignItems: 'end', marginBottom: 10,
      }}>
        <label style={{ display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>Default provider</span>
          <select value={defaultProvider} onChange={(e) => setDefaultProvider(e.target.value)} style={input('100%')}>
            <option value="auto">Auto (Grok → OpenAI → rest)</option>
            {rows?.map((r) => (
              <option key={r.id} value={r.id}>{r.label}{r.configured ? '' : ' (not configured)'}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>Default model</span>
          <input value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} placeholder="gpt-5.6-terra" style={input('100%')} />
        </label>
        <label style={{ display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>Max providers</span>
          <input value={maxProviders} onChange={(e) => setMaxProviders(e.target.value.replace(/[^0-9]/g, ''))} placeholder="3" style={input('100%')} />
        </label>
        <button type="button" onClick={() => void saveSettings()} disabled={busy === 'settings'} style={btn(C.navy, true)}>
          {busy === 'settings' ? 'Saving…' : 'Save defaults'}
        </button>
      </div>

      {/* Provider priority */}
      <div style={{ padding: 10, borderRadius: C.radiusSm, border: `1px solid ${C.border}`, background: '#fff', marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Provider priority</div>
          <div style={{ fontSize: 9, color: C.textDim }}>Top = first eligible lead · arrows change fallback order · Save defaults applies it everywhere</div>
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          {orderedRows.map((r, index) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: C.radiusXs, background: index === 0 ? C.goldSoft : C.surface2, border: `1px solid ${index === 0 ? C.goldBorder : C.border2}` }}>
              <span style={{ width: 20, fontFamily: C.mono, fontSize: 10, color: index === 0 ? C.gold : C.textDim, fontWeight: 800 }}>{index + 1}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 10, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              <SourceBadge source={r.source} />
              <button type="button" onClick={() => moveProvider(r.id, -1)} disabled={index === 0} aria-label={`Move ${r.label} up`} style={{ ...btn(), padding: '3px 7px', opacity: index === 0 ? 0.4 : 1 }}>↑</button>
              <button type="button" onClick={() => moveProvider(r.id, 1)} disabled={index === orderedRows.length - 1} aria-label={`Move ${r.label} down`} style={{ ...btn(), padding: '3px 7px', opacity: index === orderedRows.length - 1 ? 0.4 : 1 }}>↓</button>
            </div>
          ))}
        </div>
      </div>

      {parasailLead && (
        <div style={{
          padding: 12, borderRadius: C.radiusSm, marginBottom: 10,
          border: `1px solid ${parasailConfigured ? C.greenBorder : C.goldBorder}`,
          background: parasailConfigured ? C.greenSoft : C.goldSoft,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>Parasail · api.parasail.io</div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                One <span style={{ fontFamily: C.mono }}>psk-</span> key unlocks DeepSeek V4 Flash and GLM 5.2 as selectable hosts in Draft / Research / Review.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <SourceBadge source={parasailSource} />
              <span style={{ fontSize: 10, fontFamily: C.mono, color: parasailConfigured ? C.green : C.textDim }}>
                {parasailLead.maskedKey || 'no key'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="password"
              value={draft('parasail').key}
              onChange={(e) => setD('parasail', { key: e.target.value })}
              placeholder="Paste PARASAIL_API_KEY (psk-…)"
              style={{ ...input('min(280px, 100%)'), flex: 2, minWidth: 180 }}
            />
            <button type="button" onClick={() => void saveParasail()} disabled={busy === 'save-parasail'} style={btn(C.navy, true)}>
              {busy === 'save-parasail' ? 'Saving…' : 'Save Parasail'}
            </button>
            <button type="button" onClick={() => void test('parasail-deepseek')} disabled={busy === 'test-parasail-deepseek'} style={btn(C.cyan2, true)}>
              {busy === 'test-parasail-deepseek' ? '…' : 'Test'}
            </button>
          </div>
        </div>
      )}

      {/* Provider rows */}
      <div style={{ display: 'grid', gap: 6, maxHeight: 330, overflow: 'auto', paddingRight: 2 }}>
        {orderedRows.filter((r) => r.vaultGroup !== 'parasail').map((r) => {
          const d = draft(r.id)
          const probing = probe[r.id]
          const isBusy = busy === `save-${r.id}` || busy === `del-${r.id}` || busy === `test-${r.id}`
          return (
            <div key={r.id} style={{
              padding: 8, borderRadius: C.radiusSm, border: `1px solid ${r.configured ? C.greenBorder : C.border}`,
              background: r.configured ? '#FCFEFC' : '#fff',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <strong style={{ fontSize: 11, color: C.text }}>{r.label}</strong>
                  <SourceBadge source={r.source} />
                  {r.role === 'primary' && (
                    <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 9, fontWeight: 700, background: C.goldSoft, color: C.gold }}>PRIMARY</span>
                  )}
                </div>
                <span style={{ fontSize: 10, fontFamily: C.mono, color: r.configured ? C.green : C.textDim }}>
                  {r.maskedKey || 'no key'}
                  {r.model ? ` · ${r.model}` : ''}
                </span>
              </div>
              {r.hint && <div style={{ fontSize: 9, color: C.textDim, marginBottom: 6 }}>{r.hint}</div>}

              {r.id === 'grok' && (
                <div style={{
                  marginBottom: 8, padding: 8, borderRadius: C.radiusXs,
                  background: C.violetSoft, border: '1px solid #DDD6FE',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.violet, marginBottom: 4 }}>
                    SuperGrok subscription — no API key
                  </div>
                  <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 6, lineHeight: 1.45 }}>
                    Sign in with the SuperGrok (or X Premium+) account you already pay for.
                    Content Studio stores a refresh token and uses Grok 4.6 as the fallback
                    for Master Engine, Discover, Research, and Draft.
                  </div>
                  {grokOAuth?.pending && grokOAuth.userCode && (
                    <div style={{ fontSize: 10, fontFamily: C.mono, color: C.text, marginBottom: 6 }}>
                      Enter code <strong>{grokOAuth.userCode}</strong> at{' '}
                      <a href={grokOAuth.verificationUriComplete || grokOAuth.verificationUri || 'https://accounts.x.ai/device'} target="_blank" rel="noreferrer">
                        {grokOAuth.verificationUri || 'accounts.x.ai/device'}
                      </a>
                      {' '}— waiting for approval…
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => void grokOAuthAction('start')}
                      disabled={busy === 'grok-oauth-start' || busy === 'grok-oauth-poll'}
                      style={btn(C.violet, true)}
                    >
                      {grokOAuth?.pending ? 'Restart SuperGrok login' : grokOAuth?.connected ? 'Reconnect SuperGrok' : 'Connect SuperGrok'}
                    </button>
                    {grokOAuth?.pending && (
                      <button type="button" onClick={() => void grokOAuthAction('poll')} disabled={busy === 'grok-oauth-poll'} style={btn()}>
                        Check now
                      </button>
                    )}
                    {grokOAuth?.connected && (
                      <button type="button" onClick={() => void grokOAuthAction('disconnect')} disabled={busy === 'grok-oauth-disconnect'} style={btn(C.redSoft)}>
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="password"
                  value={d.key}
                  onChange={(e) => setD(r.id, { key: e.target.value })}
                  placeholder={`Paste ${r.envKey}…`}
                  style={{ ...input('min(240px, 100%)'), flex: 2, minWidth: 150 }}
                />
                {r.baseUrlEnv && (
                  <input
                    value={d.baseUrl}
                    onChange={(e) => setD(r.id, { baseUrl: e.target.value })}
                    placeholder={r.baseUrl || 'Base URL…'}
                    style={{ ...input('min(180px, 100%)'), flex: 1, minWidth: 120 }}
                  />
                )}
                {r.modelEnv && (
                  <input
                    value={d.model}
                    onChange={(e) => setD(r.id, { model: e.target.value })}
                    placeholder={`Model (${r.model || r.defaultModel})`}
                    style={{ ...input('min(150px, 100%)'), flex: 1, minWidth: 110 }}
                  />
                )}
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  <button type="button" onClick={() => void save(r.id)} disabled={isBusy} style={btn(C.navy, true)}>
                    {busy === `save-${r.id}` ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" onClick={() => void test(r.id)} disabled={isBusy} style={btn(C.cyan2, true)}>
                    {busy === `test-${r.id}` ? '…' : 'Test'}
                  </button>
                  {r.source === 'vault' && (
                    <button type="button" onClick={() => void remove(r.id)} disabled={isBusy} style={btn(C.redSoft)}>
                      {busy === `del-${r.id}` ? '…' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>
              {probing && (
                <div style={{ marginTop: 6, fontSize: 10, fontFamily: C.mono, color: probing.startsWith('ok') ? C.green : probing.startsWith('failed') ? C.red : C.textMuted, wordBreak: 'break-word' }}>
                  {probing}
                </div>
              )}
            </div>
          )
        })}
        {loading && rows === null && (
          <div style={{ fontSize: 11, color: C.textDim, padding: '8px 2px' }}>Loading provider status…</div>
        )}
      </div>
    </div>
  )
}

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
  envShadowed?: boolean
  envMasked?: string | null
  baseUrl: string | null
  model: string | null
  defaultModel: string
  hint?: string
  envKey: string
  baseUrlEnv?: string
  modelEnv?: string
  vaultGroup?: string
  vaultGroupLabel?: string
  modelOptions?: string[]
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

interface ChatgptOAuthStatus {
  connected?: boolean
  pending?: boolean
  userCode?: string | null
  verificationUri?: string | null
  verificationUriComplete?: string | null
  expiresAt?: number | null
  interval?: number | null
  models?: string[]
  error?: string
}

interface Draft {
  key: string
  baseUrl: string
  model: string
}

interface ProviderGroup {
  name: string
  label: string
  members: VaultStatusRow[]
  lead: VaultStatusRow
  configured: boolean
  source: VaultStatusRow['source']
}

interface PriorityHost {
  host: string
  label: string
  members: VaultStatusRow[]
  source: VaultStatusRow['source']
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

function SourceBadge({ source, label }: { source: VaultStatusRow['source']; label?: string }) {
  const base: React.CSSProperties = { padding: '2px 7px', borderRadius: 999, fontSize: 9, fontWeight: 700, cursor: 'help' }
  if (source === 'oauth') {
    return <span title="OAuth subscription token — stored via device login (SuperGrok or ChatGPT Plus)" style={{ ...base, background: C.violetSoft, color: C.violet, border: '1px solid #DDD6FE' }}>{label || 'OAUTH'}</span>
  }
  if (source === 'vault') {
    return <span title="Vault key (Supabase) — WINS over the Worker env secret" style={{ ...base, background: C.greenSoft, color: C.green, border: `1px solid ${C.greenBorder}` }}>VAULT · WINS</span>
  }
  if (source === 'env') {
    return <span title="Worker secret (env) — used because no vault key is stored for this provider" style={{ ...base, background: C.blueSoft, color: C.blue, border: `1px solid ${C.blueBorder}` }}>ENV</span>
  }
  return <span title="No key configured for this provider" style={{ ...base, background: '#F3F4F6', color: '#6B7280' }}>—</span>
}

/**
 * Shows when a provider has BOTH a vault key and a Worker env secret — the
 * env secret is shadowed by the vault row and only takes effect if the vault
 * key is removed. Makes the precedence visible instead of silently hiding it.
 */
function ShadowedEnv({ row }: { row: VaultStatusRow }) {
  if (!row.envShadowed || !row.envMasked) return null
  return (
    <span
      title="A Worker env secret also exists for this provider. The vault key wins; this env secret only takes effect if the vault row is removed."
      style={{ fontSize: 9, fontFamily: C.mono, color: C.orange }}
    >
      env also set: {row.envMasked} (shadowed)
    </span>
  )
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
  const [chatgptOAuth, setChatgptOAuth] = React.useState<ChatgptOAuthStatus | null>(null)

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
      setChatgptOAuth((d.chatgptOAuth || null) as ChatgptOAuthStatus | null)
      setNote(null)
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Failed to load AI keys' })
    } finally {
      setLoading(false)
    }
  }, [])

  const purgeAll = async () => {
    if (!window.confirm('Remove ALL vault keys? Workers will fall back to env secrets only. You can re-paste keys after.')) return
    setBusy('purge-all')
    try {
      const res = await fetch('/api/seo-factory/ai-keys?purge=true', {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setNote({ ok: true, text: `Purged ${j.purged ?? '?'} vault key(s) — env secrets now active` })
      await load()
      onChanged?.()
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Purge failed' })
    } finally {
      setBusy(null)
    }
  }

  const purgeGroup = async (g: ProviderGroup) => {
    const vaultCount = g.members.filter((m) => m.source === 'vault').length
    if (!window.confirm(`Remove ${vaultCount} vault key(s) for ${g.label}? Provider cards will fall back to Worker env secrets (if configured).`)) return
    setBusy(`purge-group-${g.name}`)
    try {
      const res = await fetch('/api/seo-factory/ai-keys?purgeGroup=true', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: g.members.map((m) => m.id) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setNote({ ok: true, text: `${g.label}: removed ${j.purged ?? '?'} vault key(s)` })
      await load()
      onChanged?.()
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Group purge failed' })
    } finally {
      setBusy(null)
    }
  }

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

  const runTest = async (provider: string, apiKey: string, baseUrl: string, model: string) => {
    setBusy(`test-${provider}`)
    setProbe((p) => ({ ...p, [provider]: 'probing…' }))
    try {
      const res = await fetch('/api/seo-factory/ai-keys/test', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
          ...(model.trim() ? { model: model.trim() } : {}),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (j.ok) {
        setProbe((p) => ({
          ...p,
          [provider]: `ok — via ${j.provider}${j.model ? ` · ${j.model}` : ''}${j.reply ? ` — "${String(j.reply).trim()}"` : ''}`,
        }))
        setNote({ ok: true, text: `${provider} replied via ${j.provider}${j.model ? ` · ${j.model}` : ''}` })
      } else {
        setProbe((p) => ({ ...p, [provider]: `failed — ${j.error || 'no reply'}` }))
        setNote({ ok: false, text: `${provider} test failed` })
      }
    } catch (e) {
      setProbe((p) => ({ ...p, [provider]: 'request failed' }))
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Test request failed' })
    } finally {
      setBusy(null)
    }
  }

  const test = (id: string) => {
    const d = draft(id)
    return runTest(id, d.key, d.baseUrl, d.model)
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

  const chatgptOAuthAction = async (action: 'start' | 'poll' | 'disconnect') => {
    setBusy(`chatgpt-oauth-${action}`)
    try {
      const res = await fetch('/api/seo-factory/ai-keys/chatgpt-oauth', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      setChatgptOAuth(j as ChatgptOAuthStatus)
      if (action === 'start') {
        setNote({ ok: true, text: `Open ${j.verificationUri || 'chatgpt.com/login'} and enter ${j.userCode || 'the code'} to connect ChatGPT Plus.` })
        if (j.verificationUriComplete || j.verificationUri) {
          window.open(String(j.verificationUriComplete || j.verificationUri), '_blank', 'noopener,noreferrer')
        }
      } else if (action === 'disconnect') {
        setNote({ ok: true, text: 'ChatGPT Plus disconnected. OpenAI will need a new login or an API key.' })
        await load()
        onChanged?.()
      } else if (j.connected) {
        setNote({ ok: true, text: 'ChatGPT Plus connected. OpenAI is now available in Discover, Brief, Reviewer/Editor, and Command Center.' })
        await load()
        onChanged?.()
      } else if (j.error) {
        setNote({ ok: false, text: String(j.error) })
      }
      return j as ChatgptOAuthStatus
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'ChatGPT login failed' })
      return null
    } finally {
      setBusy(null)
    }
  }

  React.useEffect(() => {
    if (!chatgptOAuth?.pending || chatgptOAuth.connected) return
    const wait = Math.max(2, Number(chatgptOAuth.interval || 5)) * 1000
    const timer = window.setInterval(() => {
      void chatgptOAuthAction('poll')
    }, wait)
    return () => window.clearInterval(timer)
  }, [chatgptOAuth?.pending, chatgptOAuth?.connected, chatgptOAuth?.interval])

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

  const orderedRows = React.useMemo(() => {
    const byId = new Map((rows || []).map((row) => [row.id, row]))
    const knownIds = (rows || []).map((row) => row.id)
    const completeOrder = [...providerOrder, ...knownIds.filter((id) => !providerOrder.includes(id))]
    return completeOrder.map((id) => byId.get(id)).filter(Boolean) as VaultStatusRow[]
  }, [rows, providerOrder])

  // Host-level grouping for the priority list: one row per provider (apex),
  // with its models kept in their current relative order.
  const priorityHosts = React.useMemo<PriorityHost[]>(() => {
    const hostOrder: string[] = []
    const membersByHost = new Map<string, VaultStatusRow[]>()
    for (const r of orderedRows) {
      const host = r.vaultGroup || r.id
      if (!membersByHost.has(host)) {
        membersByHost.set(host, [])
        hostOrder.push(host)
      }
      membersByHost.get(host)!.push(r)
    }
    return hostOrder.map((host) => {
      const members = membersByHost.get(host)!
      return {
        host,
        label: members[0].vaultGroupLabel || members[0].label,
        members,
        source: members.find((m) => m.source !== 'none')?.source || 'none',
      }
    })
  }, [orderedRows])

  const moveHost = (host: string, delta: -1 | 1) => {
    const hosts = priorityHosts.map((h) => h.host)
    const index = hosts.indexOf(host)
    const nextIndex = index + delta
    if (index < 0 || nextIndex < 0 || nextIndex >= hosts.length) return
    const next = [...hosts]
    const [item] = next.splice(index, 1)
    if (item) next.splice(nextIndex, 0, item)
    const flat: string[] = []
    for (const h of next) {
      const members = priorityHosts.find((p) => p.host === h)?.members || []
      for (const m of members) flat.push(m.id)
    }
    setProviderOrder(flat)
  }

  const groups = React.useMemo<ProviderGroup[]>(() => {
    const byGroup = new Map<string, VaultStatusRow[]>()
    for (const r of orderedRows) {
      const g = r.vaultGroup
      if (!g) continue
      const list = byGroup.get(g) || []
      list.push(r)
      byGroup.set(g, list)
    }
    return [...byGroup.entries()].map(([name, members]) => ({
      name,
      label: members[0]?.vaultGroupLabel || name,
      members,
      lead: members.find((m) => m.role === 'primary') || members[0]!,
      configured: members.some((m) => m.configured),
      source: members.find((m) => m.source === 'vault')?.source
        || members.find((m) => m.source === 'env')?.source
        || members[0]?.source
        || 'none',
    }))
  }, [orderedRows])

  const groupedIds = React.useMemo(
    () => new Set(groups.flatMap((g) => g.members.map((m) => m.id))),
    [groups],
  )
  const soloRows = orderedRows.filter((r) => !groupedIds.has(r.id))

  const modelSelectOptions = (m: VaultStatusRow) => {
    const opts = m.modelOptions || []
    const current = draft(m.id).model.trim() || m.model || m.defaultModel
    const list = opts.includes(current) ? opts : [current, ...opts]
    return list.map((o) => <option key={o} value={o}>{o}</option>)
  }

  const saveGroup = async (g: ProviderGroup) => {
    const shared = draft(`group:${g.name}`)
    const hasKey = Boolean(shared.key.trim() || shared.baseUrl.trim())
    const hasModel = g.members.some((m) => draft(m.id).model.trim())
    if (!hasKey && !hasModel) {
      setNote({ ok: false, text: 'Paste an API key (or pick a model) first.' })
      return
    }
    if (g.name === 'parasail' && shared.key.trim() && !/^psk-/i.test(shared.key.trim())) {
      setNote({ ok: false, text: 'Parasail keys start with psk-. Check you copied the full key.' })
      return
    }
    setBusy(`save-group-${g.name}`)
    try {
      for (const m of g.members) {
        const res = await fetch('/api/seo-factory/ai-keys', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: m.id,
            apiKey: shared.key.trim() || undefined,
            baseUrl: shared.baseUrl.trim() || undefined,
            model: draft(m.id).model.trim() || undefined,
          }),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
      }
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[`group:${g.name}`]
        for (const m of g.members) next[m.id] = { key: '', baseUrl: '', model: '' }
        return next
      })
      setNote({ ok: true, text: `${g.label} saved` })
      await load()
      onChanged?.()
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : `${g.label} save failed` })
    } finally {
      setBusy(null)
    }
  }

  const testGroup = (g: ProviderGroup) => {
    const shared = draft(`group:${g.name}`)
    return runTest(g.lead.id, shared.key, shared.baseUrl, draft(g.lead.id).model)
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
          <button type="button" onClick={() => void purgeAll()} disabled={busy === 'purge-all'} style={btn(C.redSoft)}>
            {busy === 'purge-all' ? 'Purging…' : '🗑 Clear all vault keys'}
          </button>
        </div>
      </div>

      {/* Source precedence legend */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        padding: '6px 10px', borderRadius: C.radiusXs, marginBottom: 8,
        background: C.surface2, border: `1px solid ${C.border}`,
        fontSize: 9.5, color: C.textMuted,
      }}>
        <span style={{ fontWeight: 700, color: C.text }}>Key source — which one is actually used:</span>
        <SourceBadge source="vault" />
        <span>wins over</span>
        <SourceBadge source="env" />
        <span>· <strong style={{ color: C.text }}>VAULT</strong> = stored here (Supabase) · <strong style={{ color: C.text }}>ENV</strong> = Worker secret, used only when no vault key · “env also set (shadowed)” = both exist</span>
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
          {priorityHosts.map((h, index) => (
            <div key={h.host} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: C.radiusXs, background: index === 0 ? C.goldSoft : C.surface2, border: `1px solid ${index === 0 ? C.goldBorder : C.border2}` }}>
              <span style={{ width: 20, fontFamily: C.mono, fontSize: 10, color: index === 0 ? C.gold : C.textDim, fontWeight: 800 }}>{index + 1}</span>
              <span style={{ flex: '1 1 140px', minWidth: 140, fontSize: 10, color: C.text, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.label}</span>
              <span style={{ flex: '2 1 auto', minWidth: 0, fontSize: 9, color: C.textDim, fontFamily: C.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {h.members.map((m) => m.model || m.defaultModel).join(' · ')}
              </span>
              <SourceBadge source={h.source} />
              {h.members.some((m) => m.envShadowed) && <ShadowedEnv row={h.members.find((m) => m.envShadowed)!} />}
              <button type="button" onClick={() => moveHost(h.host, -1)} disabled={index === 0} aria-label={`Move ${h.label} up`} style={{ ...btn(), padding: '3px 7px', opacity: index === 0 ? 0.4 : 1 }}>↑</button>
              <button type="button" onClick={() => moveHost(h.host, 1)} disabled={index === priorityHosts.length - 1} aria-label={`Move ${h.label} down`} style={{ ...btn(), padding: '3px 7px', opacity: index === priorityHosts.length - 1 ? 0.4 : 1 }}>↓</button>
            </div>
          ))}
        </div>
      </div>

      {groups.map((g) => {
        const shared = draft(`group:${g.name}`)
        const isBusy = busy === `save-group-${g.name}`
        return (
          <div key={g.name} style={{
            padding: 12, borderRadius: C.radiusSm, marginBottom: 10,
            border: `1px solid ${g.configured ? C.greenBorder : C.goldBorder}`,
            background: g.configured ? C.greenSoft : C.goldSoft,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{g.label}</div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                  One key · {g.members.length} model{g.members.length === 1 ? '' : 's'} — {g.members.map((m) => m.label).join(' · ')}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SourceBadge source={g.source} />
                {g.lead.envShadowed && <ShadowedEnv row={g.lead} />}
                <span style={{ fontSize: 10, fontFamily: C.mono, color: g.configured ? C.green : C.textDim }}>
                  {g.lead.maskedKey || 'no key'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <input
                type="password"
                value={shared.key}
                onChange={(e) => setD(`group:${g.name}`, { key: e.target.value })}
                placeholder={`Paste ${g.lead.envKey}…`}
                style={{ ...input('min(240px, 100%)'), flex: 2, minWidth: 150 }}
              />
              {g.lead.baseUrlEnv && (
                <input
                  value={shared.baseUrl}
                  onChange={(e) => setD(`group:${g.name}`, { baseUrl: e.target.value })}
                  placeholder={g.lead.baseUrl || 'Base URL…'}
                  style={{ ...input('min(180px, 100%)'), flex: 1, minWidth: 120 }}
                />
              )}
            </div>

            <div style={{ display: 'grid', gap: 5, marginBottom: 8 }}>
              {g.members.map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 220px', fontSize: 10, color: C.textMuted, fontWeight: 600, minWidth: 160 }}>
                    {m.role === 'primary' ? 'Lead' : 'Fallback'} · {m.label}
                  </span>
                  <select
                    value={draft(m.id).model.trim() || m.model || m.defaultModel}
                    onChange={(e) => setD(m.id, { model: e.target.value })}
                    style={{ ...input('min(280px, 100%)'), flex: 2, minWidth: 200 }}
                  >
                    {modelSelectOptions(m)}
                  </select>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => void saveGroup(g)} disabled={isBusy} style={btn(C.navy, true)}>
                {isBusy ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => void testGroup(g)} disabled={busy === `test-${g.lead.id}`} style={btn(C.cyan2, true)}>
                {busy === `test-${g.lead.id}` ? '…' : 'Test'}
              </button>
              {g.members.some((m) => m.source === 'vault') && (
                <button type="button" onClick={() => void purgeGroup(g)} disabled={busy === `purge-group-${g.name}`} style={btn(C.redSoft)}>
                  {busy === `purge-group-${g.name}` ? '…' : 'Remove vault keys'}
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Provider rows */}
      <div style={{ display: 'grid', gap: 6, maxHeight: 330, overflow: 'auto', paddingRight: 2 }}>
        {soloRows.map((r) => {
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
                  <SourceBadge source={r.source} label={r.id === 'grok' ? 'SUPERGROK' : r.id === 'openai' ? 'CHATGPT' : 'OAUTH'} />
                  <ShadowedEnv row={r} />
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

              {r.id === 'openai' && (
                <div style={{
                  marginBottom: 8, padding: 8, borderRadius: C.radiusXs,
                  background: C.violetSoft, border: '1px solid #DDD6FE',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.violet, marginBottom: 4 }}>
                    ChatGPT Plus subscription — no API key
                  </div>
                  <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 6, lineHeight: 1.45 }}>
                    Sign in with the ChatGPT Plus (or Pro) account you already pay for.
                    Content Studio stores a refresh token and unlocks the full Plus
                    model lineup — {Array.isArray(chatgptOAuth?.models) && chatgptOAuth!.models.length ? chatgptOAuth!.models.join(' · ') : 'GPT-5.6 Sol · Terra · Luna'} —
                    end to end: Discover, Brief, Reviewer/Editor, and the Command Center.
                  </div>
                  {chatgptOAuth?.pending && chatgptOAuth.userCode && (
                    <div style={{ fontSize: 10, fontFamily: C.mono, color: C.text, marginBottom: 6 }}>
                      Enter code <strong>{chatgptOAuth.userCode}</strong> at{' '}
                      <a href={chatgptOAuth.verificationUriComplete || chatgptOAuth.verificationUri || 'https://chatgpt.com/login'} target="_blank" rel="noreferrer">
                        {chatgptOAuth.verificationUri || 'chatgpt.com/login'}
                      </a>
                      {' '}— waiting for approval…
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => void chatgptOAuthAction('start')}
                      disabled={busy === 'chatgpt-oauth-start' || busy === 'chatgpt-oauth-poll'}
                      style={btn(C.violet, true)}
                    >
                      {chatgptOAuth?.pending ? 'Restart ChatGPT login' : chatgptOAuth?.connected ? 'Reconnect ChatGPT' : 'Connect ChatGPT Plus'}
                    </button>
                    {chatgptOAuth?.pending && (
                      <button type="button" onClick={() => void chatgptOAuthAction('poll')} disabled={busy === 'chatgpt-oauth-poll'} style={btn()}>
                        Check now
                      </button>
                    )}
                    {chatgptOAuth?.connected && (
                      <button type="button" onClick={() => void chatgptOAuthAction('disconnect')} disabled={busy === 'chatgpt-oauth-disconnect'} style={btn(C.redSoft)}>
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
                {r.modelEnv && (r.modelOptions && r.modelOptions.length > 0
                  ? (
                    <select
                      value={d.model.trim() || r.model || r.defaultModel}
                      onChange={(e) => setD(r.id, { model: e.target.value })}
                      style={{ ...input('min(160px, 100%)'), flex: 1, minWidth: 120 }}
                    >
                      {modelSelectOptions(r)}
                    </select>
                  )
                  : (
                    <input
                      value={d.model}
                      onChange={(e) => setD(r.id, { model: e.target.value })}
                      placeholder={`Model (${r.model || r.defaultModel})`}
                      style={{ ...input('min(150px, 100%)'), flex: 1, minWidth: 110 }}
                    />
                  )
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

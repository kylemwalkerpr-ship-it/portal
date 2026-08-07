'use client'
import React from 'react'
import ContentStudioWorkspace, {
  createLog,
  type PrStatus,
  type StudioJob,
  type StudioLogEntry,
} from './content-studio-workspace'

const C = {
  bg: '#F7F8FA', surface: '#FFFFFF', border: 'rgba(0,0,0,0.07)', border2: 'rgba(0,0,0,0.05)',
  cyan: '#1E1B4B', cyan2: '#3C3B6E', cyanSoft: '#EEF2FF',
  gold: '#92400E', goldSoft: '#FEF3C7', goldBorder: '#FDE68A',
  text: '#111827', textMuted: '#6B7280', textDim: '#9CA3AF', textFaint: '#D1D5DB',
  green: '#065F46', greenSoft: '#ECFDF5', greenBorder: '#A7F3D0',
  red: '#991B1B', redSoft: '#FEF2F2', redBorder: '#FECACA',
  orange: '#9A3412', orangeSoft: '#FFF7ED',
  blue: '#1D4ED8', blueSoft: '#EFF6FF', blueBorder: '#BFDBFE',
  violet: '#6D28D9', violetSoft: '#F5F3FF',
  surface2: '#F9F8F6', surface3: '#F4F2EE',
  shadowCard: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)',
  shadowHover: '0 4px 12px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)',
  radius: 12, radiusSm: 8, radiusXs: 6,
}

// ── Provider → default model (mirrors contentAiProvider defaults) ──
const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: 'gpt-5.6-luna',
  custom: 'gpt-5.6-luna',
  grok: 'grok-3',
  deepseek: 'deepseek-chat',
  'nvidia-deepseek': 'deepseek-ai/deepseek-v4-pro',
  'cloudflare-ai': '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.5-flash',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
}

function providerModelLabel(provider?: string | null, model?: string | null): string {
  if (!provider) return '—'
  const resolved = model || DEFAULT_MODEL_BY_PROVIDER[provider]
  return resolved ? `${provider} · ${resolved}` : provider
}

type ShipMode = 'none' | 'pr' | 'autodeploy' | 'auto' | 'merge'
type Tab = 'warroom' | 'autopilot' | 'keywords' | 'factory' | 'opportunities' | 'queue' | 'metrics' | 'health' | 'strategies' | 'controls' | 'crossdomain'

const STUDIO_PREFS_KEY = 'yousafe.contentStudio.prefs.v1'
const WAR_RESOLVED_KEY = 'yousafe.contentStudio.warResolved.v1'

type StudioPrefs = {
  dryRun: boolean
  minAudit: number
  maxRefine: number
  shipMode: ShipMode
  autoMode: 'auto' | 'pr' | 'autodeploy' | 'merge' | 'none'
  skipRecent: boolean
  workspaceOpen: boolean
  confirmApprove: boolean
}

export default function AdminSeoFactory({
  setActionNotice,
}: {
  setActionNotice: (msg: string) => void
}) {
  const [tab, setTab] = React.useState<Tab>('warroom')
  const [topic, setTopic] = React.useState('')
  const [aiProvider, setAiProvider] = React.useState('auto')
  const [primaryKeyword, setPrimaryKeyword] = React.useState('')
  const [region, setRegion] = React.useState('US')
  const [contentType, setContentType] = React.useState('legal_guide')
  const [shipMode, setShipMode] = React.useState<ShipMode>('merge')
  const [indexable, setIndexable] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [plan, setPlan] = React.useState<any>(null)
  const [result, setResult] = React.useState<any>(null)
  const [opps, setOpps] = React.useState<any>(null)
  const [metrics, setMetrics] = React.useState<any>(null)
  const [health, setHealth] = React.useState<any>(null)
  const [crossDomainData, setCrossDomainData] = React.useState<any>(null)
  const [crossDomainBusy, setCrossDomainBusy] = React.useState(false)
  const [jobs, setJobs] = React.useState<any[]>([])
  const [jobQ, setJobQ] = React.useState('')
  const [jobStatusFilter, setJobStatusFilter] = React.useState<string>('all')
  const [jobHostFilter, setJobHostFilter] = React.useState<string>('all')
  const [jobRepoFilter, setJobRepoFilter] = React.useState<string>('all')
  const [selectedJobIds, setSelectedJobIds] = React.useState<Set<string>>(new Set())
  const [queueSummary, setQueueSummary] = React.useState<any>(null)
  const [selectedOpp, setSelectedOpp] = React.useState<Set<string>>(new Set())
  const [opportunityMode, setOpportunityMode] = React.useState<Extract<ShipMode, 'none' | 'pr' | 'autodeploy' | 'merge'>>('none')
  const [autoLimit, setAutoLimit] = React.useState(3)
  const [autoMode, setAutoMode] = React.useState<'auto' | 'pr' | 'autodeploy' | 'merge' | 'none'>('merge')
  const [autoResult, setAutoResult] = React.useState<any>(null)
  const [dryRun, setDryRun] = React.useState(false)
  const [minAudit, setMinAudit] = React.useState(65)
  const [maxRefine, setMaxRefine] = React.useState(3)
  const [skipRecent, setSkipRecent] = React.useState(true)
  const [confirmApprove, setConfirmApprove] = React.useState(true)
  const [regionFilter, setRegionFilter] = React.useState('')
  const [preview, setPreview] = React.useState<string | null>(null)
  const [strategies, setStrategies] = React.useState<any>(null)
  const [strategyDoc, setStrategyDoc] = React.useState<{ title: string; content: string } | null>(null)
  const [kwPlan, setKwPlan] = React.useState<any>(null)
  const [optimalPlan, setOptimalPlan] = React.useState<any>(null)
  const [warRoom, setWarRoom] = React.useState<any>(null)
  const [warPlayFilter, setWarPlayFilter] = React.useState<string>('all')
  const [selectedWar, setSelectedWar] = React.useState<Set<string>>(new Set())
  const [kwLaneFilter, setKwLaneFilter] = React.useState<string>('all')
  const [mixRefresh, setMixRefresh] = React.useState(40)
  const [mixExpand, setMixExpand] = React.useState(35)
  const [mixNew, setMixNew] = React.useState(25)

  // ── Cannibal merge (war room) state ──
  const [mergeOpp, setMergeOpp] = React.useState<any>(null)
  const [mergeWinner, setMergeWinner] = React.useState<string>('')
  const [mergeMode, setMergeMode] = React.useState<'merge' | 'pr'>('merge')
  const [mergeBusy, setMergeBusy] = React.useState(false)
  const [mergeResult, setMergeResult] = React.useState<any>(null)
  const [showCompletedJobs, setShowCompletedJobs] = React.useState(false)
  const [resolvedWarTerms, setResolvedWarTerms] = React.useState<Set<string>>(new Set())
  const [warResolvedHydrated, setWarResolvedHydrated] = React.useState(false)
  const [warRoomAutoRefresh, setWarRoomAutoRefresh] = React.useState(true)
  const [warRoomLastRefreshed, setWarRoomLastRefreshed] = React.useState<Date | null>(null)
  const [briefOpen, setBriefOpen] = React.useState(false)

  // ── Per-action loading + toast feedback ──
  const [actionBusy, setActionBusy] = React.useState<Record<string, boolean>>({})
  const [toast, setToast] = React.useState<{
    type: 'success' | 'error'; message: string; id: number } | null>(null)
  const [toastId, setToastId] = React.useState(0)

  const setActionLoading = (key: string, loading: boolean) => {
    setActionBusy((prev) => (prev[key] === loading ? prev : { ...prev, [key]: loading }))
  }

  const showToast = (type: 'success' | 'error', message: string) => {
    const id = toastId + 1
    setToastId(id)
    setToast({ type, message, id })
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 6000)
  }

  /** Resilient fetch with timeout + abort. Never hang the UI. */
  async function fetchResilient(
    url: string,
    opts: RequestInit & { timeoutMs?: number; actionLabel?: string } = {},
  ): Promise<Response> {
    const { timeoutMs = 210_000, actionLabel, signal, ...init } = opts
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const onExtAbort = () => ctrl.abort()
    signal?.addEventListener('abort', onExtAbort)
    try {
      return await fetch(url, { ...init, signal: ctrl.signal })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        const cancelled = Boolean(signal?.aborted)
        const msg = cancelled
          ? 'Cancelled'
          : `Request timed out after ${Math.round(timeoutMs / 1000)}s — the server may still be processing. Check the queue or refresh.`
        throw new Error(msg)
      }
      throw err
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onExtAbort)
    }
  }

  const actionAbortRefs = React.useRef<Record<string, AbortController | null>>({})
  const withAbort = (key: string): { signal?: AbortSignal } => {
    const ctrl = new AbortController()
    actionAbortRefs.current[key] = ctrl
    return { signal: ctrl.signal }
  }

  // Cleanup abort controllers on unmount
  React.useEffect(() => () => {
    for (const c of Object.values(actionAbortRefs.current)) c?.abort()
  }, [])


  // ── Command-center workspace state ──
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null)
  const [editorContent, setEditorContent] = React.useState('')
  const [logs, setLogs] = React.useState<StudioLogEntry[]>([])
  const [prStatus, setPrStatus] = React.useState<PrStatus | null>(null)
  const [activityLine, setActivityLine] = React.useState<string | null>(null)
  const [workspaceOpen, setWorkspaceOpen] = React.useState(true)
  const [prefsHydrated, setPrefsHydrated] = React.useState(false)

  // Hydrate admin prefs from localStorage
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STUDIO_PREFS_KEY)
      if (!raw) {
        setPrefsHydrated(true)
        return
      }
      const p = JSON.parse(raw) as Partial<StudioPrefs>
      if (typeof p.dryRun === 'boolean') setDryRun(p.dryRun)
      if (typeof p.minAudit === 'number') setMinAudit(p.minAudit)
      if (typeof p.maxRefine === 'number') setMaxRefine(p.maxRefine)
      if (p.shipMode) setShipMode(p.shipMode)
      if (p.autoMode) setAutoMode(p.autoMode)
      if (typeof p.skipRecent === 'boolean') setSkipRecent(p.skipRecent)
      if (typeof p.workspaceOpen === 'boolean') setWorkspaceOpen(p.workspaceOpen)
      if (typeof p.confirmApprove === 'boolean') setConfirmApprove(p.confirmApprove)
    } catch { /* ignore */ }
    setPrefsHydrated(true)
  }, [])

  // Persist war-room resolutions so fixes stay cleared across reloads
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(WAR_RESOLVED_KEY)
      if (raw) setResolvedWarTerms(new Set(JSON.parse(raw) as string[]))
    } catch { /* ignore */ }
    finally {
      // Do not let the first render persist an empty set over saved resolutions.
      setWarResolvedHydrated(true)
    }
  }, [])
  React.useEffect(() => {
    if (!warResolvedHydrated) return
    try {
      localStorage.setItem(WAR_RESOLVED_KEY, JSON.stringify([...resolvedWarTerms]))
    } catch { /* ignore */ }
  }, [warResolvedHydrated, resolvedWarTerms])

  React.useEffect(() => {
    if (!prefsHydrated) return
    try {
      const prefs: StudioPrefs = {
        dryRun,
        minAudit,
        maxRefine,
        shipMode,
        autoMode,
        skipRecent,
        workspaceOpen,
        confirmApprove,
      }
      localStorage.setItem(STUDIO_PREFS_KEY, JSON.stringify(prefs))
    } catch { /* ignore */ }
  }, [prefsHydrated, dryRun, minAudit, maxRefine, shipMode, autoMode, skipRecent, workspaceOpen, confirmApprove])
  const logPersistQueue = React.useRef<StudioLogEntry[]>([])
  const logPersistTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedJobIdRef = React.useRef<string | null>(null)
  const editorContentRef = React.useRef('')
  const selectedJobContentRef = React.useRef<string>('')
  React.useEffect(() => { selectedJobIdRef.current = selectedJobId }, [selectedJobId])
  React.useEffect(() => { editorContentRef.current = editorContent }, [editorContent])

  const flushLogPersist = React.useCallback(async () => {
    const jobId = selectedJobIdRef.current
    const batch = logPersistQueue.current.splice(0, logPersistQueue.current.length)
    if (!jobId || !batch.length) return
    try {
      await fetch('/api/content-studio/jobs', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: jobId, action: 'append_log', entries: batch }),
      })
    } catch {
      /* soft-fail persist */
    }
  }, [])

  const pushLog = React.useCallback((
    level: StudioLogEntry['level'],
    source: string,
    message: string,
    detail?: string,
  ) => {
    const entry = createLog(level, source, message, detail)
    setLogs((prev) => [...prev.slice(-199), entry])
    // Persist to DB when a job is selected (debounced)
    if (selectedJobIdRef.current) {
      logPersistQueue.current.push(entry)
      if (logPersistTimer.current) clearTimeout(logPersistTimer.current)
      logPersistTimer.current = setTimeout(() => { void flushLogPersist() }, 800)
    }
  }, [flushLogPersist])

  const selectedJob = React.useMemo(
    () => (jobs as StudioJob[]).find((j) => j.id === selectedJobId) || null,
    [jobs, selectedJobId],
  )

  React.useEffect(() => {
    selectedJobContentRef.current = selectedJob?.content || ''
  }, [selectedJob?.content, selectedJob?.id])

  const isEditorDirty = React.useCallback(() => {
    if (!selectedJobIdRef.current) return false
    return editorContentRef.current !== (selectedJobContentRef.current || '')
  }, [])

  const selectJob = React.useCallback((id: string) => {
    if (selectedJobIdRef.current && selectedJobIdRef.current !== id && isEditorDirty()) {
      const ok = window.confirm(
        'You have unsaved editor changes. Switch jobs and discard them?',
      )
      if (!ok) return
    }
    setSelectedJobId(id)
    setWorkspaceOpen(true)
    setPrStatus(null)
  }, [isEditorDirty])

  const loadCrossDomain = async (action = 'audit') => {
    setCrossDomainBusy(true)
    try {
      const res = await fetchResilient('/api/seo-factory/cross-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, scope: 'all' }),
        timeoutMs: 120_000,
      })
      const data = await res.json()
      setCrossDomainData(data)
      showToast('success', action === 'audit' ? 'Cross-domain audit complete' : 'Enrichment briefs loaded')
    } catch (err: any) {
      showToast('error', err.message || 'Cross-domain load failed')
    } finally {
      setCrossDomainBusy(false)
    }
  }

  const loadHealth = async () => {
    try {
      const res = await fetch('/api/seo-factory/health', { credentials: 'same-origin' })
      const data = await res.json()
      if (res.ok) setHealth(data)
    } catch { /* ignore */ }
  }

  const loadJobs = React.useCallback(async () => {
    // Skip background polls when tab is hidden (was a major 503 amplifier)
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    const params = new URLSearchParams()
    // Lightweight list (no content body) — full row loaded via ?id=
    params.set('limit', '40')
    if (jobQ) params.set('q', jobQ)
    if (jobStatusFilter && jobStatusFilter !== 'all') params.set('status', jobStatusFilter)
    if (jobHostFilter && jobHostFilter !== 'all') params.set('host', jobHostFilter)
    if (jobRepoFilter && jobRepoFilter !== 'all') params.set('repo', jobRepoFilter)
    const url = `/api/content-studio/jobs?${params}`
    try {
      const res = await fetch(url, { credentials: 'same-origin' })
      // Do not hammer retries on 503 — that worsens Worker overload (CF 1102)
      if (res.status === 503) {
        pushLog('warn', 'jobs', '503 from /jobs — backing off (Worker busy). Will retry on next poll.')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setJobs(data.jobs || [])
        setQueueSummary(data.summary || null)
        // List payload no longer includes content — keep editor until ?id= fetch
      } else if (data.error) {
        pushLog('error', 'jobs', data.error)
      }
    } catch (e) {
      pushLog('error', 'jobs', e instanceof Error ? e.message : 'Failed to load jobs')
    }
  }, [jobQ, jobStatusFilter, jobHostFilter, jobRepoFilter, pushLog])

  // Always keep job list fresh for the workspace queue
  React.useEffect(() => {
    void loadJobs()
  }, [loadJobs])

  // Poll only while truly in-flight (not drafting holds). 4s polls + select(*) caused 503 storms.
  React.useEffect(() => {
    const inflight = jobs.some((j) =>
      ['pending', 'publishing'].includes(String(j.status || '')),
    )
    if (!inflight && !busy) return
    const t = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      void loadJobs()
    }, 12_000)
    return () => clearInterval(t)
  }, [jobs, busy, loadJobs])

  // When selecting a job, load full content + persisted event_log
  React.useEffect(() => {
    if (!selectedJobId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/content-studio/jobs?id=${encodeURIComponent(selectedJobId)}`, {
          credentials: 'same-origin',
        })
        const data = await res.json()
        if (!res.ok || !data.job || cancelled) return
        setJobs((prev) => {
          const others = prev.filter((j) => j.id !== data.job.id)
          return [data.job, ...others]
        })
        setEditorContent(data.job.content || '')
        // Hydrate durable logs for this job (keep session noise, prepend job history)
        const stored: StudioLogEntry[] = Array.isArray(data.job.event_log)
          ? data.job.event_log.map((e: any) => ({
              id: String(e.id || `${e.ts}-h`),
              ts: Number(e.ts) || Date.now(),
              level: (e.level || 'info') as StudioLogEntry['level'],
              source: String(e.source || 'job'),
              message: String(e.message || ''),
              detail: e.detail != null ? String(e.detail) : undefined,
            }))
          : []
        if (stored.length) {
          setLogs((prev) => {
            const ids = new Set(stored.map((s) => s.id))
            const sessionOnly = prev.filter((p) => !ids.has(p.id))
            return [...stored, ...sessionOnly].slice(-200)
          })
        }
        // Don't re-persist the "opened" line as noise — local only
        setLogs((prev) => [
          ...prev.slice(-199),
          createLog('info', 'workspace', `Opened job ${data.job.title || data.job.topic || data.job.id.slice(0, 8)}`),
        ])
      } catch (e) {
        pushLog('error', 'workspace', e instanceof Error ? e.message : 'Failed to open job')
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId])

  const saveJobContent = async () => {
    if (!selectedJobId) return
    setBusy(true)
    setActivityLine('Saving draft…')
    pushLog('info', 'editor', 'Saving draft content')
    try {
      const res = await fetch('/api/content-studio/jobs', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedJobId, action: 'save', content: editorContent }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      if (data.job) {
        setJobs((prev) => prev.map((j) => (j.id === data.job.id ? data.job : j)))
        setEditorContent(data.job.content || editorContent)
      }
      pushLog('success', 'editor', `Draft saved · SEO ${data.audit?.score ?? data.job?.seo_score ?? '—'} · ${data.job?.word_count ?? '—'} words`)
      setActionNotice('Draft saved')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed'
      pushLog('error', 'editor', msg)
      setActionNotice(msg)
    } finally {
      setBusy(false)
      setActivityLine(null)
    }
  }

  const refreshPrStatus = async () => {
    if (!selectedJobId) return
    setBusy(true)
    setActivityLine('Refreshing GitHub PR…')
    pushLog('info', 'github', 'Refreshing PR status from GitHub')
    try {
      const res = await fetch('/api/content-studio/jobs', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedJobId, action: 'refresh_pr' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'PR refresh failed')
      if (data.job) setJobs((prev) => prev.map((j) => (j.id === data.job.id ? data.job : j)))
      setPrStatus(data.prStatus || null)
      if (data.prStatus) {
        const cs = data.prStatus.check_summary
        const ciLine = cs
          ? ` · CI ${cs.state} (${cs.success}/${cs.total} ok, ${cs.failure} fail, ${cs.pending} pending)`
          : ''
        pushLog(
          'success',
          'github',
          `PR #${data.prStatus.number}: ${data.prStatus.merged ? 'merged' : data.prStatus.state}${ciLine}`,
          JSON.stringify({
            state: data.prStatus.state,
            merged: data.prStatus.merged,
            mergeable_state: data.prStatus.mergeable_state,
            check_summary: cs,
            checks: (data.prStatus.checks || []).slice(0, 15),
          }, null, 2),
        )
      } else {
        pushLog('warn', 'github', data.message || 'No PR on this job')
      }
      const notice = data.prStatus
        ? `PR #${data.prStatus.number} · ${data.prStatus.merged ? 'merged' : data.prStatus.state}${
            data.prStatus.check_summary ? ` · CI ${data.prStatus.check_summary.state}` : ''
          }`
        : 'No PR yet'
      setActionNotice(notice)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'PR refresh failed'
      pushLog('error', 'github', msg)
      setActionNotice(msg)
    } finally {
      setBusy(false)
      setActivityLine(null)
    }
  }

  const loadOpps = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/seo-factory/opportunities', { credentials: 'same-origin' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setOpps(data)
    } catch (e) {
      setActionNotice(e instanceof Error ? e.message : 'Opportunities failed')
    } finally {
      setBusy(false)
    }
  }

  const loadMetrics = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/seo-factory/metrics', { credentials: 'same-origin' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setMetrics(data)
    } catch (e) {
      setActionNotice(e instanceof Error ? e.message : 'Metrics failed')
    } finally {
      setBusy(false)
    }
  }

  React.useEffect(() => {
    loadHealth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (tab === 'opportunities' && !opps) loadOpps()
    if (tab === 'metrics' && !metrics) loadMetrics()
    if (tab === 'queue') loadJobs()
    if (tab === 'health') loadHealth()
    if (tab === 'strategies' && !strategies) {
      fetch('/api/seo-factory/strategies?pack=index', { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((d) => { if (d.ok) setStrategies(d.index) })
        .catch(() => {})
    }
    if (tab === 'keywords' && !kwPlan) loadKeywordPlan()
    if (tab === 'warroom' && !warRoom) loadWarRoom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const loadKeywordPlan = async () => {
    setBusy(true)
    try {
      const qs = new URLSearchParams({
        planLimit: '15',
        boardLimit: '80',
        refresh: String(mixRefresh / 100),
        expand: String(mixExpand / 100),
        build_new: String(mixNew / 100),
      })
      if (regionFilter) qs.set('region', regionFilter)
      const res = await fetch(`/api/seo-factory/keyword-plan?${qs}`, { credentials: 'same-origin' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Keyword plan failed')
      setKwPlan(data)
      setActionNotice(data.summary || 'Keyword plan ready')
    } catch (e) {
      setActionNotice(e instanceof Error ? e.message : 'Keyword plan failed')
    } finally {
      setBusy(false)
    }
  }

  const loadWarRoom = async () => {
    setActionLoading('warRoom', true)
    setActivityLine('Building SEO War Room…')
    pushLog('info', 'warroom', 'Build war room (CTR gap · strike · cannibal · AEO)')
    try {
      const res = await fetchResilient('/api/seo-factory/war-room', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        actionLabel: 'warRoom',
        body: JSON.stringify({
          days: 90,
          limit: 50,
          minImpressions: 2,
          regionFilter: regionFilter || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'War room failed')
      setWarRoom(data)
      setWarRoomLastRefreshed(new Date())
      for (const w of data.warnings || []) pushLog('warn', 'warroom', w)
      pushLog(
        'success',
        'warroom',
        data.summary || `War room · ${data.queue?.length || 0} actions`,
        JSON.stringify({ kpis: data.kpis, autoRunTerms: data.autoRunTerms }, null, 2),
      )
      setActionNotice(
        data.kpis?.liveGsc
          ? `War Room ready (live GSC) · ${data.kpis.actionable} plays · ~${data.kpis.estimatedGainClicksSum} est. clicks`
          : `War Room ready (snapshot) · ${data.kpis?.actionable || 0} plays — wire SA for live`,
      )
      showToast('success', data.kpis ? `War room ready · ${data.kpis.actionable || '—'} plays` : 'War room rebuilt')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'War room failed'
      pushLog('error', 'warroom', msg)
      setActionNotice(msg)
      showToast('error', msg)
    } finally {
      setActionLoading('warRoom', false)
      setActivityLine(null)
    }
  }

  const pollWarRoom = React.useCallback(async () => {
    if (!warRoomAutoRefresh) return
    try {
      const res = await fetch('/api/seo-factory/war-room', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days: 90, limit: 50, minImpressions: 2,
          regionFilter: regionFilter || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) return
      // Diff: terms that dropped from GSC between refreshes are truly resolved.
      const newTerms = new Set((data.queue || []).map((o: any) => o.term))
      setResolvedWarTerms((prev) => {
        const next = new Set(prev)
        for (const t of prev) {
          if (!newTerms.has(t)) next.delete(t)
        }
        return next
      })
      setWarRoom(data)
      setWarRoomLastRefreshed(new Date())
    } catch {
      // silent — transient failures during background polling
    }
  }, [warRoomAutoRefresh, warRoom, regionFilter])

  React.useEffect(() => {
    if (tab !== 'warroom' || !warRoomAutoRefresh || !warRoom) return
    const interval = setInterval(pollWarRoom, 300_000) // every 5 minutes
    return () => clearInterval(interval)
  }, [tab, warRoomAutoRefresh, pollWarRoom, warRoom])

  // Execute top plays: always uses the war-room auto-generated play list.
  // Manual term execution is handled by runAutoPilot(terms) directly
  // so callers are never confused about which feed they're shipping.
  const runWarRoomStrike = async () => {
    let feed = (warRoom?.autoRunTerms as string[]) || []
    if (!feed.length) {
      await loadWarRoom()
      try {
        const res = await fetch('/api/seo-factory/war-room', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            days: 90,
            limit: 40,
            minImpressions: 2,
            regionFilter: regionFilter || undefined,
          }),
        })
        const data = await res.json()
        if (res.ok) {
          setWarRoom(data)
          feed = data.autoRunTerms || []
        }
      } catch { /* handled below */ }
    }
    // Filter out terms already resolved in this session (persisted to localStorage)
    feed = feed.filter((t: string) => !resolvedWarTerms.has(t))
    if (!feed.length) {
      setActionNotice('All top plays already shipped — no new terms to execute')
      return
    }
    await runAutoPilot(feed.slice(0, autoLimit))
    setResolvedWarTerms((prev) => {
      const next = new Set(prev)
      for (const t of feed.slice(0, autoLimit)) next.add(t)
      return next
    })
  }

  const toggleWarTerm = (term: string) => {
    setSelectedWar((prev) => {
      const n = new Set(prev)
      if (n.has(term)) n.delete(term)
      else n.add(term)
      return n
    })
  }

  const executeCannibalMerge = async () => {
    if (!mergeOpp || !mergeWinner) return
    setActionLoading('cannibalSingle', true)
    setMergeBusy(true)
    setMergeResult(null)
    try {
      const losers = (mergeOpp.pages || [])
        .map((p: any) => String(p.url || ''))
        .filter((u: string) => u && u !== mergeWinner)
      const res = await fetchResilient('/api/seo-factory/cannibal-merge', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        actionLabel: 'cannibalSingle',
        body: JSON.stringify({
          term: mergeOpp.term,
          winnerUrl: mergeWinner,
          loserUrls: losers,
          mode: mergeMode,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'cannibal merge failed')
      setMergeResult(data)
      setResolvedWarTerms((prev) => new Set(prev).add(mergeOpp.term))
      showToast('success', `Cannibal merge completed → ${mergeWinner.split('/').pop() || mergeWinner}`)
      loadWarRoom()
      pushLog('info', 'warroom', `Cannibal merge "${mergeOpp.term}" → ${mergeWinner}`)
    } catch (e: any) {
      const msg = e.message || String(e)
      setMergeResult({ error: msg })
      showToast('error', msg)
    } finally {
      setMergeBusy(false)
      setActionLoading('cannibalSingle', false)
    }
  }

  const runBatchCannibalMerge = async (terms: string[]) => {
    const q = (warRoom?.queue || []) as Array<any>
    const cannibals = q.filter((o: any) => o.play === 'cannibal_merge' && terms.includes(o.term))
    if (!cannibals.length) {
      setActionNotice('No cannibal plays selected')
      return
    }
    setMergeBusy(true)
    setMergeResult(null)
    setActivityLine(`Batch merging ${cannibals.length} cannibal plays…`)
    pushLog('info', 'warroom', `Batch merge: ${cannibals.length} cannibal plays`)
    const results: Array<{ term: string; ok: boolean; winner?: string; redirects?: number; files?: number; error?: string }> = []
    const resolved: string[] = []
    for (let i = 0; i < cannibals.length; i++) {
      const o = cannibals[i]
      const pages = (o.pages || []) as Array<{ url: string; impressions: number; clicks: number; position: number; ctr: number }>
      // Auto-pick winner = highest impressions
      const winner = [...pages].sort((a, b) => (b.impressions || 0) - (a.impressions || 0))[0]?.url || pages[0]?.url
      if (!winner) {
        results.push({ term: o.term, ok: false, error: 'no pages to merge' })
        continue
      }
      try {
        const losers = pages.map((p) => String(p.url || '')).filter((u) => u && u !== winner)
        const res = await fetch('/api/seo-factory/cannibal-merge', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ term: o.term, winnerUrl: winner, loserUrls: losers, mode: mergeMode }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'cannibal merge failed')
        results.push({
          term: o.term, ok: true, winner,
          redirects: (data.redirectsAdded || []).length,
          files: (data.filesUpdated || []).length,
        })
        resolved.push(o.term)
        pushLog('success', 'warroom', `Merged "${o.term}" → ${winner} (${(data.redirectsAdded || []).length} redirects)`)
      } catch (e: any) {
        results.push({ term: o.term, ok: false, error: e.message || String(e) })
        pushLog('error', 'warroom', `Merge failed "${o.term}": ${e.message || String(e)}`)
      }
    }
    setResolvedWarTerms((prev) => {
      const next = new Set(prev)
      for (const t of resolved) next.add(t)
      return next
    })
    setSelectedWar((prev) => {
      const next = new Set(prev)
      for (const t of resolved) next.delete(t)
      return next
    })
    setMergeResult({ batch: true, okCount: resolved.length, total: cannibals.length, results })
    setActivityLine(null)
    setMergeBusy(false)
    setActionNotice(`Batch merge: ${resolved.length}/${cannibals.length} resolved`)
    loadWarRoom()
  }
  const loadOptimalPlan = async () => {
    setBusy(true)
    setActivityLine('Building optimal GSC × War Room plan…')
    pushLog('info', 'optimal', 'Build optimal plan (war-room + AEO/SEO/GEO + estate)')
    try {
      const res = await fetch('/api/seo-factory/optimal-plan', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planLimit: Math.max(autoLimit * 4, 12),
          boardLimit: 80,
          regionFilter: regionFilter || undefined,
          mixRefresh,
          mixExpand,
          mixNew,
          minImpressions: 2,
          useWarRoom: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Optimal plan failed')
      setOptimalPlan(data)
      if (data.warRoom?.queue) {
        setWarRoom({
          ...(warRoom || {}),
          queue: data.warRoom.queue,
          kpis: data.warRoom.kpis,
          autoRunTerms: data.autoRunTerms,
          summary: data.summary,
          source: data.gscSource,
          siteUrl: data.siteUrl,
          buckets: data.warRoom.buckets
            ? Object.fromEntries(
                Object.entries(data.warRoom.buckets).map(([k, n]) => [k, Array(n as number).fill(null)]),
              )
            : undefined,
        })
      }
      // Mirror into keyword plan UI shape where useful
      setKwPlan({
        source: data.gscSource,
        summary: data.summary,
        mix: data.mix,
        targetMix: data.targetMix,
        plan: data.plan,
        board: data.board,
        warnings: data.warnings,
      })
      for (const w of data.warnings || []) pushLog('warn', 'optimal', w)
      pushLog(
        'success',
        'optimal',
        data.summary || `Optimal plan · ${data.plan?.length || 0} items · GSC ${data.gscSource}`,
        JSON.stringify({ siteUrl: data.siteUrl, autoRunTerms: data.autoRunTerms, stack: data.stack }, null, 2),
      )
      setActionNotice(
        data.gscLive
          ? `Optimal plan ready (live GSC + War Room) · ${data.autoRunTerms?.length || 0} auto-run terms`
          : `Optimal plan ready (snapshot) · ${data.autoRunTerms?.length || 0} terms — wire SA for live`,
      )
      setTab('warroom')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Optimal plan failed'
      pushLog('error', 'optimal', msg)
      setActionNotice(msg)
    } finally {
      setBusy(false)
      setActivityLine(null)
    }
  }

  const runOptimalAutoPilot = async () => {
    let feed = (optimalPlan?.autoRunTerms as string[]) || []
    if (!feed.length) {
      // Build plan first, then run without requiring a second click
      setBusy(true)
      setActivityLine('Building optimal plan then generating…')
      try {
        const res = await fetch('/api/seo-factory/optimal-plan', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planLimit: Math.max(autoLimit * 4, 12),
            regionFilter: regionFilter || undefined,
            mixRefresh,
            mixExpand,
            mixNew,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Optimal plan failed')
        setOptimalPlan(data)
        setKwPlan({
          source: data.gscSource,
          summary: data.summary,
          mix: data.mix,
          targetMix: data.targetMix,
          plan: data.plan,
          board: data.board,
          warnings: data.warnings,
        })
        feed = data.autoRunTerms || []
        pushLog('success', 'optimal', data.summary || 'Optimal plan ready')
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Optimal plan failed'
        pushLog('error', 'optimal', msg)
        setActionNotice(msg)
        setBusy(false)
        setActivityLine(null)
        return
      }
      setBusy(false)
      setActivityLine(null)
    }
    if (!feed.length) {
      setActionNotice('Optimal plan returned no terms')
      return
    }
    await runAutoPilot(feed.slice(0, autoLimit))
  }

  const executeKeywordPlan = async () => {
    setBusy(true)
    setWorkspaceOpen(true)
    setActivityLine('Executing keyword plan…')
    pushLog('info', 'keywords', 'Execute balanced keyword plan')
    try {
      const res = await fetch('/api/seo-factory/keyword-plan', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: autoLimit,
          dryRun,
          shipMode: autoMode === 'none' ? 'none' : autoMode,
          minAuditScore: minAudit,
          maxRefine,
          targetMix: {
            refresh: mixRefresh / 100,
            expand: mixExpand / 100,
            build_new: mixNew / 100,
          },
          lanes: kwLaneFilter === 'all' ? ['refresh', 'expand', 'build_new'] : [kwLaneFilter],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Execute failed')
      setAutoResult({
        source: data.source,
        shipped: data.shipped,
        candidateCount: data.results?.length || 0,
        message: data.message,
        results: data.results,
        avgAuditScore: null,
      })
      const last = (data.results || []).slice().reverse().find((r: any) => r.jobId || r.content)
      if (last?.jobId) selectJob(last.jobId)
      if (last?.content) setEditorContent(last.content)
      for (const r of data.results || []) {
        pushLog(
          r.error ? 'error' : 'success',
          'keywords',
          `${r.lane || r.action || 'item'}: ${r.term || r.keyword || '—'} → ${r.ship?.status || r.status || (r.error ? 'failed' : 'ok')}`,
          r.ship?.prUrl || r.error,
        )
      }
      setActionNotice(data.message || 'Plan executed')
      setTab('autopilot')
      await loadJobs()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Execute failed'
      pushLog('error', 'keywords', msg)
      setActionNotice(msg)
    } finally {
      setBusy(false)
      setActivityLine(null)
    }
  }

  const runPlan = async () => {
    setBusy(true)
    setResult(null)
    setActivityLine('Planning ownership…')
    pushLog('info', 'plan', `Plan · ${primaryKeyword || topic}`)
    try {
      const res = await fetch('/api/seo-factory/plan', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic || primaryKeyword,
          primaryKeyword: primaryKeyword || topic,
          region,
          contentType,
          indexable,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Plan failed')
      setPlan(data)
      pushLog('success', 'plan', `${data.plan.host} → ${data.plan.repo}`, data.plan.filePath)
      setActionNotice(`Plan ready → ${data.plan.host} / ${data.plan.repo}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Plan failed'
      pushLog('error', 'plan', msg)
      setActionNotice(msg)
    } finally {
      setBusy(false)
      setActivityLine(null)
    }
  }

  const runGenerate = async (override?: {
    topic?: string
    keyword?: string
    region?: string
    contentType?: string
    shipMode?: ShipMode
  }) => {
    setBusy(true)
    setWorkspaceOpen(true)
    const t = override?.topic || topic || primaryKeyword
    const k = override?.keyword || primaryKeyword || topic
    const sm = override?.shipMode || shipMode
    setActivityLine(`Generating: ${k || t}…`)
    setEditorContent('') // live stream into empty editor
    setPreview(null)
    pushLog('info', 'generate', `Start stream · ${k || t}`, JSON.stringify({ region: override?.region || region, contentType: override?.contentType || contentType, shipMode: sm }, null, 2))

    const body = {
      topic: t,
      primaryKeyword: k,
      region: override?.region || region,
      contentType: override?.contentType || contentType,
      shipMode: sm === 'auto' ? 'auto' : sm,
      indexable,
      title: t,
      minAuditScore: minAudit,
      maxRefine,
      dryRun,
      aiProvider,
    }

    try {
      // Prefer SSE stream; fall back to classic JSON generate
      let usedStream = false
      try {
        const res = await fetch('/api/seo-factory/generate-stream', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(body),
        })
        const ct = res.headers.get('content-type') || ''
        // OpenNext/CF may omit content-type; treat 200 + body as SSE when Accept requested it
        if (res.ok && res.body && (ct.includes('text/event-stream') || ct.includes('stream') || !ct.includes('application/json'))) {
          usedStream = true
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let streamText = ''
          let currentAttempt = 1
          let finalResult: any = null

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const chunks = buffer.split('\n\n')
            buffer = chunks.pop() || ''
            for (const chunk of chunks) {
              const line = chunk.split('\n').find((l) => l.startsWith('data:'))
              if (!line) continue
              const payload = line.slice(5).trim()
              if (!payload || payload === '[DONE]') continue
              let ev: any
              try { ev = JSON.parse(payload) } catch { continue }

              if (ev.type === 'progress') {
                setActivityLine(ev.message || ev.stage)
                pushLog('info', 'generate', ev.message || ev.stage)
              } else if (ev.type === 'provider') {
                pushLog('debug', 'generate', `Provider ${ev.provider} · ${ev.model}`)
              } else if (ev.type === 'delta') {
                // Reset buffer when a refine attempt starts fresh
                if (ev.attempt && ev.attempt !== currentAttempt) {
                  streamText = ''
                  currentAttempt = ev.attempt
                }
                streamText += ev.text || ''
                setEditorContent(streamText)
                setActivityLine(`Streaming attempt ${currentAttempt}… ${streamText.trim().split(/\s+/).filter(Boolean).length} words`)
              } else if (ev.type === 'attempt') {
                pushLog(
                  ev.goodEnough ? 'success' : 'warn',
                  'audit',
                  `Attempt ${ev.attempt}: SEO ${ev.score} · ${ev.wordCount} words${ev.goodEnough ? ' ✓' : ' (refine)'}`,
                )
              } else if (ev.type === 'ship') {
                if (ev.ship?.prUrl) {
                  pushLog('success', 'github', `PR opened: ${ev.ship.prUrl}`, JSON.stringify(ev.ship, null, 2))
                }
                if (ev.shipError) pushLog('error', 'ship', ev.shipError)
              } else if (ev.type === 'final') {
                finalResult = ev.result
              } else if (ev.type === 'error') {
                throw new Error(ev.error || 'Stream error')
              }
            }
          }

          if (!finalResult) throw new Error('Stream ended without final result')
          const data = finalResult
          setResult(data)
          setPlan({ plan: data.plan, gsc: data.gsc, shipRecommendation: null })
          if (data.content) setEditorContent(data.content)
          if (data.jobId) {
            // Attach stream session logs to the new job, then open it
            selectedJobIdRef.current = data.jobId
            setSelectedJobId(data.jobId)
            setWorkspaceOpen(true)
            setPrStatus(null)
            // Persist recent generate/audit/ship logs onto the job
            setLogs((prev) => {
              const recent = prev.slice(-40)
              logPersistQueue.current.push(...recent)
              void flushLogPersist()
              return prev
            })
          }
          // Keep plan panel aligned with stream result (estate gate + ownership)
          if (data.plan) {
            setPlan({
              plan: data.plan,
              gsc: data.gsc,
              shipRecommendation: data.shipError
                ? { allowed: false, reason: data.shipError }
                : { allowed: true, reason: data.ship?.status || 'ok' },
              shipGate: data.shipGate || null,
            })
          }
          if (data.shipError) {
            pushLog('error', 'ship', data.shipError)
          }
          pushLog(
            data.shipError ? 'warn' : 'success',
            'generate',
            data.ship
              ? `Shipped via ${data.provider} · audit ${data.audit?.score} · ${data.ship.status}`
              : `Generated via ${data.provider} · audit ${data.audit?.score}`,
            data.content ? data.content.slice(0, 500) : undefined,
          )
          setActionNotice(
            data.ship
              ? `Shipped via ${data.provider} (audit ${data.audit?.score}, ${data.attempts || 1} attempt/s): ${data.ship.status}`
              : data.shipError
                ? `Generated (audit ${data.audit?.score}) but ship failed: ${data.shipError}`
                : `Generated via ${data.provider} (audit ${data.audit?.score}, ${data.attempts || 1} attempt/s)`,
          )
          await loadJobs()
        } else if (!res.ok) {
          // Non-stream error JSON
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || `Stream ${res.status}`)
        }
      } catch (streamErr) {
        if (usedStream) throw streamErr
        pushLog('warn', 'generate', `Stream unavailable — classic generate: ${streamErr instanceof Error ? streamErr.message : 'fallback'}`)
      }

      if (!usedStream) {
        const res = await fetch('/api/seo-factory/generate', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok && !data.content) throw new Error(data.error || 'Generate failed')
        setResult(data)
        setPlan({ plan: data.plan, gsc: data.gsc, shipRecommendation: null })
        if (data.content) {
          setEditorContent(data.content)
          setPreview(null)
        }
        if (data.jobId) selectJob(data.jobId)
        if (data.ship?.prUrl) {
          pushLog('success', 'github', `PR opened: ${data.ship.prUrl}`, JSON.stringify(data.ship, null, 2))
        }
        if (data.shipError) pushLog('error', 'ship', data.shipError)
        pushLog(
          data.shipError ? 'warn' : 'success',
          'generate',
          data.ship
            ? `Shipped via ${data.provider} · audit ${data.audit?.score} · ${data.ship.status}`
            : `Generated via ${data.provider} · audit ${data.audit?.score}`,
          data.content ? data.content.slice(0, 500) : undefined,
        )
        setActionNotice(
          data.ship
            ? `Shipped via ${data.provider} (audit ${data.audit?.score}, ${data.attempts || 1} attempt/s): ${data.ship.status}`
            : data.shipError
              ? `Generated (audit ${data.audit?.score}) but ship failed: ${data.shipError}`
              : `Generated via ${data.provider} (audit ${data.audit?.score}, ${data.attempts || 1} attempt/s)`,
        )
        await loadJobs()
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Generate failed'
      pushLog('error', 'generate', msg)
      setActionNotice(msg)
    } finally {
      setBusy(false)
      setActivityLine(null)
      void flushLogPersist()
    }
  }

  const runAutoPilot = async (
    terms?: string[],
    mode: 'auto' | 'pr' | 'autodeploy' | 'merge' | 'none' = autoMode,
  ) => {
    const requestedMode = mode
    setBusy(true)
    setAutoResult(null)
    setWorkspaceOpen(true)
    setActivityLine('Auto-Pilot running…')
    pushLog('info', 'autopilot', `Start auto-run · limit ${terms?.length || autoLimit} · mode ${requestedMode}`)

    const body = JSON.stringify({
      limit: terms?.length || autoLimit,
      shipMode: requestedMode,
      dryRun,
      minAuditScore: minAudit,
      maxRefine,
      skipRecent,
      regionFilter: regionFilter || undefined,
      terms: terms?.length ? terms : undefined,
      useWarRoom: true,
      minImpressions: 2,
      aiProvider,
    })

    // Try SSE streaming first; fall back to classic POST
    let usedStream = false
    try {
      const res = await fetch('/api/seo-factory/auto-run-stream', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body,
      })
      const ct = res.headers.get('content-type') || ''
      if (res.ok && res.body && (ct.includes('text/event-stream') || ct.includes('stream') || !ct.includes('application/json'))) {
        usedStream = true
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let finalData: any = null

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split('\n\n')
          buffer = chunks.pop() || ''
          for (const chunk of chunks) {
            const line = chunk.split('\n').find((l) => l.startsWith('data:'))
            if (!line) continue
            const payload = line.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            let ev: any
            try { ev = JSON.parse(payload) } catch { continue }

            if (ev.type === 'progress') {
              setActivityLine(ev.message || ev.stage)
              if (ev.stage === 'candidate') {
                pushLog('info', 'autopilot', ev.message)
              }
            } else if (ev.type === 'candidate') {
              // Surface each result as it arrives
              pushLog(
                ev.ok === false || ev.error ? 'error' : 'success',
                'autopilot',
                `${ev.term || 'item'} [${ev.index}/${ev.total}]: ${ev.ship?.status || (ev.error ? 'failed' : 'ok')}`,
                ev.error || ev.ship?.prUrl || ev.contentPreview,
              )
              // Open last successful job into editor as candidates complete
              if (ev.jobId && ev.ok) {
                selectJob(ev.jobId)
              }
            } else if (ev.type === 'final') {
              finalData = ev
              setAutoResult(ev)
              setActionNotice(ev.message || `Auto-run: ${ev.shipped}/${ev.candidateCount}`)
              pushLog('success', 'autopilot', ev.message || `Shipped ${ev.shipped}/${ev.candidateCount}`)
            } else if (ev.type === 'error') {
              throw new Error(ev.error || 'Auto-run stream error')
            }
          }
        }

        if (!finalData) throw new Error('Stream ended without final result')
        setMetrics(null)
        await loadJobs()
      } else if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Auto-run stream ${res.status}`)
      }
    } catch (streamErr) {
      if (usedStream) {
        // Stream attempted but failed — report error
        const msg = streamErr instanceof Error ? streamErr.message : 'Auto-run stream failed'
        pushLog('error', 'autopilot', msg)
        setActionNotice(msg)
        setBusy(false)
        setActivityLine(null)
        return
      }
      // Stream unavailable — fall back to classic POST
      pushLog('warn', 'autopilot', `Stream unavailable — falling back to classic request: ${streamErr instanceof Error ? streamErr.message : 'fallback'}`)
    }

    if (!usedStream) {
      try {
        const res = await fetch('/api/seo-factory/auto-run', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Auto-run failed')
        setAutoResult(data)
        // Surface last shipped job into editor
        const last = (data.results || []).slice().reverse().find((r: any) => r.jobId || r.content || r.ship?.prUrl)
        if (last?.jobId) selectJob(last.jobId)
        if (last?.content) setEditorContent(last.content)
        for (const r of data.results || []) {
          pushLog(
            r.ok === false || r.error ? 'error' : 'success',
            'autopilot',
            `${r.term || r.keyword || r.topic || 'item'}: ${r.ship?.status || r.status || (r.error ? 'failed' : 'ok')}`,
            r.error || r.ship?.prUrl || r.contentPreview,
          )
        }
        setActionNotice(data.message || `Auto-run: ${data.shipped}/${data.candidateCount}`)
        pushLog('success', 'autopilot', data.message || `Shipped ${data.shipped}/${data.candidateCount}`)
        setMetrics(null)
        await loadJobs()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Auto-run failed'
        pushLog('error', 'autopilot', msg)
        setActionNotice(msg)
      }
    }

    setBusy(false)
    setActivityLine(null)
  }

  const jobAction = async (
    id: string,
    action: 'reship' | 'regenerate' | 'abandon' | 'approve' | 'merge_pr' | 'monitor' | 'reaudit' | 'duplicate' | 'update_meta',
    extra?: Record<string, unknown>,
  ) => {
    if (action === 'approve' && confirmApprove && !dryRun) {
      const ok = window.confirm(
        dryRun
          ? 'Dry-run approve? (no GitHub write)'
          : 'Approve this job to main?\n\nThis commits/merges to GitHub and triggers Cloudflare deploy for the target estate host.',
      )
      if (!ok) return
    }
    if (action === 'abandon' && !window.confirm('Abandon (close) this job?')) return
    if (action === 'regenerate' && !window.confirm('Regenerate will close this job and create a new one. Continue?')) return

    setBusy(true)
    setActivityLine(`${action}…`)
    pushLog('info', 'jobs', `${action} · ${id.slice(0, 8)}`)
    try {
      // Always attach live editor content for ship/approve/reaudit when this job is open
      const body: Record<string, unknown> = {
        id,
        action,
        shipMode:
          action === 'approve'
            ? 'autodeploy'
            : autoMode === 'none'
              ? 'pr'
              : autoMode === 'auto'
                ? 'merge'
                : autoMode,
        minAuditScore: minAudit,
        maxRefine,
        dryRun: action === 'reship' || action === 'approve' ? dryRun : false,
        ...extra,
      }
      if (id === selectedJobIdRef.current && editorContentRef.current) {
        if (action === 'approve' || action === 'reship' || action === 'reaudit') {
          body.content = editorContentRef.current
        }
      }
      // Persist dirty draft before ship so DB matches editor even if ship fails mid-way
      if (
        (action === 'approve' || action === 'reship') &&
        id === selectedJobIdRef.current &&
        isEditorDirty()
      ) {
        const saveRes = await fetch('/api/content-studio/jobs', {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action: 'save', content: editorContentRef.current }),
        })
        const saveData = await saveRes.json().catch(() => ({}))
        if (!saveRes.ok) throw new Error(saveData.error || 'Save before ship failed')
        if (saveData.job) {
          setJobs((prev) => prev.map((j) => (j.id === saveData.job.id ? saveData.job : j)))
          selectedJobContentRef.current = saveData.job.content || editorContentRef.current
        }
        pushLog('info', 'editor', 'Draft saved before ship')
      }

      const res = await fetch('/api/content-studio/jobs', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      if (data.job) {
        setJobs((prev) => prev.map((j) => (j.id === data.job.id ? data.job : j)))
        if (data.job.id === selectedJobIdRef.current && data.job.content != null && action !== 'approve' && action !== 'reship') {
          // Keep editor for meta/reaudit/duplicate flows when server returns content
          if (action === 'reaudit' || action === 'update_meta') {
            selectedJobContentRef.current = data.job.content || ''
            if (action === 'reaudit' && body.content) {
              /* editor already has content */
            }
          }
        }
      }
      if (data.ship?.prUrl) pushLog('success', 'github', `PR: ${data.ship.prUrl}`, JSON.stringify(data.ship, null, 2))
      if (data.ship?.status === 'deployed' || data.ship?.status === 'merged' || data.merge?.merged) {
        pushLog(
          'success',
          'github',
          data.message || `Merged/deployed · sha ${(data.ship?.mergeCommitSha || data.ship?.commitSha || data.merge?.sha || '').toString().slice(0, 10)}`,
          JSON.stringify(data.ship || data.merge, null, 2),
        )
      }
      if (data.monitor) {
        pushLog(
          data.monitor.ok ? 'success' : data.monitor.checkState === 'pending' ? 'warn' : 'error',
          'monitor',
          data.monitor.message || data.monitor.action,
          data.monitor.diagnosis || JSON.stringify(data.monitor.checks?.slice?.(0, 8), null, 2),
        )
        if (data.monitor.issueUrl) {
          pushLog('warn', 'monitor', `Diagnosis issue: ${data.monitor.issueUrl}`)
        }
      }
      if (data.result?.jobId) selectJob(data.result.jobId)
      if (data.job?.id && action === 'duplicate') selectJob(data.job.id)
      if (data.result?.content) setEditorContent(data.result.content)
      if (data.audit && action === 'reaudit') {
        pushLog('success', 'audit', `Re-audit SEO ${data.audit.score} · ${data.audit.wordCount || data.job?.word_count} words`)
      }
      // After ship/merge, refresh PR status for open workspace job
      if (
        (action === 'approve' || action === 'merge_pr' || action === 'reship') &&
        id === selectedJobIdRef.current &&
        (data.job?.pr_number || data.ship?.prNumber)
      ) {
        setTimeout(() => { void refreshPrStatus() }, 600)
      }
      setActionNotice(
        action === 'abandon'
          ? 'Job closed'
          : action === 'approve'
            ? data.message || (dryRun ? 'Dry-run approve complete' : 'Approved → main')
            : action === 'monitor'
              ? data.monitor?.message || 'Monitor complete'
              : action === 'merge_pr'
                ? data.message || 'PR merged'
                : action === 'reship'
                  ? `Reship: ${data.ship?.status || 'ok'}`
                  : action === 'reaudit'
                    ? `Re-audit: SEO ${data.audit?.score ?? '—'}`
                    : action === 'duplicate'
                      ? 'Job duplicated as draft'
                      : action === 'update_meta'
                        ? 'Meta updated · ownership re-resolved'
                        : `Regenerated → ${data.result?.jobId || 'new job'}`,
      )
      pushLog(
        'success',
        'jobs',
        action === 'abandon'
          ? 'Job closed'
          : action === 'approve'
            ? dryRun ? 'Dry-run approve complete' : 'Approve → main complete'
            : action === 'reship'
              ? `Reship ${data.ship?.status}`
              : action === 'monitor'
                ? 'Monitor finished'
                : action === 'reaudit'
                  ? 'Re-audit complete'
                  : action === 'duplicate'
                    ? 'Duplicated'
                    : action === 'update_meta'
                      ? 'Meta saved'
                      : 'Regenerated',
      )
      await loadJobs()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Job action failed'
      pushLog('error', 'jobs', msg)
      setActionNotice(msg)
    } finally {
      setBusy(false)
      setActivityLine(null)
      void flushLogPersist()
    }
  }

  const bulkAction = async (action: 'bulk_abandon' | 'bulk_monitor' | 'bulk_approve' | 'bulk_reaudit') => {
    const ids = [...selectedJobIds]
    if (!ids.length) {
      setActionNotice('Select jobs in the queue first')
      return
    }
    if (action === 'bulk_approve' && !dryRun) {
      const ok = window.confirm(`Approve ${ids.length} job(s) to main? This writes to GitHub.`)
      if (!ok) return
    }
    if (action === 'bulk_abandon' && !window.confirm(`Abandon ${ids.length} job(s)?`)) return

    setBusy(true)
    setActivityLine(`${action} × ${ids.length}…`)
    pushLog('info', 'bulk', `${action} · ${ids.length} jobs`)
    try {
      const res = await fetch('/api/content-studio/jobs', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids, dryRun }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Bulk action failed')
      pushLog(
        data.failed ? 'warn' : 'success',
        'bulk',
        `${action}: ${data.succeeded}/${data.processed} ok` + (data.failed ? ` · ${data.failed} failed` : ''),
        JSON.stringify(data.results?.slice?.(0, 10), null, 2),
      )
      setActionNotice(data.message || `${action}: ${data.succeeded}/${data.processed} succeeded`)
      setSelectedJobIds(new Set())
      await loadJobs()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bulk failed'
      pushLog('error', 'bulk', msg)
      setActionNotice(msg)
    } finally {
      setBusy(false)
      setActivityLine(null)
    }
  }

  const exportJobsCsv = () => {
    const rows = [
      ['id', 'status', 'title', 'keyword', 'region', 'host', 'repo', 'seo_score', 'words', 'pr_url', 'canonical'],
      ...jobs.map((j) => [
        j.id,
        j.status,
        JSON.stringify(j.title || j.topic || ''),
        JSON.stringify(j.primary_keyword || ''),
        j.region || '',
        j.owner_host || '',
        j.target_repo || '',
        j.seo_score ?? '',
        j.word_count ?? '',
        j.pr_url || '',
        j.canonical_url || '',
      ]),
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `content-jobs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    pushLog('success', 'export', `Exported ${jobs.length} jobs to CSV`)
  }

  const toggleJobSelect = (id: string) => {
    setSelectedJobIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const selectAllVisibleJobs = () => {
    if (selectedJobIds.size === jobs.length) setSelectedJobIds(new Set())
    else setSelectedJobIds(new Set(jobs.map((j) => j.id)))
  }

  const scanMonitor = async () => {
    setBusy(true)
    setActivityLine('Scanning recent deploys…')
    pushLog('info', 'monitor', 'Scan recent jobs for CI/deploy issues')
    try {
      const res = await fetch('/api/seo-factory/monitor', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan: true, limit: 8 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Monitor scan failed')
      pushLog('success', 'monitor', data.message || `Scanned ${data.scanned}`)
      for (const r of data.results || []) {
        pushLog(
          r.checkState === 'failure' ? 'error' : r.checkState === 'pending' ? 'warn' : 'info',
          'monitor',
          `${(r.jobId || '').slice(0, 8)} · ${r.checkState} · ${r.message}`,
          r.issueUrl || r.diagnosis?.slice?.(0, 500),
        )
      }
      setActionNotice(data.message || 'Monitor scan complete')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Monitor scan failed'
      pushLog('error', 'monitor', msg)
      setActionNotice(msg)
    } finally {
      setBusy(false)
      setActivityLine(null)
    }
  }

  const runSelectedOpportunities = async (
    mode = opportunityMode,
  ) => {
    const terms = [...selectedOpp].slice(0, 5)
    if (!terms.length) {
      setActionNotice('Select at least one opportunity first')
      return
    }
    setAutoMode(mode)
    await runAutoPilot(terms, mode)
    setTab('autopilot')
  }

  const openOpportunityInCreate = (o: any) => {
    setTopic(o.term || '')
    setPrimaryKeyword(o.term || '')
    setRegion(o.region || 'US')
    setContentType(o.suggestedContentType || 'legal_guide')
    setShipMode('none')
    setTab('factory')
    setWorkspaceOpen(true)
    setActionNotice(`Create is ready for “${o.term}”. Draft first, then edit, save, re-audit, and ship from the workspace.`)
  }

  const toggleOpp = (term: string) => {
    setSelectedOpp((prev) => {
      const n = new Set(prev)
      if (n.has(term)) n.delete(term)
      else n.add(term)
      return n
    })
  }

  const healthReady = health?.ready

  // ── Command Center navigation: workflow phases → tabs ──
  const NAV_GROUPS: { id: string; label: string; icon: string; items: [Tab, string][] }[] = [
    { id: 'discover', label: 'Discover', icon: '🎯', items: [['warroom', 'War Room'], ['keywords', 'Keywords']] },
    { id: 'create', label: 'Create', icon: '✍️', items: [['autopilot', 'Auto-Pilot'], ['factory', 'Manual']] },
    { id: 'manage', label: 'Manage', icon: '📋', items: [['opportunities', 'Opportunities'], ['queue', 'Job queue']] },
    { id: 'measure', label: 'Measure', icon: '📊', items: [['metrics', 'Metrics'], ['health', 'System']] },
    { id: 'configure', label: 'Configure', icon: '⚙️', items: [['strategies', 'Strategies'], ['controls', 'Controls']] },
  ]
  const tabs: [Tab, string][] = NAV_GROUPS.flatMap((g) => g.items)
  const activeGroup = NAV_GROUPS.find((g) => g.items.some(([it]) => it === tab))

  // Live pipeline counts for the status strip (from the loaded job queue)
  const jobCounts = React.useMemo(() => {
    const c = { inflight: 0, pr: 0, merged: 0, failed: 0, total: jobs.length }
    for (const j of jobs as StudioJob[]) {
      const s = String(j.status || '').toLowerCase()
      if (s === 'drafting' || s === 'publishing' || s === 'pending') c.inflight++
      else if (s === 'pr_created') c.pr++
      else if (s === 'merged') c.merged++
      else if (s === 'failed') c.failed++
    }
    return c
  }, [jobs])

  // ── Action helpers ──
  const navigateToQueue = (statusFilter: string) => {
    setJobStatusFilter(statusFilter)
    setTab('queue')
  }
  const isQualityGateFailure = (msg?: string | null): boolean =>
    !!msg && (msg.includes('Ship refused') || msg.includes('content quality gate') || msg.includes('Same sentence opening repeated'))

  const handleStatusClick = (label: string) => {
    if (label === 'GSC') { setTab('warroom'); if (!warRoom) loadWarRoom(); return }
    const map: Record<string, string> = { 'In flight': 'drafting,publishing,pending', 'PRs open': 'pr_created', Merged: 'merged', Failed: 'failed' }
    const f = map[label]
    if (f) navigateToQueue(f)
  }

  const warQueueFiltered = React.useMemo(() => {
    const q = (warRoom?.queue || []) as Array<Record<string, unknown>>
    const byPlay = warPlayFilter === 'all' ? q : q.filter((o) => o.play === warPlayFilter)
    // Hide terms the admin already resolved (ship play or cannibal merge)
    return byPlay.filter((o: any) => !resolvedWarTerms.has(o.term || ''))
  }, [warRoom, warPlayFilter, resolvedWarTerms])

  // Live KPIs: recompute from the unresolved queue so metrics move as fixes land
  const warKpis = React.useMemo(() => {
    const q = (warRoom?.queue || []) as Array<any>
    const live = q.filter((o: any) => !resolvedWarTerms.has(o.term || ''))
    const gain = live.reduce((s: number, o: any) => s + (Number(o.estimatedGainClicks) || 0), 0)
    const auth = live.length
      ? Math.round(live.reduce((s: number, o: any) => s + (Number(o.authorityScore) || 0), 0) / live.length)
      : 0
    return {
      queriesAnalyzed: warRoom?.kpis?.queriesAnalyzed || 0,
      actionable: live.length,
      estimatedGainClicksSum: Math.round(gain * 10) / 10,
      avgAuthority: auth,
      liveGsc: warRoom?.kpis?.liveGsc,
    }
  }, [warRoom, resolvedWarTerms])

  // Selected cannibal terms (for batch merge) + non-cannibal selected (for auto-pilot)
  const selectedCannibalCount = React.useMemo(() => {
    const q = (warRoom?.queue || []) as Array<any>
    return q.filter((o: any) => o.play === 'cannibal_merge' && selectedWar.has(o.term)).length
  }, [warRoom, selectedWar])
  const selectedStrikeTerms = React.useMemo(() => {
    const q = (warRoom?.queue || []) as Array<any>
    const cannibal = new Set(q.filter((o: any) => o.play === 'cannibal_merge').map((o: any) => o.term))
    return [...selectedWar].filter((t) => !cannibal.has(t))
  }, [warRoom, selectedWar])

  const playLabel = (play: string) => {
    const map: Record<string, string> = {
      title_ctr_rewrite: 'CTR rewrite',
      strike_distance: 'Strike distance',
      deep_demand_build: 'Deep build',
      cannibal_merge: 'Cannibal merge',
      aeo_entity_hub: 'AEO hub',
      page1_defend: 'Page-1 defend',
      decay_refresh: 'Decay refresh',
    }
    return map[play] || play
  }

  const playColor = (play: string) => {
    if (play === 'title_ctr_rewrite') return C.gold
    if (play === 'strike_distance') return C.blue
    if (play === 'deep_demand_build') return C.cyan
    if (play === 'cannibal_merge') return C.red
    if (play === 'aeo_entity_hub') return '#7C3AED'
    if (play === 'page1_defend') return C.green
    return C.textMuted
  }

  const filteredJobsClient = React.useMemo(() => {
    // Server already filters; hide completed (merged/closed) by default.
    // Toggle "Show completed" to reveal them in the queue.
    return (jobs as StudioJob[]).filter(
      (j) => showCompletedJobs || (j.status !== 'merged' && j.status !== 'closed'),
    )
  }, [jobs, showCompletedJobs])

  const openStrategyDoc = async (path: string, title: string) => {
    try {
      const res = await fetch(
        `/api/seo-factory/strategies?pack=doc&path=${encodeURIComponent(path)}`,
        { credentials: 'same-origin' },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load doc')
      setStrategyDoc({ title, content: data.content || '' })
    } catch (e) {
      setActionNotice(e instanceof Error ? e.message : 'Failed to load strategy doc')
    }
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: workspaceOpen ? 'minmax(0, 1fr) minmax(360px, 380px)' : '1fr',
      gap: 0,
      minHeight: 'calc(100vh - 120px)',
      margin: '0 -8px',
    }}>
      {/* ── Toast alerts ── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 80, right: 24, zIndex: 9999, maxWidth: 440,
          padding: '12px 18px', borderRadius: 10, fontSize: 13, lineHeight: 1.5,
          background: toast.type === 'success' ? '#F0FDF4' : '#FEF2F2',
          border: `1.5px solid ${toast.type === 'success' ? '#86EFAC' : '#FECACA'}`,
          color: toast.type === 'success' ? C.green : C.red,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'slideIn 0.25s ease-out',
        }}>
          <span style={{ fontSize: 14 }}>{toast.type === 'success' ? '✓' : '✕'}</span>
          <span style={{ flex: 1 }}>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* ── Left: command surface ── */}
      <div style={{ padding: '16px 20px 20px', width: '100%', maxWidth: 'none', overflow: 'auto', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 8px', fontSize: 26, color: C.cyan, fontWeight: 700 }}>SEO War Room · Command Center</h1>
          <p style={{ margin: '0 0 12px', color: C.textMuted, fontSize: 13, maxWidth: 680 }}>
            <strong>Discover</strong> live GSC demand → <strong>Create</strong> with DeepSeek V4 Pro · CF fallback →
            <strong> Manage</strong> the job queue → <strong>Measure</strong> impact. Every phase is one click away —
            the workspace pane stays open for editor + log.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setWorkspaceOpen((v) => !v)} style={{ ...btnSecondary, background: workspaceOpen ? C.cyan : C.surface, color: workspaceOpen ? '#fff' : C.text, borderColor: workspaceOpen ? C.cyan : C.border }} >
            {workspaceOpen ? '✕ Hide workspace' : '◈ Workspace'}
          </button>
          {health && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.border}`,
              background: healthReady ? '#ECFDF5' : '#FEF3C7', fontSize: 12, minWidth: 140,
            }}>
              <div style={{ fontWeight: 700, color: healthReady ? C.green : C.orange }}>
                {healthReady ? 'System ready' : 'Setup incomplete'}
              </div>
              <div style={{ color: C.textMuted, marginTop: 4 }}>
                {(health.checks || []).filter((c: any) => !c.ok).length} issues · System tab
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Global admin control strip */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        marginBottom: 10, padding: '8px 12px', borderRadius: C.radiusSm,
        background: C.surface2, border: `1px solid ${C.border}`, fontSize: 12,
      }}>
        <strong style={{ color: C.cyan }}>Admin</strong>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.textMuted }}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry-run
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.textMuted }}>
          Min audit
          <select value={minAudit} onChange={(e) => setMinAudit(Number(e.target.value))} style={{ padding: '4px 6px', borderRadius: 6, border: `1px solid ${C.border}` }} title="Min SEO audit score; depth floor (e.g. 1800 words for guides) is always enforced">
            {[55, 65, 70, 80, 85].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.textMuted }}>
          Refine
          <select value={maxRefine} onChange={(e) => setMaxRefine(Number(e.target.value))} style={{ padding: '4px 6px', borderRadius: 6, border: `1px solid ${C.border}` }}>
            {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.textMuted }}>
          Ship
          <select value={shipMode} onChange={(e) => setShipMode(e.target.value as ShipMode)} style={{ padding: '4px 6px', borderRadius: 6, border: `1px solid ${C.border}` }}>
            <option value="merge">merge→main</option>
            <option value="pr">PR</option>
            <option value="autodeploy">main</option>
            <option value="none">none</option>
            <option value="auto">auto</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.textMuted }}>
          <input type="checkbox" checked={confirmApprove} onChange={(e) => setConfirmApprove(e.target.checked)} />
          Confirm approve
        </label>
        <span style={{ color: C.textDim }}>·</span>
        <button type="button" style={btnSmall} disabled={busy} onClick={() => loadJobs()}>Refresh jobs</button>
        <button type="button" style={btnSmall} disabled={busy} onClick={() => scanMonitor()}>Monitor scan</button>
        <button type="button" style={btnSmall} onClick={() => setTab('controls')}>All controls…</button>
        {selectedJobIds.size > 0 && (
          <span style={{ color: C.gold, fontWeight: 700 }}>{selectedJobIds.size} selected</span>
        )}
      </div>

      {busy && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 8,
          background: '#EFF6FF', border: '1px solid #BFDBFE', color: C.blue, fontSize: 13, fontWeight: 600,
        }}>
          {activityLine || 'Working…'} — watch the workspace editor & debug log for output.
        </div>
      )}

      {/* ── Command Center: live status strip ── */}
      <div style={{
        display: 'grid', gap: 10, marginBottom: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
      }}>
        {[
          { label: 'In flight', value: jobCounts.inflight, color: C.orange },
          { label: 'PRs open', value: jobCounts.pr, color: C.blue },
          { label: 'Merged', value: jobCounts.merged, color: C.green },
          { label: 'Failed', value: jobCounts.failed, color: C.red },
          { label: 'GSC', value: warRoom?.kpis?.liveGsc ? 'LIVE' : '—', color: warRoom?.kpis?.liveGsc ? C.green : C.textDim },
        ].map((k) => (
          <div key={k.label} onClick={() => handleStatusClick(k.label)} title={'Click to filter queue: ' + k.label} style={{
            padding: '10px 12px', borderRadius: 10, background: C.surface,
            border: `1px solid ${C.border}`, cursor: 'pointer',
          }}>
            <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color, marginTop: 2 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── Quick actions ── */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14,
        padding: '10px 12px', borderRadius: 10, background: C.surface2,
        border: `1px solid ${C.border}`, fontSize: 12,
      }}>
        <strong style={{ color: C.cyan }}>Quick start</strong>
        <button type="button" style={btnPrimary} disabled={busy} onClick={() => { setTab('warroom'); if (!warRoom) loadWarRoom() }}>
          🎯 Open War Room
        </button>
        <button type="button" style={{ ...btnPrimary, background: C.gold, color: '#0B1220' }} disabled={busy} onClick={() => loadOptimalPlan()}>
          🧭 Optimal GSC plan
        </button>
        <button type="button" style={btnSecondary} onClick={() => setTab('autopilot')}>
          🤖 Auto-Pilot
        </button>
        <button type="button" style={btnSecondary} onClick={() => setTab('factory')}>
          ✍️ Manual generate
        </button>
        <button type="button" style={btnSecondary} onClick={() => { setTab('queue'); loadJobs() }}>
          📋 Job queue
        </button>
        <button type="button" style={btnSecondary} disabled={busy} onClick={() => scanMonitor()}>
          📡 Monitor scan
        </button>
        <span style={{ marginLeft: 'auto', color: C.textDim }}>
          {activeGroup ? `${activeGroup.icon} ${activeGroup.label} · ` : ''}
          {tabs.find(([t]) => t === tab)?.[1]}
        </span>
      </div>

      {/* ── Phase-grouped navigation ── */}
      <div style={{ display: 'grid', gap: 8, marginBottom: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {NAV_GROUPS.map((g) => {
          const groupActive = g.items.some(([t]) => t === tab)
          return (
            <div key={g.id} style={{
              border: `1px solid ${groupActive ? C.gold : C.border}`,
              borderRadius: 12, padding: 10, background: groupActive ? '#FFFBEB' : C.surface,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: groupActive ? C.gold : C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                {g.icon} {g.label}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {g.items.map(([t, label]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    style={{
                      background: tab === t ? C.cyan : 'transparent',
                      color: tab === t ? '#fff' : C.textMuted,
                      border: tab === t ? 'none' : `1px solid ${C.border}`,
                      borderRadius: 7, padding: '5px 10px', cursor: 'pointer',
                      fontWeight: tab === t ? 600 : 400, fontSize: 12,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Keywords research + plan ── */}
      {tab === 'keywords' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: 24, borderTop: `4px solid ${C.blue}`,
          }}>
            <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              GSC demand · ownership · balance
            </div>
            <h2 style={{ margin: '8px 0', fontSize: 20, color: C.cyan }}>Keyword research & planning</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: C.textMuted, lineHeight: 1.55, maxWidth: 720 }}>
              Pulls live Search Console (or snapshot), classifies every query into
              <strong> refresh</strong> (pos 4–20 weak CTR), <strong>expand</strong> (deep rank + owner),
              or <strong>build new</strong> (demand without owner), then builds a balanced editorial plan
              so we ship refreshing content alongside net-new — never only greenfield.
            </p>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', marginBottom: 14 }}>
              <label style={labelStyle}>
                Refresh %
                <input type="number" min={0} max={100} value={mixRefresh} onChange={(e) => setMixRefresh(Number(e.target.value))} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Expand %
                <input type="number" min={0} max={100} value={mixExpand} onChange={(e) => setMixExpand(Number(e.target.value))} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                New %
                <input type="number" min={0} max={100} value={mixNew} onChange={(e) => setMixNew(Number(e.target.value))} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Region
                <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} style={inputStyle}>
                  <option value="">All</option>
                  {['US', 'UK', 'CA', 'AU'].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Lane filter
                <select value={kwLaneFilter} onChange={(e) => setKwLaneFilter(e.target.value)} style={inputStyle}>
                  <option value="all">All actionable</option>
                  <option value="refresh">Refresh only</option>
                  <option value="expand">Expand only</option>
                  <option value="build_new">New only</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy} onClick={loadKeywordPlan} style={btnPrimary}>
                {busy ? 'Researching…' : 'Run research + plan'}
              </button>
              <button type="button" disabled={busy || !kwPlan?.plan?.length} onClick={executeKeywordPlan} style={btnSecondary}>
                Execute top {autoLimit} from plan
              </button>
            </div>
            {kwPlan?.summary && (
              <p style={{ margin: '14px 0 0', fontSize: 13, color: C.textMuted }}>{kwPlan.summary}</p>
            )}
          </div>

          {kwPlan && (
            <>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))' }}>
                {[
                  ['Refresh', kwPlan.mix?.refresh, C.orange],
                  ['Expand', kwPlan.mix?.expand, C.blue],
                  ['New', kwPlan.mix?.build_new, C.green],
                  ['Monitor', kwPlan.mix?.monitor, C.textDim],
                  ['Defer', kwPlan.mix?.defer, C.red],
                ].map(([label, n, color]) => (
                  <div key={String(label)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 11, color: C.textDim }}>{label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: color as string }}>{n ?? 0}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                <h3 style={{ margin: '0 0 10px', color: C.cyan }}>Editorial plan (AEO / SEO / GEO authority)</h3>
                <div style={{ display: 'grid', gap: 8 }}>
                  {(kwPlan.plan || []).map((p: any) => (
                    <div key={p.term} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <strong>#{p.priority} {p.term}</strong>
                        <span style={{
                          color: p.lane === 'refresh' ? C.orange : p.lane === 'expand' ? C.blue : C.green,
                          fontWeight: 600, textTransform: 'uppercase', fontSize: 10,
                        }}>{p.lane} · auth {p.authorityScore ?? '—'} · {p.shipHint || 'pr'}</span>
                      </div>
                      <div style={{ color: C.textMuted, marginTop: 4 }}>
                        {p.impressions} imp · pos {Number(p.position).toFixed(1)} · CTR {(p.ctr * 100).toFixed(2)}%
                        · {p.host} → {p.repo}
                        {p.contentAngle ? ` · angle: ${p.contentAngle}` : ''}
                      </div>
                      <div style={{ color: C.textDim, marginTop: 2 }}>{p.rationale}</div>
                      {p.writeHint && (
                        <div style={{ color: C.cyan, marginTop: 4, fontSize: 11 }}>{p.writeHint}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                <h3 style={{ margin: '0 0 10px', color: C.cyan }}>
                  Research board · GSC {kwPlan.source} · {kwPlan.board?.length || 0} keywords
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: C.textDim }}>
                        <th style={th}>Keyword</th>
                        <th style={th}>Lane</th>
                        <th style={th}>Imp</th>
                        <th style={th}>Pos</th>
                        <th style={th}>CTR</th>
                        <th style={th}>Host</th>
                        <th style={th}>Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(kwPlan.board || [])
                        .filter((b: any) => kwLaneFilter === 'all' || b.lane === kwLaneFilter || (kwLaneFilter === 'all' && true))
                        .filter((b: any) => kwLaneFilter === 'all' ? true : b.lane === kwLaneFilter)
                        .slice(0, 60)
                        .map((b: any) => (
                          <tr key={b.term} style={{ borderTop: `1px solid ${C.border}` }}>
                            <td style={td}>{b.term}</td>
                            <td style={td}>{b.lane}</td>
                            <td style={td}>{b.impressions}</td>
                            <td style={td}>{Number(b.position).toFixed(1)}</td>
                            <td style={td}>{(b.ctr * 100).toFixed(2)}%</td>
                            <td style={td}>{b.owner?.host}</td>
                            <td style={{ ...td, maxWidth: 220, color: C.textMuted }}>{b.laneReason}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── War Room ── */}
      {tab === 'warroom' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: C.radiusSm,
            padding: '14px 16px', borderLeft: `3px solid ${C.gold}`, boxShadow: C.shadowCard,
          }}>
            <div style={{ fontSize: 10, color: C.gold, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>Technician engine · Auto 12:00 EAT</div>
            <h2 style={{ margin: '6px 0 4px', fontSize: 18, color: C.cyan, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>SEO War Room</h2>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: C.textMuted, lineHeight: 1.6, maxWidth: 680 }}>
              Rank what to ship by <strong>estimated ranking gain</strong>, not raw impressions.
              Noise (brand, meal-plan spam, thin garbage) is filtered. Plays drive generation prompts:
              title/CTR rewrites for positions 4–15, strike-distance expands for page-2, AEO entity hubs
              for answer engines, cannibal merges when multi-URL.
              <br />
              <strong style={{ color: C.cyan }}>Auto:</strong> every day at <strong>12:00 Africa/Nairobi</strong> the
              top <strong>5</strong> wins generate → quality gates → merge, then email a work log with live URLs.
            </p>
            {warRoom?.dailyAutomation?.lastRun && (
              <div style={{
                marginBottom: 14, padding: 12, borderRadius: 8, fontSize: 12,
                background: '#ECFDF5', border: `1px solid ${C.border}`, color: C.textMuted, lineHeight: 1.5,
              }}>
                <strong style={{ color: C.green }}>Last daily run</strong>
                {' · '}{warRoom.dailyAutomation.lastRun.scheduledFor || '—'}
                {' · '}shipped {warRoom.dailyAutomation.lastRun.shippedCount}
                {' · '}failed {warRoom.dailyAutomation.lastRun.failedCount}
                <div style={{ marginTop: 6, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                  {(warRoom.dailyAutomation.lastRun.reportUrls || []).slice(0, 5).join(' · ') || 'No URLs yet'}
                </div>
              </div>
            )}

            {/* ── Command strip — Play | Region | Refresh + Last sync on one line ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: C.radiusSm, background: C.surface, marginBottom: 10, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textDim, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: warRoom?.kpis?.liveGsc ? C.green : C.gold, display: 'inline-block' }} /> War Room controls
              </span>
              <span style={{ width: 1, height: 18, background: C.border, display: 'inline-block' }} />
              <label style={{ ...labelStyle, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                Play filter
                <select value={warPlayFilter} onChange={(e) => setWarPlayFilter(e.target.value)} style={{ ...inputStyle, marginTop: 0, width: 'auto', minWidth: 140, fontSize: 12, padding: '6px 8px' }}>
                  <option value="all">All plays</option>
                  <option value="title_ctr_rewrite">CTR rewrite</option>
                  <option value="strike_distance">Strike distance</option>
                  <option value="deep_demand_build">Deep build</option>
                  <option value="page1_defend">Page-1 defend</option>
                  <option value="aeo_entity_hub">AEO hub</option>
                  <option value="cannibal_merge">Cannibal merge</option>
                </select>
              </label>
              <label style={{ ...labelStyle, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                Region
                <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} style={{ ...inputStyle, marginTop: 0, width: 'auto', minWidth: 90, fontSize: 12, padding: '6px 8px' }}>
                  <option value="">All</option>
                  {['US', 'UK', 'CA', 'AU'].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <button type="button" disabled={!!actionBusy['warRoom']} onClick={() => loadWarRoom()} style={{ ...btnPrimary, background: C.gold, color: '#fff', border: `1px solid ${C.gold}`, opacity: actionBusy['warRoom'] ? 0.7 : 1, cursor: actionBusy['warRoom'] ? 'not-allowed' : 'pointer', padding: '7px 14px', fontSize: 12, boxShadow: '0 2px 8px rgba(146,64,14,0.22)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {actionBusy['warRoom'] && <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#0B1220', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
                  {actionBusy['warRoom'] ? 'Scanning GSC…' : 'Refresh'}
                </span>
              </button>
              {warRoomLastRefreshed ? (
                <span style={{ fontSize: 11, color: C.textDim, fontFamily: 'ui-monospace, monospace', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Last sync {Math.round((Date.now() - warRoomLastRefreshed.getTime()) / 60_000)}m ago
                </span>
              ) : (
                <span style={{ fontSize: 11, color: C.textDim }}>— no sync yet</span>
              )}
              <label style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 5, color: C.textMuted, marginLeft: 'auto', cursor: 'pointer' }}>
                <input type="checkbox" checked={warRoomAutoRefresh} onChange={() => setWarRoomAutoRefresh((v) => !v)} /> Auto-refresh
              </label>
              {warRoom?.siteUrl && <span style={{ fontSize: 11, color: C.textDim, fontFamily: 'ui-monospace, monospace', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={warRoom.siteUrl}>{warRoom.siteUrl.replace(/^https?:\/\//,'')}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <button type="button" disabled={!!actionBusy['warStrikeTop']} onClick={() => runWarRoomStrike()} style={{ ...btnPrimary, opacity: actionBusy['warStrikeTop'] ? 0.7 : 1, cursor: actionBusy['warStrikeTop'] ? 'not-allowed' : 'pointer' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {actionBusy['warStrikeTop'] && <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
                  {actionBusy['warStrikeTop'] ? 'Executing…' : dryRun ? `Dry-run top × ${autoLimit}` : `Execute top plays × ${autoLimit}`}
                </span>
              </button>
              <button
                type="button"
                disabled={!!actionBusy['warStrikeSelected'] || selectedStrikeTerms.length === 0}
                onClick={() => runAutoPilot(selectedStrikeTerms)}
                style={{ ...btnSecondary, cursor: actionBusy['warStrikeSelected'] || selectedStrikeTerms.length === 0 ? 'not-allowed' : 'pointer', opacity: actionBusy['warStrikeSelected'] ? 0.7 : 1 }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {actionBusy['warStrikeSelected'] && <span style={{ display: 'inline-block', width: 10, height: 10, border: '1.5px solid rgba(37,99,235,0.3)', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
                  {actionBusy['warStrikeSelected'] ? 'Shipping…' : `Run selected (${selectedStrikeTerms.length})`}
                </span>
              </button>
              <button
                type="button"
                disabled={!!actionBusy['batchCannibal'] || selectedCannibalCount === 0}
                onClick={() => runBatchCannibalMerge([...selectedWar])}
                style={{ ...btnSecondary, borderColor: C.red, color: C.red, cursor: actionBusy['batchCannibal'] || selectedCannibalCount === 0 ? 'not-allowed' : 'pointer', opacity: actionBusy['batchCannibal'] ? 0.7 : 1 }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {actionBusy['batchCannibal'] && <span style={{ display: 'inline-block', width: 10, height: 10, border: '1.5px solid rgba(220,38,38,0.3)', borderTopColor: C.red, borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
                  {actionBusy['batchCannibal'] ? 'Merging…' : `Merge selected (${selectedCannibalCount})`}
                </span>
              </button>
              <button type="button" disabled={!!actionBusy['optimalPlan']} onClick={() => loadOptimalPlan()} style={{ ...btnSecondary, cursor: actionBusy['optimalPlan'] ? 'not-allowed' : 'pointer', opacity: actionBusy['optimalPlan'] ? 0.7 : 1 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {actionBusy['optimalPlan'] && <span style={{ display: 'inline-block', width: 10, height: 10, border: '1.5px solid rgba(37,99,235,0.3)', borderTopColor: C.blue, borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
                  {actionBusy['optimalPlan'] ? 'Building…' : 'Full optimal stack'}
                </span>
              </button>
            </div>

            {warRoom?.kpis && (
              <>
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 8 }}>
                  {[
                    { label: 'Queries analyzed', value: warKpis.queriesAnalyzed, sub: `${warRoom.rangeDays || 90}d window · live`, accent: '#0B1220' },
                    { label: 'Actionable plays', value: warKpis.actionable, sub: warRoom?.kpis?.liveGsc ? `live · ${warPlayFilter !== 'all' ? playLabel(warPlayFilter) : 'all plays'}` : 'snapshot — refresh for live', accent: C.gold },
                    { label: 'Est. click gain', value: `~${warKpis.estimatedGainClicksSum}`, sub: 'if top half wins — per period', accent: C.green },
                  ].map((k) => (
                    <div key={k.label} style={{ padding: '11px 12px', borderRadius: C.radiusSm, background: C.surface, border: `1px solid ${C.border}`, borderTop: `3px solid ${k.accent}`, boxShadow: C.shadowCard }}>
                      <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>{k.label}</span><span style={{ fontSize: 11 }}>{k.label === 'Queries analyzed' ? '◈' : k.label === 'Actionable plays' ? '⚑' : '↗'}</span></div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: C.cyan, marginTop: 4, letterSpacing: '-0.02em' }}>{k.value}</div>
                      <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 3, lineHeight: 1.3 }}>{k.sub}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 12 }}>
                  {[
                    { k: 'Avg authority', v: `${warKpis.avgAuthority}/100`, s: 'AEO/SEO/GEO' },
                    { k: 'GSC', v: warKpis.liveGsc ? 'LIVE' : 'snapshot', s: warRoomLastRefreshed ? `${Math.round((Date.now()-warRoomLastRefreshed.getTime())/60000)}m ago` : '—' },
                    { k: 'Window', v: `${warRoom.rangeDays || 90}d`, s: warRoom.siteUrl ? 'sc-domain' : 'not set' },
                  ].map((c) => (
                    <div key={c.k} style={{ borderRadius: C.radiusSm, border: `1px solid ${C.border2}`, background: C.surface2, padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 9, letterSpacing: '0.06em', fontWeight: 700, textTransform: 'uppercase', color: C.textDim }}>{c.k}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{c.v}</span>
                      <span style={{ fontSize: 10, color: C.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.s}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {warRoom?.summary && (
              <div style={{ marginBottom: 10, borderRadius: C.radiusSm, border: `1px solid ${warRoom.kpis?.liveGsc ? C.greenBorder : C.goldBorder}`, background: warRoom.kpis?.liveGsc ? C.greenSoft : C.goldSoft, overflow: 'hidden' }}>
                <button type="button" onClick={() => setBriefOpen((v) => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: warRoom.kpis?.liveGsc ? '#065F46' : '#92400E', display: 'inline-flex', alignItems: 'center', gap: 6 }}>Strategy brief</span>
                  <span style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace', padding: '2px 6px', borderRadius: 999, background: '#0B1220', color: '#fff' }}>{warRoom.kpis?.liveGsc ? 'LIVE' : 'snapshot'}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: warRoom.kpis?.liveGsc ? '#065F46' : '#92400E', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{briefOpen ? 'Hide' : 'Expand'} <span style={{ transform: briefOpen ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▾</span></span>
                </button>
                {briefOpen && (
                  <div style={{ padding: '0 12px 12px', display: 'grid', gap: 8 }}>
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                      <div style={{ borderRadius: C.radiusSm, border: `1px solid ${C.border}`, background: C.surface, padding: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textDim, marginBottom: 6 }}>What we found</div>
                        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{warRoom.summary?.slice(0, 260)}{(warRoom.summary?.length||0)>260?'…':''} · {warKpis.queriesAnalyzed} queries → {warKpis.actionable} actions · CTR {Array.isArray(warRoom.buckets?.title_ctr_rewrite)?warRoom.buckets.title_ctr_rewrite.length:warRoom.buckets?.title_ctr_rewrite||0}, strike {Array.isArray(warRoom.buckets?.strike_distance)?warRoom.buckets.strike_distance.length:warRoom.buckets?.strike_distance||0}, cannibal {Array.isArray(warRoom.buckets?.cannibal_merge)?warRoom.buckets.cannibal_merge.length:warRoom.buckets?.cannibal_merge||0}, AEO {Array.isArray(warRoom.buckets?.aeo_entity_hub)?warRoom.buckets.aeo_entity_hub.length:warRoom.buckets?.aeo_entity_hub||0} · est. ~{warKpis.estimatedGainClicksSum}/period · authority {warKpis.avgAuthority}/100.</div>
                        {warRoom.siteUrl && <div style={{ marginTop: 6, fontFamily: 'ui-monospace, monospace', fontSize: 10, color: C.textDim, wordBreak: 'break-all' }}>{warRoom.siteUrl}</div>}
                      </div>
                      <div style={{ borderRadius: C.radiusSm, border: `1px solid ${C.border}`, background: C.surface, padding: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textDim, marginBottom: 6 }}>What to do</div>
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                          <li><strong>Win page-1 CTR first</strong> — fastest ranking signal (positions 4–15).</li>
                          <li><strong>Then strike-distance</strong> (11–20 → page 1) → expand &amp; interlink.</li>
                          <li><strong>Then entity hubs for AEO/GEO</strong> — never ship noise meal-plan queries.</li>
                        </ul>
                      </div>
                      <div style={{ borderRadius: C.radiusSm, border: `1px solid ${C.border}`, background: C.surface, padding: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textDim, marginBottom: 6 }}>Why</div>
                        <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>Keyword lanes: refresh 2 · expand 6 · new 10 · monitor 3 · defer 40. Authority AEO/SEO/GEO avg ~{warKpis.avgAuthority}/100 — prioritize discipline entities, Q&amp;A intent, LLM-citable structure, cluster fill over thin demand. Ship default for high-authority items: merge→main (Cloudflare autodeploy). Executable feed: war-room first, lanes fill gaps. {warRoomLastRefreshed ? `Snapshot ${Math.round((Date.now()-warRoomLastRefreshed.getTime())/60000)}m ago.` : ''}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {warRoom?.buckets && typeof warRoom.buckets.title_ctr_rewrite === 'object' && (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: C.radiusSm, overflow: 'hidden', marginBottom: 12, background: C.surface, boxShadow: C.shadowCard }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.text }}>Action board</span>
                  <span style={{ fontSize: 10, color: C.textDim, fontFamily: 'ui-monospace, monospace' }}>Click a row to filter · counts decrement live after merge</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: `1px solid ${C.border}`, color: C.textMuted, background: C.surface2, fontSize: 11 }}>
                        <th style={{ ...th, padding: '8px 10px' }}>Play</th>
                        <th style={{ ...th, padding: '8px 10px' }}>Count</th>
                        <th style={{ ...th, padding: '8px 10px' }}>Intent</th>
                        <th style={{ ...th, padding: '8px 10px', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        { id: 'title_ctr_rewrite', label: 'CTR rewrite', intent: 'Low CTR on page 1 — rewrite title/meta', color: C.gold },
                        { id: 'strike_distance', label: 'Strike distance', intent: 'Positions 11–20 — push to page 1', color: C.blue },
                        { id: 'deep_demand_build', label: 'Deep build', intent: 'Beyond p2 — new entity content', color: C.cyan },
                        { id: 'page1_defend', label: 'Page-1 defend', intent: 'Top 5 — protect & expand', color: C.green },
                        { id: 'aeo_entity_hub', label: 'AEO hub', intent: 'Question intent — LLM-citable hubs', color: '#7C3AED' },
                        { id: 'cannibal_merge', label: 'Cannibal merge', intent: 'Duplicate stems — merge & redirect', color: C.red },
                      ] as const).map((r) => {
                        const liveCount = (warRoom.queue as any[]).filter((o:any)=>o.play===r.id && !resolvedWarTerms.has(o.term||'')).length
                        const active = warPlayFilter === r.id
                        return (
                          <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}`, background: active ? '#FFFBEB' : 'transparent' }}>
                            <td style={{ ...td, padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: r.color, marginRight: 6, verticalAlign: 'middle' }} />{r.label}</td>
                            <td style={{ ...td, padding: '8px 10px' }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 28, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'ui-monospace, monospace', background: active ? '#0B1220' : C.surface2, color: active ? '#fff' : C.text, border: `1px solid ${active ? '#0B1220' : C.border}` }}>{liveCount}</span></td>
                            <td style={{ ...td, padding: '8px 10px', color: C.textMuted, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.intent}</td>
                            <td style={{ ...td, padding: '8px 10px', textAlign: 'right' }}>
                              <button type="button" onClick={() => setWarPlayFilter(active ? 'all' : r.id)} style={{ ...(active ? btnPrimary : btnSecondary), padding: '5px 10px', fontSize: 11, borderColor: active ? '#0B1220' : C.border, background: active ? '#0B1220' : '#fff', color: active ? '#fff' : C.text }}>
                                {active ? 'Clear' : `View ${liveCount}`}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '6px 10px', background: C.surface2, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim, lineHeight: 1.5 }}>Tip: The queue below filters instantly. Merging or executing a term removes it from the count via live state — no refresh needed.</div>
              </div>
            )}

            {!warRoom && !busy && (
              <div style={{ color: C.textMuted, fontSize: 13 }}>Load War Room to rank live GSC opportunities.</div>
            )}

            {warQueueFiltered.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: `1px solid ${C.border}`, color: C.textMuted }}>
                      <th style={th}></th>
                      <th style={th}>Priority</th>
                      <th style={th}>Play</th>
                      <th style={th}>Query</th>
                      <th style={th}>Impr</th>
                      <th style={th}>CTR</th>
                      <th style={th}>Pos</th>
                      <th style={th}>+Clicks</th>
                      <th style={th}>Auth</th>
                      <th style={th}>Host</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {warQueueFiltered.map((o: any) => (
                      <tr key={o.id || o.term} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={td}>
                          <input
                            type="checkbox"
                            checked={selectedWar.has(o.term)}
                            onChange={() => toggleWarTerm(o.term)}
                          />
                        </td>
                        <td style={{ ...td, fontWeight: 700, color: C.cyan }}>{o.priorityScore}</td>
                        <td style={td}>
                          <span style={{
                            display: 'inline-block', padding: '2px 6px', borderRadius: 4,
                            fontSize: 10, fontWeight: 700, color: '#fff',
                            background: playColor(o.play),
                          }}>
                            {playLabel(o.play)}
                          </span>
                        </td>
                        <td style={{ ...td, maxWidth: 220 }}>
                          <strong style={{ color: C.text }}>{o.term}</strong>
                          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2, lineHeight: 1.35 }}>
                            {(o.rationale || '').slice(0, 120)}{(o.rationale || '').length > 120 ? '…' : ''}
                          </div>
                        </td>
                        <td style={td}>{o.impressions}</td>
                        <td style={td}>
                          {((o.ctr || 0) * 100).toFixed(1)}%
                          {o.expectedCtr != null && (
                            <div style={{ fontSize: 10, color: C.textDim }}>
                              exp {((o.expectedCtr || 0) * 100).toFixed(1)}%
                            </div>
                          )}
                        </td>
                        <td style={td}>{Number(o.position).toFixed(1)}</td>
                        <td style={{ ...td, color: C.green, fontWeight: 600 }}>~{o.estimatedGainClicks}</td>
                        <td style={td}>{o.authorityScore}</td>
                        <td style={{ ...td, fontSize: 11, color: C.textMuted }}>
                          {o.host || '—'}
                          {o.shipHint && <div style={{ fontSize: 10 }}>ship:{o.shipHint}</div>}
                        </td>
                        <td style={td}>
                          {o.play !== 'cannibal_merge' && (
                            <button
                              type="button"
                              disabled={busy}
                              style={btnSmall}
                              onClick={() => runAutoPilot([o.term])}
                            >
                              Ship play
                            </button>
                          )}
                          {o.play === 'cannibal_merge' && (
                            <button
                              type="button"
                              disabled={busy}
                              style={{ ...btnSmall, borderColor: C.red, color: C.red }}
                              onClick={() => {
                                const pages = (o.pages || []) as Array<{ url: string; impressions: number; clicks: number; position: number }>
                                setMergeOpp(o)
                                setMergeWinner((pages[0] && pages[0].url) || '')
                                setMergeMode('merge')
                                setMergeResult(null)
                              }}
                            >
                              Merge
                            </button>
                          )}

                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {mergeResult?.batch && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginTop: 12 }}>
              <h3 style={{ margin: '0 0 8px', color: C.red }}>
                Batch merge · {mergeResult.okCount}/{mergeResult.total} resolved
              </h3>
              <div style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                {(mergeResult.results || []).map((r: any, i: number) => (
                  <div key={i}>
                    <strong>{r.term}</strong>{' '}
                    {r.ok ? (
                      <span style={{ color: C.green }}>
                        ✓ merged → {r.winner} · {r.redirects} redirects · {r.files} files
                      </span>
                    ) : (
                      <span style={{ color: C.red }}>✗ {r.error}</span>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" style={{ ...btnSmall, marginTop: 10 }} onClick={() => setMergeResult(null)}>
                Dismiss
              </button>
            </div>
          )}

          {autoResult && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 8px', color: C.cyan }}>
                Last run · {autoResult.shipped}/{autoResult.candidateCount} shipped
                {autoResult.avgAuditScore != null ? ` · avg audit ${autoResult.avgAuditScore}` : ''}
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: C.textMuted }}>{autoResult.message}</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {(autoResult.results || []).map((r: any, i: number) => (
                  <div key={(r.term || '') + i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, fontSize: 12 }}>
                    <strong>{r.term}</strong>
                    {r.play && <span style={{ color: playColor(String(r.play)), marginLeft: 8 }}>{playLabel(String(r.play))}</span>}
                    <span style={{ color: r.ok ? C.green : C.red, marginLeft: 8 }}>
                      {r.ok ? 'ok' : 'failed'}{r.audit?.score != null ? ` · audit ${r.audit.score}` : ''}
                    </span>
                    {r.ship?.prUrl && <> · <a href={r.ship.prUrl} target="_blank" rel="noreferrer">PR</a></>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Auto-Pilot ── */}
      {tab === 'autopilot' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: 24, borderTop: `4px solid ${C.gold}`,
          }}>
            <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              War Room feed · DeepSeek primary · CF fallback · Quality refine
            </div>
            <h2 style={{ margin: '8px 0', fontSize: 20, color: C.cyan }}>Publish from ranked GSC demand</h2>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: C.textMuted, lineHeight: 1.55, maxWidth: 680 }}>
              Default feed is the <strong>War Room</strong> (CTR gap, strike distance, AEO hubs) plus
              AEO/SEO/GEO authority scoring. Drafts via <strong>DeepSeek V4 Pro (NVIDIA)</strong> first,
              then <strong>Cloudflare Workers AI</strong> and free cascade fallbacks, then audit + estate ship.
              Default: <strong>merge → main</strong>. Use workspace <strong>Approve → main</strong> for human-reviewed content.
            </p>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 14 }}>
              <label style={labelStyle}>
                Articles
                <select value={autoLimit} onChange={(e) => setAutoLimit(Number(e.target.value))} style={inputStyle}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Ship mode
                <select value={autoMode} onChange={(e) => setAutoMode(e.target.value as any)} style={inputStyle}>
                  <option value="merge">Merge → main (recommended)</option>
                  <option value="auto">Auto (merge if audit OK, else PR)</option>
                  <option value="autodeploy">Direct commit main</option>
                  <option value="pr">PR only (no auto-merge)</option>
                  <option value="none">Generate only</option>
                </select>
              </label>
              <label style={labelStyle}>
                Min audit score
                <select value={minAudit} onChange={(e) => setMinAudit(Number(e.target.value))} style={inputStyle} title="Guides need ≥1800 body words regardless of score">
                  {[55, 65, 70, 80, 85].map((n) => <option key={n} value={n}>{n}+</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Refine passes
                <select value={maxRefine} onChange={(e) => setMaxRefine(Number(e.target.value))} style={inputStyle}>
                  {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Region filter
                <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} style={inputStyle}>
                  <option value="">All regions</option>
                  {['US', 'UK', 'CA', 'AU'].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, fontSize: 13, color: C.textMuted }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                Dry run (no GitHub write)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={skipRecent} onChange={(e) => setSkipRecent(e.target.checked)} />
                Skip recently shipped keywords (merged/PR only · 14d)
                {' '}
                <span className="text-xs text-muted-foreground">
                  Uncheck if Auto-Pilot says no opportunities
                </span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy} onClick={() => { setTab('warroom'); if (!warRoom) loadWarRoom() }} style={{ ...btnPrimary, background: C.gold, color: '#0B1220', opacity: busy ? 0.7 : 1, fontSize: 14, padding: '12px 18px' }}>
                Open War Room
              </button>
              <button type="button" disabled={busy} onClick={() => loadOptimalPlan()} style={{ ...btnPrimary, opacity: busy ? 0.7 : 1, fontSize: 14, padding: '12px 18px' }}>
                {busy ? 'Planning…' : '① Optimal GSC plan'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => runOptimalAutoPilot()}
                style={{ ...btnPrimary, opacity: busy ? 0.7 : 1, fontSize: 14, padding: '12px 18px' }}
              >
                {busy ? 'Running…' : dryRun ? `② Dry-run optimal × ${autoLimit}` : `② Generate optimal × ${autoLimit}`}
              </button>
              <button type="button" disabled={busy} onClick={() => runAutoPilot()} style={btnSecondary}>
                War Room auto-run
              </button>
              <button type="button" disabled={busy || selectedOpp.size === 0} onClick={() => runSelectedOpportunities()} style={btnSecondary}>
                Create selected ({selectedOpp.size})
              </button>
              <button type="button" disabled={busy} onClick={() => { setTab('opportunities'); if (!opps) loadOpps() }} style={btnSecondary}>
                Pick opportunities
              </button>
              <button type="button" disabled={busy} onClick={() => scanMonitor()} style={btnSecondary}>
                Scan deploy monitor
              </button>
            </div>
            {optimalPlan && (
              <div style={{
                marginTop: 16, padding: 12, borderRadius: 8, fontSize: 12,
                background: optimalPlan.gscLive ? '#ECFDF5' : '#FFFBEB',
                border: `1px solid ${C.border}`, color: C.textMuted, lineHeight: 1.5,
              }}>
                <strong style={{ color: C.cyan }}>Optimal stack ready</strong>
                {' · '}GSC {optimalPlan.gscLive ? 'live' : 'snapshot'} ({optimalPlan.gscSource})
                {' · '}{optimalPlan.autoRunTerms?.length || 0} terms
                {' · '}{optimalPlan.siteUrl}
                <div style={{ marginTop: 6, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                  {(optimalPlan.autoRunTerms || []).slice(0, 8).join(' · ') || '—'}
                </div>
                <div style={{ marginTop: 8, fontSize: 11 }}>
                  Agent/MCP: use prompts in API response · docs/SEO_OPTIMAL_STACK.md
                </div>
              </div>
            )}
          </div>

          {autoResult && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 8px', color: C.cyan }}>
                Run result · GSC {autoResult.source} · {autoResult.shipped}/{autoResult.candidateCount} shipped
                {autoResult.avgAuditScore != null ? ` · avg audit ${autoResult.avgAuditScore}` : ''}
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: C.textMuted }}>{autoResult.message}</p>
              <div style={{ display: 'grid', gap: 10 }}>
                {(autoResult.results || []).map((r: any, i: number) => (
                  <div key={r.term + i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <strong>{r.term}</strong>
                      <span style={{ color: r.ok ? C.green : C.red }}>
                        {r.ok ? 'ok' : 'failed'}
                        {r.provider ? ` · ${r.provider}` : ''}
                        {r.audit?.score != null ? ` · audit ${r.audit.score}` : ''}
                        {r.attempts ? ` · ${r.attempts} attempt/s` : ''}
                      </span>
                    </div>
                    {r.plan && (
                      <div style={{ color: C.textMuted, marginTop: 4, fontSize: 12 }}>
                        {r.plan.host} → {r.plan.repo} · {r.shipMode}
                        {r.audit?.wordCount != null ? ` · ${r.audit.wordCount} words` : ''}
                        {r.ship?.prUrl && <> · <a href={r.ship.prUrl} target="_blank" rel="noreferrer">PR</a></>}
                        {r.ship?.commitSha && <> · sha {String(r.ship.commitSha).slice(0, 8)}</>}
                      </div>
                    )}
                    {(r.error || r.shipError) && (
                      <div style={{ color: C.red, marginTop: 4, fontSize: 12 }}>{r.error || r.shipError}</div>
                    )}
                    {r.contentPreview && (
                      <button type="button" style={{ ...btnSmall, marginTop: 8 }} onClick={() => setPreview(r.contentPreview)}>
                        Preview
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Manual ── */}
      {tab === 'factory' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
              <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
                Topic
                <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="UK dependent visa guide…" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Primary keyword
                <input value={primaryKeyword} onChange={(e) => setPrimaryKeyword(e.target.value)} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Region
                <select value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle}>
                  {['US', 'UK', 'CA', 'AU', 'COMPARE'].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Content type
                <select value={contentType} onChange={(e) => setContentType(e.target.value)} style={inputStyle}>
                  <option value="legal_guide">Legal guide</option>
                  <option value="blog_summary">Blog summary</option>
                  <option value="regional_page">Regional page</option>
                  <option value="marketplace_gig">Marketplace gig</option>
                </select>
              </label>
              <label style={labelStyle}>
                AI Model
                <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)} style={inputStyle}>
                  <option value="auto">Auto (Grok → OpenAI → rest)</option>
                  <option value="grok">Grok (xAI)</option>
                  <option value="openai">OpenAI (GPT-5.6 Luna)</option>
                  <option value="nvidia-deepseek">NVIDIA DeepSeek</option>
                  <option value="cloudflare-ai">Cloudflare Workers AI</option>
                  <option value="groq">Groq (Llama)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </label>
              <label style={labelStyle}>
                Ship mode
                <select value={shipMode} onChange={(e) => setShipMode(e.target.value as ShipMode)} style={inputStyle}>
                  <option value="merge">Merge → main</option>
                  <option value="auto">Auto</option>
                  <option value="autodeploy">Direct main</option>
                  <option value="pr">PR only</option>
                  <option value="none">Generate only</option>
                </select>
              </label>
              <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
                <input type="checkbox" checked={indexable} onChange={(e) => setIndexable(e.target.checked)} />
                Indexable
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy} onClick={runPlan} style={btnSecondary}>1. Plan</button>
              <button type="button" disabled={busy || (!topic && !primaryKeyword)} onClick={() => runGenerate()} style={btnPrimary}>
                2. Generate & ship (with refine)
              </button>
            </div>
          </div>

          {plan?.plan && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, fontSize: 13 }}>
              <h3 style={{ margin: '0 0 10px', color: C.cyan }}>Ownership plan · estate gate</h3>
              <div><strong>Host:</strong> {plan.plan.host} → <strong>Repo:</strong> {plan.plan.repo}</div>
              <div><strong>Path:</strong> <code>{plan.plan.filePath}</code></div>
              <div><strong>Canonical:</strong> {plan.plan.canonicalUrl}</div>
              {plan.shipGate && (
                <div style={{
                  marginTop: 10, padding: 10, borderRadius: 8,
                  background: plan.shipGate.ok ? 'rgba(22,101,52,0.08)' : 'rgba(220,38,38,0.08)',
                  border: `1px solid ${plan.shipGate.ok ? C.green : C.red}`,
                }}>
                  <strong style={{ color: plan.shipGate.ok ? C.green : C.red }}>
                    {plan.shipGate.ok ? 'Ship allowed' : 'Ship blocked'}
                  </strong>
                  <span style={{ color: C.textMuted }}> · {plan.shipGate.kind} on {plan.shipGate.host}</span>
                  {(plan.shipGate.errors || []).map((e: string) => (
                    <div key={e} style={{ color: C.red, marginTop: 4, fontSize: 12 }}>⛔ {e}</div>
                  ))}
                  {plan.shipRecommendation?.reason && (
                    <div style={{ color: C.textMuted, marginTop: 6, fontSize: 12 }}>{plan.shipRecommendation.reason}</div>
                  )}
                </div>
              )}
              {(plan.plan.blockers || []).map((b: string) => (
                <div key={b} style={{ color: C.red, marginTop: 4 }}>⛔ {b}</div>
              ))}
            </div>
          )}

          {result && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <h3 style={{ margin: '0 0 10px', color: C.cyan }}>
                Result · Audit {result.audit?.score} ({result.audit?.grade}) · {result.provider}
                {result.attempts ? ` · ${result.attempts} attempt/s` : ''}
              </h3>
              {result.ship && (
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  Ship: <strong>{result.ship.status}</strong>
                  {result.ship.prUrl && <> — <a href={result.ship.prUrl} target="_blank" rel="noreferrer">{result.ship.prUrl}</a></>}
                </div>
              )}
              {result.shipError && <div style={{ color: C.red, fontSize: 12 }}>{result.shipError}</div>}
              <button type="button" style={btnSmall} onClick={() => setPreview(result.content)}>Full preview</button>
              <pre style={preStyle}>{(result.content || '').slice(0, 3500)}{(result.content || '').length > 3500 ? '\n…' : ''}</pre>
            </div>
          )}
        </div>
      )}

      {/* ── Opportunities ── */}
      {tab === 'opportunities' && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13, color: C.textMuted }}>
              Source: {opps?.source || '—'} · {opps?.count ?? 0} opportunities · selected {selectedOpp.size}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={opportunityMode}
                onChange={(e) => setOpportunityMode(e.target.value as typeof opportunityMode)}
                disabled={busy}
                aria-label="Selected opportunity workflow"
                style={{ ...inputStyle, width: 'auto', marginTop: 0, padding: '8px 10px' }}
              >
                <option value="none">Draft only, review in workspace</option>
                <option value="pr">Create and open PR</option>
                <option value="autodeploy">Create and approve to main</option>
                <option value="merge">Create and merge PR</option>
              </select>
              <button type="button" onClick={loadOpps} disabled={busy} style={btnSecondary}>Refresh</button>
              <button
                type="button"
                disabled={busy || selectedOpp.size === 0}
                onClick={() => runSelectedOpportunities()}
                style={btnPrimary}
                title="Create selected opportunities using the selected workflow, then continue from the live workspace"
              >
                {opportunityMode === 'none' ? 'Create drafts' : 'Create selected'} ({selectedOpp.size})
              </button>
              {selectedOpp.size > 0 && (
                <button type="button" onClick={() => setSelectedOpp(new Set())} disabled={busy} style={btnSmall}>
                  Clear
                </button>
              )}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: C.textDim }}>
                  <th style={th}></th>
                  <th style={th}>Query</th>
                  <th style={th}>Imp</th>
                  <th style={th}>Pos</th>
                  <th style={th}>CTR</th>
                  <th style={th}>Action</th>
                  <th style={th}>Owner</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {(opps?.opportunities || []).slice(0, 50).map((o: any) => (
                  <tr key={o.term} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td}>
                      <input
                        type="checkbox"
                        checked={selectedOpp.has(o.term)}
                        disabled={o.action === 'ignore'}
                        onChange={() => toggleOpp(o.term)}
                      />
                    </td>
                    <td style={td}>{o.term}</td>
                    <td style={td}>{o.impressions}</td>
                    <td style={td}>{Number(o.position).toFixed(1)}</td>
                    <td style={td}>{(o.ctr * 100).toFixed(2)}%</td>
                    <td style={td}>{o.action}</td>
                    <td style={td}>{o.ownerHint?.host || o.region || '—'}</td>
                    <td style={td}>
                      <button
                        type="button"
                        style={btnSmall}
                        disabled={busy || o.action === 'ignore'}
                        onClick={() => openOpportunityInCreate(o)}
                        title="Open this opportunity in Manual Create before generating"
                      >
                        Open in Create
                      </button>
                      <button
                        type="button"
                        style={{ ...btnSmall, marginLeft: 4 }}
                        disabled={busy || o.action === 'ignore'}
                        onClick={() => runGenerate({
                          topic: o.term, keyword: o.term, region: o.region,
                          contentType: o.suggestedContentType || 'legal_guide',
                          shipMode: shipMode === 'auto' ? 'merge' : shipMode,
                        })}
                      >
                        Create
                      </button>
                      <button
                        type="button"
                        style={{ ...btnSmall, marginLeft: 4 }}
                        disabled={busy || o.action === 'ignore'}
                        onClick={() => runGenerate({
                          topic: o.term, keyword: o.term, region: o.region,
                          contentType: o.suggestedContentType || 'legal_guide', shipMode: 'none',
                        })}
                        title="Generate a draft without opening a PR; edit and save it in the workspace"
                      >
                        Draft only
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Queue ── */}
      {tab === 'queue' && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
          {queueSummary && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, fontSize: 12 }}>
              {[
                ['Shown', queueSummary.total],
                ['Drafting', queueSummary.drafting],
                ['PR', queueSummary.pr_created],
                ['Merged', queueSummary.merged],
                ['Failed', queueSummary.failed],
                ['Avg SEO', queueSummary.avgSeo ?? '—'],
              ].map(([l, v]) => (
                <span key={String(l)} style={{ padding: '4px 10px', borderRadius: 999, background: C.surface2, color: C.textMuted }}>
                  <strong style={{ color: C.cyan }}>{v}</strong> {l}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={jobQ}
              onChange={(e) => setJobQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadJobs()}
              placeholder="Search topic / keyword / path…"
              style={{ ...inputStyle, marginTop: 0, maxWidth: 260 }}
            />
            <select value={jobStatusFilter} onChange={(e) => setJobStatusFilter(e.target.value)} style={{ ...inputStyle, marginTop: 0, width: 'auto' }}>
              <option value="all">All statuses</option>
              {['drafting', 'pr_created', 'merged', 'failed', 'closed', 'pending', 'publishing'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select value={jobHostFilter} onChange={(e) => setJobHostFilter(e.target.value)} style={{ ...inputStyle, marginTop: 0, width: 'auto' }}>
              <option value="all">All hosts</option>
              {['legal', 'usa', 'uk', 'ca', 'au', 'apex', 'market'].map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <select value={jobRepoFilter} onChange={(e) => setJobRepoFilter(e.target.value)} style={{ ...inputStyle, marginTop: 0, width: 'auto' }}>
              <option value="all">All repos</option>
              {['caseworks', 'yousafe-consultancy', 'portal'].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button type="button" onClick={loadJobs} style={btnSecondary}>Search / refresh</button>
            <button type="button" onClick={exportJobsCsv} style={btnSecondary} disabled={!jobs.length}>Export CSV</button>
            <button
              type="button"
              style={{ ...btnSecondary, background: showCompletedJobs ? '#DBEAFE' : C.surface, borderColor: showCompletedJobs ? C.blue : C.border, fontSize: 11 }}
              onClick={() => setShowCompletedJobs((v) => !v)}
            >
              {showCompletedJobs ? 'Hide completed' : 'Show completed'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.textMuted }}>
              <input type="checkbox" checked={selectedJobIds.size === jobs.length && jobs.length > 0} onChange={selectAllVisibleJobs} />
              Select all ({selectedJobIds.size})
            </label>
            <button type="button" style={btnSmall} disabled={busy || !selectedJobIds.size} onClick={() => bulkAction('bulk_reaudit')}>Bulk re-audit</button>
            <button type="button" style={btnSmall} disabled={busy || !selectedJobIds.size} onClick={() => bulkAction('bulk_monitor')}>Bulk monitor</button>
            <button type="button" style={{ ...btnSmall, background: C.green, color: '#fff', border: 'none' }} disabled={busy || !selectedJobIds.size} onClick={() => bulkAction('bulk_approve')}>
              Bulk approve → main
            </button>
            <button type="button" style={{ ...btnSmall, color: C.red }} disabled={busy || !selectedJobIds.size} onClick={() => bulkAction('bulk_abandon')}>Bulk abandon</button>
            {dryRun && <span style={{ fontSize: 11, color: C.orange, fontWeight: 700 }}>DRY-RUN ON</span>}
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {filteredJobsClient.length === 0 && <div style={{ color: C.textMuted, fontSize: 13 }}>No jobs match filters.</div>}
            {filteredJobsClient.map((j) => (
              <div
                key={j.id}
                style={{
                  border: `1px solid ${selectedJobId === j.id ? C.gold : C.border}`,
                  borderRadius: 8, padding: 12, fontSize: 13,
                  background: selectedJobId === j.id ? '#FFFBEB' : C.surface,
                  cursor: 'pointer',
                }}
                onClick={() => selectJob(j.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedJobIds.has(j.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleJobSelect(j.id)}
                    />
                    <strong>{j.title || j.topic}</strong>
                  </div>
                  <span style={{ color: C.textDim }}>
                    {j.status}
                    {' · '}
                    <span
                      onClick={(e) => { e.stopPropagation(); void jobAction(j.id, 'reaudit') }}
                      title="Click to re-audit"
                      style={{ color: C.blue, cursor: 'pointer', fontWeight: 500 }}
                    >
                      SEO {j.seo_score ?? '—'}
                    </span>
                    {' · '}{j.owner_host || '—'}{' · '}{providerModelLabel(j.ai_provider, j.ai_model)}
                  </span>
                </div>
                <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>
                  {j.primary_keyword || j.topic} · {j.region} · {j.target_repo}
                  {j.content_path && <> · <code style={{ fontSize: 11 }}>{j.content_path}</code></>}
                  {j.pr_url && <> · <a href={j.pr_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>PR</a></>}
                  {j.indexable === false && <span style={{ color: C.orange }}> · noindex</span>}
                  {j.error_message && (
                    <span style={{ color: C.red, cursor: 'default' }}>
                      {' · '}{j.error_message}
                      {isQualityGateFailure(j.error_message) && (
                        <button
                          type="button"
                          style={{ ...btnSmall, color: C.red, border: '1px solid ' + C.red, marginLeft: 8, fontWeight: 600, background: '#FFF5F5' }}
                          disabled={busy}
                          onClick={(e) => { e.stopPropagation(); selectJob(j.id); void jobAction(j.id, 'regenerate') }}
                          title="Regenerate with quality-gate guidance"
                        >
                          Fix & regenerate
                        </button>
                      )}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                  <button type="button" style={btnSmall} onClick={() => selectJob(j.id)}>Open</button>
                  {j.content && (
                    <button type="button" style={btnSmall} onClick={() => { selectJob(j.id); setEditorContent(j.content || '') }}>Edit</button>
                  )}
                  {j.content && j.status !== 'merged' && (
                    <>
                      <button type="button" style={{ ...btnSmall, background: C.green, color: '#fff', border: 'none' }} disabled={busy} onClick={() => jobAction(j.id, 'approve')}>
                        Approve → main
                      </button>
                      <button type="button" style={btnSmall} disabled={busy} onClick={() => jobAction(j.id, 'reship')}>Ship PR</button>
                    </>
                  )}
                  {j.pr_number && j.status === 'pr_created' && (
                    <button type="button" style={btnSmall} disabled={busy} onClick={() => jobAction(j.id, 'merge_pr')}>Merge PR</button>
                  )}
                  {(j.deploy_sha || j.pr_number) && (
                    <button type="button" style={btnSmall} disabled={busy} onClick={() => jobAction(j.id, 'monitor')}>Monitor</button>
                  )}
                  <button type="button" style={btnSmall} disabled={busy || !j.content} onClick={() => jobAction(j.id, 'reaudit')}>Re-audit</button>
                  <button type="button" style={btnSmall} disabled={busy} onClick={() => jobAction(j.id, 'duplicate')}>Duplicate</button>
                  <button type="button" style={btnSmall} disabled={busy} onClick={() => jobAction(j.id, 'regenerate')}>Regenerate</button>
                  {j.status !== 'closed' && j.status !== 'merged' && (
                    <button type="button" style={btnSmall} disabled={busy} onClick={() => jobAction(j.id, 'abandon')}>Abandon</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Controls / prefs ── */}
      {tab === 'controls' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, borderTop: `4px solid ${C.gold}` }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, color: C.cyan }}>Studio admin controls</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: C.textMuted, maxWidth: 640 }}>
              Defaults apply across Auto-Pilot, Manual generate, queue bulk actions, and the workspace.
              Preferences persist in this browser.
            </p>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <label style={labelStyle}>
                Default ship mode (manual)
                <select value={shipMode} onChange={(e) => setShipMode(e.target.value as ShipMode)} style={inputStyle}>
                  <option value="merge">Merge → main</option>
                  <option value="auto">Auto</option>
                  <option value="autodeploy">Direct main</option>
                  <option value="pr">PR only</option>
                  <option value="none">Generate only</option>
                </select>
              </label>
              <label style={labelStyle}>
                Auto-Pilot ship mode
                <select value={autoMode} onChange={(e) => setAutoMode(e.target.value as any)} style={inputStyle}>
                  <option value="merge">Merge → main</option>
                  <option value="auto">Auto</option>
                  <option value="autodeploy">Direct main</option>
                  <option value="pr">PR only</option>
                  <option value="none">Generate only</option>
                </select>
              </label>
              <label style={labelStyle}>
                Min audit score
                <select value={minAudit} onChange={(e) => setMinAudit(Number(e.target.value))} style={inputStyle} title="Guides need ≥1800 body words regardless of score">
                  {[55, 65, 70, 80, 85].map((n) => <option key={n} value={n}>{n}+</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Refine passes
                <select value={maxRefine} onChange={(e) => setMaxRefine(Number(e.target.value))} style={inputStyle}>
                  {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16, fontSize: 13, color: C.textMuted }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                Global dry-run (no GitHub writes)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={skipRecent} onChange={(e) => setSkipRecent(e.target.checked)} />
                Skip recently shipped keywords (merged/PR only · 14d)
                {' '}
                <span className="text-xs text-muted-foreground">
                  Uncheck if Auto-Pilot says no opportunities
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={confirmApprove} onChange={(e) => setConfirmApprove(e.target.checked)} />
                Confirm before Approve → main
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={workspaceOpen} onChange={(e) => setWorkspaceOpen(e.target.checked)} />
                Show workspace pane
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={indexable} onChange={(e) => setIndexable(e.target.checked)} />
                Default indexable
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
              <button type="button" style={btnSecondary} disabled={busy} onClick={() => { void loadHealth(); setTab('health') }}>Refresh system health</button>
              <button type="button" style={btnSecondary} disabled={busy} onClick={() => scanMonitor()}>Scan deploy monitor</button>
              <button type="button" style={btnSecondary} disabled={busy} onClick={() => loadJobs()}>Refresh job queue</button>
              <button type="button" style={btnSecondary} disabled={busy} onClick={() => loadMetrics()}>Refresh metrics</button>
              <button type="button" style={btnSecondary} onClick={() => { setLogs([]); pushLog('info', 'controls', 'Debug log cleared') }}>Clear session log</button>
              <button
                type="button"
                style={btnSecondary}
                onClick={() => {
                  localStorage.removeItem(STUDIO_PREFS_KEY)
                  setActionNotice('Prefs reset — reload page to restore defaults')
                }}
              >
                Reset saved prefs
              </button>
            </div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: '0 0 10px', color: C.cyan }}>Estate ship contract (reminder)</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.textMuted, lineHeight: 1.55 }}>
              <li><strong>legal</strong> → caseworks · <code>app/…/page.tsx</code> only</li>
              <li><strong>usa/uk/ca/au/apex</strong> → yousafe-consultancy · <code>{'{region}'}/content/…/*.md</code></li>
              <li><strong>market</strong> → portal · <code>catalogue/*.mdx</code> gigs only</li>
              <li>Invalid host/type/path/format is refused before any GitHub write</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Metrics ── */}
      {tab === 'metrics' && metrics && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))' }}>
          {[
            ['Jobs', metrics.factory?.jobsTotal],
            ['PRs', metrics.factory?.prCreated],
            ['Deployed/Merged', metrics.factory?.deployedOrMerged],
            ['Failed', metrics.factory?.failed],
            ['Avg SEO', metrics.factory?.avgSeoScore],
            ['Clicks 28d', metrics.visibility?.clicks28d],
            ['Impressions 28d', metrics.visibility?.impressions28d],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, color: C.textDim, textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.cyan, marginTop: 6 }}>{value ?? '—'}</div>
            </div>
          ))}
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: C.textMuted }}>
            Visibility: {metrics.visibility?.source}
          </div>
        </div>
      )}

      {/* ── Strategies corpus ── */}
      {tab === 'strategies' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: '0 0 8px', color: C.cyan }}>SEO strategies corpus</h3>
            <p style={{ margin: 0, fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
              Synced from <code>Documents/GitHub/SEO strategies</code> into <code>public/seo-data</code>.
              Ownership registry, standing rules, GSC expansion, dual-graph university map, and full plan docs
              feed Auto-Pilot prompts and host→repo routing. Re-sync: <code>npm run sync:seo-strategies</code>
              (also runs on <code>prebuild</code> when the source folder is present).
            </p>
            {strategies && (
              <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', fontSize: 13 }}>
                <span><strong>{strategies.ownershipRows ?? '—'}</strong> ownership rows</span>
                <span><strong>{strategies.universityRows ?? '—'}</strong> university map rows</span>
                <span><strong>{strategies.documents?.length ?? 0}</strong> documents</span>
                <span style={{ color: C.textDim }}>synced {strategies.updatedAt || '—'}</span>
              </div>
            )}
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <h4 style={{ margin: '0 0 10px', color: C.cyan }}>Runtime packs</h4>
            <div style={{ display: 'grid', gap: 8 }}>
              {(strategies?.packs || []).map((p: any) => (
                <div key={p.id} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 }}>
                  <strong>{p.id}</strong>
                  <code style={{ fontSize: 11, color: C.textMuted }}>{p.path}</code>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <h4 style={{ margin: '0 0 10px', color: C.cyan }}>Strategy documents</h4>
            <div style={{ display: 'grid', gap: 8 }}>
              {(strategies?.documents || []).map((d: any) => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{d.title}</strong>
                    <div style={{ fontSize: 11, color: C.textDim }}>
                      {Math.round((d.bytes || 0) / 1024)} KB · {d.sectionCount || 0} sections · {d.category || 'core'}
                    </div>
                  </div>
                  <button type="button" style={btnSmall} onClick={() => openStrategyDoc(d.path, d.title)}>
                    View
                  </button>
                </div>
              ))}
              {!strategies && <div style={{ color: C.textMuted, fontSize: 13 }}>Loading strategies index…</div>}
            </div>
          </div>

          {strategyDoc && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <strong style={{ color: C.cyan }}>{strategyDoc.title}</strong>
                <button type="button" style={btnSmall} onClick={() => setStrategyDoc(null)}>Close</button>
              </div>
              <pre style={{ ...preStyle, maxHeight: 480 }}>{strategyDoc.content.slice(0, 30000)}</pre>
            </div>
          )}
        </div>
      )}

      {/* ── Health ── */}
      {tab === 'health' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, color: C.cyan }}>System health</h3>
            <button type="button" onClick={loadHealth} style={btnSecondary}>Re-check</button>
          </div>
          {(health?.checks || []).map((c: any) => (
            <div key={c.id} style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14,
              borderLeft: `4px solid ${c.ok ? C.green : C.red}`,
            }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.label}</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{c.detail}</div>
            </div>
          ))}
          {!health && <div style={{ color: C.textMuted }}>Loading health…</div>}
        </div>
      )}

      {/* ── Cross-Domain Enrich ── */}
      {tab === 'crossdomain' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, color: C.violet }}>Cross-Domain Enrichment Engine</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => loadCrossDomain('audit')} disabled={crossDomainBusy} style={btnPrimary}>
                {crossDomainBusy ? 'Scanning...' : 'Run Audit'}
              </button>
              <button type="button" onClick={() => loadCrossDomain('enrich')} disabled={crossDomainBusy} style={btnSecondary}>
                {crossDomainBusy ? 'Loading...' : 'Build Briefs'}
              </button>
              <button type="button" onClick={() => loadCrossDomain('clusters')} disabled={crossDomainBusy} style={btnSecondary}>
                Clusters
              </button>
            </div>
          </div>

          {crossDomainData?.stats && (
            <>
              {/* KPI cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                {[
                  { label: 'Total Pages', value: crossDomainData.stats.totalPages, color: C.cyan },
                  { label: 'Total Links', value: crossDomainData.stats.totalLinks, color: C.blue },
                  { label: 'Cross-Domain', value: crossDomainData.stats.crossDomainLinks, color: C.violet },
                  { label: 'Bidirectional', value: crossDomainData.stats.bidirectionalLinks, color: C.green },
                  { label: 'Orphans', value: crossDomainData.stats.orphanPages, color: crossDomainData.stats.orphanPages > 0 ? C.red : C.green },
                ].map((kpi) => (
                  <div key={kpi.label} style={{
                    background: C.surface, borderRadius: C.radiusSm, padding: 12,
                    border: `1px solid ${C.border}`, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: kpi.color, marginTop: 2 }}>{kpi.value}</div>
                  </div>
                ))}
              </div>

              {/* Domain breakdown table */}
              {crossDomainData.stats.domainBreakdown && (
                <div style={{ background: C.surface, borderRadius: C.radiusSm, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontWeight: 600, fontSize: 13, color: C.text }}>Domain Link Matrix</div>
                  <div style={{ overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: C.surface2 }}>
                          <th style={th}>Domain</th>
                          <th style={th}>Label</th>
                          <th style={th}>Pages</th>
                          <th style={th}>Outbound</th>
                          <th style={th}>Cross Out</th>
                          <th style={th}>Cross In</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(crossDomainData.stats.domainBreakdown as Record<string, any>).map(([host, stats]: [string, any]) => (
                          <tr key={host} style={{ borderTop: `1px solid ${C.border2}` }}>
                            <td style={td}><code style={{ fontSize: 11 }}>{host}.yousafeconsultancy.com</code></td>
                            <td style={td}>{stats.label || host}</td>
                            <td style={td}>{stats.pages}</td>
                            <td style={td}>{stats.outboundLinks || 0}</td>
                            <td style={td}><span style={{ color: C.violet, fontWeight: 600 }}>{stats.crossDomainOutbound || 0}</span></td>
                            <td style={td}><span style={{ color: C.blue, fontWeight: 600 }}>{stats.crossDomainInbound || 0}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Topic clusters */}
              {crossDomainData.stats.topicClusters && crossDomainData.stats.topicClusters.length > 0 && (
                <div style={{ background: C.surface, borderRadius: C.radiusSm, border: `1px solid ${C.border}`, padding: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: C.text }}>
                    Topic Clusters ({crossDomainData.stats.topicClusters.length})
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {(crossDomainData.stats.topicClusters as any[]).map((c: any) => (
                      <div key={c.label} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        borderRadius: 8, background: C.surface2, border: `1px solid ${C.border2}`,
                      }}>
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{c.label}</div>
                        <div style={{ fontSize: 11, color: C.textMuted }}>{c.pageCount} pages</div>
                        <div style={{ fontSize: 11, color: C.textDim }}>{c.domainCount} domains</div>
                        <div style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 10,
                          background: c.cohesion > 0.3 ? C.greenSoft : C.goldSoft,
                          color: c.cohesion > 0.3 ? C.green : C.gold,
                        }}>
                          {Math.round(c.cohesion * 100)}% cohesive
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!crossDomainData && !crossDomainBusy && (
            <div style={{ color: C.textMuted, fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
              Click <strong>Run Audit</strong> to scan the entire estate for cross-domain link opportunities, or <strong>Build Briefs</strong> to generate enrichment briefs for every page.
            </div>
          )}
        </div>
      )}

      {/* Cannibal merge dialog — resolve cannibal_merge plays with one click */}
      {mergeOpp && (
        <div
          role="dialog"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 90,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => !mergeBusy && setMergeOpp(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 12, maxWidth: 760, width: '100%',
              maxHeight: '85vh', overflow: 'auto', padding: 22,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
              <strong style={{ color: C.red, fontSize: 15 }}>
                Cannibal merge · “{mergeOpp.term}”
              </strong>
              <button type="button" onClick={() => setMergeOpp(null)} style={btnSmall}>Close</button>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
              Multiple estate URLs rank for this query. Pick the winner — losers get a <strong>301 redirect</strong>{' '}
              to it, are retired at source (<code>index: false</code> + canonical), and the merged query is added to
              the winner&apos;s frontmatter so authority consolidates on one URL.
            </p>

            <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
              {((mergeOpp.pages || []) as Array<{ url: string; impressions: number; clicks: number; position: number }>)
                .map((pg: any, i: number) => {
                  const isWinner = mergeWinner === pg.url
                  return (
                    <label
                      key={pg.url + i}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: 10,
                        borderRadius: 8, cursor: 'pointer',
                        border: `1px solid ${isWinner ? C.red : C.border}`,
                        background: isWinner ? '#FEF2F2' : C.surface,
                      }}
                    >
                      <input
                        type="radio"
                        name="mergeWinner"
                        checked={isWinner}
                        onChange={() => setMergeWinner(pg.url)}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text, wordBreak: 'break-all' }}>
                          {pg.url}
                        </div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                          {isWinner
                            ? '← winner · keeps ranking · absorbs merged query'
                            : 'loser → 301 to winner · index:false + canonical'}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, textAlign: 'right', color: C.textMuted, whiteSpace: 'nowrap' }}>
                        <div>{pg.impressions?.toLocaleString?.() ?? pg.impressions} impr</div>
                        <div>{((pg.ctr || 0) * 100).toFixed(1)}% ctr</div>
                        <div>pos {Number(pg.position || 0).toFixed(1)}</div>
                      </div>
                    </label>
                  )
                })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: C.textMuted }}>Ship:</span>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                <input type="radio" name="mergeMode" checked={mergeMode === 'merge'} onChange={() => setMergeMode('merge')} />
                Commit to main (instant 301s)
              </label>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                <input type="radio" name="mergeMode" checked={mergeMode === 'pr'} onChange={() => setMergeMode('pr')} />
                Open PR for review
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                disabled={mergeBusy || !mergeWinner}
                style={{ ...btnPrimary, background: C.red }}
                onClick={executeCannibalMerge}
              >
                {mergeBusy ? 'Merging…' : 'Execute merge'}
              </button>
              {mergeBusy && <span style={{ fontSize: 12, color: C.textMuted }}>Writing redirects + files to GitHub…</span>}
            </div>

            {mergeResult && (
              <div style={{ marginTop: 14, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, background: C.surface2 }}>
                {mergeResult.error ? (
                  <div style={{ fontSize: 12, color: C.red }}>Merge failed: {mergeResult.error}</div>
                ) : (
                  <div style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                    <strong style={{ color: C.green }}>Merge executed ✓</strong>
                    <div>
                      301 redirects: {(mergeResult.redirectsAdded || []).length} · files updated:{' '}
                      {(mergeResult.filesUpdated || []).length}
                    </div>
                    {(mergeResult.redirectsAdded || []).slice(0, 12).map((r: any, i: number) => (
                      <div key={i} style={{ color: C.textMuted, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                        {r.from} → {r.to} (301 · {r.repo})
                      </div>
                    ))}
                    {(mergeResult.commits || []).map((c: any, i: number) => (
                      <div key={i} style={{ marginTop: 4 }}>
                        {c.prUrl ? (
                          <a href={c.prUrl} target="_blank" rel="noreferrer" style={{ color: C.blue }}>
                            PR opened · {c.repo}
                          </a>
                        ) : (
                          <span style={{ color: C.textMuted }}>Committed to {c.repo} · {c.branch}</span>
                        )}
                      </div>
                    ))}
                    {(mergeResult.skipped || []).length > 0 && (
                      <div style={{ color: C.orange }}>
                        Skipped: {(mergeResult.skipped || []).map((s: any) => s.url).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Preview modal (legacy) — prefer workspace editor */}
      {preview && (
        <div
          role="dialog"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 80,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => setPreview(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 12, maxWidth: 800, width: '100%', maxHeight: '85vh',
              overflow: 'auto', padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
              <strong style={{ color: C.cyan }}>Content preview</strong>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" style={btnSmall} onClick={() => { setEditorContent(preview); setWorkspaceOpen(true); setPreview(null) }}>
                  Open in editor
                </button>
                <button type="button" onClick={() => setPreview(null)} style={btnSmall}>Close</button>
              </div>
            </div>
            <pre style={{ ...preStyle, maxHeight: 'none' }}>{preview}</pre>
          </div>
        </div>
      )}
      </div>

      {/* ── Right: live workspace ── */}
      {workspaceOpen && (
        <div style={{ minHeight: 0, maxHeight: 'calc(100vh - 100px)', position: 'sticky', top: 0, alignSelf: 'start' }}>
          <ContentStudioWorkspace
            job={selectedJob}
            jobs={jobs as StudioJob[]}
            editorContent={editorContent}
            onEditorChange={setEditorContent}
            onSelectJob={selectJob}
            onSave={saveJobContent}
            onShip={() => selectedJobId && jobAction(selectedJobId, 'reship')}
            onApprove={() => selectedJobId && jobAction(selectedJobId, 'approve')}
            onMonitor={() => selectedJobId && jobAction(selectedJobId, 'monitor')}
            onRegenerate={() => selectedJobId && jobAction(selectedJobId, 'regenerate')}
            onRefreshPr={refreshPrStatus}
            onCloseJob={() => { setSelectedJobId(null); setEditorContent(''); setPrStatus(null) }}
            onReaudit={() => selectedJobId && jobAction(selectedJobId, 'reaudit')}
            onDuplicate={() => selectedJobId && jobAction(selectedJobId, 'duplicate')}
            onMergePr={() => selectedJobId && jobAction(selectedJobId, 'merge_pr')}
            onAbandon={() => selectedJobId && jobAction(selectedJobId, 'abandon')}
            onUpdateMeta={(patch) => selectedJobId && jobAction(selectedJobId, 'update_meta', patch)}
            dryRun={dryRun}
            onToggleDryRun={() => setDryRun((d) => !d)}
            busy={busy}
            logs={logs}
            onClearLogs={() => setLogs([])}
            prStatus={prStatus}
            activityLine={activityLine}
          />
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 13, color: C.textMuted }
const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', marginTop: 6, padding: '10px 12px',
  borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: 'border-box',
}
const btnPrimary: React.CSSProperties = {
  background: C.cyan, color: '#fff', border: `1px solid ${C.cyan}`, borderRadius: C.radiusXs,
  padding: '9px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13, letterSpacing: '-0.01em',
  boxShadow: '0 1px 2px rgba(0,0,0,0.06)', transition: 'all 0.15s ease',
}
const btnSecondary: React.CSSProperties = {
  background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: C.radiusXs,
  padding: '9px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13, letterSpacing: '-0.01em',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'all 0.15s ease',
}
const btnSmall: React.CSSProperties = {
  ...btnSecondary, padding: '5px 10px', fontSize: 11, borderRadius: 6,
}
const th: React.CSSProperties = { padding: '10px 8px', fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6B7280' }
const td: React.CSSProperties = { padding: '10px 8px', verticalAlign: 'middle', fontSize: 12 }
const preStyle: React.CSSProperties = {
  marginTop: 12, maxHeight: 320, overflow: 'auto', fontSize: 11,
  background: C.surface2, padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap',
}

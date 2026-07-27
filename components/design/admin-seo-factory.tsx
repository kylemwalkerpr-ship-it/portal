'use client'
import React from 'react'
import ContentStudioWorkspace, {
  createLog,
  type PrStatus,
  type StudioJob,
  type StudioLogEntry,
} from './content-studio-workspace'

const C = {
  bg: '#F7F8FA', surface: '#FFFFFF', border: 'rgba(0,0,0,0.08)',
  cyan: '#3C3B6E', gold: '#9A7B3B', text: '#1F2937', textMuted: '#6B7280',
  textDim: '#9CA3AF', green: '#166534', red: '#DC2626', orange: '#D97706',
  blue: '#2563EB', surface2: '#F4F2EE',
}

type ShipMode = 'none' | 'pr' | 'autodeploy' | 'auto' | 'merge'
type Tab = 'warroom' | 'autopilot' | 'keywords' | 'factory' | 'opportunities' | 'queue' | 'metrics' | 'health' | 'strategies' | 'controls'

const STUDIO_PREFS_KEY = 'yousafe.contentStudio.prefs.v1'

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
  const [jobs, setJobs] = React.useState<any[]>([])
  const [jobQ, setJobQ] = React.useState('')
  const [jobStatusFilter, setJobStatusFilter] = React.useState<string>('all')
  const [jobHostFilter, setJobHostFilter] = React.useState<string>('all')
  const [jobRepoFilter, setJobRepoFilter] = React.useState<string>('all')
  const [selectedJobIds, setSelectedJobIds] = React.useState<Set<string>>(new Set())
  const [queueSummary, setQueueSummary] = React.useState<any>(null)
  const [selectedOpp, setSelectedOpp] = React.useState<Set<string>>(new Set())
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

  const loadHealth = async () => {
    try {
      const res = await fetch('/api/seo-factory/health', { credentials: 'same-origin' })
      const data = await res.json()
      if (res.ok) setHealth(data)
    } catch { /* ignore */ }
  }

  const loadJobs = React.useCallback(async () => {
    const params = new URLSearchParams()
    params.set('limit', '100')
    if (jobQ) params.set('q', jobQ)
    if (jobStatusFilter && jobStatusFilter !== 'all') params.set('status', jobStatusFilter)
    if (jobHostFilter && jobHostFilter !== 'all') params.set('host', jobHostFilter)
    if (jobRepoFilter && jobRepoFilter !== 'all') params.set('repo', jobRepoFilter)
    const url = `/api/content-studio/jobs?${params}`
    const maxRetries = 2
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, { credentials: 'same-origin' })
        if (res.status === 503 && attempt < maxRetries) {
          pushLog('warn', 'jobs', `503 retry ${attempt + 1}/${maxRetries}`)
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
          continue
        }
        const data = await res.json()
        if (res.ok) {
          setJobs(data.jobs || [])
          setQueueSummary(data.summary || null)
          // Keep editor in sync if selected job updated from server (unless local dirty)
          const sid = selectedJobIdRef.current
          if (sid) {
            const j = (data.jobs || []).find((x: any) => x.id === sid)
            if (j?.content != null) {
              setEditorContent((prev) => {
                const serverPrev = selectedJobContentRef.current || ''
                if (!prev.trim() || prev === serverPrev) {
                  selectedJobContentRef.current = j.content || ''
                  return j.content
                }
                return prev
              })
            }
          }
        } else if (data.error && attempt === maxRetries) {
          pushLog('error', 'jobs', data.error)
        }
        break // success (or non-retryable error)
      } catch (e) {
        if (attempt === maxRetries) {
          pushLog('error', 'jobs', e instanceof Error ? e.message : 'Failed to load jobs')
        } else {
          pushLog('warn', 'jobs', `Retry ${attempt + 1}/${maxRetries}: ${e instanceof Error ? e.message : 'failed'}`)
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
        }
      }
    }
  }, [jobQ, jobStatusFilter, jobHostFilter, jobRepoFilter, pushLog])

  // Always keep job list fresh for the workspace queue
  React.useEffect(() => {
    void loadJobs()
  }, [loadJobs])

  // Poll while work is in flight or a non-terminal job is selected
  React.useEffect(() => {
    const active = jobs.some((j) => !['merged', 'closed', 'failed'].includes(j.status || ''))
    if (!active && !busy) return
    const t = setInterval(() => { void loadJobs() }, 4000)
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
    setBusy(true)
    setActivityLine('Building SEO War Room…')
    pushLog('info', 'warroom', 'Build war room (CTR gap · strike · cannibal · AEO)')
    try {
      const res = await fetch('/api/seo-factory/war-room', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'War room failed'
      pushLog('error', 'warroom', msg)
      setActionNotice(msg)
    } finally {
      setBusy(false)
      setActivityLine(null)
    }
  }

  const runWarRoomStrike = async (terms?: string[]) => {
    let feed = terms?.length
      ? terms
      : selectedWar.size
        ? [...selectedWar]
        : (warRoom?.autoRunTerms as string[]) || []
    if (!feed.length) {
      await loadWarRoom()
      // re-read via fetch result is async; use latest from state after load is awkward — re-fetch
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
    if (!feed.length) {
      setActionNotice('War Room has no auto-run terms yet')
      return
    }
    await runAutoPilot(feed.slice(0, autoLimit))
  }

  const toggleWarTerm = (term: string) => {
    setSelectedWar((prev) => {
      const n = new Set(prev)
      if (n.has(term)) n.delete(term)
      else n.add(term)
      return n
    })
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

  const runAutoPilot = async (terms?: string[]) => {
    setBusy(true)
    setAutoResult(null)
    setWorkspaceOpen(true)
    setActivityLine('Auto-Pilot running…')
    pushLog('info', 'autopilot', `Start auto-run · limit ${terms?.length || autoLimit} · mode ${autoMode}`)
    try {
      const res = await fetch('/api/seo-factory/auto-run', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: terms?.length || autoLimit,
          shipMode: autoMode,
          dryRun,
          minAuditScore: minAudit,
          maxRefine,
          skipRecent,
          regionFilter: regionFilter || undefined,
          terms: terms?.length ? terms : undefined,
          useWarRoom: true,
          minImpressions: 2,
        }),
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
    } finally {
      setBusy(false)
      setActivityLine(null)
    }
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

  const toggleOpp = (term: string) => {
    setSelectedOpp((prev) => {
      const n = new Set(prev)
      if (n.has(term)) n.delete(term)
      else n.add(term)
      return n
    })
  }

  const healthReady = health?.ready
  const tabs: [Tab, string][] = [
    ['warroom', 'War Room'],
    ['autopilot', 'Auto-Pilot'],
    ['keywords', 'Keywords'],
    ['factory', 'Manual'],
    ['opportunities', 'Opportunities'],
    ['queue', 'Job queue'],
    ['controls', 'Controls'],
    ['strategies', 'Strategies'],
    ['metrics', 'Metrics'],
    ['health', 'System'],
  ]

  const warQueueFiltered = React.useMemo(() => {
    const q = (warRoom?.queue || []) as Array<Record<string, unknown>>
    if (warPlayFilter === 'all') return q
    return q.filter((o) => o.play === warPlayFilter)
  }, [warRoom, warPlayFilter])

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
    // Server already filters; keep client fallback for multi-status chips
    return jobs as StudioJob[]
  }, [jobs])

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
      gridTemplateColumns: workspaceOpen ? 'minmax(0, 1fr) minmax(340px, 42%)' : '1fr',
      gap: 0,
      minHeight: 'calc(100vh - 120px)',
      margin: '0 -8px',
    }}>
      {/* ── Left: command surface ── */}
      <div style={{ padding: 20, maxWidth: workspaceOpen ? 'none' : 1140, overflow: 'auto', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 8px', fontSize: 26, color: C.cyan, fontWeight: 700 }}>SEO War Room · Command Center</h1>
          <p style={{ margin: '0 0 12px', color: C.textMuted, fontSize: 13, maxWidth: 680 }}>
            Live GSC → CTR-gap / strike-distance / cannibal / AEO plays → generate → audit → estate-gated ship → main.
            Rank by estimated ranking gain, not vanity volume. Workspace pane stays open for editor + log.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setWorkspaceOpen((v) => !v)} style={btnSecondary}>
            {workspaceOpen ? 'Hide workspace' : 'Show workspace'}
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
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        marginBottom: 12, padding: '10px 12px', borderRadius: 10,
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

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        {tabs.map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', padding: '10px 12px', cursor: 'pointer',
              borderBottom: tab === t ? `2px solid ${C.gold}` : '2px solid transparent',
              fontWeight: tab === t ? 600 : 400, color: tab === t ? C.text : C.textDim, fontSize: 13,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Keywords research + plan ── */}
      {tab === 'keywords' && (
        <div style={{ display: 'grid', gap: 16 }}>
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
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: 24, borderTop: `4px solid ${C.gold}`,
          }}>
            <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Technician engine · CTR curve · Strike distance · Cannibal · AEO · Daily auto 12:00 EAT
            </div>
            <h2 style={{ margin: '8px 0', fontSize: 20, color: C.cyan }}>SEO War Room</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: C.textMuted, lineHeight: 1.55, maxWidth: 720 }}>
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

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <button type="button" disabled={busy} onClick={() => loadWarRoom()} style={{ ...btnPrimary, background: C.gold, color: '#0B1220', opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Scanning GSC…' : 'Refresh War Room'}
              </button>
              <button type="button" disabled={busy} onClick={() => runWarRoomStrike()} style={{ ...btnPrimary, opacity: busy ? 0.7 : 1 }}>
                {dryRun ? `Dry-run top × ${autoLimit}` : `Execute top plays × ${autoLimit}`}
              </button>
              <button
                type="button"
                disabled={busy || selectedWar.size === 0}
                onClick={() => runWarRoomStrike([...selectedWar])}
                style={btnSecondary}
              >
                Run selected ({selectedWar.size})
              </button>
              <button type="button" disabled={busy} onClick={() => loadOptimalPlan()} style={btnSecondary}>
                Full optimal stack
              </button>
              <label style={{ ...labelStyle, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                Play filter
                <select value={warPlayFilter} onChange={(e) => setWarPlayFilter(e.target.value)} style={{ ...inputStyle, marginTop: 0, width: 'auto' }}>
                  <option value="all">All plays</option>
                  <option value="title_ctr_rewrite">CTR rewrite</option>
                  <option value="strike_distance">Strike distance</option>
                  <option value="deep_demand_build">Deep build</option>
                  <option value="page1_defend">Page-1 defend</option>
                  <option value="aeo_entity_hub">AEO hub</option>
                  <option value="cannibal_merge">Cannibal merge</option>
                </select>
              </label>
              <label style={{ ...labelStyle, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                Region
                <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} style={{ ...inputStyle, marginTop: 0, width: 'auto' }}>
                  <option value="">All</option>
                  {['US', 'UK', 'CA', 'AU'].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            </div>

            {warRoom?.kpis && (
              <div style={{
                display: 'grid', gap: 10,
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                marginBottom: 16,
              }}>
                {[
                  { label: 'Queries analyzed', value: warRoom.kpis.queriesAnalyzed },
                  { label: 'Actionable plays', value: warRoom.kpis.actionable },
                  { label: 'Est. click gain', value: `~${warRoom.kpis.estimatedGainClicksSum}` },
                  { label: 'Avg authority', value: `${warRoom.kpis.avgAuthority}/100` },
                  { label: 'GSC', value: warRoom.kpis.liveGsc ? 'LIVE' : 'snapshot' },
                  { label: 'Window', value: `${warRoom.rangeDays || 90}d` },
                ].map((k) => (
                  <div key={k.label} style={{
                    padding: '10px 12px', borderRadius: 8, background: C.surface2,
                    border: `1px solid ${C.border}`,
                  }}>
                    <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.cyan, marginTop: 4 }}>{k.value}</div>
                  </div>
                ))}
              </div>
            )}

            {warRoom?.summary && (
              <div style={{
                marginBottom: 14, padding: 12, borderRadius: 8, fontSize: 12,
                background: warRoom.kpis?.liveGsc ? '#ECFDF5' : '#FFFBEB',
                border: `1px solid ${C.border}`, color: C.textMuted, lineHeight: 1.5,
              }}>
                {warRoom.summary}
                {warRoom.siteUrl && (
                  <div style={{ marginTop: 6, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                    {warRoom.siteUrl}
                  </div>
                )}
              </div>
            )}

            {warRoom?.buckets && typeof warRoom.buckets.title_ctr_rewrite === 'object' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, fontSize: 11 }}>
                {([
                  'title_ctr_rewrite',
                  'strike_distance',
                  'deep_demand_build',
                  'page1_defend',
                  'aeo_entity_hub',
                  'cannibal_merge',
                ] as const).map((p) => {
                  const n = Array.isArray(warRoom.buckets[p])
                    ? warRoom.buckets[p].length
                    : Number(warRoom.buckets[p]) || 0
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setWarPlayFilter(p === warPlayFilter ? 'all' : p)}
                      style={{
                        ...btnSmall,
                        borderColor: playColor(p),
                        color: playColor(p),
                        background: warPlayFilter === p ? 'rgba(0,0,0,0.04)' : '#fff',
                      }}
                    >
                      {playLabel(p)} · {n}
                    </button>
                  )
                })}
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
                            disabled={o.play === 'cannibal_merge'}
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
                              onClick={() => runWarRoomStrike([o.term])}
                            >
                              Ship play
                            </button>
                          )}
                          {o.play === 'cannibal_merge' && (
                            <span style={{ fontSize: 10, color: C.orange }} title={JSON.stringify(o.pages || [])}>
                              review URLs
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

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
              <button type="button" disabled={busy || selectedOpp.size === 0} onClick={() => runAutoPilot([...selectedOpp])} style={btnSecondary}>
                Run selected ({selectedOpp.size})
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={loadOpps} disabled={busy} style={btnSecondary}>Refresh</button>
              <button
                type="button"
                disabled={busy || selectedOpp.size === 0}
                onClick={() => runAutoPilot([...selectedOpp])}
                style={btnPrimary}
              >
                Ship selected
              </button>
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
                        onClick={() => runGenerate({
                          topic: o.term, keyword: o.term, region: o.region,
                          contentType: o.suggestedContentType || 'legal_guide',
                          shipMode: shipMode === 'auto' ? 'merge' : shipMode,
                        })}
                      >
                        Generate
                      </button>
                      <button
                        type="button"
                        style={{ ...btnSmall, marginLeft: 4 }}
                        disabled={busy || o.action === 'ignore'}
                        onClick={() => runGenerate({
                          topic: o.term, keyword: o.term, region: o.region,
                          contentType: o.suggestedContentType || 'legal_guide', shipMode: 'none',
                        })}
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
                    {j.status} · SEO {j.seo_score ?? '—'} · {j.owner_host || '—'} · {j.ai_provider || '—'}
                  </span>
                </div>
                <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>
                  {j.primary_keyword || j.topic} · {j.region} · {j.target_repo}
                  {j.content_path && <> · <code style={{ fontSize: 11 }}>{j.content_path}</code></>}
                  {j.pr_url && <> · <a href={j.pr_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>PR</a></>}
                  {j.indexable === false && <span style={{ color: C.orange }}> · noindex</span>}
                  {j.error_message && <span style={{ color: C.red }}> · {j.error_message}</span>}
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
  background: C.cyan, color: '#fff', border: 'none', borderRadius: 8,
  padding: '10px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13,
}
const btnSecondary: React.CSSProperties = {
  background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '10px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13,
}
const btnSmall: React.CSSProperties = {
  ...btnSecondary, padding: '4px 10px', fontSize: 11,
}
const th: React.CSSProperties = { padding: '8px 6px', fontWeight: 600 }
const td: React.CSSProperties = { padding: '8px 6px', verticalAlign: 'top' }
const preStyle: React.CSSProperties = {
  marginTop: 12, maxHeight: 320, overflow: 'auto', fontSize: 11,
  background: C.surface2, padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap',
}

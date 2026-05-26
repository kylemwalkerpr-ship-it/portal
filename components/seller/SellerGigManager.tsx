'use client'

import React from 'react'
import Link from 'next/link'
import SellerGigCard from './SellerGigCard'

interface GigMetrics { impressions: number; clicks: number; saves: number }
interface GigTier { tier?: string; title?: string; price?: number; delivery_days?: number; is_active?: boolean }
interface GalleryImage { url?: string }
interface Gig {
  id: string; slug: string; title: string; status: string
  category: string | null; pitch: string; description?: string
  tags?: string[]; seo_title?: string; seo_description?: string
  jurisdiction?: string; content_score: number
  metrics: GigMetrics | null
  gallery_images?: Array<GalleryImage | string>
  tiers?: GigTier[]
  created_at?: string
}
interface ApiResponse { gigs: Gig[]; count: number; limit: number; byStatus: Record<string, number> }

const ALL_TABS = ['All', 'Active', 'Draft', 'Paused', 'In Review', 'Suspended', 'Archived', 'Deleted'] as const
type Tab = typeof ALL_TABS[number]
// "All" intentionally excludes deleted — they live in the Deleted tab only.
const TAB_TO_STATUSES: Record<Tab, string[] | null> = {
  All: null,
  Draft: ['draft'],
  Active: ['active'],
  Paused: ['paused'],
  'In Review': ['pending_review', 'appeal_pending', 'denied'],
  Suspended: ['suspended'],
  Archived: ['archived'],
  Deleted: ['deleted'],
}

type SortKey = 'recent' | 'impressions' | 'clicks' | 'ctr' | 'price' | 'title'
const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Newest',
  impressions: 'Most impressions',
  clicks: 'Most clicks',
  ctr: 'Best CTR',
  price: 'Highest price',
  title: 'Title (A–Z)',
}

const FALLBACK_LIMIT = 5
const sans = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"
const serif = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"

async function requestJson(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin', ...options,
    headers: options.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) }
      : options.headers,
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = (payload?.error?.message as string) || (payload?.error as string) || `Request failed (${res.status})`
    const fields = payload?.error?.fields as Record<string, string> | undefined
    const err = new Error(message) as Error & { fields?: Record<string, string> }
    if (fields) err.fields = fields
    throw err
  }
  return (payload?.data ?? payload) as unknown
}

function gigInTab(gig: Gig, tab: Tab): boolean {
  if (tab === 'All') return gig.status !== 'deleted'
  const allowed = TAB_TO_STATUSES[tab]
  return allowed ? allowed.includes(gig.status) : true
}

function gigCtr(g: Gig): number {
  const imp = g.metrics?.impressions ?? 0
  const clk = g.metrics?.clicks ?? 0
  return imp > 0 ? clk / imp : 0
}

function gigStartingPrice(g: Gig): number {
  if (!Array.isArray(g.tiers) || g.tiers.length === 0) return 0
  const active = g.tiers.filter((t) => t.is_active !== false)
  const source = active.length ? active : g.tiers
  const prices = source.map((t) => Number(t.price ?? 0)).filter((n) => Number.isFinite(n) && n > 0)
  return prices.length ? Math.min(...prices) : 0
}

function applySort(gigs: Gig[], sort: SortKey): Gig[] {
  const arr = [...gigs]
  switch (sort) {
    case 'recent':
      return arr.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    case 'impressions':
      return arr.sort((a, b) => (b.metrics?.impressions ?? 0) - (a.metrics?.impressions ?? 0))
    case 'clicks':
      return arr.sort((a, b) => (b.metrics?.clicks ?? 0) - (a.metrics?.clicks ?? 0))
    case 'ctr':
      return arr.sort((a, b) => gigCtr(b) - gigCtr(a))
    case 'price':
      return arr.sort((a, b) => gigStartingPrice(b) - gigStartingPrice(a))
    case 'title':
      return arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
  }
}

// Skeleton row matching the new compact layout
function SkeletonRow() {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E8E4DC',
      borderLeft: '3px solid #E8E4DC', borderRadius: '8px',
      padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px',
    }}>
      <div style={{ width: '18px', height: '18px', background: '#F2EFE9', borderRadius: '3px', flexShrink: 0 }} />
      <div style={{ width: '92px', height: '92px', background: '#F2EFE9', borderRadius: '6px', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'grid', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <div style={{ height: '18px', width: '56px', background: '#F2EFE9', borderRadius: '4px' }} />
          <div style={{ height: '18px', width: '74px', background: '#F7F5F0', borderRadius: '4px' }} />
        </div>
        <div style={{ height: '18px', width: '60%', background: '#F2EFE9', borderRadius: '4px' }} />
        <div style={{ height: '12px', width: '80%', background: '#F7F5F0', borderRadius: '4px' }} />
      </div>
      <div style={{ width: '70px', height: '36px', background: '#F2EFE9', borderRadius: '4px', flexShrink: 0 }} />
      <div style={{ width: '180px', height: '24px', background: '#F2EFE9', borderRadius: '4px', flexShrink: 0 }} />
      <div style={{ width: '140px', height: '30px', background: '#F2EFE9', borderRadius: '6px', flexShrink: 0 }} />
    </div>
  )
}

function EmptyState({ tab, query, hasGigs }: { tab: Tab; query: string; hasGigs: boolean }) {
  const filtered = query.length > 0 || tab !== 'All'
  const titleText = !hasGigs
    ? 'No services yet'
    : query
      ? `No services match “${query}”`
      : `No ${tab.toLowerCase()} services`
  const bodyText = !hasGigs
    ? 'Create your first service to start accepting clients through the marketplace.'
    : query
      ? 'Try a different search term or clear the search to see all services.'
      : `You have no services with "${tab.toLowerCase()}" status. Switch tabs to see others.`
  return (
    <div style={{
      background: '#FFFFFF', border: '1px dashed #C8C2B6', borderRadius: '8px',
      padding: '48px 32px', textAlign: 'center' as const, fontFamily: sans,
    }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }} aria-hidden>
        <rect x="6" y="4" width="24" height="32" rx="2" stroke="#0F172A" strokeWidth="2" fill="none" />
        <path d="M12 14h16M12 20h16M12 26h10" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />
        <path d="M26 1v8h8" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <h3 style={{ fontFamily: serif, fontWeight: 600, fontSize: '20px', color: '#0F172A', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
        {titleText}
      </h3>
      <p style={{ color: '#9097A8', fontSize: '14px', lineHeight: 1.6, margin: '0 auto 22px', maxWidth: '360px' }}>
        {bodyText}
      </p>
      {!filtered && (
        <Link href="/dashboard/gigs/new" style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '10px 22px', borderRadius: '6px', fontSize: '13px', fontWeight: 600,
          background: '#0F172A', color: '#FFFFFF', textDecoration: 'none', letterSpacing: '0.01em',
        }}>
          + Create First Service
        </Link>
      )}
    </div>
  )
}

function SortDropdown({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', h); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' as const }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '7px 11px', borderRadius: '6px',
          background: '#FFFFFF', border: '1px solid #DDD8CE',
          fontSize: '12px', fontWeight: 600, color: '#0F172A',
          cursor: 'pointer', fontFamily: sans, whiteSpace: 'nowrap' as const,
        }}
      >
        <span style={{ color: '#9097A8', fontWeight: 500 }}>Sort:</span>
        {SORT_LABELS[value]}
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div role="listbox" style={{
          position: 'absolute' as const, top: 'calc(100% + 4px)', right: 0,
          background: '#FFFFFF', border: '1px solid #DDD8CE', borderRadius: '7px',
          boxShadow: '0 6px 24px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.06)',
          minWidth: '180px', padding: '4px', zIndex: 25,
        }}>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <button
              key={k}
              role="option"
              aria-selected={k === value}
              type="button"
              onClick={() => { onChange(k); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '8px 12px', fontSize: '13px',
                fontWeight: k === value ? 600 : 500,
                color: '#0F172A',
                background: k === value ? '#F7F5F0' : 'transparent',
                border: 'none', borderRadius: '4px', cursor: 'pointer',
                fontFamily: sans, textAlign: 'left' as const,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#F7F5F0' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = k === value ? '#F7F5F0' : 'transparent' }}
            >
              {SORT_LABELS[k]}
              {k === value && (
                <span style={{ color: '#1A6B45', fontSize: '12px', fontWeight: 700 }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: 'relative' as const, flex: '1 1 220px', maxWidth: '320px', minWidth: 0 }}>
      <svg
        width="14" height="14" viewBox="0 0 16 16"
        style={{ position: 'absolute' as const, left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9097A8', pointerEvents: 'none' as const }}
        fill="none" aria-hidden
      >
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search services…"
        aria-label="Search services"
        style={{
          width: '100%',
          padding: '7px 30px 7px 30px',
          borderRadius: '6px',
          border: '1px solid #DDD8CE',
          background: '#FFFFFF',
          fontSize: '13px', color: '#0F172A',
          fontFamily: sans,
          outline: 'none',
        }}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          style={{
            position: 'absolute' as const, right: '8px', top: '50%', transform: 'translateY(-50%)',
            width: '18px', height: '18px', borderRadius: '50%',
            background: '#F2EFE9', border: 'none', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#5C6070', padding: 0,
          }}
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  )
}

export default function SellerGigManager() {
  const [gigs, setGigs] = React.useState<Gig[]>([])
  const [count, setCount] = React.useState(0)
  const [gigLimit, setGigLimit] = React.useState(FALLBACK_LIMIT)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [activeTab, setActiveTab] = React.useState<Tab>('All')
  const [query, setQuery] = React.useState('')
  const [sort, setSort] = React.useState<SortKey>('recent')
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = (await requestJson('/api/gigs')) as ApiResponse
      setGigs(data.gigs ?? [])
      setCount(data.count ?? (data.gigs ?? []).filter((g) => g.status !== 'deleted').length)
      if (typeof data.limit === 'number' && data.limit > 0) setGigLimit(data.limit)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load services.')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const flash = (type: 'ok' | 'err', msg: string) => {
    setNotice({ type, msg })
    setTimeout(() => setNotice(null), 4000)
  }

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await requestJson(`/api/gigs/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      flash('ok', `Service ${status}.`)
      await load()
    } catch (e: unknown) { flash('err', e instanceof Error ? e.message : 'Update failed.') }
  }

  const handlePublish = async (id: string) => {
    try {
      await requestJson(`/api/gigs/${id}/publish`, { method: 'POST' })
      flash('ok', 'Service published and live on marketplace.')
      await load()
    } catch (e: unknown) {
      const err = e as Error & { fields?: Record<string, string> }
      const fieldList = err.fields ? Object.values(err.fields).filter(Boolean) : []
      const detail = fieldList.length ? `${err.message}: ${fieldList.join(' · ')}` : (err.message || 'Publish failed.')
      flash('err', detail)
    }
  }

  const handleBulk = async (action: 'paused' | 'archived' | 'deleted') => {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    const verb = action === 'paused' ? 'pause' : action === 'archived' ? 'archive' : 'delete'
    if (action === 'deleted' && !confirm(`Delete ${ids.length} service${ids.length === 1 ? '' : 's'}? This cannot be undone from the seller portal.`)) return

    setBulkBusy(true)
    const results = await Promise.allSettled(ids.map((id) =>
      requestJson(`/api/gigs/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: action }) }),
    ))
    const failed = results.filter((r) => r.status === 'rejected').length
    const ok = results.length - failed
    setBulkBusy(false)
    setSelectedIds(new Set())
    if (failed === 0) flash('ok', `${ok} service${ok === 1 ? '' : 's'} ${action}.`)
    else flash('err', `${ok} ${verb}d, ${failed} failed.`)
    await load()
  }

  const toggleSelect = React.useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleExpand = React.useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const tabFiltered = React.useMemo(() => gigs.filter((g) => gigInTab(g, activeTab)), [gigs, activeTab])

  const visibleGigs = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const searched = q
      ? tabFiltered.filter((g) =>
          (g.title || '').toLowerCase().includes(q) ||
          (g.pitch || '').toLowerCase().includes(q) ||
          (g.category || '').toLowerCase().includes(q) ||
          (g.tags ?? []).some((t) => t.toLowerCase().includes(q)),
        )
      : tabFiltered
    return applySort(searched, sort)
  }, [tabFiltered, query, sort])

  // Drop selections that fall outside the visible set (e.g. tab change)
  React.useEffect(() => {
    if (selectedIds.size === 0) return
    const visibleSet = new Set(visibleGigs.map((g) => g.id))
    let changed = false
    const next = new Set<string>()
    for (const id of selectedIds) {
      if (visibleSet.has(id)) next.add(id)
      else changed = true
    }
    if (changed) setSelectedIds(next)
  }, [visibleGigs, selectedIds])

  const allSelected = visibleGigs.length > 0 && visibleGigs.every((g) => selectedIds.has(g.id))
  const someSelected = !allSelected && visibleGigs.some((g) => selectedIds.has(g.id))
  const selectAllRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected
  }, [someSelected])

  const atLimit = count >= gigLimit
  const nearLimit = count >= gigLimit - 1
  const activeCount = gigs.filter((g) => g.status === 'active').length

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(visibleGigs.map((g) => g.id)))
  }

  return (
    <div style={{ display: 'grid', gap: '16px', fontFamily: sans }}>

      {/* Summary strip + slots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' as const }}>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' as const }}>
          {[
            { label: 'Total', value: gigs.filter((g) => g.status !== 'deleted').length, color: '#0F172A' },
            { label: 'Live', value: activeCount, color: '#1A6B45' },
            { label: 'Drafts', value: gigs.filter((g) => g.status === 'draft').length, color: '#9A7B3B' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
              <span style={{ fontWeight: 700, fontSize: '20px', color, fontVariantNumeric: 'tabular-nums' }}>{loading ? '—' : value}</span>
              <span style={{ fontSize: '12px', color: '#9097A8', fontWeight: 500 }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: atLimit ? '#8B1A1A' : '#9097A8' }}>
            {count} / {gigLimit} slots used
          </span>
          <div style={{ width: '80px', height: '4px', borderRadius: '2px', background: '#F2EFE9', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '2px', transition: 'width 0.4s ease',
              width: `${Math.min(100, (count / gigLimit) * 100)}%`,
              background: atLimit ? '#8B1A1A' : nearLimit ? '#8B5E0A' : '#0F172A',
            }} />
          </div>
        </div>
      </div>

      {atLimit && (
        <div style={{ background: '#FAEAEA', border: '1px solid rgba(139,26,26,0.20)', borderRadius: '7px', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '15px' }}>⚠</span>
          <span style={{ fontWeight: 600, color: '#7A1A1A', fontSize: '13px' }}>Service limit reached —</span>
          <span style={{ color: '#5C6070', fontSize: '13px' }}>archive or delete a service to create a new one.</span>
        </div>
      )}

      {/* Toolbar shell */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>

        {/* Row 1: tabs + create */}
        <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', borderBottom: '1px solid #F2EFE9', background: '#FAFAF7' }}>
          <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto' as const }}>
            {ALL_TABS.map((tab) => {
              const isActive = activeTab === tab
              const tabCount = gigs.filter((g) => gigInTab(g, tab)).length
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  aria-current={isActive ? 'page' : undefined}
                  style={{
                    padding: '12px 18px', fontSize: '13px',
                    fontWeight: isActive ? 600 : 500,
                    cursor: 'pointer', border: 'none', background: 'transparent',
                    borderBottom: isActive ? '2px solid #0F172A' : '2px solid transparent',
                    color: isActive ? '#0F172A' : '#9097A8',
                    whiteSpace: 'nowrap' as const, fontFamily: sans,
                    transition: 'color 0.12s, border-color 0.12s',
                  }}
                >
                  {tab}
                  <span style={{ marginLeft: '5px', fontSize: '11px', opacity: 0.65 }}>({tabCount})</span>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px' }}>
            <Link
              href={atLimit ? '#' : '/dashboard/gigs/new'}
              aria-disabled={atLimit}
              tabIndex={atLimit ? -1 : 0}
              onClick={(e) => { if (atLimit) e.preventDefault() }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '7px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600,
                background: atLimit ? '#F2EFE9' : '#0F172A',
                color: atLimit ? '#9097A8' : '#FFFFFF',
                textDecoration: 'none', letterSpacing: '0.01em',
                cursor: atLimit ? 'not-allowed' : 'pointer',
              }}
            >
              + New Service
            </Link>
          </div>
        </div>

        {/* Row 2: search + sort + select-all */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' as const,
          padding: '12px 16px', borderBottom: '1px solid #F2EFE9', background: '#FFFFFF',
        }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#5C6070', cursor: 'pointer' }}>
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              disabled={visibleGigs.length === 0}
              aria-label="Select all visible services"
              style={{ width: '15px', height: '15px', accentColor: '#0F172A', cursor: visibleGigs.length === 0 ? 'not-allowed' : 'pointer' }}
            />
            <span>{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}</span>
          </label>

          <SearchInput value={query} onChange={setQuery} />

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: '#9097A8' }}>
              {visibleGigs.length} of {tabFiltered.length}
            </span>
            <SortDropdown value={sort} onChange={setSort} />
          </div>
        </div>

        {/* Bulk action bar (replaces row 2 visuals when selections exist) */}
        {selectedIds.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' as const,
            padding: '10px 16px', borderBottom: '1px solid rgba(15,23,42,0.10)',
            background: '#0F172A', color: '#FFFFFF',
          }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>
              {selectedIds.size} selected
            </span>
            <button type="button" onClick={() => setSelectedIds(new Set())} style={{
              padding: '4px 10px', borderRadius: '4px',
              background: 'transparent', color: '#FFFFFF',
              border: '1px solid rgba(255,255,255,0.30)',
              fontSize: '11px', fontWeight: 500, cursor: 'pointer',
            }}>
              Clear
            </button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
              <button type="button" disabled={bulkBusy} onClick={() => handleBulk('paused')} style={{
                padding: '6px 12px', borderRadius: '5px',
                background: 'transparent', color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.40)',
                fontSize: '12px', fontWeight: 600, cursor: bulkBusy ? 'wait' : 'pointer',
              }}>
                Pause
              </button>
              <button type="button" disabled={bulkBusy} onClick={() => handleBulk('archived')} style={{
                padding: '6px 12px', borderRadius: '5px',
                background: 'rgba(255,255,255,0.10)', color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.40)',
                fontSize: '12px', fontWeight: 600, cursor: bulkBusy ? 'wait' : 'pointer',
              }}>
                Archive
              </button>
              <button type="button" disabled={bulkBusy} onClick={() => handleBulk('deleted')} style={{
                padding: '6px 12px', borderRadius: '5px',
                background: '#8B1A1A', color: '#FFFFFF',
                border: '1px solid #8B1A1A',
                fontSize: '12px', fontWeight: 600, cursor: bulkBusy ? 'wait' : 'pointer',
              }}>
                Delete
              </button>
            </div>
          </div>
        )}

        {/* Notice */}
        {notice && (
          <div style={{
            padding: '10px 20px', fontSize: '13px', fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: '8px',
            background: notice.type === 'ok' ? '#EAF5EE' : '#FAEAEA',
            color: notice.type === 'ok' ? '#1A6B45' : '#8B1A1A',
            borderBottom: `1px solid ${notice.type === 'ok' ? 'rgba(26,107,69,0.15)' : 'rgba(139,26,26,0.15)'}`,
          }}>
            <span>{notice.type === 'ok' ? '✓' : '!'}</span>
            {notice.msg}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: '24px 20px', textAlign: 'center' as const }}>
            <p style={{ color: '#8B1A1A', fontSize: '14px', margin: '0 0 12px' }}>{error}</p>
            <button onClick={load} style={{ padding: '7px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, background: '#0F172A', color: '#FFF', border: 'none', cursor: 'pointer' }}>
              Retry
            </button>
          </div>
        )}

        {/* Content */}
        <div style={{ padding: '12px', background: '#FAFAF7' }}>
          {loading ? (
            <div style={{ display: 'grid', gap: '10px' }}>
              <SkeletonRow /><SkeletonRow /><SkeletonRow />
            </div>
          ) : visibleGigs.length === 0 ? (
            <EmptyState tab={activeTab} query={query} hasGigs={gigs.filter((g) => g.status !== 'deleted').length > 0} />
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {visibleGigs.map((gig) => (
                <SellerGigCard
                  key={gig.id}
                  gig={gig}
                  selected={selectedIds.has(gig.id)}
                  expanded={expandedIds.has(gig.id)}
                  onToggleSelect={toggleSelect}
                  onToggleExpand={toggleExpand}
                  onStatusChange={handleStatusChange}
                  onPublish={handlePublish}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import React from 'react'
import Link from 'next/link'
import SellerGigCard from './SellerGigCard'

interface GigMetrics { impressions: number; clicks: number; saves: number }
interface Gig {
  id: string; slug: string; title: string; status: string
  category: string | null; pitch: string; content_score: number
  metrics: GigMetrics | null
}
interface ApiResponse { gigs: Gig[]; count: number; limit: number; byStatus: Record<string, number> }

const ALL_TABS = ['All', 'Draft', 'Active', 'Paused', 'In Review', 'Suspended', 'Archived', 'Deleted'] as const
type Tab = typeof ALL_TABS[number]
const TAB_TO_STATUSES: Record<Tab, string[]> = {
  All: [],
  Draft: ['draft'],
  Active: ['active'],
  Paused: ['paused'],
  'In Review': ['pending_review', 'appeal_pending', 'denied'],
  Suspended: ['suspended'],
  Archived: ['archived'],
  Deleted: ['deleted'],
}
// Dynamic limit — resolved from /api/gigs response (varies by seller level + admin overrides)
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

// Skeleton loading card
function SkeletonCard() {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #DDD8CE', borderLeft: '4px solid #E8E4DC',
      borderRadius: '8px', padding: '18px 22px', display: 'flex', gap: '16px',
      boxShadow: '0 1px 3px rgba(27,45,79,0.04)',
    }}>
      <div style={{ flex: 1, display: 'grid', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ height: '22px', width: '64px', background: '#F2EFE9', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ height: '22px', width: '96px', background: '#F7F5F0', borderRadius: '4px' }} />
        </div>
        <div style={{ height: '20px', width: '70%', background: '#F2EFE9', borderRadius: '4px' }} />
        <div style={{ height: '14px', width: '90%', background: '#F7F5F0', borderRadius: '4px' }} />
        <div style={{ height: '14px', width: '60%', background: '#F7F5F0', borderRadius: '4px' }} />
      </div>
      <div style={{ width: '130px', flexShrink: 0, display: 'grid', gap: '8px', alignContent: 'center' }}>
        {[80, 64, 80].map((w, i) => (
          <div key={i} style={{ height: '28px', width: `${w}%`, background: '#F2EFE9', borderRadius: '5px' }} />
        ))}
      </div>
    </div>
  )
}

// Empty state
function EmptyState({ tab, onCreateClick }: { tab: Tab; onCreateClick?: () => void }) {
  const isFiltered = tab !== 'All'
  return (
    <div style={{
      background: '#FFFFFF', border: '1px dashed #C8C2B6', borderRadius: '8px',
      padding: '48px 32px', textAlign: 'center', fontFamily: sans,
    }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }}>
        <rect x="6" y="4" width="24" height="32" rx="2" stroke="#0F172A" strokeWidth="2" fill="none" />
        <path d="M12 14h16M12 20h16M12 26h10" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />
        <path d="M26 1v8h8" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <h3 style={{ fontFamily: serif, fontWeight: 600, fontSize: '20px', color: '#0F172A', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
        {isFiltered ? `No ${tab.toLowerCase()} services` : 'No services yet'}
      </h3>
      <p style={{ color: '#9097A8', fontSize: '14px', lineHeight: 1.65, margin: '0 auto 24px', maxWidth: '340px' }}>
        {isFiltered
          ? `You have no services with "${tab.toLowerCase()}" status. Switch tabs to see others.`
          : 'Create your first service to start accepting clients through the marketplace.'}
      </p>
      {!isFiltered && (
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

export default function SellerGigManager() {
  const [gigs, setGigs] = React.useState<Gig[]>([])
  const [count, setCount] = React.useState(0)
  const [gigLimit, setGigLimit] = React.useState(FALLBACK_LIMIT)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [activeTab, setActiveTab] = React.useState<Tab>('All')

  const load = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = (await requestJson('/api/gigs')) as ApiResponse
      setGigs(data.gigs ?? [])
      setCount(data.count ?? (data.gigs ?? []).length)
      if (typeof data.limit === 'number' && data.limit > 0) setGigLimit(data.limit)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load services.')
    } finally {
      setLoading(false) }
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

  const filteredGigs = activeTab === 'All'
    ? gigs
    : gigs.filter((g) => TAB_TO_STATUSES[activeTab].includes(g.status))

  const atLimit = count >= gigLimit
  const nearLimit = count >= gigLimit - 1
  const activeCount = gigs.filter(g => g.status === 'active').length

  return (
    <div style={{ display: 'grid', gap: '20px', fontFamily: sans }}>

      {/* Summary strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' as const }}>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' as const }}>
          {[
            { label: 'Total', value: gigs.length, color: '#0F172A' },
            { label: 'Live', value: activeCount, color: '#1A6B45' },
            { label: 'Drafts', value: gigs.filter(g => g.status === 'draft').length, color: '#9A7B3B' },
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

      {/* Limit warning */}
      {atLimit && (
        <div style={{ background: '#FAEAEA', border: '1px solid rgba(139,26,26,0.20)', borderRadius: '7px', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '15px' }}>⚠</span>
          <span style={{ fontWeight: 600, color: '#7A1A1A', fontSize: '13px' }}>Service limit reached —</span>
          <span style={{ color: '#5C6070', fontSize: '13px' }}>archive or delete a service to create a new one.</span>
        </div>
      )}

      {/* Toolbar: tabs + create */}
      <div style={{ background: '#FFFFFF', border: '1px solid #DDD8CE', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(27,45,79,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', borderBottom: '1px solid #F2EFE9', background: '#FAFAF7' }}>
          <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto' as const }}>
            {ALL_TABS.map((tab) => {
              const isActive = activeTab === tab
              const tabCount = tab === 'All' ? gigs.length : gigs.filter(g => TAB_TO_STATUSES[tab].includes(g.status)).length
              return (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{
                  padding: '12px 18px', fontSize: '13px', fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer', border: 'none', background: 'transparent',
                  borderBottom: isActive ? '2px solid #0F172A' : '2px solid transparent',
                  color: isActive ? '#0F172A' : '#9097A8',
                  whiteSpace: 'nowrap' as const, fontFamily: sans,
                  transition: 'color 0.12s, border-color 0.12s',
                }}>
                  {tab}
                  <span style={{ marginLeft: '5px', fontSize: '11px', opacity: 0.65 }}>({tabCount})</span>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px' }}>
            <Link href="/dashboard/gigs/new" style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '7px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600,
              background: atLimit ? '#F2EFE9' : '#0F172A',
              color: atLimit ? '#9097A8' : '#FFFFFF',
              textDecoration: 'none', letterSpacing: '0.01em',
              pointerEvents: atLimit ? 'none' : 'auto',
            }}>
              + New Service
            </Link>
          </div>
        </div>

        {/* Notice bar */}
        {notice && (
          <div style={{
            padding: '10px 20px', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px',
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
        <div style={{ padding: '16px' }}>
          {loading ? (
            <div style={{ display: 'grid', gap: '12px' }}>
              <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </div>
          ) : filteredGigs.length === 0 ? (
            <EmptyState tab={activeTab} />
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {filteredGigs.map((gig) => (
                <SellerGigCard key={gig.id} gig={gig} onStatusChange={handleStatusChange} onPublish={handlePublish} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

/**
 * Shop SEO — Content Studio tab for the Payhip digital-products blog pipeline.
 *
 * Manages 20 blog-ready articles for the 20 digital products listed on Payhip.
 * Jobs: queued → drafting → drafted → shipped.
 * Each blog lives on the Apex site at /blog/shop-<product-slug>.
 */

import React from 'react'
import { studioTokens as E } from './studio-tokens'

const C = E

// ---- Types ----

interface ShopProduct {
  slug: string
  title: string
  price: number
  format: string
  category: string
  payhipUrl: string
  tags: string[]
  publishDay?: number
  shortDescription: string
}

interface QueueItem {
  slug: string
  status: 'queued' | 'drafting' | 'drafted' | 'shipped'
  blogSlug: string
  blogTitle: string
  createdAt: string
  draftedAt?: string
  shippedAt?: string
  product?: ShopProduct
}

interface QueueStats {
  total: number
  queued: number
  drafting: number
  drafted: number
  shipped: number
}

interface GenerateResult {
  slug: string
  product: { title: string; price: string }
  pageTsx: string
}

// ---- Style tokens ----

const TYPE = {
  display:   { fontFamily: C.serif, fontSize: 36,  lineHeight: 1.05, fontWeight: 700, color: C.inkBlack },
  kicker:    { fontFamily: C.serif, fontSize: 28,  lineHeight: 1.1,  fontWeight: 700, color: C.inkBlack },
  headline:  { fontFamily: C.serif, fontSize: 22,  lineHeight: 1.15, fontWeight: 600, color: C.inkBlack },
  body:      { fontFamily: C.serif, fontSize: 14,  lineHeight: 1.55, color: C.ink },
  caption:   { fontFamily: C.mono,  fontSize: 10,  lineHeight: 1.4,  color: C.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase' as const },
  micro:     { fontFamily: C.mono,  fontSize: 9,   letterSpacing: '0.10em', color: C.inkDim },
  metric:    { fontFamily: C.mono,  fontSize: 11, color: C.ink, fontWeight: 600 },
} as const

const STATUS_COLORS: Record<string, string> = {
  queued: '#9CA3AF',
  drafting: '#3B82F6',
  drafted: '#10B981',
  shipped: '#8B5CF6',
}

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  drafting: 'Drafting...',
  drafted: 'Draft ready',
  shipped: 'Shipped',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function fmtPrice(amount: number): string {
  return `$${amount}`
}

// ---- Main Component ----

export default function AdminShopSeo() {
  const [queue, setQueue] = React.useState<QueueItem[]>([])
  const [stats, setStats] = React.useState<QueueStats | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [generating, setGenerating] = React.useState<Set<string>>(new Set())
  const [preview, setPreview] = React.useState<GenerateResult | null>(null)
  const [filter, setFilter] = React.useState<string>('all')
  const [notice, setNotice] = React.useState<string | null>(null)

  const fetchQueue = React.useCallback(async () => {
    try {
      const res = await fetch('/api/content-studio/shop-seo/queue', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('Failed to load queue')
      const data = await res.json()
      setQueue(data.queue || [])
      setStats(data.stats || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { fetchQueue() }, [fetchQueue])

  const generateDraft = async (slug: string) => {
    setGenerating(prev => new Set(prev).add(slug))
    setNotice(null)
    try {
      const res = await fetch('/api/content-studio/shop-seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: 'Generation failed' } }))
        throw new Error(err.error?.message || `HTTP ${res.status}`)
      }
      const result: GenerateResult = await res.json()
      setPreview(result)
      setNotice(`✓ Drafted "${result.product.title}"`)
      await fetchQueue()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(prev => {
        const next = new Set(prev)
        next.delete(slug)
        return next
      })
    }
  }

  const filtered = filter === 'all'
    ? queue
    : queue.filter(q => q.status === filter)

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: C.serif, color: C.inkMuted }}>
        Loading shop queue...
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stats bar */}
      {stats && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8,
          padding: '16px 20px', background: E.paper, border: `1px solid ${E.hairline}`, borderRadius: 0,
        }}>
          <Stat label="Total" value={stats.total} />
          <Stat label="Queued" value={stats.queued} color="#9CA3AF" />
          <Stat label="Drafted" value={stats.drafted} color="#10B981" />
          <Stat label="Shipped" value={stats.shipped} color="#8B5CF6" />
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{
          padding: '14px 18px', background: '#FEF2F2', borderLeft: `4px solid #DC2626`,
          fontFamily: C.mono, fontSize: 11, color: '#991B1B', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#DC2626', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Success notice */}
      {notice && (
        <div style={{
          padding: '14px 18px', background: '#ECFDF5', borderLeft: `4px solid #10B981`,
          fontFamily: C.mono, fontSize: 11, color: '#065F46', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#065F46', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Filter row */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(['all', 'queued', 'drafted', 'shipped'] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 12px', borderRadius: 0, cursor: 'pointer',
              border: filter === f ? `2px solid ${E.gold}` : `1px solid ${E.hairline}`,
              background: filter === f ? E.goldSoft : E.ivory,
              fontFamily: C.mono, fontSize: 10, fontWeight: 600, color: E.ink,
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {stats && f !== 'all' && ` (${stats[f] ?? 0})`}
          </button>
        ))}
        {stats && <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMuted, paddingTop: 6 }}>
          {stats.total} products · {stats.shipped} shipped · {stats.drafted - stats.shipped} drafts pending
        </span>}
      </div>

      {/* Product grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
        {filtered.map(item => {
          const isGenerating = generating.has(item.slug)
          const statusColor = STATUS_COLORS[item.status] || '#9CA3AF'
          return (
            <div
              key={item.slug}
              style={{
                padding: 14, background: E.paper,
                border: `1px solid ${E.hairline}`, borderRadius: 0,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}
            >
              {/* Status + slug */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 0, fontFamily: C.mono, fontSize: 9, fontWeight: 700,
                  background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}44`,
                }}>
                  {STATUS_LABELS[item.status] || item.status}
                </span>
                <span style={{ fontFamily: C.mono, fontSize: 9, color: C.inkDim }}>
                  {item.product ? fmtPrice(item.product.price) : ''}
                </span>
              </div>

              {/* Title */}
              <div style={{ fontFamily: C.serif, fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>
                {item.blogTitle}
              </div>

              {/* Blog slug */}
              <div style={{ fontFamily: C.mono, fontSize: 9, color: C.inkDim }}>
                yousafeconsultancy.com/blog/{item.blogSlug}
              </div>

              {/* Meta row */}
              {item.product && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ padding: '0 5px', fontFamily: C.mono, fontSize: 8, color: C.inkMuted, background: C.surface3, borderRadius: 2 }}>
                    {item.product.format}
                  </span>
                  <span style={{ padding: '0 5px', fontFamily: C.mono, fontSize: 8, color: C.inkMuted, background: C.surface3, borderRadius: 2 }}>
                    {item.product.category}
                  </span>
                  {item.product.publishDay && (
                    <span style={{ padding: '0 5px', fontFamily: C.mono, fontSize: 8, color: C.inkMuted, background: C.surface3, borderRadius: 2 }}>
                      Day {item.product.publishDay}
                    </span>
                  )}
                </div>
              )}

              {/* Timeline */}
              <div style={{ fontFamily: C.mono, fontSize: 9, color: C.inkDim }}>
                Created {timeAgo(item.createdAt)}
                {item.draftedAt && ` · Drafted ${timeAgo(item.draftedAt)}`}
                {item.shippedAt && ` · Shipped ${timeAgo(item.shippedAt)}`}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {(item.status === 'queued' || item.status === 'drafting') && (
                  <button
                    type="button"
                    onClick={() => generateDraft(item.slug)}
                    disabled={isGenerating}
                    style={{
                      padding: '6px 12px', borderRadius: 0, cursor: isGenerating ? 'progress' : 'pointer',
                      border: 'none', background: isGenerating ? '#93C5FD' : E.gold,
                      fontFamily: C.mono, fontSize: 10, fontWeight: 700, color: isGenerating ? '#1E3A5F' : E.ivory,
                    }}
                  >
                    {isGenerating ? 'Generating...' : 'Generate Draft'}
                  </button>
                )}
                {item.status === 'drafted' && (
                  <button
                    type="button"
                    onClick={() => {
                      generateDraft(item.slug)
                    }}
                    disabled={isGenerating}
                    style={{
                      padding: '6px 12px', borderRadius: 0, cursor: isGenerating ? 'progress' : 'pointer',
                      border: `1px solid ${E.gold}`, background: 'transparent',
                      fontFamily: C.mono, fontSize: 10, fontWeight: 700, color: E.gold,
                    }}
                  >
                    {isGenerating ? 'Regenerating...' : 'Regenerate'}
                  </button>
                )}
                {item.status === 'shipped' && (
                  <a
                    href={`https://yousafeconsultancy.com/blog/${item.blogSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '6px 12px', borderRadius: 0,
                      border: `1px solid ${C.green}`, background: 'transparent',
                      fontFamily: C.mono, fontSize: 10, fontWeight: 700, color: C.green,
                      textDecoration: 'none', display: 'inline-block',
                    }}
                  >
                    View Live →
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Preview panel */}
      {preview && (
        <div style={{
          marginTop: 10, padding: 18, background: E.paper,
          border: `2px solid ${E.gold}`, borderRadius: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ ...TYPE.caption, color: E.gold, marginBottom: 4 }}>GENERATED DRAFT</div>
              <div style={{ fontFamily: C.serif, fontSize: 16, fontWeight: 700, color: C.ink }}>
                {preview.product.title}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPreview(null)}
              style={{
                padding: '4px 10px', borderRadius: 0, cursor: 'pointer',
                border: `1px solid ${E.hairline}`, background: 'transparent',
                fontFamily: C.mono, fontSize: 10, fontWeight: 600, color: C.inkMuted,
              }}
            >
              Close preview
            </button>
          </div>
          <div style={{
            maxHeight: 480, overflow: 'auto',
            background: '#1E293B', color: '#E2E8F0', borderRadius: 0,
            padding: 16, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {preview.pageTsx.slice(0, 8000)}
            {preview.pageTsx.length > 8000 && '\n\n... (truncated)'}
          </div>
          <div style={{ marginTop: 8, fontFamily: C.mono, fontSize: 10, color: C.inkMuted }}>
            Blog path: yousafeconsultancy.com/blog/{preview.slug}
          </div>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', fontFamily: C.serif, fontStyle: 'italic', color: C.inkMuted,
        }}>
          No products match this filter.
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: C.mono, fontSize: 28, fontWeight: 800, color: color || C.ink }}>{value}</div>
      <div style={{ fontFamily: C.mono, fontSize: 9, color: C.inkMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  )
}
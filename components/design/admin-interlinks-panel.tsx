'use client'
import React, { useState } from 'react'

// Colors match admin-content-studio.tsx
const C = {
  surface: '#FFFFFF', surface2: '#F4F2EE', border: 'rgba(0,0,0,0.08)',
  gold: '#9A7B3B', text: '#1F2937', textMuted: '#6B7280', textDim: '#9CA3AF',
  navy: '#0F172A', green: '#166534', orange: '#D97706',
  serif: "var(--portal-font-display, 'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif)",
  mono: "var(--portal-font-mono, 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace)",
}

interface InterlinkSuggestion {
  label: string
  url: string
  site: string
  kind: string
  priority: number
  matchedOn: string[]
  note?: string
}

interface Props {
  topic: string
  keywords: string[]
}

export default function AdminInterlinksPanel({ topic, keywords }: Props) {
  const [suggestions, setSuggestions] = useState<InterlinkSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchInterlinks = async () => {
    if (!topic.trim() && keywords.length === 0) return
    setLoading(true)
    setError(null)
    setFetched(true)
    try {
      const res = await fetch('/api/content-studio/interlinks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), keywords, maxResults: 5 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setSuggestions(data.suggestions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load interlinks')
    } finally {
      setLoading(false)
    }
  }

  const siteIcon = (site: string) => {
    switch (site) {
      case 'marketplace': return '🏪'
      case 'caseworks': return '📚'
      case 'regional': return '🌐'
      default: return '🔗'
    }
  }

  const siteColor = (site: string) => {
    switch (site) {
      case 'marketplace': return C.green
      case 'caseworks': return C.navy
      case 'regional': return C.orange
      default: return C.textMuted
    }
  }

  const hasData = topic.trim() || keywords.length > 0

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
      borderTop: `3px solid ${C.gold}`, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text, fontFamily: C.serif }}>
            🔗 Interlink Suggestions
          </h3>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>
            Recommended internal links (caseworks → regional → marketplace funnel)
          </p>
        </div>
        <button
          onClick={fetchInterlinks}
          disabled={loading || !hasData}
          style={{
            padding: '7px 16px', borderRadius: 6, border: 'none',
            cursor: hasData && !loading ? 'pointer' : 'not-allowed',
            background: hasData && !loading ? C.navy : C.textDim,
            color: '#FFFFFF', fontSize: 12, fontWeight: 600,
            fontFamily: 'inherit', opacity: hasData && !loading ? 1 : 0.5,
          }}
        >
          {loading ? 'Searching…' : fetched ? 'Refresh' : 'Find links'}
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: fetched || suggestions.length > 0 ? '16px 18px' : '32px 18px' }}>
        {!fetched && !loading && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
              {hasData
                ? 'Click "Find links" to discover internal linking opportunities'
                : 'Enter a topic and keywords in the generate form above, then search for interlinks'}
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
              Uses the ecosystem link registry: caseworks, regional sites, and marketplace
            </div>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: 24, color: C.textMuted }}>
            Searching {29} link rules…
          </div>
        )}

        {error && (
          <div style={{
            background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 6,
            padding: '10px 14px', fontSize: 12, color: '#DC2626',
            marginBottom: 12, fontFamily: C.mono,
          }}>
            {error}
          </div>
        )}

        {!loading && suggestions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggestions.map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 14px', borderRadius: 6,
                background: C.surface2, border: `1px solid ${C.border}`,
                borderLeft: `3px solid ${siteColor(s.site)}`,
              }}>
                {/* Rank */}
                <div style={{
                  width: 24, height: 24, borderRadius: 12,
                  background: C.navy, color: '#FFFFFF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, fontFamily: C.mono,
                  flexShrink: 0, marginTop: 2,
                }}>
                  {i + 1}
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text, wordBreak: 'break-word' }}>
                      {s.label}
                    </span>
                  </div>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11, color: C.textMuted, fontFamily: C.mono,
                      textDecoration: 'none', display: 'block', marginBottom: 4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}
                  >
                    {s.url} ↗
                  </a>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 10, padding: '1px 7px', borderRadius: 999,
                      background: siteColor(s.site), color: '#FFFFFF',
                      fontFamily: C.mono, fontWeight: 600,
                    }}>
                      {siteIcon(s.site)} {s.site}
                    </span>
                    <span style={{
                      fontSize: 10, padding: '1px 7px', borderRadius: 999,
                      background: C.textDim, color: '#FFFFFF',
                      fontFamily: C.mono,
                    }}>
                      {s.kind}
                    </span>
                    {s.matchedOn.slice(0, 3).map((m) => (
                      <span key={m} style={{
                        fontSize: 10, padding: '1px 7px', borderRadius: 999,
                        background: '#F3F4F6', color: C.textMuted,
                        fontFamily: C.mono,
                      }}>
                        {m}
                      </span>
                    ))}
                  </div>
                  {s.note && (
                    <div style={{ fontSize: 10, color: C.textDim, marginTop: 3, fontStyle: 'italic' }}>
                      {s.note}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && fetched && suggestions.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
              No matching interlinks found
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
              Try broadening the topic or adding more keywords
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

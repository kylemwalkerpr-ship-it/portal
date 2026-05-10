// @ts-nocheck
'use client'
import React from 'react'
import { C, Card, Badge, Btn } from './shared'

export default function FindAttorney() {
  const [attorneys, setAttorneys] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [selected, setSelected] = React.useState(null)

  React.useEffect(() => {
    let cancelled = false
    fetch('/api/attorneys', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (cancelled) return
        if (!r.ok) {
          setError(payload?.error || 'Could not load attorneys.')
          return
        }
        setAttorneys(Array.isArray(payload?.attorneys) ? payload.attorneys : [])
      })
      .catch((e) => {
        if (cancelled) return
        setError(e.message || 'Could not load attorneys.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return attorneys
    return attorneys.filter((a) =>
      [a.full_name, a.jurisdictions, a.practice_areas, a.bio]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q)),
    )
  }, [attorneys, query])

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px', color: C.text }}>
          Find an Attorney
        </h2>
        <p style={{ color: C.textMuted, fontSize: '13px', margin: 0 }}>
          Browse our verified panel. Pick someone whose jurisdictions and practice areas match
          your case.
        </p>
      </div>

      <input
        type="text"
        placeholder="Search by name, jurisdiction, or practice area..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: '100%',
          maxWidth: '420px',
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          padding: '10px 12px',
          color: C.text,
          fontSize: '14px',
          fontFamily: 'inherit',
          marginBottom: '20px',
        }}
      />

      {loading && <div style={{ color: C.textMuted, fontSize: '14px' }}>Loading attorneys...</div>}

      {error && (
        <div
          style={{
            background: 'rgba(220,38,38,0.10)',
            border: '1px solid rgba(220,38,38,0.25)',
            color: C.red,
            padding: '12px 14px',
            borderRadius: '10px',
            fontSize: '13px',
            marginBottom: '16px',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <Card>
          <div style={{ padding: '24px', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>
            {attorneys.length === 0
              ? 'No attorneys are available yet. Check back soon.'
              : 'No attorneys match your search.'}
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {filtered.map((a) => (
          <AttorneyCard key={a.id} attorney={a} onSelect={() => setSelected(a)} />
        ))}
      </div>

      {selected && <AttorneyDetailModal attorney={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function AttorneyCard({ attorney, onSelect }) {
  const hasRatings = attorney.rating_count > 0
  return (
    <Card>
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: C.text }}>{attorney.full_name}</div>
            {attorney.credential_type && (
              <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>{attorney.credential_type}</div>
            )}
          </div>
          {!attorney.available && <Badge color="orange">Limited</Badge>}
        </div>

        <RatingDisplay count={attorney.rating_count} avg={attorney.rating_avg} />

        {attorney.jurisdictions && (
          <CardRow label="Jurisdictions" value={attorney.jurisdictions} />
        )}
        {attorney.practice_areas && (
          <CardRow label="Practice areas" value={attorney.practice_areas} />
        )}
        {attorney.bio && (
          <p
            style={{
              color: C.textMuted,
              fontSize: '13px',
              lineHeight: 1.5,
              margin: 0,
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 3,
              overflow: 'hidden',
            }}
          >
            {attorney.bio}
          </p>
        )}

        <div style={{ marginTop: '4px' }}>
          <Btn variant="primary" size="sm" onClick={onSelect}>
            View profile
          </Btn>
        </div>
      </div>
    </Card>
  )
}

function CardRow({ label, value }) {
  return (
    <div style={{ fontSize: '12px' }}>
      <span style={{ color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '6px' }}>
        {label}:
      </span>
      <span style={{ color: C.text }}>{value}</span>
    </div>
  )
}

function RatingDisplay({ count, avg }) {
  if (!count || !avg) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Badge color="cyan">New</Badge>
        <span style={{ color: C.textDim, fontSize: '12px' }}>No reviews yet</span>
      </div>
    )
  }
  const filled = Math.round(avg)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ letterSpacing: '2px', color: '#f5b400', fontSize: '14px' }}>
        {'★'.repeat(filled)}
        <span style={{ color: C.border2 }}>{'★'.repeat(5 - filled)}</span>
      </span>
      <span style={{ color: C.text, fontSize: '13px', fontWeight: 600 }}>{avg.toFixed(1)}</span>
      <span style={{ color: C.textDim, fontSize: '12px' }}>({count})</span>
    </div>
  )
}

function AttorneyDetailModal({ attorney, onClose }) {
  React.useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: '14px',
          padding: '24px 26px',
          maxWidth: '560px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          color: C.text,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '20px' }}>{attorney.full_name}</div>
            {attorney.credential_type && (
              <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '2px' }}>{attorney.credential_type}</div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: C.textMuted,
              fontSize: '22px',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <RatingDisplay count={attorney.rating_count} avg={attorney.rating_avg} />
        </div>

        <div style={{ display: 'grid', gap: '14px' }}>
          {attorney.bio && <DetailField label="Bio" value={attorney.bio} multiline />}
          {attorney.jurisdictions && (
            <DetailField label="Jurisdictions" value={attorney.jurisdictions} />
          )}
          {attorney.practice_areas && (
            <DetailField label="Practice areas" value={attorney.practice_areas} />
          )}
          {attorney.capacity && <DetailField label="Capacity" value={attorney.capacity} />}
          {attorney.profile_url && (
            <DetailField label="Public profile" value={attorney.profile_url} link />
          )}
        </div>

        <div style={{ marginTop: '20px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Btn variant="primary" size="sm" onClick={onClose}>
            Close
          </Btn>
        </div>
        <p style={{ color: C.textDim, fontSize: '12px', marginTop: '12px', marginBottom: 0 }}>
          Engagement and rating tools will appear here once your case is matched with this
          attorney.
        </p>
      </div>
    </div>
  )
}

function DetailField({ label, value, link, multiline }) {
  return (
    <div>
      <div
        style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: C.textDim,
          marginBottom: '4px',
        }}
      >
        {label}
      </div>
      {link ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          style={{ color: C.cyan, fontSize: '14px', wordBreak: 'break-all' }}
        >
          {value}
        </a>
      ) : (
        <div
          style={{
            fontSize: '14px',
            whiteSpace: multiline ? 'pre-wrap' : 'normal',
            wordBreak: 'break-word',
            color: C.text,
          }}
        >
          {value}
        </div>
      )}
    </div>
  )
}

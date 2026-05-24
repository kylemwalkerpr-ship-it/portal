'use client'

/**
 * InquiryBubble — renders a conversation_messages row of type='inquiry'
 * inside a chat thread. Shows a stylized "case brief" card.
 */
import React from 'react'

const INDIGO = '#3C3B6E'
const BRICK = '#B22234'
const GOLD = '#9A7B3B'

function urgencyColor(u: string | undefined | null): string {
  const v = (u || '').toLowerCase()
  if (v === 'high' || v === 'urgent' || v === 'critical') return BRICK
  if (v === 'low') return '#64748B'
  return INDIGO
}

function flagFromCountryCode(code: string | undefined | null): string {
  if (!code || code.length !== 2) return ''
  const base = 0x1f1e6
  const A = 'A'.charCodeAt(0)
  return String.fromCodePoint(
    base + (code.toUpperCase().charCodeAt(0) - A),
    base + (code.toUpperCase().charCodeAt(1) - A),
  )
}

export default function InquiryBubble({ message, viewerRole }: { message: any; viewerRole?: string | null }) {
  const md = (message.metadata || {}) as Record<string, any>
  const snap = {
    id: message.ref_inquiry_id || md.inquiry_id,
    country: md.country,
    case_type: md.case_type,
    case_type_label: md.case_type_label,
    urgency: md.urgency,
    recommended_tier: md.recommended_tier,
    answers: (md.answers || null) as Record<string, unknown> | null,
  }

  const [live, setLive] = React.useState(snap)

  React.useEffect(() => {
    const id = message.ref_inquiry_id
    if (!id) return
    let cancelled = false
    fetch(`/api/attorney/inquiries/${id}`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        const row = d.inquiry || d
        if (!row || typeof row !== 'object') return
        setLive((prev) => ({
          ...prev,
          id: row.id || prev.id,
          country: row.country || prev.country,
          case_type: row.case_type || prev.case_type,
          case_type_label: row.case_type_label || prev.case_type_label,
          urgency: row.urgency || prev.urgency,
          recommended_tier: row.recommended_tier || prev.recommended_tier,
          answers: (row.answers as Record<string, unknown>) || prev.answers,
        }))
      })
      .catch(() => { /* fallback */ })
    return () => { cancelled = true }
  }, [message.ref_inquiry_id])

  const answersList = React.useMemo(() => {
    const a = live.answers
    if (!a || typeof a !== 'object') return [] as Array<[string, string]>
    return Object.entries(a)
      .slice(0, 3)
      .map(([k, v]) => [k.replace(/_/g, ' '), typeof v === 'string' ? v : JSON.stringify(v)] as [string, string])
  }, [live.answers])

  const flag = flagFromCountryCode(live.country)

  return (
    <div className="inq-card">
      <div className="inq-card-head">
        <span className="inq-card-eyebrow">Case brief</span>
      </div>
      <h4 className="inq-card-title">
        {flag ? <span className="inq-card-flag">{flag}</span> : null} {live.case_type_label || live.case_type || 'Inquiry'}
      </h4>
      <div className="inq-card-meta">
        {live.urgency ? (
          <span style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6,
            padding: '2px 8px', borderRadius: 999,
            background: `${urgencyColor(live.urgency)}14`,
            color: urgencyColor(live.urgency),
          }}>{live.urgency}</span>
        ) : null}
        {live.recommended_tier ? (
          <span style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6,
            padding: '2px 8px', borderRadius: 999,
            background: `${INDIGO}10`, color: INDIGO,
          }}>Tier · {live.recommended_tier}</span>
        ) : null}
      </div>

      {answersList.length > 0 ? (
        <div className="inq-card-brief">
          <div className="inq-card-brief-head">Intake answers</div>
          <dl className="inq-card-brief-list">
            {answersList.map(([k, v]) => (
              <div key={k} className="inq-card-brief-row">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : message.body ? (
        <div className="inq-card-summary">{message.body}</div>
      ) : null}

      {live.recommended_tier && (
        <div className="inq-card-tier">
          <span className="inq-card-tier-lbl">Recommended tier</span>
          <span className="inq-card-tier-val">{live.recommended_tier}</span>
        </div>
      )}

      {live.id ? (
        <div className="inq-card-cta">
          <a
            href={(() => {
              const base = 'https://portal.yousafeconsultancy.com/dashboard'
              if (viewerRole === 'attorney' || viewerRole === 'consultant') {
                return `${base}?page=mine&open=${encodeURIComponent(live.id)}`
              }
              return `${base}?page=inquiries&open=${encodeURIComponent(live.id)}`
            })()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', background: INDIGO, color: '#fff',
              borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}
          >
            Open full brief →
          </a>
        </div>
      ) : null}
    </div>
  )
}

'use client'

/**
 * InquiryBubble — renders a conversation_messages row of type='inquiry'
 * inside a chat thread. Shows a stylized "case brief" card with country flag,
 * case type, urgency, recommended tier, and the first three intake answers.
 *
 * Tries the attorney inquiry endpoint first; falls back to `metadata`/`body`
 * on the message if the inquiry is not accessible to the caller.
 */
import React from 'react'
import Link from 'next/link'

const INDIGO = '#3C3B6E'
const BRICK = '#B22234'
const GOLD = '#9A7B3B'
const INK = '#1D2433'
const INK_MID = '#4A4F5B'
const INK_SOFT = '#7B7B72'
const BORDER = '#D9D1BD'
const VELLUM = '#FFFEF9'
const SERIF = "var(--font-lora), Lora, Georgia, serif"
const SANS = "var(--font-inter), Inter, system-ui, sans-serif"

type InquirySnapshot = {
  id?: string
  country?: string
  flag?: string
  case_type?: string
  case_type_label?: string
  urgency?: string
  recommended_tier?: string
  answers?: Record<string, unknown> | null
}

interface InquiryBubbleProps {
  message: {
    id: string
    body?: string | null
    metadata?: Record<string, any> | null
    ref_inquiry_id?: string | null
    created_at: string
  }
}

function urgencyColor(u: string | undefined | null): string {
  const v = (u || '').toLowerCase()
  if (v === 'high' || v === 'urgent' || v === 'critical') return BRICK
  if (v === 'low') return INK_SOFT
  return INDIGO
}

// Best-effort flag from a 2-letter ISO country code; harmless if `code` is invalid.
function flagFromCountryCode(code: string | undefined | null): string {
  if (!code || code.length !== 2) return ''
  const base = 0x1f1e6
  const A = 'A'.charCodeAt(0)
  return String.fromCodePoint(
    base + (code.toUpperCase().charCodeAt(0) - A),
    base + (code.toUpperCase().charCodeAt(1) - A),
  )
}

export default function InquiryBubble({ message }: InquiryBubbleProps) {
  const [snap, setSnap] = React.useState<InquirySnapshot>(() => {
    const md = (message.metadata || {}) as Record<string, any>
    return {
      id: message.ref_inquiry_id || md.inquiry_id || undefined,
      country: md.country,
      flag: md.flag,
      case_type: md.case_type,
      case_type_label: md.case_type_label,
      urgency: md.urgency,
      recommended_tier: md.recommended_tier,
      answers: (md.answers || null) as Record<string, unknown> | null,
    }
  })

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
        setSnap((prev) => ({
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
      .catch(() => { /* fallback to metadata already in state */ })
    return () => { cancelled = true }
  }, [message.ref_inquiry_id])

  const answersList = React.useMemo(() => {
    const a = snap.answers
    if (!a || typeof a !== 'object') return [] as Array<[string, string]>
    return Object.entries(a)
      .slice(0, 3)
      .map(([k, v]) => [k.replace(/_/g, ' '), typeof v === 'string' ? v : JSON.stringify(v)] as [string, string])
  }, [snap.answers])

  const flag = snap.flag || flagFromCountryCode(snap.country)

  return (
    <div
      style={{
        background: VELLUM,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: 14,
        fontFamily: SANS,
        maxWidth: 460,
      }}
    >
      <div style={{ fontFamily: SERIF, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: GOLD }}>
        Case brief
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        {flag ? <span style={{ fontSize: 22 }}>{flag}</span> : null}
        <div style={{ fontFamily: SERIF, fontSize: 18, color: INK, fontWeight: 600 }}>
          {snap.case_type_label || snap.case_type || 'Inquiry'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {snap.urgency ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              padding: '2px 8px',
              borderRadius: 999,
              background: `${urgencyColor(snap.urgency)}14`,
              color: urgencyColor(snap.urgency),
            }}
          >
            {snap.urgency}
          </span>
        ) : null}
        {snap.recommended_tier ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              padding: '2px 8px',
              borderRadius: 999,
              background: `${INDIGO}10`,
              color: INDIGO,
            }}
          >
            Tier · {snap.recommended_tier}
          </span>
        ) : null}
      </div>

      {answersList.length > 0 ? (
        <dl style={{ margin: '12px 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 4 }}>
          {answersList.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt style={{ fontSize: 12, color: INK_SOFT, textTransform: 'capitalize' }}>{k}</dt>
              <dd style={{ margin: 0, fontSize: 13, color: INK_MID, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {v}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      ) : message.body ? (
        <div style={{ marginTop: 12, fontSize: 13, color: INK_MID, whiteSpace: 'pre-wrap' }}>{message.body}</div>
      ) : null}

      {snap.id ? (
        <div style={{ marginTop: 12 }}>
          <Link
            href={`/dashboard/inquiries/${snap.id}`}
            style={{ color: INDIGO, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
          >
            Open full brief →
          </Link>
        </div>
      ) : null}
    </div>
  )
}

'use client'
import React from 'react'

/**
 * Admin → Consultant Management (Fiverr-scale review queue).
 *
 * Server-side paginated, full-text searchable, multi-filter, bulk-actionable.
 * Mirror of admin-consultant-applications adapted for the consultant lane.
 *
 * Tabs:
 *   • Queue       — pending applications, sortable + bulk approve/decline
 *   • Triage      — risk-flagged + aged pending (≥7 days)
 *   • Decided     — approved + declined + waitlisted, with reviewer attribution
 *   • Analytics   — funnel + throughput + decision time
 */

const NAVY='#0F172A', GOLD='#9A7B3B', GOLD2='#C4A45A', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='#0E7C8E', PURPLE='#3D2B6B'
const BG='#F7F5F0', SURFACE='#FFFFFF', BORDER='#DDD8CE', BORDER2='#F2EFE9', TEXT='#1A1F2E', MUTED='#5C6070', DIM='#9097A8'
const SERIF=`'Cormorant Garamond', Georgia, serif`, SANS=`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`, MONO=`'SF Mono', Menlo, Consolas, monospace`

const fmtN = n => Number(n ?? 0).toLocaleString('en-US')
const fmtPct = n => `${Number(n ?? 0).toFixed(1)}%`
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
const fmtRelative = s => {
  if (!s) return '—'
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d}d ago`
  if (d < 365) return `${Math.floor(d/30)}mo ago`
  return `${Math.floor(d/365)}y ago`
}

const STATUS_STYLES = {
  pending:  { bg: '#FEF5E4', text: AMBER, label: 'Pending' },
  approved: { bg: '#EAF5EE', text: GREEN, label: 'Approved' },
  declined: { bg: '#FAEAEA', text: RED,   label: 'Declined' },
  waitlist: { bg: '#EDEAF7', text: PURPLE, label: 'Waitlist' },
  withdrawn:{ bg: '#F2EFE9', text: MUTED, label: 'Withdrawn' },
}

const RISK_FLAG_LABELS = {
  no_registration_number:   'No registration number',
  no_insurance:             'No insurance disclosed',
  free_email:               'Free-mail address',
  missing_jurisdictions:    'No jurisdictions',
  missing_specialties:      'No specialties',
  suspicious_profile_url:   'Suspicious profile URL',
}

// ── Reusable primitives ─────────────────────────────────────────────────────
function StatTile({ label, value, accent = NAVY, sub }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 28, color: accent, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{sub}</div>}
    </div>
  )
}

function StatusBadge({ status }) {
  const cfg = STATUS_STYLES[status] || STATUS_STYLES.pending
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
      letterSpacing: '.04em', textTransform: 'uppercase',
      background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.text}33`,
    }}>{cfg.label}</span>
  )
}

function RiskBar({ score, flags }) {
  const n = Math.max(0, Math.min(100, Number(score || 0)))
  const color = n >= 50 ? RED : n >= 25 ? AMBER : GREEN
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 64, height: 4, background: BORDER2, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${n}%`, height: '100%', background: color }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 11, color: TEXT, fontVariantNumeric: 'tabular-nums', minWidth: 32 }}>{n}</span>
      {Array.isArray(flags) && flags.length > 0 && (
        <span style={{ fontSize: 10, color: MUTED, fontFamily: MONO }}>{flags.length} flag{flags.length === 1 ? '' : 's'}</span>
      )}
    </div>
  )
}

function Pill({ active, onClick, children, count }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 999, border: `1px solid ${active ? CYAN : BORDER}`,
      background: active ? `${CYAN}15` : SURFACE, color: active ? CYAN : MUTED,
      fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      {children}
      {typeof count === 'number' && <span style={{ fontFamily: MONO, opacity: .7, fontWeight: 600 }}>({fmtN(count)})</span>}
    </button>
  )
}

function Section({ title, right, children }) {
  return (
    <section style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
      {(title || right) && (
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {title && <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: TEXT, letterSpacing: '-.01em' }}>{title}</div>}
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

// ── Drawer with full application detail + event timeline ────────────────────
function DetailDrawer({ application, onClose, onDecide, decisionPending, onLifecycleChanged }) {
  const [notes, setNotes] = React.useState('')
  const [events, setEvents] = React.useState([])
  const [eventsLoading, setEventsLoading] = React.useState(true)
  const [impact, setImpact] = React.useState(null)
  const [impactLoading, setImpactLoading] = React.useState(false)
  const [lifecyclePending, setLifecyclePending] = React.useState(false)
  const [lifecycleNotice, setLifecycleNotice] = React.useState(null)

  const flashLifecycle = (type, msg) => {
    setLifecycleNotice({ type, msg })
    setTimeout(() => setLifecycleNotice(null), 4000)
  }

  React.useEffect(() => {
    if (!application?.id) return
    setEventsLoading(true)
    fetch(`/api/admin/consultant-applications/${application.id}/events`, { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})))
      .then(d => setEvents(d.events || []))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false))
  }, [application?.id])

  React.useEffect(() => {
    if (!application?.id || application.status !== 'approved') { setImpact(null); return }
    setImpactLoading(true)
    fetch(`/api/admin/consultant-applications/${application.id}/impact`, { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})))
      .then(d => setImpact(d.impact || null))
      .catch(() => setImpact(null))
      .finally(() => setImpactLoading(false))
  }, [application?.id, application?.status])

  async function toggleSuspend(targetStatus) {
    if (!application?.profile_id) { flashLifecycle('err', 'No linked profile.'); return }
    setLifecyclePending(true)
    try {
      const r = await fetch(`/api/admin/users/${application.profile_id}`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Update failed')
      flashLifecycle('ok', `Consultant ${targetStatus === 'suspended' ? 'suspended' : 'reactivated'}.`)
      onLifecycleChanged && onLifecycleChanged()
    } catch (e) { flashLifecycle('err', e.message) }
    finally { setLifecyclePending(false) }
  }

  async function revokeApproval() {
    if (!window.confirm('Revoke this consultant’s approval? Their gigs will be paused, profile suspended, and a revocation email sent.')) return
    setLifecyclePending(true)
    try {
      const r = await fetch(`/api/admin/consultant-applications/${application.id}/revoke`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes || undefined }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Revoke failed')
      flashLifecycle('ok', 'Approval revoked.')
      onLifecycleChanged && onLifecycleChanged()
      onClose()
    } catch (e) { flashLifecycle('err', e.message) }
    finally { setLifecyclePending(false) }
  }

  async function deleteUser() {
    if (!application?.profile_id) { flashLifecycle('err', 'No linked profile.'); return }
    if (!window.confirm('Permanently delete this consultant’s user account? This cascades through gigs and related records and cannot be undone.')) return
    setLifecyclePending(true)
    try {
      const r = await fetch(`/api/admin/users/${application.profile_id}`, {
        method: 'DELETE', credentials: 'same-origin',
      })
      const d = await r.json().catch(() => ({}))
      if (r.status === 409) { flashLifecycle('err', d?.error || 'Cannot delete — user has open obligations.'); return }
      if (!r.ok) throw new Error(d?.error || 'Delete failed')
      flashLifecycle('ok', 'User deleted.')
      onLifecycleChanged && onLifecycleChanged()
      onClose()
    } catch (e) { flashLifecycle('err', e.message) }
    finally { setLifecyclePending(false) }
  }

  if (!application) return null

  const flagList = Array.isArray(application.risk_flags) ? application.risk_flags : []

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
      <button onClick={onClose} aria-label="Close" style={{ flex: 1, background: 'rgba(15,18,32,0.45)', border: 'none', cursor: 'pointer' }} />
      <aside style={{
        width: 'min(620px, 100vw)', height: '100vh', background: BG, display: 'flex', flexDirection: 'column',
        borderLeft: `1px solid ${BORDER}`, boxShadow: '-24px 0 60px rgba(15,18,32,0.18)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${BORDER}`, background: SURFACE }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <StatusBadge status={application.status} />
                {application.priority && application.priority !== 'normal' && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: application.priority === 'urgent' ? `${RED}15` : `${AMBER}15`, color: application.priority === 'urgent' ? RED : AMBER, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {application.priority}
                  </span>
                )}
              </div>
              <h2 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600, color: TEXT, margin: '0 0 4px', letterSpacing: '-.012em' }}>{application.full_name}</h2>
              <div style={{ fontSize: 13, color: MUTED, fontFamily: MONO }}>{application.email}{application.phone ? ` · ${application.phone}` : ''}</div>
              <div style={{ fontSize: 12, color: DIM, marginTop: 4, fontFamily: MONO }}>
                Submitted {fmtRelative(application.created_at)} · age {application.age_days || 0}d
              </div>
            </div>
            <button onClick={onClose} style={{ border: `1px solid ${BORDER}`, background: SURFACE, color: MUTED, borderRadius: 999, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 120px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Risk panel */}
          <Section title="Risk assessment">
            <div style={{ padding: '16px 18px', display: 'grid', gap: 10 }}>
              <RiskBar score={application.risk_score} flags={flagList} />
              {flagList.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {flagList.map(f => (
                    <span key={f} style={{ fontSize: 11, fontWeight: 600, color: RED, background: `${RED}10`, border: `1px solid ${RED}33`, padding: '3px 8px', borderRadius: 4 }}>
                      {RISK_FLAG_LABELS[f] || f}
                    </span>
                  ))}
                </div>
              )}
              {flagList.length === 0 && <div style={{ fontSize: 12, color: MUTED }}>No automated flags raised.</div>}
            </div>
          </Section>

          {/* Full application — single-column Google-form-style sheet so every
              answer renders in full (no two-column clipping). Lists every field
              the applicant submitted, in form order, for complete review. */}
          <Section title="Application">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr' }}>
              <FormRow label="Full name"                value={application.full_name} first />
              <FormRow label="Email"                    value={application.email} link={application.email ? `mailto:${application.email}` : undefined} />
              <FormRow label="Phone"                    value={application.phone} />
              <FormRow label="Consultant type"          value={application.consultant_type} />
              <FormRow label="Registration number"      value={application.registration_number} />
              <FormRow label="Jurisdictions"            value={application.jurisdictions} />
              <FormRow label="Specialties"              value={Array.isArray(application.specialties) ? application.specialties.join(', ') : application.specialties} />
              <FormRow label="Capacity / availability"  value={application.capacity} />
              <FormRow label="Professional indemnity / E&O insurance" value={application.malpractice_insurance} />
              <FormRow label="Public profile / website" value={application.profile_url} link={application.profile_url} />
              <FormRow label="Anything else we should know" value={application.notes} />
            </div>
          </Section>

          {/* Decision audit */}
          {application.status !== 'pending' && (
            <Section title="Decision">
              <div style={{ padding: '14px 18px', display: 'grid', gap: 8 }}>
                <Field label="Decided" value={`${application.status} · ${fmtRelative(application.decided_at)}`} />
                {application.reviewer_profile && <Field label="Reviewer" value={`${application.reviewer_profile.full_name || application.reviewer_profile.email}`} />}
                {application.decision_notes && <Field label="Notes" value={application.decision_notes} multiline />}
              </div>
            </Section>
          )}

          {/* Lifecycle controls — appear only for approved consultants. */}
          {application.status === 'approved' && (
            <Section title="Lifecycle">
              <div style={{ padding: '14px 18px', display: 'grid', gap: 12 }}>
                {/* Impact panel */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                  <StatTile
                    label="Gigs"
                    value={impact ? `${impact.gigs?.active ?? 0} / ${impact.gigs?.paused ?? 0} / ${impact.gigs?.archived ?? 0}` : (impactLoading ? '…' : '0 / 0 / 0')}
                    accent={NAVY}
                    sub="active / paused / archived"
                  />
                  <StatTile
                    label="Orders"
                    value={impact ? fmtN(impact.orders?.count ?? 0) : (impactLoading ? '…' : '0')}
                    accent={CYAN}
                    sub={impact ? `$${((impact.orders?.total_amount_cents ?? 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} GMV` : ''}
                  />
                  <StatTile
                    label="Reviews"
                    value={impact ? fmtN(impact.reviews?.count ?? 0) : (impactLoading ? '…' : '0')}
                    accent={GOLD}
                    sub={impact?.reviews?.count ? `${impact.reviews.avg_rating}★ avg` : ''}
                  />
                </div>
                {lifecycleNotice && (
                  <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: lifecycleNotice.type === 'ok' ? `${GREEN}10` : `${RED}10`, color: lifecycleNotice.type === 'ok' ? GREEN : RED, border: `1px solid ${lifecycleNotice.type === 'ok' ? GREEN : RED}33` }}>
                    {lifecycleNotice.msg}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => toggleSuspend('suspended')} disabled={lifecyclePending}
                    style={{ padding: '8px 14px', background: 'transparent', color: AMBER, border: `1px solid ${AMBER}55`, borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: lifecyclePending ? 'wait' : 'pointer' }}>
                    Suspend
                  </button>
                  <button onClick={() => toggleSuspend('active')} disabled={lifecyclePending}
                    style={{ padding: '8px 14px', background: 'transparent', color: GREEN, border: `1px solid ${GREEN}55`, borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: lifecyclePending ? 'wait' : 'pointer' }}>
                    Reactivate
                  </button>
                  <button onClick={revokeApproval} disabled={lifecyclePending}
                    style={{ padding: '8px 14px', background: RED, color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: lifecyclePending ? 'wait' : 'pointer' }}>
                    Revoke approval
                  </button>
                  <button onClick={deleteUser} disabled={lifecyclePending}
                    style={{ padding: '8px 14px', background: 'transparent', color: RED, border: `1px solid ${RED}55`, borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: lifecyclePending ? 'wait' : 'pointer' }}>
                    Delete user
                  </button>
                </div>
              </div>
            </Section>
          )}

          {/* Event timeline */}
          <Section title={`Timeline${events.length ? ` · ${events.length}` : ''}`}>
            <div style={{ padding: '14px 18px' }}>
              {eventsLoading ? (
                <div style={{ color: MUTED, fontSize: 13 }}>Loading…</div>
              ) : events.length === 0 ? (
                <div style={{ color: MUTED, fontSize: 13 }}>No prior events recorded.</div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {events.map(e => (
                    <div key={e.id} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                      <span style={{ fontFamily: MONO, color: DIM, minWidth: 90 }}>{fmtDate(e.created_at)}</span>
                      <span style={{ fontWeight: 700, color: TEXT, textTransform: 'capitalize' }}>{e.event_type}</span>
                      {e.from_status && e.to_status && <span style={{ color: MUTED }}>{e.from_status} → {e.to_status}</span>}
                      {e.notes && <span style={{ color: MUTED, fontStyle: 'italic' }}>“{e.notes}”</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {/* Decision controls (only for pending) */}
          {application.status === 'pending' && (
            <Section title="Decide">
              <div style={{ padding: '14px 18px', display: 'grid', gap: 10 }}>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Decision notes (visible to other admins; not sent in the email)"
                  rows={3}
                  style={{ padding: 10, fontSize: 13, fontFamily: SANS, border: `1px solid ${BORDER}`, borderRadius: 8, background: SURFACE, color: TEXT, resize: 'vertical', minHeight: 64 }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => onDecide(application.id, 'approve', notes)} disabled={decisionPending}
                    style={{ padding: '8px 16px', background: GREEN, color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: decisionPending ? 'wait' : 'pointer' }}>
                    {decisionPending ? 'Saving…' : 'Approve'}
                  </button>
                  <button onClick={() => onDecide(application.id, 'decline', notes)} disabled={decisionPending}
                    style={{ padding: '8px 16px', background: RED, color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: decisionPending ? 'wait' : 'pointer' }}>
                    Decline
                  </button>
                  <button onClick={() => onDecide(application.id, 'waitlist', notes)} disabled={decisionPending}
                    style={{ padding: '8px 16px', background: 'transparent', color: PURPLE, border: `1px solid ${PURPLE}55`, borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: decisionPending ? 'wait' : 'pointer' }}>
                    Waitlist
                  </button>
                </div>
              </div>
            </Section>
          )}
        </div>
      </aside>
    </div>
  )
}

// Google-form-style row: question label + full answer, hairline-divided,
// full-width so long answers wrap instead of clipping. Empty answers show "—".
function FormRow({ label, value, link, first }) {
  const has = value != null && String(value).trim() !== ''
  return (
    <div style={{ padding: '14px 18px', borderTop: first ? 'none' : `1px solid ${BORDER2}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: DIM, marginBottom: 6, fontFamily: MONO }}>{label}</div>
      {!has ? (
        <div style={{ fontSize: 14, color: DIM }}>—</div>
      ) : link ? (
        <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: CYAN, lineHeight: 1.6, wordBreak: 'break-word' }}>{value}</a>
      ) : (
        <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</div>
      )}
    </div>
  )
}

function Field({ label, value, multiline, link, span }) {
  return (
    <div style={{ gridColumn: span }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: DIM, marginBottom: 4, fontFamily: MONO }}>{label}</div>
      {!value ? (
        <div style={{ fontSize: 13, color: DIM }}>—</div>
      ) : link ? (
        <a href={value} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: CYAN, wordBreak: 'break-all' }}>{value}</a>
      ) : multiline ? (
        <div style={{ fontSize: 13, color: TEXT, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{value}</div>
      ) : (
        <div style={{ fontSize: 13, color: TEXT }}>{value}</div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
import AdminRoleUsersTable from './admin-role-users-table'

export default function AdminConsultantManagement() {
  // 'apps' = the review queue + lifecycle drawer (default — preserves deep
  // links). 'users' = role-scoped consultant table with bulk + per-row
  // actions, mirroring the Users tab UX inside the management surface.
  const [view, setView] = React.useState('apps')
  const [tab, setTab] = React.useState('queue') // queue | triage | decided | analytics
  const [apps, setApps] = React.useState([])
  const [total, setTotal] = React.useState(0)
  const [byStatus, setByStatus] = React.useState({})
  const [stats, setStats] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [page, setPage] = React.useState(1)
  const PAGE_SIZE = 25
  const [searchQ, setSearchQ] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [credentialFilter, setCredentialFilter] = React.useState('')
  const [priorityFilter, setPriorityFilter] = React.useState('')
  const [sortCol, setSortCol] = React.useState('created_at')
  const [sortDir, setSortDir] = React.useState('desc')
  const [selectedIds, setSelectedIds] = React.useState(new Set())
  const [openApp, setOpenApp] = React.useState(null)
  const [decisionPending, setDecisionPending] = React.useState(false)
  const [notice, setNotice] = React.useState(null)
  const flash = (type, msg) => { setNotice({ type, msg }); setTimeout(() => setNotice(null), 4000) }

  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(searchQ); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchQ])

  // Tab → server filter mapping
  const statusFilter = tab === 'queue' ? 'pending'
    : tab === 'triage' ? 'pending'
    : tab === 'decided' ? 'all'
    : 'pending'
  const minRisk = tab === 'triage' ? 25 : 0
  const agedOnly = tab === 'triage'

  const load = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      params.set('status', statusFilter)
      params.set('page', String(page))
      params.set('page_size', String(PAGE_SIZE))
      params.set('sort', sortCol)
      params.set('dir', sortDir)
      if (debouncedQ) params.set('q', debouncedQ)
      if (credentialFilter) params.set('consultant_type', credentialFilter)
      if (priorityFilter) params.set('priority', priorityFilter)
      if (minRisk > 0) params.set('min_risk', String(minRisk))
      if (agedOnly) params.set('aged_only', 'true')
      if (tab === 'decided') {
        // Show only decided (non-pending) in this tab — easiest as a client filter
        // since the API doesn't take a "not equal" status. Workaround: ask the
        // server for all, then drop pending here.
      }
      const r = await fetch(`/api/admin/consultant-applications?${params}`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error?.message || d?.error || 'Failed to load')
      let list = d.applications || []
      if (tab === 'decided') list = list.filter(a => a.status !== 'pending')
      setApps(list)
      setTotal(d.total || 0)
      setByStatus(d.byStatus || {})
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [tab, page, sortCol, sortDir, debouncedQ, credentialFilter, priorityFilter, statusFilter, minRisk, agedOnly])

  React.useEffect(() => { load() }, [load])

  // Stats — load lazily for the analytics tab + once on mount for header tiles
  React.useEffect(() => {
    fetch('/api/admin/consultant-applications/stats', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})))
      .then(d => setStats(d?.stats || null))
      .catch(() => null)
  }, [])

  const toggleSelected = id => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const selectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      apps.forEach(a => next.add(a.id))
      return next
    })
  }
  const clearSelection = () => setSelectedIds(new Set())

  const bulkAct = async (action, notes = '') => {
    if (!selectedIds.size) return
    setDecisionPending(true)
    try {
      const r = await fetch('/api/admin/consultant-applications/bulk', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedIds], action, notes }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Bulk action failed')
      flash('ok', `${d.successful || 0} of ${d.requested || 0} applications ${action}d.`)
      clearSelection()
      await load()
    } catch (e) { flash('err', e.message) }
    finally { setDecisionPending(false) }
  }

  const decideOne = async (id, action, notes) => {
    setDecisionPending(true)
    try {
      // For approve/decline use the existing single-row endpoint (sends email etc.).
      if (action === 'approve' || action === 'decline') {
        const r = await fetch(`/api/admin/consultant-applications/${id}`, {
          method: 'PATCH', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, notes }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.error || `${action} failed`)
        flash('ok', `Application ${action}d.`)
      } else {
        // waitlist routed through bulk endpoint for code reuse
        await bulkAct('waitlist', notes)
      }
      setOpenApp(null)
      await load()
    } catch (e) { flash('err', e.message) }
    finally { setDecisionPending(false) }
  }

  const onSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }
  const sortArrow = col => sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // View toggle pill — shared shape with the rest of the module.
  const ViewPill = ({ id, label }) => (
    <button type="button" onClick={() => setView(id)}
      style={{
        padding: '8px 16px', borderRadius: 999, fontSize: 13, fontFamily: SANS,
        border: `1px solid ${view === id ? NAVY : BORDER}`,
        background: view === id ? NAVY : SURFACE,
        color: view === id ? '#fff' : TEXT,
        fontWeight: 700, cursor: 'pointer',
      }}>{label}</button>
  )

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      {/* Header — always visible. The Applications | Users toggle sits in
          the top-right next to the refresh button. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>
            Panel · {view === 'apps' ? 'Review queue' : 'Live consultants'}
          </div>
          <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 600, color: TEXT, margin: 0, letterSpacing: '-.018em' }}>Consultant Management</h1>
          {stats && view === 'apps' && (
            <div style={{ fontSize: 12, color: MUTED, marginTop: 6, fontFamily: MONO }}>
              {fmtN(stats.pending)} pending · {fmtN(stats.aged_pending)} aged · {fmtN(stats.high_risk_pending)} high-risk · {fmtPct(stats.approval_rate_pct)} approval rate (90d)
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ViewPill id="apps"  label="Applications" />
          <ViewPill id="users" label="Users" />
          {view === 'apps' && (
            <button onClick={load} style={{ padding: '6px 14px', border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: MONO }}>↻ refresh</button>
          )}
        </div>
      </div>

      {/* Live users view: short-circuit the rest of the application surface
          and render the role-scoped table. */}
      {view === 'users' && (
        <div style={{ margin: '0 -24px' }}>
          <AdminRoleUsersTable role="consultant" />
        </div>
      )}

      {view === 'apps' && <>

      {/* Stat tiles */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <StatTile label="Pending"          value={fmtN(stats.pending)}            accent={AMBER}  sub={`+${fmtN(stats.last_7d)} · last 7d`} />
          <StatTile label="High risk"        value={fmtN(stats.high_risk_pending)}  accent={RED}    sub="score ≥ 50, pending" />
          <StatTile label="Aged > 7 days"    value={fmtN(stats.aged_pending)}       accent={AMBER}  sub="needs attention" />
          <StatTile label="Approved"         value={fmtN(stats.approved)}           accent={GREEN}  sub={`${fmtPct(stats.approval_rate_pct)} approval rate`} />
          <StatTile label="Declined"         value={fmtN(stats.declined)}           accent={MUTED} />
          <StatTile label="Avg decision"     value={`${stats.avg_decision_hours ?? 0}h`} accent={NAVY} sub="time to decision" />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Pill active={tab === 'queue'}     onClick={() => { setTab('queue');     setPage(1); clearSelection() }} count={byStatus.pending}>Queue</Pill>
        <Pill active={tab === 'triage'}    onClick={() => { setTab('triage');    setPage(1); clearSelection() }} count={stats?.aged_pending}>Triage</Pill>
        <Pill active={tab === 'decided'}   onClick={() => { setTab('decided');   setPage(1); clearSelection() }} count={(byStatus.approved || 0) + (byStatus.declined || 0) + (byStatus.waitlist || 0)}>Decided</Pill>
        <Pill active={tab === 'analytics'} onClick={() => setTab('analytics')}>Analytics</Pill>
      </div>

      {/* Notice */}
      {notice && (
        <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: notice.type === 'ok' ? `${GREEN}10` : `${RED}10`, color: notice.type === 'ok' ? GREEN : RED, border: `1px solid ${notice.type === 'ok' ? GREEN : RED}33` }}>
          {notice.msg}
        </div>
      )}

      {/* Analytics tab */}
      {tab === 'analytics' && stats && (
        <div style={{ display: 'grid', gap: 14 }}>
          <Section title="Funnel">
            <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <StatTile label="Total received"  value={fmtN(stats.total)}    accent={NAVY} />
              <StatTile label="Pending"         value={fmtN(stats.pending)}  accent={AMBER} />
              <StatTile label="Approved"        value={fmtN(stats.approved)} accent={GREEN} />
              <StatTile label="Declined"        value={fmtN(stats.declined)} accent={RED} />
              <StatTile label="Waitlist"        value={fmtN(stats.waitlist)} accent={PURPLE} />
            </div>
          </Section>
          <Section title="Throughput & quality">
            <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <StatTile label="Last 7 days"     value={fmtN(stats.last_7d)}   accent={CYAN} />
              <StatTile label="Last 30 days"    value={fmtN(stats.last_30d)}  accent={CYAN} />
              <StatTile label="Avg decision time" value={`${stats.avg_decision_hours ?? 0}h`} accent={NAVY} />
              <StatTile label="Approval rate (90d)" value={fmtPct(stats.approval_rate_pct)} accent={GREEN} />
              <StatTile label="High-risk pending" value={fmtN(stats.high_risk_pending)} accent={RED} />
              <StatTile label="Aged pending"    value={fmtN(stats.aged_pending)} accent={AMBER} />
            </div>
          </Section>
        </div>
      )}

      {/* Queue / Triage / Decided table */}
      {tab !== 'analytics' && (
        <Section
          title={tab === 'queue' ? 'Pending review' : tab === 'triage' ? 'Triage queue — risk + age' : 'Decided'}
          right={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search name, email, registration #…"
                style={{ padding: '6px 12px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 6, fontFamily: SANS, width: 220, color: TEXT, background: SURFACE }}
              />
              <select value={credentialFilter} onChange={e => { setCredentialFilter(e.target.value); setPage(1) }} style={{ padding: '6px 8px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 6, background: SURFACE, color: TEXT }}>
                <option value="">All types</option>
                <option value="individual">Individual</option>
                <option value="firm">Firm</option>
                <option value="student">Student</option>
              </select>
              <select value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setPage(1) }} style={{ padding: '6px 8px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 6, background: SURFACE, color: TEXT }}>
                <option value="">All priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
              </select>
            </div>
          }
        >
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div style={{ padding: '10px 16px', background: `${CYAN}10`, borderBottom: `1px solid ${BORDER2}`, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: CYAN }}>{selectedIds.size} selected</span>
              <button onClick={() => bulkAct('approve')} disabled={decisionPending} style={btnPrimary(GREEN)}>Approve all</button>
              <button onClick={() => bulkAct('decline')} disabled={decisionPending} style={btnPrimary(RED)}>Decline all</button>
              <button onClick={() => bulkAct('waitlist')} disabled={decisionPending} style={btnGhost(PURPLE)}>Waitlist</button>
              <button
                onClick={() => {
                  if (window.confirm(`Delete ${selectedIds.size} application(s)? The profile rows are left intact so applicants can re-apply.`)) bulkAct('delete')
                }}
                disabled={decisionPending}
                style={btnGhost(RED)}
              >Delete</button>
              <button onClick={clearSelection} style={btnGhost(MUTED)}>Clear</button>
            </div>
          )}

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: BORDER2 }}>
                  <Th style={{ width: 32 }}>
                    <input type="checkbox"
                      checked={apps.length > 0 && apps.every(a => selectedIds.has(a.id))}
                      onChange={e => e.target.checked ? selectAllVisible() : clearSelection()}
                    />
                  </Th>
                  <Th onClick={() => onSort('full_name')}>Applicant{sortArrow('full_name')}</Th>
                  <Th onClick={() => onSort('created_at')}>Submitted{sortArrow('created_at')}</Th>
                  <Th>Type</Th>
                  <Th onClick={() => onSort('risk_score')}>Risk{sortArrow('risk_score')}</Th>
                  <Th onClick={() => onSort('priority')}>Priority{sortArrow('priority')}</Th>
                  <Th onClick={() => onSort('status')}>Status{sortArrow('status')}</Th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><Td colSpan={7} style={{ textAlign: 'center', color: MUTED, padding: 20 }}>Loading…</Td></tr>
                )}
                {error && !loading && (
                  <tr><Td colSpan={7} style={{ textAlign: 'center', color: RED, padding: 20 }}>{error}</Td></tr>
                )}
                {!loading && !error && apps.length === 0 && (
                  <tr><Td colSpan={7} style={{ textAlign: 'center', color: MUTED, padding: 28 }}>No applications in this view.</Td></tr>
                )}
                {!loading && !error && apps.map(a => (
                  <tr key={a.id} style={{ borderTop: `1px solid ${BORDER2}`, cursor: 'pointer' }}
                      onClick={() => setOpenApp(a)}>
                    <Td onClick={e => { e.stopPropagation(); toggleSelected(a.id) }} style={{ cursor: 'default' }}>
                      <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelected(a.id)} onClick={e => e.stopPropagation()} />
                    </Td>
                    <Td>
                      <div style={{ fontWeight: 700, color: TEXT }}>{a.full_name}</div>
                      <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{a.email}</div>
                    </Td>
                    <Td>
                      <div style={{ fontSize: 12, color: TEXT }}>{fmtRelative(a.created_at)}</div>
                      <div style={{ fontSize: 10, color: DIM, fontFamily: MONO }}>{fmtDate(a.created_at)}</div>
                    </Td>
                    <Td>
                      <div style={{ fontSize: 12, color: TEXT }}>{a.consultant_type || '—'}</div>
                      <div style={{ fontSize: 11, color: MUTED }}>{a.jurisdictions || '—'}</div>
                    </Td>
                    <Td>
                      <RiskBar score={a.risk_score} flags={a.risk_flags} />
                    </Td>
                    <Td>
                      <span style={{ fontSize: 11, color: a.priority === 'urgent' ? RED : a.priority === 'high' ? AMBER : MUTED, fontWeight: 600, textTransform: 'capitalize' }}>
                        {a.priority || 'normal'}
                      </span>
                    </Td>
                    <Td><StatusBadge status={a.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ padding: '10px 16px', borderTop: `1px solid ${BORDER2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: MUTED, fontFamily: MONO }}>
              <div>{fmtN((page - 1) * PAGE_SIZE + 1)}–{fmtN(Math.min(page * PAGE_SIZE, total))} of {fmtN(total)}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={btnGhost(TEXT)}>← Prev</button>
                <span style={{ padding: '4px 10px' }}>{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={btnGhost(TEXT)}>Next →</button>
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Drawer */}
      {openApp && (
        <DetailDrawer
          application={openApp}
          onClose={() => setOpenApp(null)}
          onDecide={decideOne}
          decisionPending={decisionPending}
          onLifecycleChanged={() => { load() }}
        />
      )}
      </>}
    </div>
  )
}

// ── Small style helpers ────────────────────────────────────────────────────
const thBase = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTED, fontFamily: MONO, cursor: 'pointer', userSelect: 'none' }
const tdBase = { padding: '10px 14px', verticalAlign: 'top', color: TEXT, fontSize: 13 }
function Th({ children, onClick, style }) { return <th onClick={onClick} style={{ ...thBase, cursor: onClick ? 'pointer' : 'default', ...style }}>{children}</th> }
function Td({ children, colSpan, style, onClick }) { return <td colSpan={colSpan} style={{ ...tdBase, ...style }} onClick={onClick}>{children}</td> }
const btnPrimary = c => ({ padding: '6px 12px', background: c, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' })
const btnGhost = c => ({ padding: '6px 12px', background: 'transparent', color: c, border: `1px solid ${c}55`, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' })

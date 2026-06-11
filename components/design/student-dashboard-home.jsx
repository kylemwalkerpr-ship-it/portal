'use client'
import React from 'react'
import { Card, Btn, Badge, StatusBadge, ProgressBar, Avatar } from './shared'
import DashboardGuide from './DashboardGuide'

/**
 * Student → Dashboard home.
 *
 * Categorized, calm layout:
 *   1. Greeting + four core stat tiles (escrow folded into Wallet; pending
 *      offers surface as an attention item, not a permanent tile).
 *   2. "Needs your attention" — only renders when something actually does.
 *   3. Collapsible sections (state persisted per-user in localStorage):
 *      Orders in motion · Quick actions · Marketplace activity.
 *   4. Right side pane — collapsible to a slim icon rail.
 */

const NAVY='var(--portal-ink)', GOLD='var(--portal-gold)', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='var(--portal-accent)', PURPLE='#3D2B6B'
const BG='var(--portal-bg)', SURFACE='var(--portal-surface)', SURFACE2='var(--portal-surface-2)', BORDER='var(--portal-rule)', BORDER2='var(--portal-rule-soft)', TEXT='var(--portal-ink)', MUTED='var(--portal-ink-mid)', DIM='var(--portal-ink-soft)'
const SERIF=`var(--portal-font-display, 'Cormorant Garamond', Georgia, serif)`
const SANS=`var(--portal-font-body, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif)`
const MONO=`'SF Mono', Menlo, Consolas, monospace`

const fmtN = n => Number(n ?? 0).toLocaleString('en-US')
const fmtMoney = (dollars, code = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: String(code || 'USD').toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .format(Number(dollars || 0))
const fmtDateShort = s => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
const firstName = full => {
  if (!full) return ''
  const t = String(full).trim().split(/\s+/)
  return t.find(x => !/^(Mr\.|Mrs\.|Ms\.|Mx\.|Dr\.|Prof\.)$/i.test(x)) || ''
}

// ── Collapsible section with persisted open state ──────────────────────────
function useStoredBool(key, fallback) {
  const [val, setVal] = React.useState(() => {
    if (typeof window === 'undefined') return fallback
    try {
      const raw = window.localStorage.getItem(key)
      return raw === null ? fallback : raw === '1'
    } catch { return fallback }
  })
  const set = React.useCallback(next => {
    setVal(next)
    try { window.localStorage.setItem(key, next ? '1' : '0') } catch {}
  }, [key])
  return [val, set]
}

function CollapsibleSection({ id, eyebrow, title, count, action, onActionClick, defaultOpen = true, children }) {
  const [open, setOpen] = useStoredBool(`yousafe.dash.sec.${id}`, defaultOpen)
  return (
    <section style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
          background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: SANS, textAlign: 'left',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 11, color: DIM, display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▸</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && <span style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 2 }}>{eyebrow}</span>}
          <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: TEXT, letterSpacing: '-.01em' }}>{title}</span>
          {typeof count === 'number' && count > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, fontFamily: MONO, color: MUTED }}>({fmtN(count)})</span>
          )}
        </span>
        {action && open && (
          <span
            role="link"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onActionClick?.() }}
            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onActionClick?.() } }}
            style={{ fontSize: 12, fontWeight: 700, color: CYAN, whiteSpace: 'nowrap' }}
          >
            {action}
          </span>
        )}
      </button>
      {open && <div style={{ padding: '0 18px 18px' }}>{children}</div>}
    </section>
  )
}

// ── Compact primitives ──────────────────────────────────────────────────────
function StatTile({ label, value, accent = NAVY, sub, onClick, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10,
        padding: '13px 16px', display: 'flex', flexDirection: 'column', gap: 3,
        textAlign: 'left', fontFamily: SANS,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow .15s, border-color .15s',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = '0 4px 12px rgba(27,45,79,0.08)' } }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: DIM, fontFamily: MONO }}>{label}</span>
      </div>
      <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 26, color: accent, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{sub}</div>}
    </button>
  )
}

function ActionPill({ icon, label, badge, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px',
      borderRadius: 999, border: `1px solid ${BORDER}`, background: SURFACE2,
      color: TEXT, fontSize: 13, fontWeight: 600, fontFamily: SANS, cursor: 'pointer',
      transition: 'border-color .15s, background .15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = CYAN; e.currentTarget.style.background = SURFACE }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = SURFACE2 }}
    >
      <span style={{ fontSize: 15 }}>{icon}</span>
      {label}
      {badge > 0 && (
        <span style={{ fontSize: 10, fontWeight: 800, fontFamily: MONO, background: `${PURPLE}15`, color: PURPLE, borderRadius: 999, padding: '2px 7px' }}>{badge}</span>
      )}
    </button>
  )
}

function AttentionRow({ icon, text, cta, onClick, tone = AMBER }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
      background: `${tone}0d`, border: `1px solid ${tone}33`, borderRadius: 10,
    }}>
      <span style={{ fontSize: 17 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{text}</span>
      <Btn variant="primary" size="sm" onClick={onClick}>{cta}</Btn>
    </div>
  )
}

// ── Right side pane (collapsible to icon rail) ─────────────────────────────
function SidePane({ upcoming, docs, stats, onNavigate }) {
  const [open, setOpen] = useStoredBool('yousafe.dash.sidepane', true)

  if (!open) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', width: 48 }}>
        <button onClick={() => setOpen(true)} title="Expand panel" style={railBtn}>«</button>
        <button onClick={() => setOpen(true)} title={`Deadlines${upcoming.length ? ` (${upcoming.length})` : ''}`} style={{ ...railBtn, position: 'relative' }}>
          ⏰
          {upcoming.length > 0 && <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 99, background: AMBER }} />}
        </button>
        <button onClick={() => onNavigate?.('documents')} title="Documents" style={railBtn}>📄</button>
        <button onClick={() => onNavigate?.('billing')} title="Billing" style={railBtn}>💳</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 300 }}>
      <button onClick={() => setOpen(false)} style={{
        alignSelf: 'flex-end', display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'none', border: 'none', cursor: 'pointer', color: DIM, fontSize: 11,
        fontWeight: 700, fontFamily: MONO, padding: '2px 4px',
      }}>
        Collapse »
      </button>

      {/* Upcoming deadlines */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '13px 16px', borderBottom: `1px solid ${BORDER2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600, color: TEXT }}>⏰ Upcoming deadlines</div>
          {upcoming.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${AMBER}15`, color: AMBER, textTransform: 'uppercase' }}>{upcoming.length}</span>}
        </div>
        <div style={{ padding: '8px 16px 12px' }}>
          {upcoming.length === 0
            ? <div style={{ fontSize: 12, color: MUTED, padding: '6px 0' }}>Nothing due — you're clear.</div>
            : upcoming.map(d => {
                const overdue = d.daysAway < 0
                const soon = d.daysAway <= 3 && d.daysAway >= 0
                const color = overdue ? RED : soon ? AMBER : NAVY
                return (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${BORDER2}`, gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                      <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{fmtDateShort(d.deadlineAt)}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${color}15`, color, textTransform: 'uppercase', flexShrink: 0 }}>
                      {overdue ? `${-d.daysAway}d overdue` : d.daysAway === 0 ? 'Today' : d.daysAway === 1 ? 'Tomorrow' : `${d.daysAway}d`}
                    </span>
                  </div>
                )
              })}
        </div>
      </Card>

      {/* Documents snapshot */}
      <Card style={{ padding: '13px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600, color: TEXT }}>📄 Documents</div>
          <Btn variant="ghost" size="sm" onClick={() => onNavigate?.('documents')}>Open →</Btn>
        </div>
        <div style={{ fontSize: 12, color: MUTED, fontFamily: MONO }}>
          {fmtN(docs.total ?? 0)} file{(docs.total ?? 0) === 1 ? '' : 's'} stored
          {docs.last7d > 0 && <span style={{ color: CYAN }}> · {fmtN(docs.last7d)} new this week</span>}
        </div>
      </Card>

      {/* Spend snapshot */}
      {stats.lifetimeSpend > 0 && (
        <Card style={{ padding: '13px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO, marginBottom: 4 }}>Lifetime spend</div>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: TEXT, lineHeight: 1 }}>{fmtMoney(stats.lifetimeSpend)}</div>
          <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO, marginTop: 4 }}>
            across {fmtN(stats.total ?? 0)} order{stats.total === 1 ? '' : 's'} · <span role="link" tabIndex={0} onClick={() => onNavigate?.('billing')} onKeyDown={e => e.key === 'Enter' && onNavigate?.('billing')} style={{ color: CYAN, fontWeight: 700, cursor: 'pointer' }}>billing →</span>
          </div>
        </Card>
      )}
    </div>
  )
}

const railBtn = {
  width: 40, height: 40, borderRadius: 10, border: `1px solid var(--portal-rule)`,
  background: 'var(--portal-surface)', cursor: 'pointer', fontSize: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink-mid)',
}

// ── Dashboard ───────────────────────────────────────────────────────────────
export default function StudentDashboardHome({ userName, onNavigate, onOpenOrder, marketplaceWidgets }) {
  const [home, setHome] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [walletBal, setWalletBal] = React.useState(null)
  const [refreshKey, setRefreshKey] = React.useState(0)

  React.useEffect(() => {
    setLoading(true); setError('')
    fetch('/api/student/home', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})).then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!ok) throw new Error(d?.error || 'Failed'); setHome(d) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [refreshKey])

  React.useEffect(() => {
    fetch('/api/wallet/balance', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})))
      .then(d => setWalletBal(Number(d.available ?? 0)))
      .catch(() => setWalletBal(0))
  }, [refreshKey])

  // Visibility-aware refresh
  React.useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') setRefreshKey(k => k + 1) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const name = home?.profile?.full_name || userName || ''
  const greeting = firstName(name)
  const stats = home?.orderStats || {}
  const inq = home?.inquiryStats || {}
  const docs = home?.docStats || {}
  const upcoming = home?.upcoming || []
  const inMotion = home?.inMotion || []
  const unread = home?.unreadConversations || 0

  const noActivity = !loading && (stats.total ?? 0) === 0 && inq.open === 0 && inq.engaged === 0
  const needsAttention = (stats.awaitingApproval ?? 0) > 0 || (inq.pendingOffers ?? 0) > 0

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>Today</div>
        <h1 style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 500, color: TEXT, margin: 0, letterSpacing: '-.012em' }}>
          Welcome back{greeting ? `, ${greeting}` : ''}.
        </h1>
        <div style={{ fontSize: 14, color: MUTED, marginTop: 6 }}>
          {loading
            ? 'Pulling your portfolio…'
            : noActivity
              ? 'Browse services or templates and place your first order to get started.'
              : stats.awaitingApproval > 0
                ? <>You have <strong style={{ color: AMBER }}>{stats.awaitingApproval}</strong> order{stats.awaitingApproval === 1 ? '' : 's'} awaiting your approval.</>
                : stats.active > 0
                  ? <>{stats.active} order{stats.active === 1 ? '' : 's'} in progress · {unread > 0 ? `${unread} unread conversation${unread === 1 ? '' : 's'}` : 'all caught up'}.</>
                  : 'No active engagements. Browse the catalogue or contact a specialist.'}
        </div>
      </div>

      {error && (
        <Card style={{ padding: 14, background: `${RED}10`, border: `1px solid ${RED}33`, color: RED, fontSize: 13 }}>{error}</Card>
      )}

      {/* Core stat strip — four tiles. Escrow lives inside Wallet; pending
          offers surface in "Needs your attention" instead of a tile. */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <StatTile icon="📦" label="Active orders" value={fmtN(stats.active ?? 0)} accent={CYAN}
            sub={stats.awaitingApproval > 0 ? `${fmtN(stats.awaitingApproval)} awaiting approval` : `${fmtN(stats.pending ?? 0)} pending`}
            onClick={() => onNavigate?.('orders')} />
          <StatTile icon="💬" label="Messages" value={fmtN(unread)} accent={PURPLE}
            sub={unread > 0 ? 'unread conversations' : 'all caught up'}
            onClick={() => onNavigate?.('messages')} />
          <StatTile icon="📥" label="Open inquiries" value={fmtN(inq.open ?? 0)} accent={GREEN}
            sub={inq.pendingOffers > 0 ? `${fmtN(inq.pendingOffers)} offer${inq.pendingOffers === 1 ? '' : 's'} waiting` : 'specialists can respond'}
            onClick={() => onNavigate?.('inquiries')} />
          <StatTile icon="💳" label="Wallet" value={walletBal === null ? '—' : fmtMoney(walletBal)} accent={NAVY}
            sub={(stats.escrowHeld ?? 0) > 0 ? `${fmtMoney(stats.escrowHeld)} held in escrow` : 'available to spend'}
            onClick={() => onNavigate?.('billing')} />
        </div>
      )}

      {/* Needs your attention — only exists when something does */}
      {!loading && needsAttention && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(stats.awaitingApproval ?? 0) > 0 && (
            <AttentionRow
              icon="⏳"
              tone={AMBER}
              text={<><strong>{fmtN(stats.awaitingApproval)} order{stats.awaitingApproval === 1 ? '' : 's'}</strong> delivered and waiting for your review — approve to release payment, or request changes.</>}
              cta="Review now"
              onClick={() => onNavigate?.('orders')}
            />
          )}
          {(inq.pendingOffers ?? 0) > 0 && (
            <AttentionRow
              icon="⚡"
              tone={GREEN}
              text={<><strong>{fmtN(inq.pendingOffers)} offer{inq.pendingOffers === 1 ? '' : 's'}</strong> from specialists on your inquiries — compare and accept to get started.</>}
              cta="View offers"
              onClick={() => onNavigate?.('inquiries')}
            />
          )}
        </div>
      )}

      {/* Role guide (kept — answers "how do I use this?") */}
      <DashboardGuide role="client" />

      <div className="yousafe-mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'start' }}>
        {/* Left column — collapsible, categorized */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

          {/* Empty state */}
          {noActivity && (
            <Card style={{ padding: '40px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 38, marginBottom: 10 }}>🎯</div>
              <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: TEXT, marginBottom: 4 }}>Start your first engagement</div>
              <div style={{ fontSize: 13, color: MUTED, maxWidth: 380, margin: '0 auto 14px' }}>
                Browse the catalogue, contact a specialist, or submit an inquiry to describe your case.
              </div>
              <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Btn variant="primary" size="sm" onClick={() => onNavigate?.('services')}>Browse services</Btn>
                <Btn variant="secondary" size="sm" onClick={() => onNavigate?.('attorneys')}>Find Your Specialist</Btn>
              </div>
            </Card>
          )}

          {/* Orders in motion */}
          {inMotion.length > 0 && (
            <CollapsibleSection id="inmotion" eyebrow="Active" title="Orders in motion" count={inMotion.length} action="View all →" onActionClick={() => onNavigate?.('orders')} defaultOpen>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {inMotion.map(o => (
                  <Card key={o.id} onClick={() => onOpenOrder?.(o)} hover style={{
                    padding: '14px 18px', cursor: 'pointer',
                    borderLeft: `4px solid ${o.status === 'review' ? AMBER : o.status === 'active' ? CYAN : MUTED}`,
                  }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <Avatar name={o.consultant} src={o.consultantAvatar || undefined} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                          <StatusBadge status={o.status} />
                          {o.status === 'review' && <Badge color="orange" style={{ fontSize: 10 }}>⚠ Approve delivery</Badge>}
                        </div>
                        <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 16, color: TEXT, lineHeight: 1.2, letterSpacing: '-.005em' }}>{o.title}</div>
                        <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO, marginTop: 2 }}>with {o.consultant}{o.deadlineAt && <> · due {fmtDateShort(o.deadlineAt)}</>}</div>
                        <ProgressBar value={o.progress} style={{ marginTop: 8 }} />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Quick actions — one calm row of pills */}
          <CollapsibleSection id="actions" eyebrow="Shortcuts" title="Quick actions" defaultOpen>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <ActionPill icon="🎯" label="Find Your Specialist" onClick={() => onNavigate?.('attorneys')} />
              <ActionPill icon="🛒" label="Browse services" onClick={() => onNavigate?.('services')} />
              <ActionPill icon="📥" label="New inquiry" onClick={() => onNavigate?.('inquiries')} />
              <ActionPill icon="📄" label="Documents" onClick={() => onNavigate?.('documents')} />
              <ActionPill icon="💬" label="Messages" badge={unread} onClick={() => onNavigate?.('messages')} />
              <ActionPill icon="💳" label="Billing" onClick={() => onNavigate?.('billing')} />
            </div>
          </CollapsibleSection>

          {/* Marketplace activity — secondary, collapsed by default */}
          {marketplaceWidgets && (
            <CollapsibleSection id="marketactivity" eyebrow="Marketplace" title="Your activity" defaultOpen={false}>
              {marketplaceWidgets}
            </CollapsibleSection>
          )}
        </div>

        {/* Right side pane — collapsible to icon rail */}
        <div style={{ width: 'auto', minWidth: 48, maxWidth: 320 }}>
          <SidePane upcoming={upcoming} docs={docs} stats={stats} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  )
}

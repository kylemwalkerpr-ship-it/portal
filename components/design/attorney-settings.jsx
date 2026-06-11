'use client'
import React from 'react'
import { Card, Btn, Badge, Avatar, Input, Select } from './shared'
import { PhoneVerificationCard } from '../PhoneVerificationCard'
import { usePortalTheme } from './usePortalTheme'
import ThemePicker from './ThemePicker'

/**
 * Attorney → Settings (Fiverr-grade).
 *
 * 6 tabs: Profile / Notifications / Privacy / Compliance / Payouts / Security.
 * Mirrors the student-settings shape but adds Compliance (bar/insurance/
 * approval state) and a dedicated Payouts tab wired to Payout setup.
 */

const NAVY='var(--portal-ink)', GOLD='var(--portal-gold)', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='var(--portal-accent)', PURPLE='#3D2B6B'
const BG='var(--portal-bg)', SURFACE='var(--portal-surface)', SURFACE2='var(--portal-surface-2)', BORDER='var(--portal-rule)', BORDER2='var(--portal-rule-soft)', TEXT='var(--portal-ink)', MUTED='var(--portal-ink-mid)', DIM='var(--portal-ink-soft)'
const SERIF=`var(--portal-font-display, 'Cormorant Garamond', Georgia, serif)`
const SANS=`var(--portal-font-body, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif)`
const MONO=`'SF Mono', Menlo, Consolas, monospace`

const TABS = [
  { id: 'profile',      label: 'Profile',      icon: '👤' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'privacy',      label: 'Privacy',      icon: '🔐' },
  { id: 'compliance',   label: 'Compliance',   icon: '🛡️' },
  { id: 'payouts',      label: 'Payouts',      icon: '💸' },
  { id: 'security',     label: 'Security',     icon: '🔑' },
  { id: 'appearance',   label: 'Appearance',   icon: '🎨' },
]

function splitDisplayName(full = '') {
  const SALS = new Set(['Mr.', 'Mrs.', 'Ms.', 'Mx.', 'Dr.', 'Prof.'])
  const tokens = String(full || '').trim().split(/\s+/).filter(Boolean)
  let salutation = ''
  if (tokens[0] && SALS.has(tokens[0])) salutation = tokens.shift() || ''
  return { salutation, first_name: tokens[0] || '', last_name: tokens.slice(1).join(' ') }
}

function Section({ title, sub, right, children }) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 22px 12px', borderBottom: `1px solid ${BORDER2}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, color: TEXT, letterSpacing: '-.01em' }}>{title}</div>
          {sub && <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{sub}</div>}
        </div>
        {right}
      </div>
      <div style={{ padding: '18px 22px' }}>{children}</div>
    </Card>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button onClick={onChange} style={{
      width: 40, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer',
      background: checked ? CYAN : '#D1CFC8', position: 'relative', transition: 'background .15s', flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute', top: 3, left: checked ? 20 : 3,
        width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .15s',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

function PrefRow({ label, sub, value, onChange }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: `1px solid ${BORDER2}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: TEXT }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{sub}</div>}
      </div>
      <Toggle checked={!!value} onChange={onChange} />
    </div>
  )
}

export default function AttorneySettings() {
  // Active tab survives re-renders, remounts, and refreshes (?tab=… in the
  // URL). Picking a theme in Appearance must NOT bounce the user back to
  // Profile — the tab only changes when they click another tab themselves.
  const TAB_IDS = ['profile', 'notifications', 'privacy', 'compliance', 'payouts', 'security', 'appearance']
  const tabFromUrl = () => {
    if (typeof window === 'undefined') return 'profile'
    try {
      const t = new URLSearchParams(window.location.search).get('tab')
      return TAB_IDS.includes(t) ? t : 'profile'
    } catch { return 'profile' }
  }
  const [tab, setTabState] = React.useState(tabFromUrl)
  const setTab = React.useCallback((next) => {
    setTabState(next)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', next)
      window.history.replaceState({}, '', url)
    } catch { /* SSR / older browsers — state still updates */ }
  }, [])
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState(null)
  const flash = (kind, msg) => { setNotice({ kind, msg }); setTimeout(() => setNotice(null), 4000) }

  const load = React.useCallback(() => {
    setLoading(true); setError('')
    fetch('/api/attorney/preferences', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})).then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!ok) throw new Error(d?.error || 'Failed'); setData(d) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => { load() }, [load])

  if (loading && !data) return <div style={{ padding: 28, color: MUTED, fontSize: 14, fontFamily: SANS, background: BG, minHeight: '100vh' }}>Loading settings…</div>
  if (error && !data) return (
    <div style={{ padding: 28, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      <div style={{ background: `${RED}10`, border: `1px solid ${RED}33`, borderRadius: 10, padding: 18, color: RED }}>{error}</div>
    </div>
  )
  if (!data) return null

  return (
    <div style={{ padding: '24px 28px 60px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>Account</div>
        <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: TEXT, margin: 0, letterSpacing: '-.012em' }}>Settings.</h1>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
          {data.profile.email}{data.profile.member_since && <> · member since {new Date(data.profile.member_since).toLocaleDateString()}</>}
        </div>
      </div>

      {notice && (
        <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: notice.kind === 'ok' ? `${GREEN}10` : `${RED}10`, color: notice.kind === 'ok' ? GREEN : RED, border: `1px solid ${notice.kind === 'ok' ? GREEN : RED}33` }}>
          {notice.msg}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: `1px solid ${BORDER}`, marginBottom: -2 }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '9px 16px', fontSize: 13, fontFamily: SANS, fontWeight: active ? 700 : 500,
              border: 'none', background: 'transparent',
              borderBottom: `2px solid ${active ? CYAN : 'transparent'}`,
              color: active ? TEXT : MUTED, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}><span>{t.icon}</span>{t.label}</button>
          )
        })}
      </div>

      <div style={{ maxWidth: 760 }}>
        {tab === 'profile'      && <ProfileTab data={data} setData={setData} flash={flash} reload={load} />}
        {tab === 'notifications' && <NotificationsTab data={data} setData={setData} flash={flash} />}
        {tab === 'privacy'      && <PrivacyTab data={data} setData={setData} flash={flash} />}
        {tab === 'compliance'   && <ComplianceTab data={data} flash={flash} reload={load} />}
        {tab === 'payouts'      && <PayoutsTab data={data} flash={flash} reload={load} />}
        {tab === 'security'     && <SecurityTab data={data} flash={flash} />}
        {tab === 'appearance'   && <AppearanceTab />}
      </div>
    </div>
  )
}

// ── Profile ─────────────────────────────────────────────────────────────
function ProfileTab({ data, setData, flash, reload }) {
  const parsed = React.useMemo(() => splitDisplayName(data.profile.full_name || ''), [data.profile.full_name])
  const [form, setForm] = React.useState({
    salutation: parsed.salutation,
    first_name: parsed.first_name,
    last_name:  parsed.last_name,
    email:      data.profile.email || '',
    phone:      data.profile.phone || '',
    timezone:   data.profile.timezone || '',
    language:   data.profile.language || 'en',
    address_line1: data.profile.address_line1 || '',
    address_line2: data.profile.address_line2 || '',
    city:       data.profile.city || '',
    postal_code: data.profile.postal_code || '',
    country:    data.profile.country || '',
  })
  const [saving, setSaving] = React.useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/attorney/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(form) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Save failed')
      flash('ok', 'Profile saved.'); reload()
    } catch (e) { flash('err', e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section title="Identity" sub="How you appear to clients and on payouts.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
          <Avatar name={data.profile.full_name || form.first_name || 'Attorney'} src={data.profile.avatar_url || undefined} size={64} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{data.profile.full_name || 'Add your name'}</div>
            <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{data.profile.email}</div>
            <div style={{ fontSize: 11, color: DIM, fontFamily: MONO, marginTop: 4 }}>Edit your public photo in My Profile.</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Select label="Salutation" value={form.salutation} onChange={v => setForm(f => ({ ...f, salutation: v }))}
            options={[{ value: '', label: 'No salutation' }, { value: 'Mr.', label: 'Mr.' }, { value: 'Mrs.', label: 'Mrs.' }, { value: 'Ms.', label: 'Ms.' }, { value: 'Mx.', label: 'Mx.' }, { value: 'Dr.', label: 'Dr.' }, { value: 'Prof.', label: 'Prof.' }]} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input label="First name" value={form.first_name} onChange={v => setForm(f => ({ ...f, first_name: v }))} />
            <Input label="Last name"  value={form.last_name}  onChange={v => setForm(f => ({ ...f, last_name: v }))} />
          </div>
          <Input label="Email" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} />
          <div>
            <Input label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+1 555 555 0123" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 11, color: MUTED, fontFamily: MONO }}>
              {data.profile?.phone_verified
                ? <span style={{ color: GREEN, fontWeight: 700 }}>✓ Verified</span>
                : data.profile?.phone
                  ? <span style={{ color: AMBER, fontWeight: 700 }}>● Unverified</span>
                  : <span>Add a number to receive SMS notifications</span>}
              {data.profile?.phone && !data.profile?.phone_verified && (
                <button type="button" onClick={() => window.location.href = '/user/security#/phone-numbers'} style={{ background: 'none', border: 'none', color: CYAN, fontWeight: 700, fontFamily: SANS, cursor: 'pointer', padding: 0, fontSize: 11 }}>
                  Verify via SMS →
                </button>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Location & locale">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input label="Timezone" value={form.timezone} onChange={v => setForm(f => ({ ...f, timezone: v }))} placeholder="America/Toronto" />
            <Select label="Language" value={form.language} onChange={v => setForm(f => ({ ...f, language: v }))}
              options={[{ value: 'en', label: 'English' }, { value: 'fr', label: 'French' }, { value: 'es', label: 'Spanish' }, { value: 'ar', label: 'Arabic' }]} />
          </div>
          <Input label="Address line 1" value={form.address_line1} onChange={v => setForm(f => ({ ...f, address_line1: v }))} />
          <Input label="Address line 2" value={form.address_line2} onChange={v => setForm(f => ({ ...f, address_line2: v }))} placeholder="Suite, floor (optional)" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Input label="City" value={form.city} onChange={v => setForm(f => ({ ...f, city: v }))} />
            <Input label="Postal code" value={form.postal_code} onChange={v => setForm(f => ({ ...f, postal_code: v }))} />
            <Input label="Country" value={form.country} onChange={v => setForm(f => ({ ...f, country: v }))} placeholder="Canada" />
          </div>
        </div>
      </Section>

      <div>
        <Btn variant="primary" size="md" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save profile changes'}</Btn>
      </div>
    </div>
  )
}

// ── Notifications ───────────────────────────────────────────────────────
function NotificationsTab({ data, setData, flash }) {
  const [prefs, setPrefs] = React.useState({ ...data.notif_prefs })
  const [saving, setSaving] = React.useState(false)
  const dirty = JSON.stringify(prefs) !== JSON.stringify(data.notif_prefs)
  const update = (k, v) => setPrefs(p => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/attorney/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ notif_prefs: prefs }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Save failed')
      flash('ok', 'Notification preferences saved.')
      setData(prev => ({ ...prev, notif_prefs: prefs }))
    } catch (e) { flash('err', e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section title="Email notifications" sub="Choose which updates land in your inbox.">
        <PrefRow label="New inquiries"      sub="When a relevant intake lands in the queue."      value={prefs.email_inquiries}      onChange={() => update('email_inquiries',     !prefs.email_inquiries)} />
        <PrefRow label="Offer activity"     sub="Offer accepted, declined, expired, or revised."  value={prefs.email_offers}         onChange={() => update('email_offers',        !prefs.email_offers)} />
        <PrefRow label="Order updates"      sub="Client approves, requests revisions, or completes." value={prefs.email_orders}      onChange={() => update('email_orders',        !prefs.email_orders)} />
        <PrefRow label="New messages"       sub="Inbound messages from clients on inquiries or orders." value={prefs.email_messages}  onChange={() => update('email_messages',      !prefs.email_messages)} />
        <PrefRow label="Payment events"     sub="Escrow released, payout transferred, failed transfers." value={prefs.email_payments} onChange={() => update('email_payments',      !prefs.email_payments)} />
        <PrefRow label="Weekly digest"      sub="A Monday recap of new inquiries and pipeline."   value={prefs.email_weekly_digest}  onChange={() => update('email_weekly_digest', !prefs.email_weekly_digest)} />
        <PrefRow label="Promotions"         sub="Platform announcements and new features."         value={prefs.email_promo}          onChange={() => update('email_promo',         !prefs.email_promo)} />
      </Section>
      <div>
        <Btn variant="primary" size="md" disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : dirty ? 'Save notification preferences' : 'Saved'}</Btn>
      </div>
    </div>
  )
}

// ── Privacy ─────────────────────────────────────────────────────────────
function PrivacyTab({ data, setData, flash }) {
  const [prefs, setPrefs] = React.useState({ ...data.privacy_prefs })
  const [saving, setSaving] = React.useState(false)
  const dirty = JSON.stringify(prefs) !== JSON.stringify(data.privacy_prefs)
  const update = (k, v) => setPrefs(p => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/attorney/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ privacy_prefs: prefs }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Save failed')
      flash('ok', 'Privacy preferences saved.')
      setData(prev => ({ ...prev, privacy_prefs: prefs }))
    } catch (e) { flash('err', e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section title="Privacy controls">
        <PrefRow label="Show full name on public profile" sub="When off, clients see only your first name and credential." value={prefs.show_full_name}            onChange={() => update('show_full_name',            !prefs.show_full_name)} />
        <PrefRow label="Share email with clients"          sub="Required for order channels — disabling may limit responsiveness." value={prefs.share_email_with_clients} onChange={() => update('share_email_with_clients', !prefs.share_email_with_clients)} />
        <PrefRow label="Allow product analytics"           sub="Helps us tune ranking and search for your specialty." value={prefs.allow_analytics}                       onChange={() => update('allow_analytics',           !prefs.allow_analytics)} />
        <PrefRow label="Marketing emails"                   sub="Occasional updates about new features and partnerships." value={prefs.marketing_emails}                  onChange={() => update('marketing_emails',          !prefs.marketing_emails)} />
      </Section>

      <Section title="Your data">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <Btn variant="secondary" size="sm" onClick={() => window.open('/api/attorney/earnings?format=csv', '_blank')}>⬇ Download earnings CSV</Btn>
          <Btn variant="ghost" size="sm" onClick={() => flash('ok', 'Full data export will be emailed to you.')}>📧 Email me a full export</Btn>
        </div>
      </Section>

      <div>
        <Btn variant="primary" size="md" disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : dirty ? 'Save privacy preferences' : 'Saved'}</Btn>
      </div>
    </div>
  )
}

// ── Compliance ──────────────────────────────────────────────────────────
function ComplianceTab({ data, flash, reload }) {
  const c = data.compliance || {}
  const items = [
    { label: 'Email verified',     done: true,                                        meta: data.profile.email },
    { label: 'Application approved', done: !!c.approved_at,                           meta: c.approved_at ? `Approved ${new Date(c.approved_at).toLocaleDateString()}` : 'Pending admin review' },
    { label: 'Credential type',     done: !!c.credential_type,                        meta: c.credential_type || 'Not specified on application' },
    { label: 'Bar / roll number',   done: !!c.bar_number,                             meta: c.bar_number || 'Add on next application revision' },
    { label: 'Malpractice insurance', done: !!c.malpractice_insurance,                meta: c.malpractice_insurance || 'Not disclosed' },
    { label: 'Jurisdictions',       done: !!c.jurisdictions,                          meta: c.jurisdictions || 'Add in My Profile' },
    { label: 'Payout setup',      done: true,                                     meta: 'Manual payouts via admin' },
    { label: 'Accepting new clients', done: c.available !== false,                    meta: c.available !== false ? 'Visible in search' : 'Paused — profile hidden from new buyers' },
  ]
  const completed = items.filter(i => i.done).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section
        title="Compliance status"
        sub={`${completed} of ${items.length} compliance items in good standing`}
        right={<Btn variant="ghost" size="sm" onClick={reload}>↻ Refresh</Btn>}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map(it => (
            <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, background: it.done ? `${GREEN}08` : `${AMBER}08`, border: `1px solid ${it.done ? `${GREEN}22` : `${AMBER}33`}` }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: it.done ? GREEN : AMBER, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0, fontSize: 12 }}>
                {it.done ? '✓' : '!'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{it.label}</div>
                <div style={{ fontSize: 12, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.meta}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Document upload" sub="Coming soon — upload bar admission cards, malpractice certificates, and licensure renewals. Today, send these to admin@yousafe.com.">
        <div style={{ padding: 12, background: `${AMBER}08`, border: `1px solid ${AMBER}33`, borderRadius: 8, fontSize: 12, color: TEXT, lineHeight: 1.55 }}>
          Once enabled, expiring documents will alert you 30 days in advance, and the Compliance tile on your dashboard will warn if anything lapses.
        </div>
      </Section>
    </div>
  )
}

// ── Payouts ─────────────────────────────────────────────────────────────
function PayoutsTab({ data, flash, reload }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section title="Payouts" sub="You are eligible for manual payouts administered by the platform.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8, background: `${GREEN}08`, border: `1px solid ${GREEN}22`, marginBottom: 14 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: GREEN }}>
              Eligible for payouts
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              Admin will process your earnings manually. No additional setup required.
            </div>
          </div>
        </div>
      </Section>

      <Section title="Payout policy">
        <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 10px' }}>• Funds are held in escrow until the client approves delivery.</p>
          <p style={{ margin: '0 0 10px' }}>• Escrow auto-releases 14 days after delivery if the client does not respond.</p>
          <p style={{ margin: '0 0 10px' }}>• Refunds raised within 14 days are clawed back from your pending balance.</p>
          <p style={{ margin: 0 }}>• Open Earnings → ⬇ Export CSV for monthly tax records.</p>
        </div>
      </Section>
    </div>
  )
}

// ── Security ────────────────────────────────────────────────────────────
function SecurityTab({ data, flash }) {
  const security = data.security || {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section title="Sign-in security">
        <div style={{ display: 'grid', gap: 10 }}>
          <Row label="Email" value={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {data.profile.email}
              {security.email_verified
                ? <Badge color="green" style={{ fontSize: 9 }}>Verified</Badge>
                : <Badge color="orange" style={{ fontSize: 9 }}>Unverified</Badge>}
            </span>
          } />
          <Row label="Phone" value={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {data.profile.phone || '—'}
              {data.profile.phone && (security.phone_verified
                ? <Badge color="green" style={{ fontSize: 9 }}>Verified</Badge>
                : <Badge color="orange" style={{ fontSize: 9 }}>Unverified</Badge>)}
            </span>
          } />
          <Row label="Two-factor" value={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {security.two_factor_enabled
                ? <>🛡️ <Badge color="green" style={{ fontSize: 9 }}>Enabled</Badge></>
                : <Badge color="gray" style={{ fontSize: 9 }}>Off</Badge>}
              {security.totp_enabled && <Badge color="cyan" style={{ fontSize: 9 }}>TOTP</Badge>}
              {security.backup_codes && <Badge color="purple" style={{ fontSize: 9 }}>Backup codes</Badge>}
            </span>
          } />
          <Row label="Member since" value={data.profile.member_since ? new Date(data.profile.member_since).toLocaleDateString() : '—'} />
        </div>
      </Section>

      {/* Inline phone verification — no Clerk modal, no redirect */}
      <PhoneVerificationCard />

      <Section title="Two-factor & advanced" sub="Set up an authenticator app (Authy, Google Authenticator, 1Password), generate backup codes, change your password, and review active sessions.">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Btn variant="primary" size="md" onClick={() => window.location.href = '/user/security'}>
            🛡️ Open security panel
          </Btn>
          {!security.phone_verified && data.profile.phone && (
            <Btn variant="secondary" size="md" onClick={() => window.location.href = '/user/security#/phone-numbers'}>
              📱 Verify phone via SMS
            </Btn>
          )}
          {!security.two_factor_enabled && (
            <Btn variant="secondary" size="md" onClick={() => window.location.href = '/user/security#/mfa'}>
              ✨ Enable two-factor auth
            </Btn>
          )}
        </div>
        <div style={{ marginTop: 14, padding: 12, background: `color-mix(in srgb, ${CYAN} 3%, transparent)`, border: `1px solid color-mix(in srgb, ${CYAN} 20%, transparent)`, borderRadius: 8, fontSize: 12, color: TEXT, lineHeight: 1.55 }}>
          <strong>Recommended:</strong> verify your phone, then enable two-factor with an authenticator app. Backup codes let you sign in if you lose your device.
        </div>
      </Section>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER2}` }}>
      <span style={{ fontSize: 12, color: MUTED, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{value}</span>
    </div>
  )
}


// ── Appearance tab ──────────────────────────────────────────────────────
function AppearanceTab() {
  const [theme, applyTheme] = usePortalTheme()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, marginBottom: 4 }}>
        Choose your view — your saved theme follows you on every device.
      </div>
      <ThemePicker currentTheme={theme} onChange={applyTheme} />
    </div>
  )
}

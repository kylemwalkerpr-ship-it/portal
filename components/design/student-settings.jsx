'use client'
import React from 'react'
import { Card, Btn, Badge, Avatar, Input, Select } from './shared'
import { PhoneVerificationCard } from '../PhoneVerificationCard'
import { usePortalTheme } from './usePortalTheme'
import ThemePicker from './ThemePicker'
import { COUNTRY_LIST } from '../../lib/countryList'

/**
 * Student → Settings (Fiverr-grade).
 *
 * Tabbed: Profile, Notifications, Privacy, Security, Verification.
 * Reads/writes a single endpoint that returns merged preference defaults so
 * the form always has sensible starting values even before the migration runs.
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
  { id: 'security',     label: 'Security',     icon: '🛡️' },
  { id: 'verification', label: 'Verification', icon: '✅' },
  { id: 'appearance',   label: 'Appearance',   icon: '🎨' },
]

function splitDisplayName(full = '') {
  const SALUTATIONS = new Set(['Mr.', 'Mrs.', 'Ms.', 'Mx.', 'Dr.', 'Prof.'])
  const tokens = String(full || '').trim().split(/\s+/).filter(Boolean)
  let salutation = ''
  if (tokens[0] && SALUTATIONS.has(tokens[0])) salutation = tokens.shift() || ''
  const first_name = tokens[0] || ''
  const last_name = tokens.slice(1).join(' ')
  return { salutation, first_name, last_name }
}

function Section({ title, sub, children }) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 22px 12px', borderBottom: `1px solid ${BORDER2}` }}>
        <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, color: TEXT, letterSpacing: '-.01em' }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{sub}</div>}
      </div>
      <div style={{ padding: '18px 22px' }}>{children}</div>
    </Card>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button onClick={onChange} style={{
      width: 40, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer',
      background: checked ? CYAN : '#D1CFC8', position: 'relative', transition: 'background .15s',
      flexShrink: 0,
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

export default function StudentSettings({ userName }) {
  // Active tab survives re-renders, remounts, and refreshes (?tab=… in the
  // URL). Picking a theme in Appearance must NOT bounce the user back to
  // Profile — the tab only changes when they click another tab themselves.
  const TAB_IDS = ['profile', 'notifications', 'privacy', 'security', 'verification', 'appearance']
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

  React.useEffect(() => {
    setLoading(true); setError('')
    fetch('/api/student/preferences', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})).then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error || 'Failed to load preferences')
        setData(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading && !data) {
    return <div style={{ padding: 28, color: MUTED, fontSize: 14, fontFamily: SANS, background: BG, minHeight: '100vh' }}>Loading settings…</div>
  }
  if (error && !data) {
    return (
      <div style={{ padding: 28, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
        <div style={{ background: `${RED}10`, border: `1px solid ${RED}33`, borderRadius: 10, padding: 18, color: RED }}>{error}</div>
      </div>
    )
  }
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
            }}>
              <span>{t.icon}</span>{t.label}
            </button>
          )
        })}
      </div>

      <div style={{ maxWidth: 760 }}>
        {tab === 'profile'      && <ProfileTab data={data} setData={setData} userName={userName} flash={flash} />}
        {tab === 'notifications' && <NotificationsTab data={data} setData={setData} flash={flash} />}
        {tab === 'privacy'      && <PrivacyTab data={data} setData={setData} flash={flash} />}
        {tab === 'security'     && <SecurityTab data={data} flash={flash} />}
        {tab === 'verification' && <VerificationTab flash={flash} />}
        {tab === 'appearance'   && <AppearanceTab />}
      </div>
    </div>
  )
}

// ── Profile tab ─────────────────────────────────────────────────────────
function ProfileTab({ data, setData, userName, flash }) {
  const parsed = React.useMemo(() => splitDisplayName(data.profile.full_name || userName || ''), [data.profile.full_name, userName])
  const [form, setForm] = React.useState({
    salutation:    parsed.salutation,
    first_name:    parsed.first_name,
    last_name:     parsed.last_name,
    email:         data.profile.email || '',
    phone:         data.profile.phone || '',
    timezone:      data.profile.timezone || '',
    language:      data.profile.language || 'en',
    address_line1: data.profile.address_line1 || '',
    address_line2: data.profile.address_line2 || '',
    city:          data.profile.city || '',
    postal_code:   data.profile.postal_code || '',
    country:       data.profile.country || '',
    country_code:  data.profile.country_code || '',
  })
  const [saving, setSaving] = React.useState(false)
  const [avatarBusy, setAvatarBusy] = React.useState(false);
  const avatarInputRef = React.useRef(null);

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/student/preferences', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Save failed')
      // ISO country override goes through a dedicated endpoint so the server
      // can stamp country_source='user' and reject codes outside our allowlist.
      // Skipped silently if the user didn't change it or the env hasn't run
      // the country migration yet (503 from the route).
      if (form.country_code && form.country_code !== (data.profile.country_code || '')) {
        const cr = await fetch('/api/profile/country', {
          method: 'PATCH', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ country_code: form.country_code }),
        })
        if (!cr.ok && cr.status !== 503) {
          const cd = await cr.json().catch(() => ({}))
          throw new Error(cd?.error?.message || cd?.error || 'Country save failed')
        }
      }
      flash('ok', 'Profile saved.')
      // Reload from server so the canonical full_name is reflected
      const r2 = await fetch('/api/student/preferences', { credentials: 'same-origin' })
      const d2 = await r2.json().catch(() => ({}))
      if (r2.ok) setData(d2)
    } catch (e) { flash('err', e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section title="Identity" sub="How you appear to consultants and on receipts.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
          <Avatar name={data.profile.full_name || form.first_name || 'User'} src={data.profile.avatar_url || undefined} size={64} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{data.profile.full_name || 'Add your name'}</div>
            <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{data.profile.email}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setAvatarBusy(true);
                  try {
                    const fd = new FormData();
                    fd.append('file', file);
                    const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd, credentials: 'same-origin' });
                    const d = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(d.error || 'Upload failed.');
                    setData(prev => ({ ...prev, profile: { ...prev.profile, avatar_url: d.avatar_url } }));
                    flash('ok', 'Profile photo updated.');
                  } catch (err) { flash('err', err.message); }
                  finally { setAvatarBusy(false); }
                }}
              />
              <Btn variant="secondary" size="sm" disabled={avatarBusy} onClick={() => avatarInputRef.current?.click()}>
                {avatarBusy ? 'Uploading…' : data.profile.avatar_url ? 'Change photo' : 'Upload photo'}
              </Btn>
              {data.profile.avatar_url && (
                <Btn variant="ghost" size="sm" disabled={avatarBusy} onClick={async () => {
                  setAvatarBusy(true);
                  try {
                    const res = await fetch('/api/profile/avatar', { method: 'DELETE', credentials: 'same-origin' });
                    if (!res.ok) throw new Error('Could not remove photo.');
                    setData(prev => ({ ...prev, profile: { ...prev.profile, avatar_url: null } }));
                    flash('ok', 'Photo removed.');
                  } catch (err) { flash('err', err.message); }
                  finally { setAvatarBusy(false); }
                }}>Remove</Btn>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Select
            label="Salutation"
            value={form.salutation}
            onChange={v => setForm(f => ({ ...f, salutation: v }))}
            options={[
              { value: '', label: 'No salutation' }, { value: 'Mr.', label: 'Mr.' }, { value: 'Mrs.', label: 'Mrs.' },
              { value: 'Ms.', label: 'Ms.' }, { value: 'Mx.', label: 'Mx.' }, { value: 'Dr.', label: 'Dr.' }, { value: 'Prof.', label: 'Prof.' },
            ]}
          />
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
                  : <span>Add a number to enable SMS notifications</span>}
              {data.profile?.phone && !data.profile?.phone_verified && (
                <button type="button" onClick={() => window.location.href = '/user/security'} style={{ background: 'none', border: 'none', color: CYAN, fontWeight: 700, fontFamily: SANS, cursor: 'pointer', padding: 0, fontSize: 11 }}>
                  Verify via SMS →
                </button>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Location & locale" sub="Affects timezone for deadlines and language for outbound emails.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Input label="Timezone" value={form.timezone} onChange={v => setForm(f => ({ ...f, timezone: v }))} placeholder="America/Toronto" />
            <Select
              label="Language"
              value={form.language}
              onChange={v => setForm(f => ({ ...f, language: v }))}
              options={[
                { value: 'en', label: 'English' }, { value: 'fr', label: 'French' },
                { value: 'es', label: 'Spanish' }, { value: 'ar', label: 'Arabic' },
              ]}
            />
          </div>
          <Input label="Address line 1" value={form.address_line1} onChange={v => setForm(f => ({ ...f, address_line1: v }))} />
          <Input label="Address line 2" value={form.address_line2} onChange={v => setForm(f => ({ ...f, address_line2: v }))} placeholder="Apt, suite, etc. (optional)" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Input label="City"        value={form.city}        onChange={v => setForm(f => ({ ...f, city: v }))} />
            <Input label="Postal code" value={form.postal_code} onChange={v => setForm(f => ({ ...f, postal_code: v }))} />
            <Input label="Country"     value={form.country}     onChange={v => setForm(f => ({ ...f, country: v }))} placeholder="Canada" />
          </div>
          <Select
            label="Country (for matching & jurisdiction)"
            value={form.country_code}
            onChange={v => setForm(f => ({ ...f, country_code: v }))}
            options={[
              { value: '', label: 'Detect from my location' },
              ...COUNTRY_LIST.map(c => ({ value: c.code, label: `${c.code} — ${c.name}` })),
            ]}
          />
        </div>
      </Section>

      <div>
        <Btn variant="primary" size="md" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save profile changes'}</Btn>
      </div>
    </div>
  )
}

// ── Notifications tab ───────────────────────────────────────────────────
function NotificationsTab({ data, setData, flash }) {
  const [prefs, setPrefs] = React.useState({ ...data.notif_prefs })
  const [saving, setSaving] = React.useState(false)
  const dirty = JSON.stringify(prefs) !== JSON.stringify(data.notif_prefs)
  const update = (k, v) => setPrefs(p => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/student/preferences', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notif_prefs: prefs }),
      })
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
        <PrefRow label="New messages"          sub="When a consultant or attorney sends you a message." value={prefs.email_messages}       onChange={() => update('email_messages',       !prefs.email_messages)} />
        <PrefRow label="Order status updates"  sub="Delivery, revisions, completion, refunds."         value={prefs.email_orders}         onChange={() => update('email_orders',         !prefs.email_orders)} />
        <PrefRow label="New attorney offers"   sub="When an attorney sends you a custom offer."        value={prefs.email_offers}         onChange={() => update('email_offers',         !prefs.email_offers)} />
        <PrefRow label="Weekly digest"         sub="A Sunday recap of activity across your orders."    value={prefs.email_weekly_digest}  onChange={() => update('email_weekly_digest',  !prefs.email_weekly_digest)} />
        <div style={{ paddingTop: 10 }}>
          <PrefRow label="Promotions and offers" sub="Curated services, seasonal pricing, and announcements." value={prefs.email_promo} onChange={() => update('email_promo', !prefs.email_promo)} />
        </div>
      </Section>

      <div>
        <Btn variant="primary" size="md" disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : dirty ? 'Save notification preferences' : 'Saved'}</Btn>
      </div>
    </div>
  )
}

// ── Privacy tab ─────────────────────────────────────────────────────────
function PrivacyTab({ data, setData, flash }) {
  const [prefs, setPrefs] = React.useState({ ...data.privacy_prefs })
  const [saving, setSaving] = React.useState(false)
  const dirty = JSON.stringify(prefs) !== JSON.stringify(data.privacy_prefs)
  const update = (k, v) => setPrefs(p => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/student/preferences', {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacy_prefs: prefs }),
      })
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
        <PrefRow label="Share profile with consultants" sub="Consultants see your name, country, and timezone when an order is placed." value={prefs.share_profile_with_consultants} onChange={() => update('share_profile_with_consultants', !prefs.share_profile_with_consultants)} />
        <PrefRow label="Allow product analytics"        sub="Helps us improve search results and recommendations. Never shared with attorneys." value={prefs.allow_analytics} onChange={() => update('allow_analytics', !prefs.allow_analytics)} />
        <PrefRow label="Marketing emails"              sub="Occasional updates about new features and partnerships." value={prefs.marketing_emails} onChange={() => update('marketing_emails', !prefs.marketing_emails)} />
      </Section>

      <Section title="Your data" sub="You own your data. Export or delete it any time.">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <Btn variant="secondary" size="sm" onClick={() => window.open('/api/student/billing/transactions?format=csv', '_blank')}>⬇ Download transactions (CSV)</Btn>
          <Btn variant="ghost" size="sm" onClick={() => flash('ok', 'Full data export will arrive in your inbox.')}>📧 Email me a full export</Btn>
        </div>
        <div style={{ marginTop: 12, padding: 12, background: `${RED}08`, border: `1px solid ${RED}22`, borderRadius: 8 }}>
          <div style={{ fontWeight: 700, color: RED, fontSize: 13 }}>Delete account</div>
          <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginTop: 4 }}>
            Deleting your account ends all attorney engagements and removes your data within 30 days. Outstanding escrow is refunded automatically.
          </div>
          <Btn variant="danger" size="sm" style={{ marginTop: 10 }} onClick={() => flash('err', 'Contact support@yousafe.com to delete your account.')}>Request account deletion</Btn>
        </div>
      </Section>

      <div>
        <Btn variant="primary" size="md" disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : dirty ? 'Save privacy preferences' : 'Saved'}</Btn>
      </div>
    </div>
  )
}

// ── Security tab ────────────────────────────────────────────────────────
function SecurityTab({ data, flash }) {
  const security = data.security || {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section title="Sign-in security" sub="Phone, password, and two-factor authentication are managed securely.">
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={infoRow}><span style={infoKey}>Email</span>
            <span style={{ ...infoVal, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {data.profile.email}
              {security.email_verified
                ? <Badge color="green" style={{ fontSize: 9 }}>Verified</Badge>
                : <Badge color="orange" style={{ fontSize: 9 }}>Unverified</Badge>}
            </span>
          </div>
          <div style={infoRow}><span style={infoKey}>Phone</span>
            <span style={{ ...infoVal, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {data.profile.phone || '—'}
              {data.profile.phone && (security.phone_verified
                ? <Badge color="green" style={{ fontSize: 9 }}>Verified</Badge>
                : <Badge color="orange" style={{ fontSize: 9 }}>Unverified</Badge>)}
            </span>
          </div>
          <div style={infoRow}><span style={infoKey}>Two-factor auth</span>
            <span style={{ ...infoVal, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {security.two_factor_enabled
                ? <>🛡️ <Badge color="green" style={{ fontSize: 9 }}>Enabled</Badge></>
                : <Badge color="gray" style={{ fontSize: 9 }}>Off</Badge>}
              {security.totp_enabled && <Badge color="cyan" style={{ fontSize: 9 }}>TOTP</Badge>}
              {security.backup_codes && <Badge color="purple" style={{ fontSize: 9 }}>Backup codes</Badge>}
            </span>
          </div>
          <div style={infoRow}><span style={infoKey}>Member since</span><span style={infoVal}>{data.profile.member_since ? new Date(data.profile.member_since).toLocaleDateString() : '—'}</span></div>
        </div>
      </Section>

      {/* Inline phone verification — no Clerk modal, no redirect */}
      <PhoneVerificationCard />

      <Section title="Two-factor & advanced" sub="Set up an authenticator app (Authy / Google Authenticator / 1Password), generate backup codes, change your password, and review active sessions.">
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
          <strong>Best practice:</strong> after adding a phone number, verify it via SMS, then enable TOTP two-factor with an authenticator app like Authy or Google Authenticator. Backup codes let you sign in if you lose your phone.
        </div>
      </Section>
    </div>
  )
}

// ── Verification tab ────────────────────────────────────────────────────
function VerificationTab({ flash }) {
  return (
    <Section title="Identity verification" sub="Strongly recommended for high-value engagements. Verified students unlock priority routing.">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 0' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 4 }}>Email</div>
          <div style={{ fontSize: 12, color: MUTED }}>Confirmed at sign-up via Clerk.</div>
        </div>
        <Badge color="green" style={{ fontSize: 10, fontWeight: 700 }}>Verified</Badge>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 0', borderTop: `1px solid ${BORDER2}` }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 4 }}>Phone number</div>
          <div style={{ fontSize: 12, color: MUTED }}>Add a phone in the Profile tab and verify via SMS to enable SMS notifications.</div>
        </div>
        <Badge color="gray" style={{ fontSize: 10 }}>Pending</Badge>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 0', borderTop: `1px solid ${BORDER2}` }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 4 }}>Government ID</div>
          <div style={{ fontSize: 12, color: MUTED }}>Required for engagements above $5,000 or where the attorney requests KYC.</div>
        </div>
        <Btn variant="secondary" size="sm" onClick={() => flash('ok', 'ID verification flow coming soon.')}>Upload ID</Btn>
      </div>
    </Section>
  )
}

const infoRow = { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER2}` }
const infoKey = { fontSize: 12, color: MUTED, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }
const infoVal = { fontSize: 13, color: TEXT, fontWeight: 600 }


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

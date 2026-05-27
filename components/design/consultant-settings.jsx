'use client'
import React from 'react'
import { C, Btn, Card, Input, Avatar } from './shared'
import { PhoneVerificationCard } from '@/components/PhoneVerificationCard'
import ProfileAIDraftButton from '../profile/ProfileAIDraftButton'
import { usePortalTheme } from './usePortalTheme'
import ThemePicker from './ThemePicker'

/**
 * Consultant → Settings (mirrors AttorneySettings pattern).
 *
 * Handles its own data fetching for profile/preferences and provides
 * inline editing for profile, notifications, privacy, and appearance.
 */

function Toggle({ checked, onChange }) {
  return (
    <button onClick={onChange} style={{
      width: '44px', height: '24px', borderRadius: '99px', border: 'none', cursor: 'pointer',
      background: checked ? C.cyan : C.surface3, position: 'relative', transition: 'background 0.2s', flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute', top: '3px', left: checked ? '22px' : '3px',
        width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

function PrefRow({ label, sub, value, onChange }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: C.text }}>{label}</div>
        {sub && <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>{sub}</div>}
      </div>
      <Toggle checked={!!value} onChange={onChange} />
    </div>
  )
}

function Section({ title, sub, children }) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 22px 12px', borderBottom: `1px solid ${C.border2 || C.border}` }}>
        <div style={{ fontWeight: 700, fontSize: '15px', color: C.text }}>{title}</div>
        {sub && <div style={{ fontSize: '12px', color: C.textMuted, marginTop: 3 }}>{sub}</div>}
      </div>
      <div style={{ padding: '18px 22px' }}>{children}</div>
    </Card>
  )
}

export default function ConsultantSettings({
  profileName, setProfileName,
  profileEmail, setProfileEmail,
  profileBio, setProfileBio,
  profileAvatarUrl,
  offersFreeConsult, setOffersFreeConsult,
  consultBookingUrl, setConsultBookingUrl,
  available, toggleAvailable,
  notifPrefs, toggleNotifPref,
  privPrefs, setPrivPrefs,
  privDirty, setPrivDirty,
  privSaving, setPrivSaving,
  uploadingAvatar,
  avatarInputRef,
  headshotInputRef,
  uploadingHeadshot,
  onSaveProfile,
  onUploadAvatar,
}) {
  const [theme, applyTheme] = usePortalTheme()

  const togglePriv = (key) => {
    setPrivPrefs(p => ({ ...p, [key]: !p[key] }))
    setPrivDirty(true)
  }

  const savePrivacy = async () => {
    setPrivSaving(true)
    try {
      const r = await fetch('/api/consultant/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ privacy_prefs: privPrefs }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Save failed')
      setPrivDirty(false)
      // notification
    } catch (e) { /* handled by parent */ }
    finally { setPrivSaving(false) }
  }

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '720px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Settings</h2>

      {/* Profile */}
      <Section title="Profile" sub="Your name, photo, and bio — visible to students on your public card.">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <Avatar name={profileName || 'Consultant'} src={profileAvatarUrl} size={60} color={C.purple} />
          <div>
            <div style={{ fontWeight: 700 }}>{profileName || 'Consultant Name'}</div>
            <div style={{ color: C.textMuted, fontSize: '13px' }}>{profileEmail || 'you@example.com'}</div>
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }}
              onChange={e => onUploadAvatar(e.target.files?.[0])} />
            <Btn variant="secondary" size="sm" style={{ marginTop: '8px' }} disabled={uploadingAvatar} onClick={() => avatarInputRef.current?.click()}>
              {uploadingAvatar ? 'Uploading...' : profileAvatarUrl ? 'Change photo' : 'Upload profile photo'}
            </Btn>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="First and last name" value={profileName} onChange={setProfileName} placeholder="First Last" />
          <Input label="Email" type="email" value={profileEmail} onChange={setProfileEmail} placeholder="Email address" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: C.text }}>Bio</span>
              <ProfileAIDraftButton field="bio" onApply={(v) => setProfileBio(String(v || ''))} />
            </div>
            <Input label="" value={profileBio} onChange={setProfileBio} placeholder="Short profile summary" />
          </div>

          {/* Free consult toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Offer a free 15-minute consult</div>
              <div style={{ fontSize: '12px', color: C.textMuted }}>Strongly boosts click-through. Save below after toggling.</div>
            </div>
            <Toggle checked={offersFreeConsult} onChange={() => setOffersFreeConsult(v => !v)} />
          </div>

          {/* Booking URL */}
          {offersFreeConsult && (
            <div style={{ padding: '4px 0' }}>
              <Input label="Free consult booking link" value={consultBookingUrl} onChange={setConsultBookingUrl} placeholder="https://calendly.com/your-handle/15min" />
              <div style={{ fontSize: '11px', color: C.textMuted, marginTop: '6px', lineHeight: 1.5 }}>
                Paste your Calendly, Cal.com, or Google Calendar appointments URL.
              </div>
            </div>
          )}

          {/* Availability toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Available for orders</div>
              <div style={{ fontSize: '12px', color: C.textMuted }}>Toggle off to pause new requests</div>
            </div>
            <Toggle checked={available} onChange={toggleAvailable} />
          </div>
          <Btn variant="primary" size="sm" style={{ alignSelf: 'flex-start' }} onClick={onSaveProfile}>Save changes</Btn>
        </div>
      </Section>

      {/* Privacy */}
      <Section title="Privacy" sub="Control what's visible on your profile and how we use your data.">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[
            { key: 'show_full_name', label: 'Show full name on public profile', sub: 'When off, clients see only your initials.' },
            { key: 'share_email_with_clients', label: 'Share email with clients', sub: 'Required for order channels.' },
            { key: 'allow_analytics', label: 'Allow product analytics', sub: 'Helps us tune search and ranking for your specialty.' },
            { key: 'marketing_emails', label: 'Marketing emails', sub: 'Occasional updates about new features and partnerships.' },
          ].map(({ key, label, sub }) => (
            <PrefRow key={key} label={label} sub={sub} value={privPrefs[key]} onChange={() => togglePriv(key)} />
          ))}
        </div>
        <Btn variant="primary" size="sm" style={{ marginTop: '16px' }} disabled={privSaving || !privDirty} onClick={savePrivacy}>
          {privSaving ? 'Saving…' : privDirty ? 'Save privacy preferences' : 'Saved'}
        </Btn>
      </Section>

      {/* Appearance */}
      <Section title="Appearance" sub="Choose your view — your saved theme follows you on every device.">
        <ThemePicker currentTheme={theme} onChange={applyTheme} />
      </Section>

      {/* Notifications */}
      <Section title="Notifications" sub="Choose which updates you receive.">
        {[['orders', 'New order requests'], ['messages', 'Student messages'], ['payments', 'Payment confirmations']].map(([key, label]) => (
          <PrefRow key={key} label={label} value={notifPrefs[key]} onChange={() => toggleNotifPref(key)} />
        ))}
      </Section>

      {/* Phone verification */}
      <PhoneVerificationCard />
    </div>
  );
}

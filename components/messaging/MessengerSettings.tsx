'use client'

import React from 'react'

interface MessengerSettingsProps {
  open: boolean
  onClose: () => void
  theme: string
  density: string
  wallpaper: string
  wallpaperUrl: string
  globalMute: boolean
  onChangeTheme: (t: string) => void
  onChangeDensity: (d: string) => void
  onChangeWallpaper: (w: string) => void
  onChangeWallpaperUrl: (url: string) => void
  onToggleGlobalMute: (muted: boolean) => void
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="settings-section">
      <div className="settings-section-title">{title}</div>
      {children}
    </div>
  )
}

function Segmented({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={value === o.id ? 'on' : ''}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`settings-switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
      aria-checked={checked}
      role="switch"
    >
      <span className="settings-switch-knob" />
    </button>
  )
}

export default function MessengerSettings({
  open,
  onClose,
  theme,
  density,
  wallpaper,
  wallpaperUrl,
  globalMute,
  onChangeTheme,
  onChangeDensity,
  onChangeWallpaper,
  onChangeWallpaperUrl,
  onToggleGlobalMute,
}: MessengerSettingsProps) {
  const [uploading, setUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState('')
  const fileRef = React.useRef<HTMLInputElement>(null)

  if (!open) return null

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await fetch('/api/messenger/wallpaper', {
        method: 'POST',
        credentials: 'same-origin',
        body: form,
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setUploadError(d?.error?.message || 'Upload failed.')
        return
      }
      onChangeWallpaperUrl(d?.data?.url || '')
      onChangeWallpaper('custom')
    } catch {
      setUploadError('Network error. Please try again.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleReplace = () => {
    fileRef.current?.click()
  }

  const handleRemove = async () => {
    setUploadError('')
    try {
      const r = await fetch('/api/messenger/wallpaper', {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setUploadError(d?.error?.message || 'Remove failed.')
        return
      }
    } catch {
      // Best-effort; clear local state regardless
    }
    onChangeWallpaperUrl('')
    onChangeWallpaper('default')
  }

  const wallpaperOptions = [
    { id: 'default', label: 'Default doodle' },
    { id: 'paper', label: 'Paper' },
    { id: 'none', label: 'None' },
    { id: 'custom', label: 'Custom' },
  ]

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="backdrop-inner settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <button type="button" className="iconbtn" onClick={onClose} title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div>Settings</div>
          <div style={{ width: 32 }} />
        </div>

        <div className="settings-scroll">
          <SettingSection title="Theme">
            <Segmented
              options={[
                { id: 'light', label: 'Light' },
                { id: 'dark', label: 'Dark' },
                { id: 'system', label: 'System' },
              ]}
              value={theme}
              onChange={onChangeTheme}
            />
          </SettingSection>

          <SettingSection title="Density">
            <Segmented
              options={[
                { id: 'comfortable', label: 'Comfortable' },
                { id: 'compact', label: 'Compact' },
              ]}
              value={density}
              onChange={onChangeDensity}
            />
          </SettingSection>

          <SettingSection title="Chat wallpaper">
            <Segmented
              options={wallpaperOptions}
              value={wallpaper}
              onChange={(w) => {
                onChangeWallpaper(w)
                if (w !== 'custom') {
                  onChangeWallpaperUrl('')
                }
              }}
            />
            {wallpaper === 'custom' && (
              <div style={{ marginTop: 12 }}>
                {wallpaperUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img
                      src={wallpaperUrl}
                      alt="Wallpaper"
                      style={{ width: 96, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="cl-pill"
                        onClick={handleReplace}
                        disabled={uploading}
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        className="cl-pill"
                        onClick={handleRemove}
                        disabled={uploading}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      className="cl-pill"
                      onClick={handleReplace}
                      disabled={uploading}
                    >
                      {uploading ? 'Uploading…' : 'Upload image'}
                    </button>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                {uploadError && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--brick)' }}>
                    {uploadError}
                  </div>
                )}
              </div>
            )}
          </SettingSection>

          <SettingSection title="Platform safety">
            <div className="settings-list">
              <div className="settings-row">
                <div>
                  <b>Off-platform contact filter</b>
                  <div className="settings-sub">Blocks phone numbers, emails, external URLs, payment-app handles and social IDs in every message.</div>
                </div>
                <div className="settings-val">Enforced</div>
              </div>
              <div className="settings-row">
                <div>
                  <b>Attachment scanning</b>
                  <div className="settings-sub">Every uploaded file is scanned for malware before delivery.</div>
                </div>
                <div className="settings-val">On</div>
              </div>
              <div className="settings-row">
                <div>
                  <b>Escrow protection</b>
                  <div className="settings-sub">Payments are held by Yousafe until you mark the work complete or 7 days after delivery.</div>
                </div>
                <div className="settings-val">On</div>
              </div>
            </div>
          </SettingSection>

          <SettingSection title="Notifications">
            <div className="settings-row">
              <div>
                <b>Mute all conversations</b>
                <div className="settings-sub">When on, all conversations are muted until you turn this off.</div>
              </div>
              <Switch checked={globalMute} onChange={onToggleGlobalMute} />
            </div>
          </SettingSection>

          <SettingSection title="Data">
            <button
              type="button"
              className="settings-btn"
              onClick={() => {
                const data = { exported_at: new Date().toISOString(), conversations: [] }
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'yousafe-messenger-export.json'
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export conversations (JSON)
            </button>
          </SettingSection>
        </div>
      </div>
    </div>
  )
}

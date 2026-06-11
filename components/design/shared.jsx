'use client'
import React from 'react'

// Warm editorial palette. Off-white paper background, indigo accent (legacy
// `cyan` key kept for compatibility with existing code), and a serif font
// reference for premium headings.
export const C = {
  bg:        'var(--portal-bg)',
  surface:   'var(--portal-surface)',
  surface2:  'var(--portal-surface-2)',
  surface3:  'var(--portal-surface-3)',
  border:    'var(--portal-rule)',
  border2:   'var(--portal-rule-soft)',
  borderSoft:'var(--portal-rule-soft)',
  cyan:      'var(--portal-accent)',
  cyanDark:  'var(--portal-accent-deep)',
  cyanGlow:  'var(--portal-accent-soft)',
  studentMessageBg: '#E8EEF6',
  studentMessageText: 'var(--portal-ink)',
  studentMessageBorder: '#C9D5E3',
  outboundMessageBg: 'var(--portal-surface)',
  outboundMessageText: 'var(--portal-ink)',
  outboundMessageBorder: 'rgba(0,0,0,0.16)',
  navy:      'var(--portal-ink)',
  navyGlow:  'rgba(15,23,42,0.08)',
  text:      'var(--portal-ink)',
  textMuted: 'var(--portal-ink-mid)',
  textDim:   'var(--portal-ink-soft)',
  green:     'var(--portal-moss)',
  orange:    '#D97706',
  red:       'var(--portal-brick)',
  purple:    '#7C3AED',
  serif: "var(--portal-font-display, 'Cormorant Garamond', Georgia, serif)",
  sans: "var(--portal-font-body, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
}

export function Btn({ children, variant = 'primary', size = 'md', onClick = undefined, disabled = false, style = {}, type = 'button', fullWidth = false, ...props }) {
  const [hovered, setHovered] = React.useState(false)
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: '8px', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', fontWeight: 600,
    transition: 'transform 140ms ease, box-shadow 140ms ease, background 140ms ease, border-color 140ms ease',
    borderRadius: '999px', whiteSpace: 'nowrap', width: fullWidth ? '100%' : undefined,
    opacity: disabled ? 0.5 : 1,
    transform: hovered && !disabled ? 'translateY(-1px)' : 'none',
  }
  const sizes = {
    sm: { padding: '7px 16px', fontSize: '13px', letterSpacing: '0.005em' },
    md: { padding: '10px 22px', fontSize: '14px', letterSpacing: '0.005em' },
    lg: { padding: '13px 28px', fontSize: '15px' },
    xl: { padding: '16px 36px', fontSize: '16px' },
  }
  const variants = {
    primary: {
      background: '#0F172A', color: '#fff',
      boxShadow: hovered && !disabled ? '0 6px 18px rgba(15,23,42,0.20)' : '0 1px 2px rgba(15,23,42,0.10)',
    },
    secondary: { background: C.surface, color: C.text, border: `1px solid ${C.border2}` },
    ghost: { background: 'transparent', color: C.textMuted },
    danger: { background: 'rgba(178,34,52,0.08)', color: C.red, border: `1px solid rgba(178,34,52,0.25)` },
    success: { background: 'rgba(95,107,58,0.10)', color: C.green, border: `1px solid rgba(95,107,58,0.25)` },
    outline: { background: 'transparent', color: C.text, border: `1px solid ${hovered && !disabled ? C.text : 'rgba(0,0,0,0.18)'}` },
    navy: { background: C.navy, color: '#fff', boxShadow: hovered && !disabled ? `0 6px 18px ${C.navyGlow}` : `0 1px 2px ${C.navyGlow}` },
    brand: { background: '#3C3B6E', color: '#fff', boxShadow: hovered && !disabled ? '0 6px 18px rgba(60,59,110,0.30)' : '0 1px 2px rgba(60,59,110,0.18)' },
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...props}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
    >
      {children}
    </button>
  )
}

export function Badge({ children, color = 'cyan', style = {}, ...props }) {
  const colors = {
    cyan: { bg: 'rgba(60,59,110,0.08)', text: C.cyan, border: 'rgba(60,59,110,0.25)' },
    green: { bg: 'rgba(95,107,58,0.10)', text: C.green, border: 'rgba(95,107,58,0.25)' },
    orange: { bg: 'rgba(217,119,6,0.10)', text: C.orange, border: 'rgba(217,119,6,0.25)' },
    red: { bg: 'rgba(178,34,52,0.10)', text: C.red, border: 'rgba(178,34,52,0.25)' },
    purple: { bg: 'rgba(124,58,237,0.10)', text: C.purple, border: 'rgba(124,58,237,0.25)' },
    gray: { bg: 'rgba(100,116,139,0.10)', text: C.textMuted, border: 'rgba(100,116,139,0.25)' },
  }
  const c = colors[color] || colors.cyan
  return (
    <span
      {...props}
      style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
      letterSpacing: '0.01em',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, ...style
      }}
    >
      {children}
    </span>
  )
}

export function Card({ children, style = {}, onClick = undefined, hover = false, className = undefined }) {
  const [hovered, setHovered] = React.useState(false)
  const isHover = hover || Boolean(onClick)
  return (
    <div
      className={className}
      onClick={onClick}
      onMouseEnter={() => isHover && setHovered(true)}
      onMouseLeave={() => isHover && setHovered(false)}
      style={{
        background: C.surface,
        border: `1px solid ${hovered ? 'rgba(0,0,0,0.12)' : C.border}`,
        borderRadius: '14px',
        padding: '24px',
        transition: 'border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
        cursor: onClick ? 'pointer' : undefined,
        transform: hovered && isHover ? 'translateY(-2px)' : undefined,
        boxShadow: hovered && isHover
          ? '0 12px 32px rgba(15,23,42,0.10)'
          : '0 1px 3px rgba(15,23,42,0.04)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Input({ label, type = 'text', value, onChange, placeholder, icon, hint, error, style, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && <label style={{ fontSize: '13px', fontWeight: 600, color: C.textMuted }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        {icon && <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: C.textDim, fontSize: '16px' }}>{icon}</span>}
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} {...props}
          style={{
            width: '100%', padding: icon ? '11px 14px 11px 38px' : '11px 14px',
            background: C.surface2, border: `1px solid ${error ? C.red : C.border2}`,
            borderRadius: '10px', color: C.text, fontSize: '14px',
            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', ...style
          }} />
      </div>
      {hint && !error && <span style={{ fontSize: '12px', color: C.textDim }}>{hint}</span>}
      {error && <span style={{ fontSize: '12px', color: C.red }}>{error}</span>}
    </div>
  )
}

export function Textarea({ label, value, onChange, placeholder, hint, error, style = {}, rows = 4, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && <label style={{ fontSize: '13px', fontWeight: 600, color: C.textMuted }}>{label}</label>}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        {...props}
        style={{
          width: '100%',
          padding: '11px 14px',
          background: C.surface2,
          border: `1px solid ${error ? C.red : C.border2}`,
          borderRadius: '10px',
          color: C.text,
          fontSize: '14px',
          outline: 'none',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
          resize: 'vertical',
          ...style,
        }}
      />
      {hint && !error && <span style={{ fontSize: '12px', color: C.textDim }}>{hint}</span>}
      {error && <span style={{ fontSize: '12px', color: C.red }}>{error}</span>}
    </div>
  )
}

export function Select({ label, value, onChange, options, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && <label style={{ fontSize: '13px', fontWeight: 600, color: C.textMuted }}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        padding: '11px 14px', background: C.surface2, border: `1px solid ${C.border2}`,
        borderRadius: '10px', color: C.text, fontSize: '14px',
        outline: 'none', fontFamily: 'inherit', cursor: 'pointer', ...style
      }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

export function Avatar({ name, src, size = 36, color }) {
  const colors = ['#3C3B6E', '#B22234', '#5F6B3A', '#D97706', '#7C3AED']
  const idx = name ? name.charCodeAt(0) % colors.length : 0
  const bg = color || colors[idx]
  const initials = name ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: src ? 'transparent' : `${bg}22`,
      border: `2px solid ${bg}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: bg,
      flexShrink: 0, overflow: 'hidden',
    }}>
      {src ? <img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={name} /> : initials}
    </div>
  )
}

export function MessageBody({ body, linkColor = C.cyan }) {
  const raw = String(body || '')
  const lines = raw.split('\n')
  const attachmentLine = lines.find(line => /^https?:\/\//.test(line.trim()))
  const labelLine = lines.find(line => line.startsWith('Attachment:'))
  const metaLine = lines.find(line => line.startsWith('AttachmentMeta:'))
  const attachmentMeta = React.useMemo(() => {
    if (!metaLine) return null
    try { return JSON.parse(metaLine.replace(/^AttachmentMeta:\s*/, '')) } catch { return null }
  }, [metaLine])
  const text = attachmentLine
    ? lines.filter(line => line !== attachmentLine && line !== labelLine).join('\n').trim()
    : attachmentMeta
      ? lines.filter(line => line !== labelLine && line !== metaLine).join('\n').trim()
    : raw
  const [signed, setSigned] = React.useState(null)
  const [lightbox, setLightbox] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    if (!attachmentMeta?.id) return
    setSigned(null)
    fetch(`/api/chat-attachments/${attachmentMeta.id}/signed-url`)
      .then(r => r.json().then(p => ({ ok: r.ok, status: r.status, payload: p })))
      .then(({ payload }) => {
        if (!cancelled) setSigned(payload?.data || null)
      })
      .catch(() => !cancelled && setSigned({ attachment: attachmentMeta, signed_url: null }))
    return () => { cancelled = true }
  }, [attachmentMeta?.id])

  const meta = signed?.attachment || attachmentMeta
  const signedUrl = signed?.signed_url
  const isImage = String(meta?.mime_type || '').startsWith('image/')

  return (
    <>
      {text && <div>{text}</div>}
      {attachmentMeta && (
        <div style={{ marginTop: text ? '8px' : 0, display: 'grid', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', border: `1px solid ${C.border}`, background: C.surface2, borderRadius: '8px', padding: '8px 10px' }}>
            <span aria-hidden="true">{isImage ? '▧' : String(meta?.mime_type || '').includes('pdf') ? 'PDF' : 'FILE'}</span>
            <span style={{ color: C.text, fontWeight: 800, fontSize: '13px' }}>{meta?.file_name || labelLine?.replace('Attachment:', '').trim() || 'Attachment'}</span>
            <span style={{ color: C.textMuted, fontSize: '12px' }}>{humanFileSize(meta?.file_size)} {meta?.mime_type ? `· ${meta.mime_type}` : ''}</span>
            {meta?.scan_status !== 'clean' ? (
              <span style={{ color: C.orange, fontSize: '12px', fontWeight: 800 }}>Scanning...</span>
            ) : signedUrl ? (
              <a href={signedUrl} download={meta?.file_name} style={{ marginLeft: 'auto', color: linkColor, fontWeight: 800, textDecoration: 'none', fontSize: '12px' }}>
                Download
              </a>
            ) : (
              <span style={{ marginLeft: 'auto', color: C.textDim, fontSize: '12px', fontWeight: 800 }}>Preparing...</span>
            )}
          </div>
          {isImage && signedUrl && (
            <button type="button" onClick={() => setLightbox(true)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', width: 'fit-content' }}>
              <img src={signedUrl} alt={meta?.file_name || 'Attachment thumbnail'} style={{ width: '160px', maxWidth: '100%', borderRadius: '8px', border: `1px solid ${C.border}`, display: 'block' }} />
            </button>
          )}
          {lightbox && (
            <div onClick={() => setLightbox(false)} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
              <div onClick={e => e.stopPropagation()} style={{ maxWidth: '92vw', maxHeight: '88vh', display: 'grid', gap: '12px' }}>
                <img src={signedUrl} alt={meta?.file_name || 'Attachment'} style={{ maxWidth: '92vw', maxHeight: '78vh', objectFit: 'contain', borderRadius: '8px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                  <button type="button" onClick={() => setLightbox(false)} style={{ border: 'none', background: '#fff', color: C.text, borderRadius: '999px', padding: '8px 12px', cursor: 'pointer', fontWeight: 800 }}>Close</button>
                  <a href={signedUrl} download={meta?.file_name} style={{ background: '#fff', color: C.text, borderRadius: '999px', padding: '8px 12px', textDecoration: 'none', fontWeight: 800 }}>Download</a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {attachmentLine && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: text ? '8px' : 0 }}>
          <a
            href={attachmentLine.trim()}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              color: linkColor,
              fontWeight: 800,
              textDecoration: 'none',
              wordBreak: 'break-word',
            }}
          >
            {labelLine || 'Open attachment'}
          </a>
          <a
            href={attachmentLine.trim()}
            download
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              border: `1px solid ${linkColor}`,
              color: linkColor,
              borderRadius: '999px',
              padding: '2px 8px',
              fontSize: '12px',
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            Download
          </a>
        </div>
      )}
    </>
  )
}

function humanFileSize(bytes) {
  const n = Number(bytes || 0)
  if (!n) return ''
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

export function UserMenu({ name, role, email, color, avatarSrc, onNavigate, onLogout, items = [] }) {
  const [open, setOpen] = React.useState(false)
  const [loggingOut, setLoggingOut] = React.useState(false)
  const displayName = name || role || 'User'
  const defaultItems = [
    { label: 'Profile settings', icon: '⚙️', action: () => onNavigate?.('settings') },
    { label: role === 'Admin' ? 'User management' : role === 'Consultant' ? 'Messages' : 'Billing', icon: role === 'Admin' ? '👥' : role === 'Consultant' ? '💬' : '💳', action: () => onNavigate?.(role === 'Admin' ? 'users' : role === 'Consultant' ? 'messages' : 'billing') },
    { label: 'Help & support', icon: '❔', action: () => window.location.href = 'mailto:support@yousafeconsultancy.com' },
  ]
  const menuItems = items.length ? items : defaultItems

  const run = action => {
    setOpen(false)
    action?.()
  }

  const handleLogoutClick = () => {
    if (loggingOut) return
    setLoggingOut(true)
    setOpen(false)
    // If onLogout is missing, fall back to a hard page reload which will
    // trigger the auth middleware and send the user to sign-in
    if (typeof onLogout === 'function') {
      onLogout()
    } else {
      window.location.replace('/')
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${displayName} account menu`}
        style={{
          border: `1px solid ${open ? C.cyan : C.border}`,
          background: open ? `${C.cyan}10` : C.surface2,
          borderRadius: '999px',
          padding: '2px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          color: C.text,
        }}
      >
        <Avatar name={displayName} src={avatarSrc} size={32} color={color} />
        <span style={{ fontSize: '12px', color: C.textDim, paddingRight: '6px' }}>⌄</span>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: '44px',
            width: '248px',
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: '14px',
            boxShadow: '0 18px 50px rgba(15,23,42,0.18)',
            zIndex: 120,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Avatar name={displayName} src={avatarSrc} size={36} color={color} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
              <div style={{ fontSize: '11px', color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email || role || 'Account'}</div>
            </div>
          </div>
          <div style={{ padding: '6px' }}>
            {menuItems.map(item => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => run(item.action)}
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  color: C.text,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px',
                  borderRadius: '10px',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  fontWeight: 600,
                  textAlign: 'left',
                }}
              >
                <span style={{ width: '18px', textAlign: 'center' }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div style={{ padding: '6px', borderTop: `1px solid ${C.border}` }}>
            <button
              type="button"
              role="menuitem"
              disabled={loggingOut}
              onClick={handleLogoutClick}
              style={{
                width: '100%',
                border: 'none',
                background: loggingOut ? `${C.red}10` : 'transparent',
                color: loggingOut ? `${C.red}80` : C.red,
                cursor: loggingOut ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px',
                borderRadius: '10px',
                fontFamily: 'inherit',
                fontSize: '13px',
                fontWeight: 700,
                textAlign: 'left',
                opacity: loggingOut ? 0.7 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              <span style={{ width: '18px', textAlign: 'center' }}>{loggingOut ? '⏳' : '⏻'}</span>
              <span>{loggingOut ? 'Signing out…' : 'Logout'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function StatusBadge({ status }) {
  const map = {
    pending: { label: 'Pending', color: 'orange' },
    active: { label: 'In Progress', color: 'cyan' },
    review: { label: 'Under Review', color: 'purple' },
    completed: { label: 'Completed', color: 'green' },
    cancelled: { label: 'Cancelled', color: 'red' },
    new: { label: 'New', color: 'cyan' },
    queued: { label: 'Pending', color: 'orange' },
  }
  const s = map[status] || map.pending
  return <Badge color={s.color}>{s.label}</Badge>
}

export function PayoutBadge({ status }) {
  const map = {
    pending: { label: 'Payout Pending', color: 'gray' },
    transferred: { label: 'Paid Out', color: 'green' },
    failed: { label: 'Payout Failed — Contact Support', color: 'red' },
  }
  const s = map[status] || map.pending
  return <Badge color={s.color}>{s.label}</Badge>
}

export function Divider({ style }) {
  return <div style={{ height: '1px', background: C.border, ...style }} />
}

export function StatCard({ label, value, delta, icon, color = C.cyan, subtitle, onClick }) {
  const interactive = typeof onClick === 'function'
  return (
    <Card
      hover={interactive}
      onClick={interactive ? onClick : undefined}
      style={{
        display: 'flex', flexDirection: 'column', gap: '10px',
        cursor: interactive ? 'pointer' : 'default',
        transition: 'border-color 140ms, box-shadow 140ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ fontSize: '18px', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}15`, borderRadius: '10px' }}>{icon}</span>
      </div>
      <div style={{ fontSize: '26px', fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>{value}</div>
      {delta && <div style={{ fontSize: '12px', color: delta.startsWith('+') ? C.green : C.red }}>{delta} this month</div>}
      {subtitle && <div style={{ fontSize: '11px', color: C.textDim, marginTop: '-2px' }}>{subtitle}</div>}
      {interactive && (
        <div style={{ fontSize: '11px', color: color, fontWeight: 600, marginTop: '2px', letterSpacing: '0.02em' }}>
          View details →
        </div>
      )}
    </Card>
  )
}

export function ProgressBar({ value, color = C.cyan, style = {} }) {
  return (
    <div style={{ height: '6px', background: C.surface3, borderRadius: '99px', overflow: 'hidden', ...style }}>
      <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: '99px', transition: 'width 0.5s' }} />
    </div>
  )
}

// Small uppercase group label between sidebar nav sections — keeps the
// console scannable as sections grow. Used by the admin/student/attorney/
// consultant shells.
export function NavGroupLabel({ label, first = false }) {
  return (
    <div style={{ padding: first ? '4px 12px 4px' : '14px 12px 4px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.textDim }}>
      {label}
    </div>
  )
}

export function NavItem({ icon, label, active, onClick, badge, badgeColor = 'red' }) {
  const [hovered, setHovered] = React.useState(false)
  const ref = React.useRef(null)
  // Auto-centre the active item in the scroll container. On desktop the
  // sidebar is vertical and the nav is taller than the viewport rarely
  // matters; on mobile the same nav becomes a horizontal scroll strip
  // (see globals.css .yousafe-sidebar-nav @media (max-width: 760px))
  // and without this the user can scroll the strip away from where they
  // actually are, then click "Active Orders" and lose track of the
  // highlight under the fold.
  React.useEffect(() => {
    if (!active || !ref.current) return
    const id = requestAnimationFrame(() => {
      // Re-check inside the frame: the node can unmount between the effect
      // and the rAF firing (rapid page switches, e.g. marketplace → portal),
      // which crashed with "null is not an object (scrollIntoView)".
      const el = ref.current
      if (!el || typeof el.scrollIntoView !== 'function') return
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      } catch {
        el.scrollIntoView(false)
      }
    })
    return () => cancelAnimationFrame(id)
  }, [active])
  return (
    <div
      ref={ref}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-nav-active={active ? 'true' : 'false'}
      className="yousafe-nav-item"
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 12px 10px 14px', borderRadius: '0 10px 10px 0',
        marginLeft: '8px',
        cursor: 'pointer',
        background: active ? C.surface2 : (hovered ? 'rgba(0,0,0,0.03)' : 'transparent'),
        color: active ? C.text : C.textMuted,
        fontWeight: active ? 600 : 500, fontSize: '14px',
        transition: 'background 120ms ease, color 120ms ease',
        position: 'relative',
        borderLeft: active ? `3px solid ${C.cyan}` : '3px solid transparent',
      }}
    >
      <span style={{ fontSize: '16px', width: '22px', textAlign: 'center', opacity: active ? 1 : 0.8 }}>{icon}</span>
      <span style={{ flex: 1, letterSpacing: '0.005em' }}>{label}</span>
      {badge && <Badge color={badgeColor} style={{ fontSize: '10px', padding: '1px 6px' }}>{badge}</Badge>}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search...', style }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: C.textDim, fontSize: '14px', pointerEvents: 'none' }}>🔍</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '9px 14px 9px 36px',
          background: C.surface2, border: `1px solid ${C.border}`,
          borderRadius: '10px', color: C.text, fontSize: '13px',
          outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: C.textDim, cursor: 'pointer', fontSize: '14px', padding: '4px', lineHeight: 1 }}
        >
          ✕
        </button>
      )}
    </div>
  )
}

export function LoadingState({ message = undefined, label = 'Loading...' }) {
  const text = message || label
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '48px 24px' }}>
      <div style={{ width: '40px', height: '40px', border: `3px solid ${C.surface3}`, borderTopColor: C.cyan, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <span style={{ color: C.textMuted, fontSize: '14px' }}>{text}</span>
    </div>
  )
}

export function ErrorState({ message, onRetry = undefined }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '48px 24px', textAlign: 'center' }}>
      <span style={{ fontSize: '48px' }}>⚠️</span>
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: C.text, margin: '0 0 8px' }}>Something went wrong</h3>
        <p style={{ fontSize: '14px', color: C.textMuted, margin: 0 }}>{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: '10px 20px',
            background: C.cyan,
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ message = undefined, submessage = undefined, title = undefined, body = undefined, action = undefined }) {
  const heading = message || title
  const detail = submessage || body
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '48px 24px', textAlign: 'center' }}>
      <span style={{ fontSize: '48px', opacity: 0.5 }}>📭</span>
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: C.text, margin: '0 0 8px' }}>{heading}</h3>
        {detail && <p style={{ fontSize: '14px', color: C.textMuted, margin: 0 }}>{detail}</p>}
      </div>
      {action}
    </div>
  )
}

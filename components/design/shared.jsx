'use client'
// @ts-nocheck
import React from 'react'

// Warm editorial palette. Off-white paper background, indigo accent (legacy
// `cyan` key kept for compatibility with existing code), and a serif font
// reference for premium headings.
export const C = {
  bg: '#FBFAF7',
  surface: '#FFFFFF',
  surface2: '#F4F2EE',
  surface3: '#EAE7E0',
  border: 'rgba(0,0,0,0.08)',
  border2: 'rgba(0,0,0,0.14)',
  cyan: '#3C3B6E',
  cyanDark: '#2d2a5e',
  cyanGlow: 'rgba(60,59,110,0.10)',
  navy: '#B22234',
  navyGlow: 'rgba(178,34,52,0.10)',
  text: '#1F2937',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',
  green: '#059669',
  orange: '#D97706',
  red: '#DC2626',
  purple: '#7C3AED',
  serif: "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif",
  sans: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
}

export function Btn({ children, variant = 'primary', size = 'md', onClick, disabled, style, type = 'button', fullWidth, ...props }) {
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
      background: '#1F2937', color: '#fff',
      boxShadow: hovered && !disabled ? '0 6px 18px rgba(31,41,55,0.20)' : '0 1px 2px rgba(31,41,55,0.10)',
    },
    secondary: { background: C.surface, color: C.text, border: `1px solid ${C.border2}` },
    ghost: { background: 'transparent', color: C.textMuted },
    danger: { background: 'rgba(220,38,38,0.08)', color: C.red, border: `1px solid rgba(220,38,38,0.25)` },
    success: { background: 'rgba(5,150,105,0.10)', color: C.green, border: `1px solid rgba(5,150,105,0.25)` },
    outline: { background: 'transparent', color: C.text, border: `1px solid ${hovered && !disabled ? C.text : 'rgba(0,0,0,0.18)'}` },
    navy: { background: C.navy, color: '#fff', boxShadow: hovered && !disabled ? `0 6px 18px ${C.navyGlow}` : `0 1px 2px ${C.navyGlow}` },
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

export function Badge({ children, color = 'cyan', style }) {
  const colors = {
    cyan: { bg: 'rgba(60,59,110,0.10)', text: C.cyan, border: 'rgba(60,59,110,0.25)' },
    green: { bg: 'rgba(5,150,105,0.10)', text: C.green, border: 'rgba(5,150,105,0.25)' },
    orange: { bg: 'rgba(217,119,6,0.10)', text: C.orange, border: 'rgba(217,119,6,0.25)' },
    red: { bg: 'rgba(220,38,38,0.10)', text: C.red, border: 'rgba(220,38,38,0.25)' },
    purple: { bg: 'rgba(124,58,237,0.10)', text: C.purple, border: 'rgba(124,58,237,0.25)' },
    gray: { bg: 'rgba(107,114,128,0.10)', text: C.textMuted, border: 'rgba(107,114,128,0.25)' },
  }
  const c = colors[color] || colors.cyan
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, ...style
    }}>{children}</span>
  )
}

export function Card({ children, style, onClick, hover = false }) {
  const [hovered, setHovered] = React.useState(false)
  const isHover = hover || Boolean(onClick)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => isHover && setHovered(true)}
      onMouseLeave={() => isHover && setHovered(false)}
      style={{
        background: C.surface,
        border: `1px solid ${hovered ? 'rgba(0,0,0,0.14)' : C.border}`,
        borderRadius: '14px',
        padding: '24px',
        transition: 'border-color 140ms ease, transform 140ms ease, box-shadow 140ms ease',
        cursor: onClick ? 'pointer' : undefined,
        transform: hovered && isHover ? 'translateY(-2px)' : undefined,
        boxShadow: hovered && isHover ? '0 12px 28px rgba(15,18,32,0.08)' : '0 1px 2px rgba(15,18,32,0.03)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Input({ label, type = 'text', value, onChange, placeholder, icon, hint, error, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && <label style={{ fontSize: '13px', fontWeight: 600, color: C.textMuted }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        {icon && <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: C.textDim, fontSize: '16px' }}>{icon}</span>}
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
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
  const colors = ['#3C3B6E', '#B22234', '#059669', '#D97706', '#7C3AED']
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

export function UserMenu({ name, role, email, color, avatarSrc, onNavigate, onLogout, items = [] }) {
  const [open, setOpen] = React.useState(false)
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
              onClick={() => run(onLogout)}
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                color: C.red,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px',
                borderRadius: '10px',
                fontFamily: 'inherit',
                fontSize: '13px',
                fontWeight: 700,
                textAlign: 'left',
              }}
            >
              <span style={{ width: '18px', textAlign: 'center' }}>⏻</span>
              <span>Logout</span>
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

export function StatCard({ label, value, delta, icon, color = C.cyan }) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', color: C.textMuted, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '20px', background: `${color}18`, padding: '8px', borderRadius: '10px' }}>{icon}</span>
      </div>
      <div style={{ fontSize: '28px', fontWeight: 700, color: C.text }}>{value}</div>
      {delta && <div style={{ fontSize: '12px', color: delta.startsWith('+') ? C.green : C.red }}>{delta} this month</div>}
    </Card>
  )
}

export function ProgressBar({ value, color = C.cyan, style }) {
  return (
    <div style={{ height: '6px', background: C.surface3, borderRadius: '99px', overflow: 'hidden', ...style }}>
      <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: '99px', transition: 'width 0.5s' }} />
    </div>
  )
}

export function NavItem({ icon, label, active, onClick, badge }) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
        background: active ? C.surface2 : (hovered ? 'rgba(0,0,0,0.03)' : 'transparent'),
        color: active ? C.text : C.textMuted,
        fontWeight: active ? 600 : 500, fontSize: '14px',
        transition: 'background 120ms ease, color 120ms ease',
        position: 'relative',
      }}
    >
      <span style={{ fontSize: '16px', width: '20px', textAlign: 'center', opacity: active ? 1 : 0.85 }}>{icon}</span>
      <span style={{ flex: 1, letterSpacing: '0.005em' }}>{label}</span>
      {badge && <Badge color="red" style={{ fontSize: '10px', padding: '1px 6px' }}>{badge}</Badge>}
    </div>
  )
}

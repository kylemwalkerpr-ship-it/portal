'use client'
// @ts-nocheck
import React from 'react'

export const C = {
  bg: '#E8E8E8',
  surface: '#FFFFFF',
  surface2: '#F3F4F6',
  surface3: '#E5E7EB',
  border: '#E5E7EB',
  border2: '#D1D5DB',
  cyan: '#3C3B6E',
  cyanDark: '#2d2a5e',
  cyanGlow: 'rgba(60,59,110,0.12)',
  navy: '#B22234',
  navyGlow: 'rgba(178,34,52,0.12)',
  text: '#1F2937',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',
  green: '#059669',
  orange: '#D97706',
  red: '#DC2626',
  purple: '#7C3AED',
}

export function Btn({ children, variant = 'primary', size = 'md', onClick, disabled, style, type = 'button', fullWidth }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: '8px', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', fontWeight: 600, transition: 'all 0.15s',
    borderRadius: '10px', whiteSpace: 'nowrap', width: fullWidth ? '100%' : undefined,
    opacity: disabled ? 0.5 : 1,
  }
  const sizes = {
    sm: { padding: '6px 14px', fontSize: '13px' },
    md: { padding: '10px 20px', fontSize: '14px' },
    lg: { padding: '13px 28px', fontSize: '15px' },
    xl: { padding: '16px 36px', fontSize: '16px' },
  }
  const variants = {
    primary: { background: C.cyan, color: '#fff', boxShadow: `0 0 20px ${C.cyanGlow}` },
    secondary: { background: C.surface2, color: C.text, border: `1px solid ${C.border2}` },
    ghost: { background: 'transparent', color: C.textMuted },
    danger: { background: 'rgba(239,68,68,0.15)', color: C.red, border: `1px solid rgba(239,68,68,0.3)` },
    success: { background: 'rgba(16,185,129,0.15)', color: C.green, border: `1px solid rgba(16,185,129,0.3)` },
    outline: { background: 'transparent', color: C.cyan, border: `1px solid ${C.cyan}` },
    navy: { background: C.navy, color: '#fff', boxShadow: `0 0 20px ${C.navyGlow}` },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}>
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
  return (
    <div onClick={onClick}
      onMouseEnter={() => hover && setHovered(true)}
      onMouseLeave={() => hover && setHovered(false)}
      style={{
        background: C.surface, border: `1px solid ${hovered ? C.border2 : C.border}`,
        borderRadius: '16px', padding: '24px', transition: 'all 0.2s',
        cursor: onClick ? 'pointer' : undefined,
        transform: hovered ? 'translateY(-2px)' : undefined,
        boxShadow: hovered ? `0 8px 32px rgba(0,0,0,0.3)` : undefined,
        ...style
      }}>{children}</div>
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

export function UserMenu({ name, role, email, color, onNavigate, onLogout, items = [] }) {
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
        <Avatar name={displayName} size={32} color={color} />
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
            <Avatar name={displayName} size={36} color={color} />
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
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
      background: active ? `${C.cyan}18` : 'transparent',
      color: active ? C.cyan : C.textMuted,
      fontWeight: active ? 600 : 400, fontSize: '14px',
      transition: 'all 0.15s', position: 'relative',
      borderLeft: active ? `2px solid ${C.cyan}` : '2px solid transparent',
    }}>
      <span style={{ fontSize: '18px', width: '20px', textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && <Badge color="red" style={{ fontSize: '10px', padding: '1px 6px' }}>{badge}</Badge>}
    </div>
  )
}

'use client'
// @ts-nocheck
import React from 'react'

export const C = {
  bg: '#05080f',
  surface: '#0b1120',
  surface2: '#111928',
  surface3: '#182035',
  border: '#1e2d48',
  border2: '#243557',
  cyan: '#c8102e',
  cyanDark: '#a00d24',
  cyanGlow: 'rgba(200,16,46,0.15)',
  navy: '#1e4db7',
  navyGlow: 'rgba(30,77,183,0.15)',
  text: '#f0f4fc',
  textMuted: '#7d90b0',
  textDim: '#3d5070',
  green: '#10b981',
  orange: '#f59e0b',
  red: '#ef4444',
  purple: '#a78bfa',
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
    cyan: { bg: 'rgba(34,211,238,0.12)', text: C.cyan, border: 'rgba(34,211,238,0.25)' },
    green: { bg: 'rgba(16,185,129,0.12)', text: C.green, border: 'rgba(16,185,129,0.25)' },
    orange: { bg: 'rgba(245,158,11,0.12)', text: C.orange, border: 'rgba(245,158,11,0.25)' },
    red: { bg: 'rgba(239,68,68,0.12)', text: C.red, border: 'rgba(239,68,68,0.25)' },
    purple: { bg: 'rgba(167,139,250,0.12)', text: C.purple, border: 'rgba(167,139,250,0.25)' },
    gray: { bg: 'rgba(125,143,163,0.12)', text: C.textMuted, border: 'rgba(125,143,163,0.25)' },
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
  const colors = ['#22d3ee', '#10b981', '#a78bfa', '#f59e0b', '#ef4444']
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

export function StatusBadge({ status }) {
  const map = {
    pending: { label: 'Pending', color: 'orange' },
    active: { label: 'In Progress', color: 'cyan' },
    review: { label: 'Under Review', color: 'purple' },
    completed: { label: 'Completed', color: 'green' },
    cancelled: { label: 'Cancelled', color: 'red' },
    new: { label: 'New', color: 'cyan' },
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

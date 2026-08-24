'use client'
import React, { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { T } from './tokens'
import { Arrow, ArrowUR, Cap, Scale, Briefcase, Headset, Close, Lock } from './icons'

interface Role {
  id: string
  label: string
  blurb: string
  primary: string
  secondary: string | null
  icon: React.FC<{ size?: number; stroke?: number; style?: React.CSSProperties }>
  accent: string
  signInHref: string
  signUpHref: string | null
  external: boolean
}

const ROLES: Role[] = [
  {
    id: 'student',
    label: 'Client',
    blurb: 'Place orders, talk to your consultant, manage documents and inquiries.',
    primary: 'Sign in',
    secondary: 'Create account',
    icon: Cap,
    accent: T.indigo,
    signInHref: 'https://portal.yousafeconsultancy.com/sign-in/student',
    signUpHref: 'https://portal.yousafeconsultancy.com/sign-up/student',
    external: false,
  },
  {
    id: 'attorney',
    label: 'Attorney',
    blurb: 'Review intake inquiries, message clients, send custom offers and manage payouts.',
    primary: 'Sign in',
    secondary: 'Apply to join',
    icon: Scale,
    accent: T.brick,
    signInHref: 'https://portal.yousafeconsultancy.com/sign-in/attorney',
    signUpHref: 'https://portal.yousafeconsultancy.com/sign-up/attorney',
    external: false,
  },
  {
    id: 'consultant',
    label: 'Consultant',
    blurb: 'Manage assigned clients, deliverables, escrow releases and your profile.',
    primary: 'Sign in',
    secondary: 'Apply as consultant',
    icon: Briefcase,
    accent: T.moss,
    signInHref: 'https://portal.yousafeconsultancy.com/sign-in/consultant',
    signUpHref: 'https://portal.yousafeconsultancy.com/sign-up/consultant',
    external: false,
  },
  {
    id: 'support',
    label: 'Support team',
    blurb: 'Agent and admin tools for the YouSafe support desk — chats, tickets, escalations.',
    primary: 'Sign in to support',
    secondary: null,
    icon: Headset,
    accent: T.ink,
    signInHref: 'https://support.yousafeconsultancy.com/',
    signUpHref: null,
    external: true,
  },
]

interface MemberSignInModalProps {
  open: boolean
  onClose: () => void
}

export default function MemberSignInModal({ open, onClose }: MemberSignInModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    lastFocusedRef.current = document.activeElement as HTMLElement
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    // Focus close button on open
    setTimeout(() => closeBtnRef.current?.focus(), 50)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      lastFocusedRef.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Member sign-in"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        animation: 'ysFadeIn 180ms ease',
      }}
    >
      <style>{`
        @keyframes ysFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ysRise { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(900px, 100%)',
          background: T.paper,
          borderRadius: 24,
          overflow: 'hidden',
          boxShadow: '0 40px 80px rgba(15,23,42,0.35)',
          border: '1px solid rgba(255,255,255,0.5)',
          animation: 'ysRise 220ms cubic-bezier(0.22, 1, 0.36, 1)',
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
        }}
      >
        {/* Flag bar */}
        <div
          aria-hidden="true"
          style={{
            height: 4,
            background:
              'linear-gradient(90deg, #3c3b6e 0%, #3c3b6e 33%, #b22234 33%, #b22234 66%, #C4A45A 66%, #C4A45A 100%)',
          }}
        />

        {/* Header */}
        <div
          style={{
            padding: '32px 36px 12px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: T.mono,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: T.inkSoft,
                marginBottom: 10,
              }}
            >
              Member access
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: 'clamp(28px, 3.6vw, 36px)',
                color: T.ink,
                lineHeight: 1.05,
                fontFamily: T.serif,
                fontWeight: 500,
                letterSpacing: '-0.014em',
              }}
            >
              Sign in to the portal.
            </h2>
            <p
              style={{
                margin: '10px 0 0',
                color: T.inkMid,
                fontSize: 14,
                lineHeight: 1.6,
                maxWidth: 520,
              }}
            >
              Four sign-in routes — one secure portal. Pick the role that matches you.
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: `1px solid ${T.rule}`,
              borderRadius: 10,
              width: 36,
              height: 36,
              cursor: 'pointer',
              color: T.inkMid,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Close size={16} stroke={1.8} />
          </button>
        </div>

        {/* Role grid */}
        <div
          className="ys-lane-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
            padding: '20px 36px 32px',
          }}
        >
          {ROLES.map((role) => (
            <RoleCard key={role.id} role={role} />
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: `1px solid ${T.rule}`,
            background: T.surface2,
            padding: '14px 36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: T.inkSoft }}>
            <Lock size={13} stroke={1.6} />
            <span>Clerk-secured sign-in · TLS &amp; 2FA · noindex members area</span>
          </div>
          <a
            href="https://support.yousafeconsultancy.com/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: T.indigo, fontWeight: 700, textDecoration: 'none' }}
          >
            Need help signing in? →
          </a>
        </div>
      </div>
    </div>,
    document.body
  )
}

function RoleCard({ role }: { role: Role }) {
  const [hover, setHover] = React.useState(false)
  const IconC = role.icon

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#fff',
        border: `1px solid ${hover ? role.accent : T.rule}`,
        borderRadius: 14,
        padding: '18px 18px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'border-color 160ms, transform 160ms, box-shadow 160ms',
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover ? `0 10px 24px ${role.accent}22` : '0 1px 2px rgba(15,23,42,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `${role.accent}14`,
            color: role.accent,
          }}
        >
          <IconC size={18} stroke={1.6} />
        </span>
        <div
          style={{
            fontFamily: T.serif,
            fontSize: 22,
            fontWeight: 500,
            color: T.ink,
            lineHeight: 1.1,
          }}
        >
          {role.label}
        </div>
      </div>
      <p
        style={{
          margin: '4px 0 8px',
          fontSize: 13,
          color: T.inkMid,
          lineHeight: 1.55,
          minHeight: 44,
        }}
      >
        {role.blurb}
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <a
          href={role.signInHref}
          target={role.external ? '_blank' : undefined}
          rel={role.external ? 'noopener noreferrer' : undefined}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: T.ink,
            color: '#fff',
            borderRadius: 999,
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
            flex: '1 1 auto',
            transition: 'transform 140ms ease',
          }}
        >
          {role.primary}
          {role.external ? (
            <ArrowUR size={12} stroke={2} />
          ) : (
            <Arrow size={12} stroke={2} />
          )}
        </a>
        {role.secondary && role.signUpHref && (
          <a
            href={role.signUpHref}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              color: T.ink,
              border: '1px solid rgba(0,0,0,0.15)',
              borderRadius: 999,
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              flex: '0 0 auto',
              transition: 'transform 140ms ease',
            }}
          >
            {role.secondary}
          </a>
        )}
      </div>
    </div>
  )
}

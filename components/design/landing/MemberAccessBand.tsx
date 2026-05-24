'use client'
import React from 'react'
import { T } from './tokens'
import { Cap, Scale, Briefcase, Headset, Arrow, ArrowUR } from './icons'

interface MemberAccessBandProps {
  onOpenSignIn: () => void
}

const PORTAL = 'https://portal.yousafeconsultancy.com'
const SUPPORT = 'https://support.yousafeconsultancy.com/'

const ROLES = [
  {
    id: 'student',
    label: 'Student / Client',
    blurb: 'Place orders, talk to your consultant, manage documents and inquiries.',
    Icon: Cap,
    accent: T.indigo,
    accentSoft: T.indigoSoft,
    signInHref: `${PORTAL}/sign-in/student`,
    signUpHref: `${PORTAL}/sign-up/student`,
    signUpLabel: 'Create account',
  },
  {
    id: 'attorney',
    label: 'Attorney',
    blurb: 'Review intake inquiries, message clients, send custom offers and manage payouts.',
    Icon: Scale,
    accent: T.brick,
    accentSoft: 'rgba(178,34,52,0.08)',
    signInHref: `${PORTAL}/sign-in/attorney`,
    signUpHref: `${PORTAL}/sign-up/attorney`,
    signUpLabel: 'Apply to join',
  },
  {
    id: 'consultant',
    label: 'Consultant',
    blurb: 'Manage assigned students, deliverables, escrow releases and your profile.',
    Icon: Briefcase,
    accent: T.moss,
    accentSoft: 'rgba(95,107,58,0.10)',
    signInHref: `${PORTAL}/sign-in/consultant`,
    signUpHref: `${PORTAL}/sign-up/consultant`,
    signUpLabel: 'Apply as consultant',
  },
  {
    id: 'support',
    label: 'Support team',
    blurb: 'Agent and admin tools for the YouSafe support desk — chats, tickets, escalations.',
    Icon: Headset,
    accent: T.ink,
    accentSoft: 'rgba(15,23,42,0.06)',
    signInHref: SUPPORT,
    signUpHref: null,
    signUpLabel: null,
    external: true,
  },
] as const

export default function MemberAccessBand({ onOpenSignIn }: MemberAccessBandProps) {
  return (
    <section
      style={{
        background: T.paper,
        padding: '88px 40px',
      }}
    >
      <style>{`
        .ys-member-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 18px;
        }
        @media (max-width: 980px) {
          .ys-member-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 560px) {
          .ys-member-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.inkSoft }}>
            Member access
          </span>
          <h2 style={{ margin: '12px 0 0', fontFamily: T.serif, fontSize: 'clamp(32px,3.6vw,48px)', fontWeight: 500, color: T.ink, letterSpacing: '-0.014em' }}>
            Four roles. One secure portal.
          </h2>
        </div>

        <div className="ys-member-grid">
          {ROLES.map((role) => (
            <div
              key={role.id}
              style={{
                background: T.surface,
                border: `1px solid ${T.ruleSoft}`,
                borderRadius: 14,
                padding: 22,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <span style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: role.accentSoft, color: role.accent,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <role.Icon size={20} stroke={1.7} />
                </span>
                <Arrow size={16} stroke={1.7} style={{ color: T.inkDim }} />
              </div>

              <div>
                <h3 style={{ margin: '0 0 6px', fontFamily: T.serif, fontSize: 20, fontWeight: 500, color: T.ink, letterSpacing: '-0.005em' }}>
                  {role.label}
                </h3>
                <p style={{ margin: 0, fontFamily: T.sans, fontSize: 13.5, lineHeight: 1.55, color: T.inkMid }}>
                  {role.blurb}
                </p>
              </div>

              <div style={{
                marginTop: 'auto',
                paddingTop: 14,
                borderTop: `1px solid ${T.ruleSoft}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}>
                <a
                  href={role.signInHref}
                  target={role.external ? '_blank' : undefined}
                  rel={role.external ? 'noopener noreferrer' : undefined}
                  style={{
                    fontFamily: T.sans, fontSize: 13.5, fontWeight: 600,
                    color: role.accent, textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  Sign in {role.external ? <ArrowUR size={13} stroke={2} /> : <Arrow size={13} stroke={2} />}
                </a>
                {role.signUpHref && role.signUpLabel && (
                  <a
                    href={role.signUpHref}
                    style={{
                      fontFamily: T.sans, fontSize: 12, color: T.inkSoft, textDecoration: 'none',
                    }}
                  >
                    or <span style={{ textDecoration: 'underline' }}>{role.signUpLabel}</span>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={onOpenSignIn}
            style={{
              background: T.ink, color: '#fff', border: 'none',
              borderRadius: 999, padding: '14px 28px',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
              fontFamily: T.sans,
            }}
          >
            Sign in to your account
          </button>
          <a
            href={`${PORTAL}/sign-up/student`}
            style={{ fontFamily: T.sans, fontSize: 13, color: T.inkSoft, textDecoration: 'none' }}
          >
            Not a member yet? <span style={{ color: T.indigo, textDecoration: 'underline' }}>Create a free account →</span>
          </a>
        </div>
      </div>
    </section>
  )
}

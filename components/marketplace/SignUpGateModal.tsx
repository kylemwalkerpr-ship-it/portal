'use client'

import React from 'react'

const C = {
  surface: '#FFFFFF',
  surface2: '#F4F2EE',
  border: 'rgba(0,0,0,0.08)',
  cyan: '#3C3B6E',
  text: '#1F2937',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',
}

const SANS = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"
const SERIF = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"

interface SignUpGateModalProps {
  open: boolean
  onClose: () => void
  intent: 'order' | 'chat' | 'save' | 'review'
  returnTo: string
  metadata?: Record<string, unknown>
}

const INTENT_HEADINGS: Record<string, string> = {
  order: 'Sign up to place your order',
  chat: 'Sign up to start a chat',
  save: 'Sign up to save this gig',
  review: 'Sign up to leave a review',
}

const INTENT_BODY: Record<string, string> = {
  order: 'Create a free account to check out. It takes about 30 seconds.',
  chat: 'Create a free account to message providers. It takes about 30 seconds.',
  save: 'Create a free account to save gigs and providers for later. It takes about 30 seconds.',
  review: 'Create a free account to share your experience. It takes about 30 seconds.',
}

function encodeMeta(meta?: Record<string, unknown>): string {
  if (!meta) return ''
  try {
    return btoa(JSON.stringify(meta))
  } catch {
    return ''
  }
}

export default function SignUpGateModal({ open, onClose, intent, returnTo, metadata }: SignUpGateModalProps) {
  if (!open) return null

  const meta = encodeMeta(metadata)
  const returnUrl = encodeURIComponent(returnTo)
  const signUpUrl = `https://portal.yousafeconsultancy.com/sign-up/student?return_to=${returnUrl}&action=${intent}${meta ? `&meta=${meta}` : ''}`

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surface,
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '420px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          fontFamily: SANS,
          color: C.text,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: C.textMuted }}>
              Free account
            </div>
            <h2 style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: 500, margin: '6px 0 0' }}>
              {INTENT_HEADINGS[intent] || 'Sign up to continue'}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: C.textDim, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: '14px', color: C.textMuted, lineHeight: 1.6, margin: '0 0 24px' }}>
          {INTENT_BODY[intent] || 'Create a free account to continue. It takes about 30 seconds.'}
        </p>

        <a
          href={signUpUrl}
          style={{
            display: 'block',
            width: '100%',
            padding: '14px',
            borderRadius: '10px',
            background: C.cyan,
            color: '#fff',
            fontSize: '15px',
            fontWeight: 700,
            textDecoration: 'none',
            textAlign: 'center',
          }}
        >
          Create free account →
        </a>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: C.textMuted }}>
          Already have an account?{' '}
          <a href={`https://portal.yousafeconsultancy.com/sign-in/student?return_to=${returnUrl}`} style={{ color: C.cyan, fontWeight: 600, textDecoration: 'none' }}>
            Sign in
          </a>
        </div>
      </div>
    </div>
  )
}

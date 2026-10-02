'use client'

import React from 'react'
import { useClerk } from '@clerk/nextjs'
import { T, F } from './tokens'
import { buildAuthUrl } from '@/lib/auth/returnTo'
import { openYsSignIn, openYsSignUp } from '@/lib/auth/ysAuthModal'

interface SignUpGateModalProps {
  open: boolean
  onClose: () => void
  intent: 'order' | 'chat' | 'save' | 'review'
  returnTo: string
  metadata?: Record<string, unknown>
}

const MARKET_ORIGIN = 'https://market.yousafeconsultancy.com'

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

/**
 * The return target carries the gated action so the origin page can resume it.
 * Everything is set through URLSearchParams, so the JSON metadata is
 * URL-encoded (the old raw base64 `meta` could be corrupted by `+`/`/`/`=`).
 */
export function gatedReturnTo(returnTo: string, intent: string, metadata?: Record<string, unknown>): string {
  const absolute = returnTo.startsWith('/') ? `${MARKET_ORIGIN}${returnTo}` : returnTo
  try {
    const url = new URL(absolute)
    url.searchParams.set('resume', intent)
    if (metadata) url.searchParams.set('meta', JSON.stringify(metadata))
    return url.toString()
  } catch {
    return `${MARKET_ORIGIN}/`
  }
}

export default function SignUpGateModal({ open, onClose, intent, returnTo, metadata }: SignUpGateModalProps) {
  const clerk = useClerk()
  if (!open) return null

  const destination = gatedReturnTo(returnTo, intent, metadata)
  // No-JS / modal-unavailable fallbacks: the single canonical portal documents.
  const signUpUrl = buildAuthUrl('sign-up', { returnTo: destination, intent: 'client' })
  const signInUrl = buildAuthUrl('sign-in', { returnTo: destination })
  const openModal = (mode: 'sign-in' | 'sign-up') => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!clerk || typeof clerk.openSignUp !== 'function') return
    event.preventDefault()
    onClose()
    if (mode === 'sign-up') openYsSignUp(clerk, { returnTo: destination, intent: 'client', source: `market_gate_${intent}` })
    else openYsSignIn(clerk, { returnTo: destination })
  }

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
          background: T.vellum,
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '420px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          fontFamily: F.ui,
          color: T.ink,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T.inkMid }}>
              Free account
            </div>
            <h2 style={{ fontFamily: F.display, fontSize: '22px', fontWeight: 500, margin: '6px 0 0' }}>
              {INTENT_HEADINGS[intent] || 'Sign up to continue'}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: T.inkSoft, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: '14px', color: T.inkMid, lineHeight: 1.6, margin: '0 0 24px' }}>
          {INTENT_BODY[intent] || 'Create a free account to continue. It takes about 30 seconds.'}
        </p>

        <a
          href={signUpUrl}
          onClick={openModal('sign-up')}
          style={{
            display: 'block',
            width: '100%',
            padding: '14px',
            background: T.indigo,
            color: '#fff',
            fontSize: '15px',
            fontWeight: 700,
            textDecoration: 'none',
            textAlign: 'center',
            borderRadius: '999px',
          }}
        >
          Create free account →
        </a>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', color: T.inkMid }}>
          Already have an account?{' '}
          <a href={signInUrl} onClick={openModal('sign-in')} style={{ color: T.indigo, fontWeight: 600, textDecoration: 'none' }}>
            Sign in
          </a>
        </div>
      </div>
    </div>
  )
}

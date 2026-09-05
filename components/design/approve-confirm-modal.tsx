'use client'

import React from 'react'
import { APPROVE_MAIN_PROMPT } from '@/lib/seoFactory/approveConfirm'

type Props = {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  /** Override body copy; defaults to APPROVE_MAIN_PROMPT */
  message?: string
}

/**
 * In-DOM Approve → main confirm. Native window.confirm is suppressed after
 * awaits and invisible to desktop automation — open this synchronously in the
 * click turn, then run approve only after Confirm.
 */
export function ApproveConfirmModal({
  open,
  onConfirm,
  onCancel,
  busy = false,
  message = APPROVE_MAIN_PROMPT,
}: Props) {
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Approve to main"
      data-testid="studio-approve-confirm"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(0,0,0,0.55)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 10,
          padding: 28,
          boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
          fontFamily: 'var(--portal-font-sans, system-ui, sans-serif)',
        }}
      >
        <h3
          style={{
            margin: '0 0 12px',
            fontSize: 20,
            fontWeight: 600,
            color: '#0F172A',
            fontFamily: 'var(--portal-font-display, Georgia, serif)',
          }}
        >
          Approve → main
        </h3>
        <p
          data-testid="studio-approve-confirm-message"
          style={{
            margin: '0 0 20px',
            fontSize: 13,
            lineHeight: 1.6,
            color: '#5C6070',
          }}
        >
          {message}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-testid="studio-approve-confirm-cancel"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '8px 18px',
              borderRadius: 6,
              border: '1px solid #DDD8CE',
              background: '#fff',
              color: '#5C6070',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="studio-approve-confirm-ok"
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: '8px 18px',
              borderRadius: 6,
              border: 'none',
              background: '#166534',
              color: '#fff',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 700,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Approving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

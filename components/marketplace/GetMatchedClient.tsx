'use client'
import React from 'react'
import IntakeFormJsx from '@/components/design/inquiry-intake-form'

// The intake wizard is plain JSX shared with the portal dashboard; its
// inferred prop types mark every prop required, so type it loosely here.
const IntakeForm = IntakeFormJsx as unknown as React.ComponentType<Record<string, unknown>>

/**
 * Public, signed-out entry point to the free case intake. Posts to the public
 * /api/inquiries endpoint (no account needed); the lead is persisted, bound to
 * attribution, and both the buyer and the YouSafe admin inbox get an email.
 */
export default function GetMatchedClient() {
  return (
    <main className="get-matched" style={{ display: 'flex', justifyContent: 'center', padding: '24px 12px 64px' }}>
      <IntakeForm
        source="market:get-matched"
        backLabel="← Back to the marketplace"
        submittedLabel="Create a free account to track replies →"
        submittedMessage="Thanks, we have your case. A reviewed provider will reply with a fixed-fee offer, usually within a few hours, and we'll email you when they do. Nothing is charged until you accept an offer."
        onCancel={() => { window.location.href = '/' }}
        onSubmitted={() => { window.location.href = '/?ys_sign_up=1&intent=client' }}
      />
    </main>
  )
}

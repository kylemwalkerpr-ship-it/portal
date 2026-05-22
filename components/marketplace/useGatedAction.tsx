'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import SignUpGateModal from './SignUpGateModal'

export function useGatedAction(intent: 'order' | 'chat' | 'save' | 'review', metadata?: Record<string, unknown>) {
  const [modalOpen, setModalOpen] = React.useState(false)
  const pathname = usePathname()

  const execute = React.useCallback((action: () => void) => {
    fetch('/api/profile', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const profile = data?.profile
        if (profile && profile.role === 'client' && profile.status === 'active') {
          action()
        } else {
          setModalOpen(true)
        }
      })
      .catch(() => setModalOpen(true))
  }, [])

  const modal = (
    <SignUpGateModal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      intent={intent}
      returnTo={pathname}
      metadata={metadata}
    />
  )

  return { execute, modal }
}

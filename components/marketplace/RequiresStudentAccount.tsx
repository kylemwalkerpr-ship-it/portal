'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import SignUpGateModal from './SignUpGateModal'

interface RequiresStudentAccountProps {
  intent: 'order' | 'chat' | 'save' | 'review'
  metadata?: Record<string, unknown>
  onAuthed?: () => void
  children: React.ReactNode
}

export default function RequiresStudentAccount({ intent, metadata, onAuthed, children }: RequiresStudentAccountProps) {
  const [modalOpen, setModalOpen] = React.useState(false)
  const pathname = usePathname()

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Check auth state client-side via the same endpoint the shell uses
    fetch('/api/profile', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const profile = data?.profile
        if (profile && profile.role === 'client' && profile.status === 'active') {
          onAuthed?.()
        } else {
          setModalOpen(true)
        }
      })
      .catch(() => setModalOpen(true))
  }

  return (
    <>
      <span onClick={handleClick} style={{ display: 'inline-block', cursor: 'pointer' }}>
        {children}
      </span>
      <SignUpGateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        intent={intent}
        returnTo={pathname}
        metadata={metadata}
      />
    </>
  )
}

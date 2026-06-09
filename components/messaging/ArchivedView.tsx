'use client'

import React from 'react'

interface ArchivedConversation {
  id: string
  archived_at: string | null
  counterpart?: { full_name?: string; avatar_url?: string; avatar_color?: string } | null
  last_message_snippet?: string
  [key: string]: any
}

interface ArchivedViewProps {
  open: boolean
  onClose: () => void
  conversations: ArchivedConversation[]
  onUnarchive: (convId: string) => void
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="backdrop-inner" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export default function ArchivedView({ open, onClose, conversations, onUnarchive }: ArchivedViewProps) {
  if (!open) return null
  const sorted = [...conversations].sort(
    (a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
  )

  return (
    <Backdrop onClose={onClose}>
      <div className="modal archived-modal">
        <div className="modal-head">
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div>Archived ({sorted.length})</div>
          <div style={{ width: 32 }} />
        </div>
        <div className="modal-list">
          {sorted.length === 0 && (
            <div className="modal-empty">No archived chats. Right-click any chat → Archive.</div>
          )}
          {sorted.map((c) => {
            const name = c.counterpart?.full_name || 'Conversation'
            const initials = name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
            const bg = c.counterpart?.avatar_color || '#3C3B6E'
            return (
              <div key={c.id} className="modal-row" style={{ cursor: 'default' }}>
                <div className="row-avatar" style={{ background: bg, width: 40, height: 40 }}>
                  {c.counterpart?.avatar_url
                    ? <img src={c.counterpart.avatar_url} alt={name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                    : initials}
                </div>
                <div className="modal-row-body">
                  <div className="modal-row-name">{name}</div>
                  <div className="modal-row-sub">{c.last_message_snippet || ''}</div>
                </div>
                <div className="modal-row-actions">
                  <button onClick={() => onUnarchive(c.id)}>Unarchive</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Backdrop>
  )
}

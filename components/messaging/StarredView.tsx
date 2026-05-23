'use client'

import React from 'react'
import { fmtRelative } from '@/lib/messaging/format'

interface StarredMessage {
  id: string
  body?: string
  type?: string
  created_at: string
  convName?: string
  senderName?: string
  conversation_id?: string
  [key: string]: any
}

interface StarredViewProps {
  open: boolean
  onClose: () => void
  messages: StarredMessage[]
  onJump: (msgId: string, convId: string) => void
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

export default function StarredView({ open, onClose, messages, onJump }: StarredViewProps) {
  if (!open) return null
  const sorted = [...messages].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <Backdrop onClose={onClose}>
      <div className="modal starred-modal">
        <div className="modal-head">
          <button className="iconbtn" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#C68B27" stroke="#C68B27" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 6 }}>
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Starred ({sorted.length})
          </div>
          <div style={{ width: 32 }} />
        </div>
        <div className="modal-list">
          {sorted.length === 0 && (
            <div className="modal-empty">Long-press any message → Star to keep it here.</div>
          )}
          {sorted.map((m) => {
            const sender = m.senderName || 'You'
            const chat = m.convName || ''
            return (
              <button
                key={m.id}
                className="modal-row starred-row"
                onClick={() => onJump(m.id, m.conversation_id || '')}
              >
                <div className="starred-meta">
                  <span className="starred-from">{sender}</span>
                  <span className="starred-arrow">→</span>
                  <span className="starred-chat">{chat}</span>
                  <span className="starred-time">{fmtRelative(m.created_at)}</span>
                </div>
                <div className="starred-body">{
                  m.type === 'text' ? (m.body || '').slice(0, 200)
                    : m.type === 'document' ? `📄 ${m.attachment_name || 'Document'}`
                    : m.type === 'image' ? '📷 Photo'
                    : m.type === 'voice' ? '🎙 Voice message'
                    : m.type === 'location' ? '📍 Location'
                    : m.body || '(message)'
                }</div>
              </button>
            )
          })}
        </div>
      </div>
    </Backdrop>
  )
}

'use client'

import React from 'react'

interface ReplyToInfo {
  id: string
  senderName: string
  snippet: string
}

interface AutoGrowInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  placeholder?: string
  style?: React.CSSProperties
  replyTo?: ReplyToInfo | null
  onCancelReply?: () => void
}

export default function AutoGrowInput({ value, onChange, onSubmit, disabled, placeholder, style, replyTo, onCancelReply }: AutoGrowInputProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const hasContent = value.trim().length > 0

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [value])

  return (
    <div style={style}>
      {replyTo && (
        <div className="comp-reply-banner">
          <div className="comp-reply-banner-inner">
            <div className="comp-reply-banner-bar" />
            <div className="comp-reply-banner-body">
              <div className="comp-reply-banner-name">{replyTo.senderName}</div>
              <div className="comp-reply-banner-snippet">{replyTo.snippet}</div>
            </div>
          </div>
          <button
            type="button"
            className="comp-reply-banner-close"
            onClick={onCancelReply}
            title="Cancel reply"
            aria-label="Cancel reply"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      <div className="comp-row">
        <button
          type="button"
          className="iconbtn"
          title="Emoji"
          onClick={() => { /* Phase 1 inert */ }}
          data-tooltip="Coming in Phase 2"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </button>
        <button
          type="button"
          className="iconbtn"
          title="Attachment"
          onClick={() => { /* Phase 1 inert */ }}
          data-tooltip="Coming in Phase 2"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        <textarea
          ref={ref}
          className="comp-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSubmit()
            }
          }}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
        />

        {hasContent ? (
          <button
            type="button"
            className="comp-send"
            title="Send"
            onClick={onSubmit}
            disabled={disabled}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className="comp-mic"
            title="Voice message"
            onClick={() => { /* Phase 1 inert */ }}
            data-tooltip="Coming in Phase 2"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

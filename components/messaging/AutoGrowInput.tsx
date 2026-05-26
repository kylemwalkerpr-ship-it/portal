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
  // Hooked up to /api/messages/conversations/[id]/attach. When omitted,
  // the paperclip + mic buttons fall back to a clear "unavailable" state
  // rather than the prior silent no-op.
  conversationId?: string
  onAttachmentSent?: (message: any) => void
}

// Curated emoji set — shows in the popover. Kept small + categorised so
// the picker doesn't need a heavy emoji-mart dependency. Add to the
// arrays below if a user asks for a missing one.
const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  { label: 'Smileys', emojis: ['😀','😁','😂','🤣','😊','😍','🥰','😘','😎','🤔','😐','🙄','😴','🤯','😅','😭','😢','😡','🤝','🙏'] },
  { label: 'Reactions', emojis: ['👍','👎','❤️','🔥','💯','✅','❌','⚠️','💡','🎯','📌','⭐','🌟','✨','🎉','👏','💪','🤞','👀','🙌'] },
  { label: 'Work', emojis: ['📄','📋','📎','📁','📂','📊','📈','📉','📝','✍️','💼','💵','💰','⏰','⏳','📅','📆','✉️','📧','🔔'] },
  { label: 'Travel', emojis: ['✈️','🛂','🛃','🏛','🇺🇸','🇨🇦','🇬🇧','🇦🇺','🌍','🗺','📍','🏠','🏢','🚗','🛬','📜','🎓','📚','💼','🛄'] },
]

export default function AutoGrowInput({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  style,
  replyTo,
  onCancelReply,
  conversationId,
  onAttachmentSent,
}: AutoGrowInputProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  const hasContent = value.trim().length > 0

  // ── Emoji picker ──────────────────────────────────────────────────────
  const [showEmoji, setShowEmoji] = React.useState(false)
  const emojiBtnRef = React.useRef<HTMLButtonElement>(null)
  const emojiPopRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!showEmoji) return
    const onDown = (e: MouseEvent) => {
      if (emojiPopRef.current?.contains(e.target as Node)) return
      if (emojiBtnRef.current?.contains(e.target as Node)) return
      setShowEmoji(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowEmoji(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [showEmoji])

  const insertEmoji = (emoji: string) => {
    const el = ref.current
    if (!el) { onChange(value + emoji); return }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const next = value.slice(0, start) + emoji + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + emoji.length
      el.setSelectionRange(pos, pos)
    })
  }

  // ── Attachment upload ─────────────────────────────────────────────────
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [attachError, setAttachError] = React.useState('')

  const sendFile = async (file: File, kind: 'attachment' | 'voice') => {
    if (!conversationId) {
      setAttachError('Attachments are not available in this view.')
      return
    }
    setAttachError('')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(
        `/api/messages/conversations/${conversationId}/attach${kind === 'voice' ? '?type=voice' : ''}`,
        { method: 'POST', body: form, credentials: 'same-origin' },
      )
      const data: any = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data?.error?.message
          || (typeof data?.error === 'string' ? data.error : null)
          || 'Upload failed.'
        setAttachError(String(msg))
        return
      }
      onAttachmentSent?.(data.message)
    } catch (err: any) {
      setAttachError(err?.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    sendFile(file, 'attachment')
  }

  // ── Voice recording (MediaRecorder API) ───────────────────────────────
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const recordTimerRef = React.useRef<number | null>(null)
  const [recording, setRecording] = React.useState(false)
  const [recordSeconds, setRecordSeconds] = React.useState(0)

  const stopRecording = (cancel = false) => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
    }
    const r = recorderRef.current
    if (r && r.state !== 'inactive') {
      ;(r as any)._cancelled = cancel
      r.stop()
    }
    setRecording(false)
  }

  const startRecording = async () => {
    if (!conversationId) {
      setAttachError('Voice notes are not available in this view.')
      return
    }
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setAttachError('Voice notes are not supported in this browser.')
      return
    }
    // If the user has already blocked mic access for this site, the
    // getUserMedia call will silently no-op (browsers don't re-prompt
    // once "Block" was selected). Catch that case up-front and surface
    // explicit unblock steps — otherwise the user keeps clicking and
    // nothing happens.
    try {
      if (typeof navigator.permissions?.query === 'function') {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
        if (status.state === 'denied') {
          setAttachError(
            'Microphone is blocked. Click the lock icon next to the URL bar → Site settings → Microphone → Allow, then reload this page.',
          )
          return
        }
      }
    } catch {
      // Permissions API not available for mic in some browsers; fall
      // through and let getUserMedia raise the regular prompt/error.
    }
    setAttachError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || ''
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const cancelled = (recorder as any)._cancelled
        if (cancelled) return
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size < 500) {
          setAttachError('Recording too short — tap and hold (or click again to stop) to send.')
          return
        }
        const ext = (recorder.mimeType || 'audio/webm').includes('mp4') ? 'm4a' : 'webm'
        const file = new File([blob], `voice-note-${Date.now()}.${ext}`, { type: blob.type })
        await sendFile(file, 'voice')
      }
      recorder.start()
      setRecording(true)
      setRecordSeconds(0)
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => {
          // Hard cap at 2 minutes to keep file size + UI reasonable.
          if (s + 1 >= 120) { stopRecording(false); return 120 }
          return s + 1
        })
      }, 1000)
    } catch (err: any) {
      const name = err?.name || ''
      if (name === 'NotAllowedError' || /permission|denied/i.test(err?.message || '')) {
        setAttachError(
          'Microphone permission denied. Click the lock icon next to the URL bar → Site settings → Microphone → Allow, then reload this page and try again.',
        )
      } else if (name === 'NotFoundError') {
        setAttachError('No microphone detected on this device.')
      } else {
        setAttachError(err?.message || 'Could not start recording.')
      }
    }
  }

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current)
      const r = recorderRef.current
      if (r && r.state !== 'inactive') {
        ;(r as any)._cancelled = true
        r.stop()
      }
    }
  }, [])

  const recordingLabel = `${Math.floor(recordSeconds / 60)}:${String(recordSeconds % 60).padStart(2, '0')}`

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

      {attachError && (
        <div style={{
          margin: '0 14px 6px', padding: '6px 10px', borderRadius: 6, fontSize: 12,
          background: 'rgba(178,34,52,0.08)', color: '#B22234',
        }}>
          {attachError}
        </div>
      )}

      {recording && (
        <div style={{
          margin: '0 14px 6px', padding: '8px 12px', borderRadius: 8,
          background: 'rgba(178,34,52,0.08)', color: '#B22234',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="ys-rec-dot" style={{
              width: 10, height: 10, borderRadius: '50%', background: '#B22234',
            }} />
            Recording · {recordingLabel}
          </span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => stopRecording(true)}
              style={{ background: 'transparent', border: '1px solid rgba(178,34,52,0.4)', color: '#B22234', borderRadius: 999, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => stopRecording(false)}
              style={{ background: '#B22234', border: 'none', color: '#fff', borderRadius: 999, padding: '4px 12px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
            >
              Send
            </button>
          </span>
          <style>{`.ys-rec-dot { animation: ys-rec-pulse 1.2s ease-in-out infinite } @keyframes ys-rec-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
        </div>
      )}

      <div className="comp-row" style={{ position: 'relative' }}>
        <button
          ref={emojiBtnRef}
          type="button"
          className="iconbtn"
          title="Emoji"
          onClick={() => setShowEmoji((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={showEmoji}
          disabled={disabled || uploading || recording}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </button>

        {showEmoji && (
          <div
            ref={emojiPopRef}
            role="dialog"
            aria-label="Pick an emoji"
            style={{
              position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
              width: 320, maxHeight: 320, overflowY: 'auto',
              background: '#fff', border: '1px solid rgba(15,23,42,0.10)',
              borderRadius: 12, boxShadow: '0 10px 28px rgba(15,23,42,0.16)',
              padding: 10, zIndex: 30,
            }}
          >
            {EMOJI_CATEGORIES.map((cat) => (
              <div key={cat.label} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748B', padding: '4px 6px' }}>
                  {cat.label}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2 }}>
                  {cat.emojis.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => { insertEmoji(e); setShowEmoji(false) }}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        fontSize: 20, padding: 4, borderRadius: 6,
                      }}
                      onMouseEnter={(ev) => { (ev.currentTarget as HTMLButtonElement).style.background = '#F1F5F9' }}
                      onMouseLeave={(ev) => { (ev.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv"
          onChange={handleFilePick}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="iconbtn"
          title={uploading ? 'Uploading…' : 'Attach a file'}
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading || recording || !conversationId}
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
          disabled={disabled || uploading || recording}
        />

        {hasContent ? (
          <button
            type="button"
            className="comp-send"
            title="Send"
            onClick={onSubmit}
            disabled={disabled || uploading || recording}
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
            title={recording ? 'Stop recording (click to send)' : 'Record a voice message'}
            onClick={() => (recording ? stopRecording(false) : startRecording())}
            disabled={disabled || uploading || !conversationId}
            style={recording ? { background: '#B22234', color: '#fff', borderColor: '#B22234' } : undefined}
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

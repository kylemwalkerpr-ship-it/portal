'use client'

import React from 'react'

type DirectTo = 'client' | 'provider'

type ReplyToInfo = {
  id: string
  senderName: string
  snippet: string
}

interface Props {
  conversationId: string
  directTo: DirectTo
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onAttachmentSent: (message?: any) => void
  replyTo?: ReplyToInfo | null
  onCancelReply?: () => void
  disabled?: boolean
  placeholder?: string
}

const EMOJIS = ['😀','😁','😂','😊','😍','🥰','😎','🤔','🙏','👍','❤️','🔥','✅','⚠️','💡','🎯','📌','⭐','🎉','👏','📄','📎','💼','✈️','🌍','📍','🎓','📚']

export default function AdminMasterComposer({
  conversationId,
  directTo,
  value,
  onChange,
  onSubmit,
  onAttachmentSent,
  replyTo,
  onCancelReply,
  disabled,
  placeholder,
}: Props) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const emojiRef = React.useRef<HTMLDivElement>(null)
  const emojiButtonRef = React.useRef<HTMLButtonElement>(null)
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const timerRef = React.useRef<number | null>(null)

  const [showEmoji, setShowEmoji] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [recording, setRecording] = React.useState(false)
  const [seconds, setSeconds] = React.useState(0)

  const hasContent = value.trim().length > 0

  React.useEffect(() => {
    if (!showEmoji) return
    const onPointer = (event: MouseEvent) => {
      const node = event.target as Node
      if (emojiRef.current?.contains(node) || emojiButtonRef.current?.contains(node)) return
      setShowEmoji(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowEmoji(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [showEmoji])

  React.useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(140, Math.max(42, el.scrollHeight))}px`
  }, [value])

  React.useEffect(() => {
    if (replyTo) requestAnimationFrame(() => textareaRef.current?.focus())
  }, [replyTo?.id])

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const next = value.slice(0, start) + emoji + value.slice(end)
    onChange(next)
    setShowEmoji(false)
    requestAnimationFrame(() => {
      el?.focus()
      const pos = start + emoji.length
      el?.setSelectionRange(pos, pos)
    })
  }

  const sendFile = async (file: File, kind: 'attachment' | 'voice') => {
    if (!conversationId) return
    setError('')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const params = new URLSearchParams({ to: directTo })
      if (kind === 'voice') params.set('type', 'voice')
      const response = await fetch(`/api/admin/messages/conversations/${conversationId}/attach?${params.toString()}`, {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Upload failed.')
      onAttachmentSent(data.message)
    } catch (e: any) {
      setError(e?.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void sendFile(file, 'attachment')
  }

  const stopRecording = React.useCallback((cancel = false) => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      ;(recorder as any)._cancelled = cancel
      recorder.stop()
    }
    setRecording(false)
  }, [])

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice notes are not supported in this browser.')
      return
    }
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      const mime = candidates.find((item) => MediaRecorder.isTypeSupported(item)) || ''
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        if ((recorder as any)._cancelled) return
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size < 500) {
          setError('Recording was too short to send.')
          return
        }
        const ext = (recorder.mimeType || '').includes('mp4') ? 'm4a' : 'webm'
        await sendFile(new File([blob], `admin-voice-${Date.now()}.${ext}`, { type: blob.type }), 'voice')
      }
      recorder.start()
      setRecording(true)
      setSeconds(0)
      timerRef.current = window.setInterval(() => {
        setSeconds((value) => {
          if (value + 1 >= 120) {
            stopRecording(false)
            return 120
          }
          return value + 1
        })
      }, 1000)
    } catch (e: any) {
      const name = e?.name || ''
      if (name === 'NotAllowedError') setError('Microphone permission was denied for this site.')
      else if (name === 'NotFoundError') setError('No microphone was detected on this device.')
      else setError(e?.message || 'Could not start recording.')
    }
  }

  React.useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      ;(recorder as any)._cancelled = true
      recorder.stop()
    }
  }, [])

  const recordLabel = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <div className="comp">
      {replyTo && (
        <div className="comp-reply-banner">
          <div className="comp-reply-banner-inner">
            <div className="comp-reply-banner-bar" />
            <div className="comp-reply-banner-body">
              <div className="comp-reply-banner-name">Replying to {replyTo.senderName}</div>
              <div className="comp-reply-banner-snippet">{replyTo.snippet}</div>
            </div>
          </div>
          <button type="button" className="comp-reply-banner-close" onClick={onCancelReply} aria-label="Cancel reply">×</button>
        </div>
      )}
      {error && <div className="admin-master-attachment-error" role="alert">{error}</div>}
      {recording && (
        <div className="admin-master-recording">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="admin-master-recording-dot" />
            Recording · {recordLabel}
          </span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="admin-master-chip" onClick={() => stopRecording(true)}>Cancel</button>
            <button type="button" className="admin-master-chip" onClick={() => stopRecording(false)} style={{ background: '#9d2235', color: '#fff', borderColor: '#9d2235' }}>Send</button>
          </span>
        </div>
      )}
      <div className="comp-row" style={{ position: 'relative' }}>
        <button
          ref={emojiButtonRef}
          type="button"
          className="iconbtn"
          aria-label="Choose emoji"
          aria-haspopup="dialog"
          aria-expanded={showEmoji}
          title="Emoji"
          disabled={disabled || uploading || recording}
          onClick={() => setShowEmoji((value) => !value)}
        >
          ☺
        </button>
        {showEmoji && (
          <div
            ref={emojiRef}
            role="dialog"
            aria-label="Pick an emoji"
            style={{ position: 'absolute', left: 4, bottom: 'calc(100% + 8px)', width: 'min(300px, calc(100vw - 24px))', maxHeight: 'min(44dvh, 300px)', overflowY: 'auto', zIndex: 40, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3, padding: 10, border: '1px solid rgba(15,23,42,.10)', borderRadius: 14, background: '#fff', boxShadow: '0 16px 40px rgba(15,23,42,.18)' }}
          >
            {EMOJIS.map((emoji) => (
              <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} style={{ minWidth: 34, minHeight: 34, border: 0, borderRadius: 8, background: 'transparent', fontSize: 20, cursor: 'pointer' }}>{emoji}</button>
            ))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="iconbtn"
          title={uploading ? 'Uploading…' : 'Attach a file'}
          aria-label="Attach a file"
          disabled={disabled || uploading || recording}
          onClick={() => fileRef.current?.click()}
        >
          📎
        </button>
        <textarea
          ref={textareaRef}
          className="comp-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSubmit()
            }
          }}
          placeholder={placeholder}
          rows={1}
          disabled={disabled || uploading || recording}
        />
        {hasContent ? (
          <button type="button" className="comp-send" title="Send" aria-label="Send message" disabled={disabled || uploading || recording} onClick={onSubmit}>➤</button>
        ) : (
          <button type="button" className="comp-mic" title={recording ? 'Stop recording' : 'Record a voice message'} aria-label="Record a voice message" disabled={disabled || uploading} onClick={() => recording ? stopRecording(false) : void startRecording()}>🎙</button>
        )}
      </div>
    </div>
  )
}

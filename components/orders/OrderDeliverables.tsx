'use client'
/**
 * OrderDeliverables — submit + view the files attached to an order.
 *
 * Providers (attorney/consultant) use this on the order-detail view to submit
 * the completed deliverable files; everyone sees the list with download links.
 * Self-contained (plain styles + the shared /api/orders/:id/files route) so it
 * drops into any role dashboard.
 */
import React from 'react'

type OrderFile = {
  id: string
  name: string
  mime_type?: string | null
  size_bytes?: number | null
  uploader_role?: string | null
  uploader_name?: string | null
  created_at?: string | null
  url?: string | null
}

function fmtSize(bytes?: number | null): string {
  const b = Number(bytes || 0)
  if (b <= 0) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

export default function OrderDeliverables({
  orderId,
  canUpload = false,
  apiBase = '/api/orders',
}: {
  orderId: string
  canUpload?: boolean
  apiBase?: string
}) {
  const [files, setFiles] = React.useState<OrderFile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  const load = React.useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/${orderId}/files`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Could not load files.')
      setFiles(Array.isArray(d.files) ? d.files : [])
      setError('')
    } catch (e: any) {
      setError(e?.message || 'Could not load files.')
    } finally {
      setLoading(false)
    }
  }, [orderId, apiBase])

  React.useEffect(() => { load() }, [load])

  const onPick = async (file?: File | null) => {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await fetch(`${apiBase}/${orderId}/files`, { method: 'POST', credentials: 'same-origin', body: form })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Upload failed.')
      await load()
    } catch (e: any) {
      setError(e?.message || 'Upload failed.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E5E0D6', borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: '#1A1F2E', fontSize: 14 }}>Deliverables</div>
        {canUpload && (
          <>
            <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={(e) => onPick(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              style={{
                background: '#0F172A', color: '#fff', border: 'none', borderRadius: 8,
                padding: '7px 12px', fontSize: 13, fontWeight: 700,
                cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.7 : 1,
              }}
            >
              {uploading ? 'Uploading…' : '⬆ Submit deliverable'}
            </button>
          </>
        )}
      </div>
      <p style={{ color: '#5C6070', fontSize: 12.5, margin: '0 0 12px', lineHeight: 1.5 }}>
        {canUpload
          ? 'Upload the completed work here. The client can download it and approve to release escrow.'
          : 'Files delivered for this order.'}
      </p>

      {error && (
        <div style={{ background: 'rgba(139,26,26,0.08)', border: '1px solid #8B1A1A44', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, color: '#8B1A1A', marginBottom: 10 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#9097A8', fontSize: 13 }}>Loading…</div>
      ) : files.length === 0 ? (
        <div style={{ color: '#9097A8', fontSize: 13 }}>
          {canUpload ? 'No deliverables uploaded yet.' : 'No files yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {files.map((f) => (
            <a
              key={f.id}
              href={f.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
                background: '#FAFAF7', border: '1px solid #E5E0D6', borderRadius: 10, padding: '10px 12px',
              }}
            >
              <span style={{ fontSize: 18 }}>📄</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1F2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                <div style={{ fontSize: 11, color: '#9097A8' }}>
                  {[f.uploader_name, fmtSize(f.size_bytes), f.created_at ? new Date(f.created_at).toLocaleDateString() : ''].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#3C3B6E', fontWeight: 700 }}>Download</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

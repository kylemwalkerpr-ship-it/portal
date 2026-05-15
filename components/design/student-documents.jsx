'use client'
import React from 'react'
import { Card, Btn, Badge } from './shared'

/**
 * Student → Documents (Fiverr-grade).
 *
 * Paginated, filterable, searchable file vault across every order the student
 * has placed. Replaces the prior single-fetch all-files view.
 *
 * - Stat tiles (total / yours / consultants' / last 7d / total storage)
 * - Filters: order, uploader, type, date range, search
 * - Two views: List (flat) and Folders (grouped by order)
 * - Per-file: open (mints signed URL on demand), delete (yours only)
 * - Inline preview for images, target=_blank for everything else
 * - Upload via per-order picker
 */

const NAVY='#1B2D4F', GOLD='#9A7B3B', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='#0E7C8E', PURPLE='#3D2B6B'
const BG='#F7F5F0', SURFACE='#FFFFFF', SURFACE2='#FAFAF7', BORDER='#DDD8CE', BORDER2='#F2EFE9', TEXT='#1A1F2E', MUTED='#5C6070', DIM='#9097A8'
const SERIF=`'Cormorant Garamond', Georgia, serif`
const SANS=`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO=`'SF Mono', Menlo, Consolas, monospace`
const PAGE_SIZE = 25

const fmtN = n => Number(n ?? 0).toLocaleString('en-US')
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const fmtRelative = s => {
  if (!s) return '—'
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d}d ago`
  if (d < 365) return `${Math.floor(d/30)}mo ago`
  return `${Math.floor(d/365)}y ago`
}
const fmtBytes = b => {
  const n = Number(b || 0)
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const TYPE_ICON = (mime, name) => {
  if (/^image\//i.test(mime || '') || /\.(jpe?g|png|gif|webp|heic|svg)$/i.test(name || '')) return '🖼'
  if (/pdf/i.test(mime || '') || /\.pdf$/i.test(name || '')) return '📕'
  if (/(word|msword|officedocument|opendocument|rtf)/i.test(mime || '') || /\.(docx?|odt|rtf|pages)$/i.test(name || '')) return '📝'
  if (/(excel|spreadsheetml|opendocument.spreadsheet)/i.test(mime || '') || /\.(xlsx?|ods|numbers|csv)$/i.test(name || '')) return '📊'
  if (/(zip|x-rar|x-7z)/i.test(mime || '') || /\.(zip|rar|7z|tar|gz)$/i.test(name || '')) return '🗜'
  return '📄'
}

function StatTile({ label, value, accent = NAVY, sub }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 26, color: accent, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{sub}</div>}
    </div>
  )
}

export default function StudentDocuments({ onOpenOrder }) {
  // ── Filters ─────────────────────────────────────────────────────────────
  const [orderId, setOrderId] = React.useState('')
  const [uploader, setUploader] = React.useState('all')
  const [type, setType] = React.useState('all')
  const [searchInput, setSearchInput] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [sort, setSort] = React.useState('created_at')
  const [dir, setDir] = React.useState('desc')
  const [view, setView] = React.useState('list') // list | folders
  const [page, setPage] = React.useState(1)

  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // ── State ───────────────────────────────────────────────────────────────
  const [files, setFiles] = React.useState([])
  const [orders, setOrders] = React.useState([])
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [stats, setStats] = React.useState(null)
  const [notice, setNotice] = React.useState(null)
  const flash = (kind, msg) => { setNotice({ kind, msg }); setTimeout(() => setNotice(null), 4000) }

  // ── Upload state ────────────────────────────────────────────────────────
  const fileRef = React.useRef(null)
  const [uploadOrderId, setUploadOrderId] = React.useState('')
  const [uploading, setUploading] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (orderId) params.set('order_id', orderId)
      if (uploader !== 'all') params.set('uploader', uploader)
      if (type !== 'all') params.set('type', type)
      if (debouncedQ) params.set('q', debouncedQ)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      params.set('sort', sort); params.set('dir', dir)
      params.set('page', String(page))
      params.set('page_size', String(view === 'folders' ? 200 : PAGE_SIZE)) // folders need everything visible to group
      const r = await fetch(`/api/student/documents?${params}`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`)
      setFiles(d.files || [])
      setOrders(d.orders || [])
      setTotal(d.total || 0)
      setTotalPages(d.total_pages || 1)
      setHasMore(!!d.has_more)
      if (!uploadOrderId && d.orders?.length) setUploadOrderId(d.orders[0].id)
    } catch (e) {
      setError(e.message || 'Failed to load documents.')
    } finally {
      setLoading(false)
    }
  }, [orderId, uploader, type, debouncedQ, from, to, sort, dir, page, view, uploadOrderId])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    fetch('/api/student/documents/stats', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})))
      .then(d => setStats(d?.stats || null))
      .catch(() => setStats(null))
  }, [files.length])

  const openFile = async (file) => {
    try {
      const r = await fetch(`/api/student/documents/${file.id}/url`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d?.url) throw new Error(d?.error || 'Could not open file')
      window.open(d.url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      flash('err', e.message)
    }
  }

  const deleteFile = async (file) => {
    if (!file.is_mine) return
    if (!confirm(`Delete “${file.name}”?`)) return
    try {
      const r = await fetch(`/api/student/orders/${file.order_id}/files?id=${encodeURIComponent(file.id)}`, {
        method: 'DELETE', credentials: 'same-origin',
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Delete failed')
      flash('ok', 'File deleted.')
      load()
    } catch (e) { flash('err', e.message) }
  }

  const upload = async (file) => {
    if (!file || !uploadOrderId) {
      flash('err', uploadOrderId ? 'No file selected.' : 'Choose an order first.')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch(`/api/student/orders/${uploadOrderId}/files`, { method: 'POST', body: fd, credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Upload failed')
      flash('ok', 'File uploaded.')
      load()
    } catch (e) { flash('err', e.message) }
    finally { setUploading(false) }
  }

  // ── Folder grouping (when view === 'folders') ────────────────────────────
  const folders = React.useMemo(() => {
    if (view !== 'folders') return null
    const map = new Map()
    for (const f of files) {
      if (!map.has(f.order_id)) map.set(f.order_id, { orderId: f.order_id, title: f.order_title, files: [] })
      map.get(f.order_id).files.push(f)
    }
    return Array.from(map.values())
  }, [files, view])

  return (
    <div style={{ padding: '24px 28px 60px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>Files</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: TEXT, margin: 0, letterSpacing: '-.012em' }}>Documents.</h1>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
            All files shared with consultants across your orders. Links are private and expire 10 minutes after they're opened.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {orders.length > 0 && (
            <select
              value={uploadOrderId}
              onChange={e => setUploadOrderId(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT, fontSize: 13, fontFamily: SANS, minWidth: 160 }}
              title="Upload destination order"
            >
              {orders.map(o => (
                <option key={o.id} value={o.id}>{o.title} · {o.order_number || o.id.slice(0, 8)}</option>
              ))}
            </select>
          )}
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => upload(e.target.files?.[0])} />
          <Btn variant="primary" size="sm" disabled={uploading || !uploadOrderId} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading…' : '+ Upload file'}
          </Btn>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <StatTile label="Total files"   value={stats ? fmtN(stats.total) : '—'}   accent={NAVY}  sub={stats ? `${fmtN(stats.last7d)} this week` : ''} />
        <StatTile label="Your uploads"  value={stats ? fmtN(stats.mine) : '—'}    accent={CYAN}  sub="files you've shared" />
        <StatTile label="From consultants" value={stats ? fmtN(stats.theirs) : '—'} accent={PURPLE} sub="deliverables + responses" />
        <StatTile label="Total storage" value={stats ? fmtBytes(stats.totalBytes) : '—'} accent={AMBER} sub="across all orders" />
      </div>

      {/* Toolbar */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: DIM, fontSize: 14 }}>🔍</span>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search filename…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 6, background: BG, color: TEXT, fontFamily: SANS, boxSizing: 'border-box' }}
          />
        </div>
        <select value={orderId} onChange={e => { setOrderId(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="">All orders</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>
        <select value={uploader} onChange={e => { setUploader(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="all">Anyone</option>
          <option value="client">From you</option>
          <option value="consultant">From consultant</option>
        </select>
        <select value={type} onChange={e => { setType(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="all">All types</option>
          <option value="pdf">PDFs</option>
          <option value="image">Images</option>
          <option value="doc">Documents</option>
          <option value="sheet">Spreadsheets</option>
        </select>
        <select value={`${sort}:${dir}`} onChange={e => { const [c, d] = e.target.value.split(':'); setSort(c); setDir(d); setPage(1) }} style={selectStyle}>
          <option value="created_at:desc">Newest first</option>
          <option value="created_at:asc">Oldest first</option>
          <option value="name:asc">Name A → Z</option>
          <option value="name:desc">Name Z → A</option>
          <option value="size_bytes:desc">Largest first</option>
        </select>
        <label style={{ fontSize: 12, color: MUTED, fontFamily: MONO, display: 'flex', alignItems: 'center', gap: 4 }}>
          From <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }} style={inlineDate} />
        </label>
        <label style={{ fontSize: 12, color: MUTED, fontFamily: MONO, display: 'flex', alignItems: 'center', gap: 4 }}>
          To <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1) }} style={inlineDate} />
        </label>
        <div style={{ display: 'inline-flex', background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 2 }}>
          {['list', 'folders'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 12px', fontSize: 12, fontWeight: 700, fontFamily: SANS, border: 'none', borderRadius: 4,
              background: view === v ? CYAN : 'transparent', color: view === v ? '#fff' : MUTED, cursor: 'pointer',
              textTransform: 'capitalize',
            }}>{v}</button>
          ))}
        </div>
      </div>

      {/* Notice */}
      {notice && (
        <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: notice.kind === 'ok' ? `${GREEN}10` : `${RED}10`, color: notice.kind === 'ok' ? GREEN : RED, border: `1px solid ${notice.kind === 'ok' ? GREEN : RED}33` }}>
          {notice.msg}
        </div>
      )}

      {/* Content */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
        {error && (
          <div style={{ padding: '16px 20px', background: `${RED}10`, color: RED, fontSize: 13, fontWeight: 600 }}>
            {error} · <button onClick={load} style={{ background: 'none', border: 'none', color: RED, textDecoration: 'underline', cursor: 'pointer', fontFamily: SANS }}>retry</button>
          </div>
        )}
        {loading && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: MUTED, fontSize: 13 }}>Loading documents…</div>
        )}
        {!loading && !error && files.length === 0 && (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
            <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: TEXT, marginBottom: 6 }}>
              No documents in this view
            </div>
            <div style={{ fontSize: 13, color: MUTED }}>
              {orders.length === 0
                ? 'Place an order from Services & Templates to start exchanging files with your consultant.'
                : 'Try a different filter, or upload a file using the picker above.'}
            </div>
          </div>
        )}

        {/* List view */}
        {!loading && !error && view === 'list' && files.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: SURFACE2 }}>
                <Th>File</Th>
                <Th style={{ width: 160 }}>Order</Th>
                <Th style={{ width: 130 }}>Uploaded</Th>
                <Th style={{ width: 100 }}>By</Th>
                <Th style={{ width: 90, textAlign: 'right' }}>Size</Th>
                <Th style={{ width: 130 }}>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {files.map(f => (
                <tr key={f.id} style={{ borderTop: `1px solid ${BORDER2}` }}>
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 22 }}>{TYPE_ICON(f.mime_type, f.name)}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: TEXT, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>{f.name}</div>
                        <div style={{ fontSize: 10, color: DIM, fontFamily: MONO, textTransform: 'uppercase' }}>{f.mime_type || 'file'}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <button onClick={() => onOpenOrder?.(f.order_id)} style={linkBtn}>{f.order_title}</button>
                  </Td>
                  <Td>
                    <div style={{ fontSize: 12, color: TEXT }}>{fmtDate(f.created_at)}</div>
                    <div style={{ fontSize: 10, color: DIM, fontFamily: MONO }}>{fmtRelative(f.created_at)}</div>
                  </Td>
                  <Td>
                    {f.is_mine
                      ? <Badge color="cyan" style={{ fontSize: 10 }}>You</Badge>
                      : <span style={{ fontSize: 12, color: MUTED }}>{f.uploader_name || 'Consultant'}</span>}
                  </Td>
                  <Td style={{ textAlign: 'right', fontFamily: MONO, fontSize: 12, color: MUTED }}>{fmtBytes(f.size_bytes)}</Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openFile(f)} style={actionBtn(CYAN)}>Open ↗</button>
                      {f.is_mine && <button onClick={() => deleteFile(f)} style={actionBtn(RED)}>×</button>}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Folder view */}
        {!loading && !error && view === 'folders' && folders && folders.length > 0 && (
          <div style={{ padding: '8px 18px 14px' }}>
            {folders.map(g => (
              <div key={g.orderId} style={{ borderBottom: `1px solid ${BORDER2}`, padding: '14px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>📁</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{g.title}</div>
                      <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{g.files.length} file{g.files.length === 1 ? '' : 's'}</div>
                    </div>
                  </div>
                  <Btn variant="ghost" size="sm" onClick={() => onOpenOrder?.(g.orderId)}>Open order →</Btn>
                </div>
                <div style={{ display: 'grid', gap: 4, paddingLeft: 28 }}>
                  {g.files.map(f => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', fontSize: 13 }}>
                      <span style={{ fontSize: 18 }}>{TYPE_ICON(f.mime_type, f.name)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: TEXT, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                        <div style={{ fontSize: 11, color: DIM, fontFamily: MONO }}>
                          {f.is_mine ? 'You' : f.uploader_name || 'Consultant'} · {fmtRelative(f.created_at)} · {fmtBytes(f.size_bytes)}
                        </div>
                      </div>
                      <button onClick={() => openFile(f)} style={actionBtn(CYAN)}>Open ↗</button>
                      {f.is_mine && <button onClick={() => deleteFile(f)} style={actionBtn(RED)}>×</button>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination — list view only */}
        {!loading && !error && view === 'list' && totalPages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${BORDER2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: MUTED, fontFamily: MONO }}>
              {fmtN((page - 1) * PAGE_SIZE + 1)}–{fmtN(Math.min(page * PAGE_SIZE, total))} of {fmtN(total)}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</Btn>
              <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT, padding: '4px 10px' }}>Page {page} / {totalPages}</span>
              <Btn variant="ghost" size="sm" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Next →</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const Th = ({ children, style }) => (
  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTED, fontFamily: MONO, ...style }}>{children}</th>
)
const Td = ({ children, style }) => (
  <td style={{ padding: '12px 14px', verticalAlign: 'top', color: TEXT, fontSize: 13, ...style }}>{children}</td>
)
const selectStyle = {
  padding: '8px 10px', fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 6,
  background: BG, color: TEXT, fontFamily: SANS, cursor: 'pointer',
}
const inlineDate = {
  padding: '6px 8px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 6,
  background: BG, color: TEXT, fontFamily: MONO,
}
const actionBtn = (color) => ({
  padding: '4px 10px', fontSize: 11, fontWeight: 700, fontFamily: SANS,
  background: 'transparent', color, border: `1px solid ${color}55`,
  borderRadius: 5, cursor: 'pointer',
})
const linkBtn = {
  background: 'none', border: 'none', color: CYAN, cursor: 'pointer',
  fontFamily: SANS, fontSize: 13, padding: 0, textAlign: 'left', textDecoration: 'underline',
}

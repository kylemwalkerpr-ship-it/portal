// @ts-nocheck
'use client'
import React from 'react'
import { C, Btn, Card, Avatar } from './shared'

/**
 * Role-scoped user table for the Attorney + Consultant management modules.
 *
 * Mirrors the Users-tab bulk-action UX but pre-filters to a single role so
 * admins can manage live attorneys / consultants without crossing the
 * boundary into other accounts. Fetches its own data from /api/admin/data
 * (which the parent shell also reads, so the response is hot in the worker
 * cache by the time this surface mounts).
 *
 * Eligibility rules are enforced both client-side (button counts) and on the
 * server (the existing /api/admin/users/[id] PATCH + DELETE handlers).
 * Self-mutation stays impossible — the current-admin row is filtered out of
 * every fan-out before the request leaves the page.
 */

const ROLE_LABEL = {
  attorney: 'Attorney',
  consultant: 'Consultant',
}

const STATUS_PILL = {
  active:    { bg: '#DCFCE7', fg: '#166534', dot: '#22C55E' },
  pending:   { bg: '#FEF9C3', fg: '#854D0E', dot: '#EAB308' },
  suspended: { bg: '#FEE2E2', fg: '#991B1B', dot: '#EF4444' },
  declined:  { bg: '#E5E7EB', fg: '#374151', dot: '#6B7280' },
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isFinite(d.valueOf()) ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
}

export default function AdminRoleUsersTable({ role }) {
  const [loading, setLoading] = React.useState(true)
  const [error, setError]     = React.useState('')
  const [users, setUsers]     = React.useState([])
  const [currentAdminId, setCurrentAdminId] = React.useState(null)
  const [q, setQ]             = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all') // all|active|pending|suspended
  const [sortCol, setSortCol] = React.useState('created_at')
  const [sortDir, setSortDir] = React.useState('desc')
  const [selectedRows, setSelectedRows] = React.useState(new Set())
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const [notice, setNotice]   = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/data', { credentials: 'same-origin' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setUsers(body.users ?? [])
      setCurrentAdminId(body.currentAdminId || null)
    } catch (e) {
      setError(e.message || 'Could not load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { load() }, [load])

  const isCurrentAdmin = u => currentAdminId && u.id === currentAdminId

  // Role-locked + search + status filtered + sorted.
  const visible = React.useMemo(() => {
    const ql = q.trim().toLowerCase()
    let rows = users.filter(u => u.role === role)
    if (statusFilter !== 'all') rows = rows.filter(u => u.status === statusFilter)
    if (ql.length > 0) {
      rows = rows.filter(u =>
        (u.full_name || '').toLowerCase().includes(ql) ||
        (u.email     || '').toLowerCase().includes(ql) ||
        (u.country   || '').toLowerCase().includes(ql)
      )
    }
    const dir = sortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      const av = a[sortCol] ?? ''
      const bv = b[sortCol] ?? ''
      if (av < bv) return -1 * dir
      if (av > bv) return  1 * dir
      return 0
    })
    return rows
  }, [users, role, statusFilter, q, sortCol, sortDir])

  const statusCounts = React.useMemo(() => {
    const all = users.filter(u => u.role === role)
    return {
      all:       all.length,
      active:    all.filter(u => u.status === 'active').length,
      pending:   all.filter(u => u.status === 'pending').length,
      suspended: all.filter(u => u.status === 'suspended').length,
    }
  }, [users, role])

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const toggleRow = id => setSelectedRows(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const allVisibleSelected = visible.length > 0 && visible.every(u => selectedRows.has(u.id))
  const toggleAll = () => setSelectedRows(prev => {
    if (allVisibleSelected) {
      const next = new Set(prev)
      for (const u of visible) next.delete(u.id)
      return next
    }
    const next = new Set(prev)
    for (const u of visible) next.add(u.id)
    return next
  })
  const bulkClear = () => setSelectedRows(new Set())

  const selectedUsers = React.useMemo(
    () => users.filter(u => selectedRows.has(u.id) && u.role === role),
    [users, selectedRows, role],
  )

  // Fan-out helper — caps in-flight at 5 so a 50-row select-all doesn't
  // saturate the worker. Each per-row promise returns { ok, reason } so the
  // summary toast can collapse N results into one line.
  const fanOut = async (targets, runOne) => {
    const queue = [...targets]
    const results = []
    const workers = Array(Math.min(5, queue.length)).fill(0).map(async () => {
      while (queue.length) {
        const item = queue.shift()
        try {
          const r = await runOne(item)
          results.push({ id: item.id, name: item.full_name || item.email, ok: !!r.ok, reason: r.reason })
        } catch (e) {
          results.push({ id: item.id, name: item.full_name || item.email, ok: false, reason: e?.message || 'failed' })
        }
      }
    })
    await Promise.all(workers)
    return {
      succeeded: results.filter(r => r.ok).length,
      skipped:   results.filter(r => !r.ok).length,
      results,
    }
  }

  const bulkUpdateStatus = async status => {
    const verb = status === 'active' ? 'activate' : status === 'suspended' ? 'suspend' : status
    const candidates = selectedUsers.filter(u => !isCurrentAdmin(u) && u.status !== status)
    if (candidates.length === 0) { setNotice(`Nothing to ${verb} — selection has no eligible users.`); return }
    if (!confirm(`${verb[0].toUpperCase() + verb.slice(1)} ${candidates.length} ${ROLE_LABEL[role].toLowerCase()}${candidates.length === 1 ? '' : 's'}?`)) return
    setBulkBusy(true)
    const { succeeded, skipped, results } = await fanOut(candidates, async u => {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) return { ok: true }
      const body = await res.json().catch(() => ({}))
      return { ok: false, reason: body.error || `HTTP ${res.status}` }
    })
    setBulkBusy(false); setSelectedRows(new Set())
    const fails = results.filter(r => !r.ok).slice(0, 3).map(r => `${r.name}: ${r.reason}`).join('; ')
    setNotice(`${verb[0].toUpperCase() + verb.slice(1)}d ${succeeded}/${candidates.length}.${skipped > 0 ? ` ${skipped} failed${fails ? ' — ' + fails : ''}.` : ''}`)
    await load()
  }

  const bulkApprove = async () => {
    const candidates = selectedUsers.filter(u => !isCurrentAdmin(u) && u.status === 'pending')
    if (candidates.length === 0) { setNotice('Nothing to approve — selection has no pending users.'); return }
    if (!confirm(`Approve ${candidates.length} pending ${ROLE_LABEL[role].toLowerCase()}${candidates.length === 1 ? '' : 's'}?`)) return
    setBulkBusy(true)
    const { succeeded, skipped, results } = await fanOut(candidates, async u => {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      if (res.ok) return { ok: true }
      const body = await res.json().catch(() => ({}))
      return { ok: false, reason: body.error || `HTTP ${res.status}` }
    })
    setBulkBusy(false); setSelectedRows(new Set())
    const fails = results.filter(r => !r.ok).slice(0, 3).map(r => `${r.name}: ${r.reason}`).join('; ')
    setNotice(`Approved ${succeeded}/${candidates.length}.${skipped > 0 ? ` ${skipped} failed${fails ? ' — ' + fails : ''}.` : ''}`)
    await load()
  }

  const bulkDelete = async () => {
    const candidates = selectedUsers.filter(u => !isCurrentAdmin(u))
    if (candidates.length === 0) { setNotice('Nothing to delete — your own account is excluded.'); return }
    if (!confirm(`Permanently delete ${candidates.length} ${ROLE_LABEL[role].toLowerCase()}${candidates.length === 1 ? '' : 's'}? This nukes their Clerk login + cascades every linked record across the marketplace.`)) return
    setBulkBusy(true)
    const { succeeded, skipped, results } = await fanOut(candidates, async u => {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' })
      if (res.ok) return { ok: true }
      const body = await res.json().catch(() => ({}))
      if (res.status === 409 && Array.isArray(body.blockers) && body.blockers.length > 0) {
        return { ok: false, reason: body.blockers[0].detail || 'refunds required first' }
      }
      return { ok: false, reason: body.error || `HTTP ${res.status}` }
    })
    setBulkBusy(false); setSelectedRows(new Set())
    const fails = results.filter(r => !r.ok).slice(0, 3).map(r => `${r.name}: ${r.reason}`).join('; ')
    setNotice(`Deleted ${succeeded}/${candidates.length}.${skipped > 0 ? ` ${skipped} skipped${fails ? ' — ' + fails : ''}.` : ''}`)
    await load()
  }

  // Per-row single actions — same handlers as bulk, scoped to one user.
  const rowAction = async (u, kind) => {
    if (isCurrentAdmin(u)) return
    let confirmMsg = ''
    let init = null
    if (kind === 'approve' || kind === 'activate') {
      confirmMsg = kind === 'approve' ? `Approve ${u.full_name || u.email}?` : `Activate ${u.full_name || u.email}?`
      init = { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }) }
    } else if (kind === 'suspend') {
      confirmMsg = `Suspend ${u.full_name || u.email}?`
      init = { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'suspended' }) }
    } else if (kind === 'delete') {
      confirmMsg = `Permanently delete ${u.full_name || u.email}? This nukes their Clerk login + cascades every linked record.`
      init = { method: 'DELETE' }
    } else {
      return
    }
    if (!confirm(confirmMsg)) return
    const res = await fetch(`/api/admin/users/${u.id}`, init)
    if (res.ok) { setNotice(`${kind === 'delete' ? 'Deleted' : kind[0].toUpperCase() + kind.slice(1) + 'ed'} ${u.full_name || u.email}.`); await load(); return }
    const body = await res.json().catch(() => ({}))
    if (res.status === 409 && Array.isArray(body.blockers) && body.blockers.length > 0) {
      setNotice(`Cannot delete ${u.full_name || u.email}: ${body.blockers[0].detail}`); return
    }
    setNotice(body.error || `Action failed (HTTP ${res.status}).`)
  }

  const eligibleApprove  = selectedUsers.filter(u => !isCurrentAdmin(u) && u.status === 'pending').length
  const eligibleActivate = selectedUsers.filter(u => !isCurrentAdmin(u) && u.status !== 'active').length
  const eligibleSuspend  = selectedUsers.filter(u => !isCurrentAdmin(u) && u.status === 'active').length
  const eligibleDelete   = selectedUsers.filter(u => !isCurrentAdmin(u)).length

  if (loading) return <div style={{ padding: '24px', color: C.textMuted, fontSize: '13px' }}>Loading {ROLE_LABEL[role].toLowerCase()}s…</div>
  if (error)   return <div style={{ padding: '24px', color: C.red, fontSize: '13px' }}>{error}</div>

  const Pill = ({ id, label, count }) => (
    <button type="button" onClick={() => { setStatusFilter(id); setSelectedRows(new Set()) }}
      style={{
        padding: '7px 14px', borderRadius: 999, fontSize: 12, fontFamily: 'inherit',
        border: `1px solid ${statusFilter === id ? C.cyan : C.border}`,
        background: statusFilter === id ? C.cyan : C.surface2,
        color: statusFilter === id ? '#fff' : C.text,
        fontWeight: 700, cursor: 'pointer',
      }}>
      {label}{typeof count === 'number' ? ` (${count})` : ''}
    </button>
  )

  const thStyle = (col, extra = {}) => ({
    padding: '12px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700,
    color: sortCol === col ? '#C4A45A' : 'rgba(255,255,255,0.70)',
    background: '#0F172A', whiteSpace: 'nowrap', cursor: col ? 'pointer' : 'default',
    letterSpacing: '0.06em', textTransform: 'uppercase', userSelect: 'none', ...extra,
  })
  const tdStyle = (extra = {}) => ({
    padding: '11px 14px', fontSize: '13px', color: C.text, borderBottom: `1px solid ${C.border}`,
    background: C.surface, ...extra,
  })

  return (
    <div style={{ padding: '20px 28px' }}>
      {notice && (
        <div style={{ marginBottom: '14px', padding: '10px 14px', background: `${C.cyan}10`, border: `1px solid ${C.cyan}33`, borderRadius: '10px', color: C.cyan, fontSize: '13px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
          <span style={{ whiteSpace: 'pre-wrap' }}>{notice}</span>
          <button type="button" onClick={() => setNotice('')} style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontWeight: 800 }}>×</button>
        </div>
      )}

      {/* Filter pills + search */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <Pill id="all"       label="All"        count={statusCounts.all} />
        <Pill id="active"    label="Active"     count={statusCounts.active} />
        <Pill id="pending"   label="Pending"    count={statusCounts.pending} />
        <Pill id="suspended" label="Suspended"  count={statusCounts.suspended} />
        <input
          type="search"
          placeholder={`Search ${ROLE_LABEL[role].toLowerCase()}s by name, email, country…`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{
            flex: 1, minWidth: '220px',
            padding: '8px 12px', borderRadius: '8px',
            border: `1px solid ${C.border}`, background: C.surface2,
            color: C.text, fontSize: '13px', fontFamily: 'inherit',
          }}
        />
        <span style={{ fontSize: '12px', color: C.textMuted }}>
          {visible.length} result{visible.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Bulk action bar */}
      {selectedRows.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          padding: '10px 14px', marginBottom: '14px',
          background: `${C.cyan}10`, border: `1px solid ${C.cyan}40`,
          borderRadius: '12px',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: C.cyan, marginRight: '4px' }}>
            {selectedUsers.length} selected
          </span>
          <Btn variant="success" size="sm" onClick={bulkApprove} disabled={bulkBusy}>
            Approve{eligibleApprove > 0 ? ` (${eligibleApprove})` : ''}
          </Btn>
          <Btn variant="success" size="sm" onClick={() => bulkUpdateStatus('active')} disabled={bulkBusy}>
            Activate{eligibleActivate > 0 ? ` (${eligibleActivate})` : ''}
          </Btn>
          <Btn variant="danger" size="sm" onClick={() => bulkUpdateStatus('suspended')} disabled={bulkBusy}>
            Suspend{eligibleSuspend > 0 ? ` (${eligibleSuspend})` : ''}
          </Btn>
          <Btn variant="danger" size="sm" onClick={bulkDelete} disabled={bulkBusy}>
            Delete{eligibleDelete > 0 ? ` (${eligibleDelete})` : ''}
          </Btn>
          <Btn variant="ghost" size="sm" onClick={bulkClear} disabled={bulkBusy}>Clear</Btn>
          {bulkBusy && <span style={{ fontSize: '12px', color: C.textMuted, marginLeft: 'auto' }}>Working…</span>}
        </div>
      )}

      {/* Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle('', { width: '40px', cursor: 'default', padding: '12px 10px 12px 16px' }) }}>
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll}
                    style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#C4A45A' }} />
                </th>
                <th style={thStyle('full_name')} onClick={() => handleSort('full_name')}>User</th>
                <th style={thStyle('country')}   onClick={() => handleSort('country')}>Country</th>
                <th style={thStyle('created_at')} onClick={() => handleSort('created_at')}>Joined</th>
                <th style={thStyle('status')}    onClick={() => handleSort('status')}>Status</th>
                <th style={thStyle('', { cursor: 'default' })}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle({ textAlign: 'center', color: C.textMuted, padding: '40px 14px' }) }}>
                    No {ROLE_LABEL[role].toLowerCase()}s match these filters.
                  </td>
                </tr>
              ) : visible.map((u) => {
                const isSelected = selectedRows.has(u.id)
                const isYou = isCurrentAdmin(u)
                const sp = STATUS_PILL[u.status] || STATUS_PILL.declined
                return (
                  <tr key={u.id} style={{ background: isSelected ? `${C.cyan}08` : C.surface }}>
                    <td style={tdStyle({ width: '40px', padding: '11px 10px 11px 16px' })}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleRow(u.id)}
                        style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#C4A45A' }} />
                    </td>
                    <td style={tdStyle()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Avatar name={u.full_name || u.email} size={34} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>{u.full_name || '—'}</div>
                          <div style={{ fontSize: '11px', color: C.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle({ color: C.textMuted })}>{u.country || '—'}</td>
                    <td style={tdStyle({ color: C.textMuted, whiteSpace: 'nowrap' })}>{fmtDate(u.created_at)}</td>
                    <td style={tdStyle()}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '3px 8px', borderRadius: '4px',
                        fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                        background: sp.bg, color: sp.fg,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: sp.dot, display: 'inline-block' }} />
                        {u.status}
                      </span>
                    </td>
                    <td style={tdStyle({ whiteSpace: 'nowrap' })}>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        {u.status === 'pending' && !isYou && (
                          <Btn variant="success" size="sm" onClick={() => rowAction(u, 'approve')}>Approve</Btn>
                        )}
                        {isYou ? (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: C.red, padding: '3px 8px', background: '#FEE2E2', borderRadius: '4px' }}>You</span>
                        ) : (
                          <Btn variant={u.status === 'active' ? 'danger' : 'success'} size="sm"
                            onClick={() => rowAction(u, u.status === 'active' ? 'suspend' : 'activate')}>
                            {u.status === 'active' ? 'Suspend' : 'Activate'}
                          </Btn>
                        )}
                        {!isYou && (
                          <Btn variant="danger" size="sm" onClick={() => rowAction(u, 'delete')}>Delete</Btn>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

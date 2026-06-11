'use client'
import React from 'react'

interface TemplateItem {
  id: string
  product_type: string
  slug: string
  title: string
  category: string
  region: string
  template_type: string
  price: number
  price_usd: number
  usd_price: number
  badge: string
  status: string
  delivery_type: string
  file_path: string
  delivery_days: number
  active: boolean
  orders: number
  short_description?: string
  full_description?: string
}

const C = {
  bg: '#F7F8FA',
  surface: '#FFFFFF',
  surface2: '#F4F2EE',
  surface3: '#EBEDF0',
  border: 'rgba(0,0,0,0.08)',
  cyan: '#3C3B6E',
  red: '#DC2626',
  green: '#166534',
  orange: '#D97706',
  purple: '#7C3AED',
  text: '#1F2937',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',
  serif: "var(--portal-font-display, 'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif)",
}

const adminSectionHeading = {
  fontFamily: C.serif, fontSize: '18px', fontWeight: 500, color: C.text,
  letterSpacing: '-0.005em', margin: '0 0 10px',
}

const STATUS_OPTIONS = ['active', 'draft', 'archived']

export default function AdminTemplates({
  services,
  refreshAdminData,
  setActionNotice,
}: {
  services: TemplateItem[]
  refreshAdminData: () => void
  setActionNotice: (msg: string) => void
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editForm, setEditForm] = React.useState<Partial<TemplateItem>>({})
  const [saving, setSaving] = React.useState(false)

  const templates = React.useMemo(
    () => services.filter(s => s.product_type === 'template'),
    [services]
  )

  const startEdit = (t: TemplateItem) => {
    setEditingId(t.id)
    setEditForm({
      title: t.title,
      price_usd: t.price_usd,
      badge: t.badge,
      status: t.status,
      short_description: t.short_description || '',
      region: t.region || templateRegionFromType(t.template_type || t.category),
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  const saveEdit = async (id: string) => {
    if (!editForm.title?.trim()) {
      setActionNotice('Title is required.')
      return
    }
    if (editForm.price_usd != null && (isNaN(editForm.price_usd) || editForm.price_usd < 0)) {
      setActionNotice('Price must be a valid number.')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        title: editForm.title,
        price_usd: Number(editForm.price_usd ?? 0),
        badge: editForm.badge || '',
        product_type: 'template',
        status: editForm.status || 'active',
        short_description: editForm.short_description || '',
        region: editForm.region || 'General',
        // Sync price fields for compatibility
        price: Number(editForm.price_usd ?? 0),
        usd_price: Number(editForm.price_usd ?? 0),
      }
      const res = await fetch(`/api/admin/services/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setActionNotice(`Template "${editForm.title}" updated.`)
      cancelEdit()
      refreshAdminData()
    } catch (e: any) {
      setActionNotice(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (t: TemplateItem) => {
    const nextStatus = t.status === 'active' ? 'draft' : 'active'
    try {
      const res = await fetch(`/api/admin/services/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, product_type: 'template' }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Update failed')
      setActionNotice(`"${t.title}" ${nextStatus === 'active' ? 'activated' : 'drafted'}.`)
      refreshAdminData()
    } catch (e: any) {
      setActionNotice(e.message || 'Failed to toggle status')
    }
  }

  const totalRevenue = templates.reduce((s, t) => s + (t.price_usd || 0), 0)
  const activeTemplates = templates.filter(t => t.status === 'active').length
  const draftTemplates = templates.filter(t => t.status === 'draft' || !t.active).length

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page header */}
      <div>
        <div style={{ color: C.textMuted, fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 800, marginBottom: '4px' }}>
          Marketplace
        </div>
        <h2 style={{ fontFamily: C.serif, fontSize: '30px', fontWeight: 500, color: C.text, letterSpacing: '-0.015em', margin: '0 0 6px' }}>
          Templates
        </h2>
        <p style={{ color: C.textMuted, fontSize: '13px', margin: 0 }}>
          {templates.length} template packs · {activeTemplates} active · {draftTemplates} draft
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
        {[
          { label: 'Total templates', value: templates.length, icon: '📄', color: C.cyan },
          { label: 'Active', value: activeTemplates, icon: '✅', color: C.green },
          { label: 'Draft / Inactive', value: draftTemplates, icon: '✏️', color: C.orange },
          { label: 'Total catalogue value', value: `$${totalRevenue}`, icon: '💰', color: C.purple },
        ].map(s => (
          <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '20px' }}>{s.icon}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color, fontFamily: C.serif }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Templates table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr style={{ background: '#0F172A' }}>
                {['Template', 'Slug', 'Price', 'Badge', 'Region', 'Status', 'Orders', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.70)', whiteSpace: 'nowrap', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '48px 24px', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>
                    No templates found in the catalogue.
                  </td>
                </tr>
              ) : templates.map((t, i) => {
                const isEditing = editingId === t.id
                const rowBg = i % 2 === 0 ? '#FFFFFF' : C.surface
                return (
                  <tr key={t.id} style={{ background: rowBg, borderBottom: `1px solid ${C.border}` }}>
                    {/* Template name */}
                    <td style={{ padding: '11px 14px' }}>
                      {isEditing ? (
                        <input
                          value={editForm.title || ''}
                          onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                          style={{ width: '100%', padding: '4px 8px', border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '13px', fontFamily: 'inherit' }}
                        />
                      ) : (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>{t.title}</div>
                          {t.template_type && <div style={{ fontSize: '11px', color: C.textMuted, marginTop: '1px' }}>{t.template_type}</div>}
                        </div>
                      )}
                    </td>

                    {/* Slug */}
                    <td style={{ padding: '11px 14px', fontSize: '12px', color: C.textDim, fontFamily: 'monospace' }}>{t.slug}</td>

                    {/* Price */}
                    <td style={{ padding: '11px 14px', fontWeight: 700, fontSize: '14px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                          <span style={{ fontSize: '12px', color: C.textMuted }}>$</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={editForm.price_usd ?? 0}
                            onChange={e => setEditForm(f => ({ ...f, price_usd: Number(e.target.value) }))}
                            style={{ width: '60px', padding: '4px 6px', border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '13px', fontFamily: 'inherit' }}
                          />
                        </div>
                      ) : (
                        <span style={{ color: C.cyan }}>${t.price_usd}</span>
                      )}
                    </td>

                    {/* Badge */}
                    <td style={{ padding: '11px 14px' }}>
                      {isEditing ? (
                        <input
                          value={editForm.badge || ''}
                          onChange={e => setEditForm(f => ({ ...f, badge: e.target.value }))}
                          placeholder="Badge text"
                          style={{ width: '100%', padding: '4px 8px', border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '12px', fontFamily: 'inherit' }}
                        />
                      ) : t.badge ? (
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: '#F5EDD6', color: '#7A6030' }}>
                          {t.badge}
                        </span>
                      ) : (
                        <span style={{ color: C.textDim, fontSize: '12px' }}>—</span>
                      )}
                    </td>

                    {/* Region/category */}
                    <td style={{ padding: '11px 14px', fontSize: '12px', color: C.textMuted }}>
                      {t.region || templateRegionFromType(t.template_type || t.category)}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '11px 14px' }}>
                      {isEditing ? (
                        <select
                          value={editForm.status || 'active'}
                          onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                          style={{ padding: '4px 6px', border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer' }}
                        >
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.04em',
                          background: t.status === 'active' ? '#DCFCE7' : t.status === 'draft' ? '#FEF9C3' : '#FEE2E2',
                          color: t.status === 'active' ? '#166534' : t.status === 'draft' ? '#854D0E' : '#991B1B',
                        }}>
                          <span style={{
                            width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block',
                            background: t.status === 'active' ? '#22C55E' : t.status === 'draft' ? '#EAB308' : '#EF4444',
                          }} />
                          {t.status}
                        </span>
                      )}
                    </td>

                    {/* Orders count */}
                    <td style={{ padding: '11px 14px', fontSize: '13px', fontWeight: 600, color: C.textMuted }}>
                      {t.orders || 0}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap' }}>
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(t.id)}
                              disabled={saving}
                              style={{
                                padding: '4px 10px', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
                                background: C.cyan, color: '#fff', border: 'none', borderRadius: '4px',
                                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                              }}
                            >
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={saving}
                              style={{
                                padding: '4px 10px', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
                                background: C.surface2, color: C.textMuted, border: `1px solid ${C.border}`,
                                borderRadius: '4px', cursor: 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(t)}
                              style={{
                                padding: '4px 10px', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
                                background: C.surface2, color: C.text, border: `1px solid ${C.border}`,
                                borderRadius: '4px', cursor: 'pointer',
                              }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => toggleStatus(t)}
                              style={{
                                padding: '4px 10px', fontSize: '12px', fontWeight: 600, fontFamily: 'inherit',
                                background: t.status === 'active' ? '#FEE2E2' : '#DCFCE7',
                                color: t.status === 'active' ? '#991B1B' : '#166534',
                                border: 'none', borderRadius: '4px', cursor: 'pointer',
                              }}
                            >
                              {t.status === 'active' ? 'Draft' : 'Activate'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Help text */}
      <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '14px 16px', fontSize: '13px', color: C.textMuted, lineHeight: 1.5 }}>
        <strong style={{ color: C.text }}>💡 About template management</strong>
        <br />
        Templates are stored in the <code style={{ background: C.surface3, padding: '1px 5px', borderRadius: '3px', fontSize: '12px' }}>services</code> table with <code style={{ background: C.surface3, padding: '1px 5px', borderRadius: '3px', fontSize: '12px' }}>product_type = 'template'</code>.
        Edit name, price, badge, and status here. To manage fillable PDF manifests, use the <strong>PDF Maker</strong> tool in the sidebar.
        New templates require deploying code changes to add catalogue entries, manifests, and delivery files.
      </div>
    </div>
  )
}

function templateRegionFromType(value: string): string {
  const text = String(value || '').toLowerCase()
  if (text.includes('canada')) return 'Canada'
  if (text.includes('usa') || text.includes('us ')) return 'USA'
  return 'General'
}

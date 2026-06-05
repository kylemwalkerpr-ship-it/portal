'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type FieldType = 'text' | 'multiline' | 'checkbox' | 'date' | 'select' | 'signature'

interface Field {
  id: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string
  options?: string[]
  help?: string
  rows?: number
}
interface Section {
  title: string
  intro?: string
  fields: Field[]
}
interface Manifest {
  slug: string
  pageSize?: 'LETTER' | 'A4'
  sections: Section[]
}

interface SlugRow { slug: string; name: string; badge: string; hasManifest: boolean }

const TYPES: FieldType[] = ['text', 'multiline', 'checkbox', 'date', 'select', 'signature']

export default function PdfMakerClient({ slugs }: { slugs: SlugRow[] }) {
  const [selectedSlug, setSelectedSlug] = useState<string>(slugs[0]?.slug ?? '')
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [loading, setLoading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string>('')
  const [error, setError] = useState<string>('')
  const previewBlobRef = useRef<string | null>(null)

  // Load manifest on slug change
  useEffect(() => {
    if (!selectedSlug) return
    setError('')
    setLoading(true)
    fetch(`/api/admin/templates/manifest/${selectedSlug}`)
      .then((r) => r.json())
      .then((res) => {
        if (res?.data?.manifest) setManifest(res.data.manifest as Manifest)
        else setError(res?.error?.message || 'Manifest not found.')
      })
      .catch((e) => setError(e?.message || 'Load failed.'))
      .finally(() => setLoading(false))
  }, [selectedSlug])

  // Debounced render whenever the manifest changes
  const renderPdf = useCallback(async (m: Manifest) => {
    const slugRow = slugs.find((s) => s.slug === m.slug)
    const res = await fetch('/api/admin/templates/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manifest: m,
        prefillValues: {
          client_full_name: 'Sample Applicant',
          client_email: 'sample@example.com',
          date_prepared: new Date().toISOString().slice(0, 10),
        },
        meta: {
          templateName: slugRow?.name || m.slug,
          templateBadge: slugRow?.badge,
          userFullName: 'Sample Applicant',
          userEmail: 'sample@example.com',
          orderId: 'preview-order',
        },
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j?.error?.message || 'Render failed.')
      return
    }
    const blob = await res.blob()
    if (previewBlobRef.current) URL.revokeObjectURL(previewBlobRef.current)
    const url = URL.createObjectURL(blob)
    previewBlobRef.current = url
    setPdfUrl(url)
  }, [slugs])

  useEffect(() => {
    if (!manifest) return
    const t = window.setTimeout(() => { renderPdf(manifest).catch(() => {}) }, 600)
    return () => window.clearTimeout(t)
  }, [manifest, renderPdf])

  const updateSection = (idx: number, patch: Partial<Section>) => {
    if (!manifest) return
    const next = { ...manifest, sections: [...manifest.sections] }
    next.sections[idx] = { ...next.sections[idx], ...patch }
    setManifest(next)
  }
  const updateField = (sIdx: number, fIdx: number, patch: Partial<Field>) => {
    if (!manifest) return
    const next = { ...manifest, sections: [...manifest.sections] }
    const sec = { ...next.sections[sIdx], fields: [...next.sections[sIdx].fields] }
    sec.fields[fIdx] = { ...sec.fields[fIdx], ...patch }
    next.sections[sIdx] = sec
    setManifest(next)
  }
  const addField = (sIdx: number) => {
    if (!manifest) return
    const next = { ...manifest, sections: [...manifest.sections] }
    const sec = { ...next.sections[sIdx], fields: [...next.sections[sIdx].fields] }
    sec.fields.push({ id: `new_field_${Date.now()}`, label: 'New field', type: 'text' })
    next.sections[sIdx] = sec
    setManifest(next)
  }
  const removeField = (sIdx: number, fIdx: number) => {
    if (!manifest) return
    const next = { ...manifest, sections: [...manifest.sections] }
    const sec = { ...next.sections[sIdx], fields: next.sections[sIdx].fields.filter((_, i) => i !== fIdx) }
    next.sections[sIdx] = sec
    setManifest(next)
  }
  const moveField = (sIdx: number, fIdx: number, dir: -1 | 1) => {
    if (!manifest) return
    const fields = [...manifest.sections[sIdx].fields]
    const j = fIdx + dir
    if (j < 0 || j >= fields.length) return
    const tmp = fields[fIdx]
    fields[fIdx] = fields[j]
    fields[j] = tmp
    const next = { ...manifest, sections: [...manifest.sections] }
    next.sections[sIdx] = { ...next.sections[sIdx], fields }
    setManifest(next)
  }
  const exportJson = () => {
    if (!manifest) return
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${manifest.slug}.manifest.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const slugOptions = useMemo(() => slugs, [slugs])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* LEFT pane — editor */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, overflow: 'auto', maxHeight: 'calc(100vh - 140px)' }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontWeight: 600 }}>Template slug</label>
          <select
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            style={{ width: '100%', padding: 6, marginTop: 4 }}
          >
            {slugOptions.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name} {s.hasManifest ? '' : '(fallback)'}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={exportJson} disabled={!manifest} style={btnPrimary}>Export manifest JSON</button>
          <button onClick={() => manifest && renderPdf(manifest)} disabled={!manifest} style={btnSecondary}>Re-render</button>
        </div>
        {error && <p style={{ color: '#b00020' }}>{error}</p>}
        {loading && <p>Loading…</p>}
        {manifest?.sections.map((section, sIdx) => (
          <div key={sIdx} style={{ border: '1px solid #eee', borderRadius: 6, padding: 10, marginBottom: 12 }}>
            <input
              value={section.title}
              onChange={(e) => updateSection(sIdx, { title: e.target.value })}
              style={{ width: '100%', fontWeight: 700, fontSize: 15, marginBottom: 6, border: 'none', borderBottom: '1px solid #ccc' }}
            />
            <textarea
              value={section.intro ?? ''}
              placeholder="Section intro (optional)"
              onChange={(e) => updateSection(sIdx, { intro: e.target.value })}
              style={{ width: '100%', minHeight: 36, marginBottom: 8 }}
            />
            {section.fields.map((field, fIdx) => (
              <div key={fIdx} style={{ borderTop: '1px dashed #ccc', padding: '6px 0' }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    value={field.id}
                    onChange={(e) => updateField(sIdx, fIdx, { id: e.target.value })}
                    placeholder="field_id"
                    style={{ width: 160, fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <input
                    value={field.label}
                    onChange={(e) => updateField(sIdx, fIdx, { label: e.target.value })}
                    placeholder="Label"
                    style={{ flex: 1, fontSize: 13 }}
                  />
                  <select
                    value={field.type}
                    onChange={(e) => updateField(sIdx, fIdx, { type: e.target.value as FieldType })}
                    style={{ fontSize: 12 }}
                  >
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <label style={{ fontSize: 11 }}>
                    <input
                      type="checkbox"
                      checked={!!field.required}
                      onChange={(e) => updateField(sIdx, fIdx, { required: e.target.checked })}
                    />
                    req
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <input
                    value={field.placeholder ?? ''}
                    placeholder="placeholder"
                    onChange={(e) => updateField(sIdx, fIdx, { placeholder: e.target.value })}
                    style={{ flex: 1, fontSize: 12 }}
                  />
                  <input
                    value={field.help ?? ''}
                    placeholder="help text"
                    onChange={(e) => updateField(sIdx, fIdx, { help: e.target.value })}
                    style={{ flex: 1, fontSize: 12 }}
                  />
                  <button onClick={() => moveField(sIdx, fIdx, -1)} style={btnTiny}>up</button>
                  <button onClick={() => moveField(sIdx, fIdx, 1)} style={btnTiny}>dn</button>
                  <button onClick={() => removeField(sIdx, fIdx)} style={{ ...btnTiny, color: '#b00020' }}>x</button>
                </div>
              </div>
            ))}
            <button onClick={() => addField(sIdx)} style={{ ...btnSecondary, marginTop: 8 }}>+ Add field</button>
          </div>
        ))}
      </div>

      {/* RIGHT pane — preview */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden', height: 'calc(100vh - 140px)' }}>
        {pdfUrl ? (
          <iframe src={pdfUrl} title="PDF preview" style={{ width: '100%', height: '100%', border: 'none' }} />
        ) : (
          <div style={{ padding: 24, color: '#666' }}>Preview will appear after the manifest loads.</div>
        )}
      </div>
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  padding: '6px 12px', background: '#0b4a8f', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  padding: '6px 12px', background: '#eee', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer',
}
const btnTiny: React.CSSProperties = {
  padding: '2px 6px', background: '#fafafa', border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer', fontSize: 11,
}

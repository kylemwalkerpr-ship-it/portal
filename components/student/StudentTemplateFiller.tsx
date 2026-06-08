'use client'

import React from 'react'

// ── AI suggestion helper ───────────────────────────────────────────
// Calls the same chatProvider chain as profileSuggest (Groq → Gemini → Cloudflare AI)
// to generate intelligent suggestions for form fields based on the student's profile.

async function aiSuggest(slug: string, fieldId: string, fieldLabel: string, currentValue: string, profileData: string) {
  try {
    const res = await fetch('/api/templates/fill/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, fieldId, fieldLabel, currentValue, profileData }),
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d?.error || 'AI suggest failed')
    return d.data?.suggestion || ''
  } catch {
    return ''
  }
}

// ── Design tokens ──────────────────────────────────────────────────
const C = {
  bg: '#F7F5F0',
  surface: '#FFFFFF',
  surfaceHover: '#FAF9F5',
  border: '#E8E4DC',
  borderFocus: '#3C3B6E',
  text: '#1A1F2E',
  textMuted: '#5C6070',
  textDim: '#9097A8',
  brand: '#3C3B6E',
  brandLight: '#EBEAF3',
  accent: '#9A7B3B',
  accentLight: '#F5F0E7',
  success: '#1A6B45',
  successBg: '#E8F5EE',
  danger: '#8B1A1A',
  dangerBg: '#FAEAEA',
  rule: '#DDD8CE',
}

const SANS = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"
const SERIF = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"

// ── Types ──────────────────────────────────────────────────────────

interface ManifestField {
  id: string
  label: string
  type: 'text' | 'multiline' | 'checkbox' | 'date' | 'select' | 'signature'
  required?: boolean
  placeholder?: string
  options?: string[]
  help?: string
  rows?: number
}

interface ManifestSection {
  title: string
  intro?: string
  fields: ManifestField[]
}

interface TemplateEntitlement {
  slug: string
  name: string
  category: string
  short_description: string
  includes: string[]
  purchased_at: string
  order_id: string
  downloadHref: string
}

// ── Helpers ────────────────────────────────────────────────────────

function snake(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]+/g, '_').toLowerCase()
}

function classNames(...args: (string | boolean | undefined | null)[]): string {
  return args.filter(Boolean).join(' ')
}

// ── Styles ─────────────────────────────────────────────────────────

const styles = {
  // Main container
  container: {
    minHeight: 'calc(100vh - 60px)',
    background: C.bg,
    fontFamily: SANS,
    color: C.text,
  } as React.CSSProperties,

  // Header
  headerBar: {
    background: C.surface,
    borderBottom: `1px solid ${C.rule}`,
    padding: '20px 28px',
  } as React.CSSProperties,

  headerTitle: {
    fontFamily: SERIF,
    fontSize: 'clamp(22px, 3vw, 28px)',
    fontWeight: 600,
    color: C.text,
    margin: 0,
    letterSpacing: '-0.015em',
  } as React.CSSProperties,

  headerSub: {
    fontSize: '13px',
    color: C.textMuted,
    margin: '4px 0 0',
  } as React.CSSProperties,

  // Content area
  content: {
    maxWidth: '880px',
    margin: '0 auto',
    padding: '28px 24px 100px',
  } as React.CSSProperties,

  // Template cards (selector grid)
  selectorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '12px',
    marginBottom: '28px',
  } as React.CSSProperties,

  selectorCard: (active: boolean) => ({
    background: active ? '#FFFFFF' : C.surface,
    border: `1px solid ${active ? C.brand : C.border}`,
    borderLeft: active ? `3px solid ${C.accent}` : `3px solid ${C.border}`,
    borderRadius: '10px',
    padding: '16px 18px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    position: 'relative' as const,
    boxShadow: active ? '0 2px 8px rgba(60,59,110,0.08)' : '0 1px 3px rgba(15,23,42,0.04)',
  }),

  selectorCardHover: {
    borderColor: C.brand,
    boxShadow: '0 2px 8px rgba(60,59,110,0.08)',
  } as React.CSSProperties,

  cardBadge: (bg: string, fg: string) => ({
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 7px',
    borderRadius: '4px',
    background: bg,
    color: fg,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    display: 'inline-block',
    marginBottom: '6px',
  }),

  cardName: {
    fontFamily: SERIF,
    fontSize: '16px',
    fontWeight: 600,
    color: C.text,
    margin: '0 0 3px',
    lineHeight: 1.25,
  } as React.CSSProperties,

  cardDesc: {
    fontSize: '12px',
    color: C.textMuted,
    lineHeight: 1.5,
    margin: 0,
  } as React.CSSProperties,

  cardCheck: {
    position: 'absolute' as const,
    top: '12px',
    right: '12px',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    background: C.brand,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 700,
  },

  cardDate: {
    fontSize: '10px',
    color: C.textDim,
    marginTop: '8px',
    paddingTop: '6px',
    borderTop: `1px solid ${C.border}`,
  } as React.CSSProperties,

  // Form section
  sectionCard: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: '10px',
    overflow: 'hidden',
    marginBottom: '16px',
    boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
  } as React.CSSProperties,

  sectionHeader: (open: boolean) => ({
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    borderBottom: open ? `1px solid ${C.border}` : 'none',
    transition: 'background 0.12s ease',
  } as React.CSSProperties),

  sectionTitle: {
    fontFamily: SERIF,
    fontSize: '17px',
    fontWeight: 600,
    color: C.text,
    margin: 0,
    letterSpacing: '-0.01em',
  } as React.CSSProperties,

  sectionIntro: {
    fontSize: '12.5px',
    color: C.textMuted,
    lineHeight: 1.55,
    padding: '0 20px 12px',
    margin: 0,
  } as React.CSSProperties,

  sectionBody: {
    padding: '8px 20px 20px',
  } as React.CSSProperties,

  chevron: (open: boolean) => ({
    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
    transition: 'transform 0.2s ease',
    fontSize: '12px',
    color: C.textDim,
  } as React.CSSProperties),

  // Fields
  fieldGroup: {
    marginBottom: '16px',
  } as React.CSSProperties,

  fieldLabel: {
    display: 'block',
    fontSize: '12.5px',
    fontWeight: 600,
    color: C.text,
    marginBottom: '5px',
    letterSpacing: '0.01em',
  } as React.CSSProperties,

  fieldRequired: {
    color: C.danger,
    marginLeft: '2px',
  } as React.CSSProperties,

  fieldInput: {
    width: '100%',
    padding: '9px 12px',
    fontSize: '13px',
    border: `1px solid ${C.border}`,
    borderRadius: '6px',
    background: C.bg,
    color: C.text,
    fontFamily: SANS,
    outline: 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    boxSizing: 'border-box' as const,
    lineHeight: 1.4,
  } as React.CSSProperties,

  fieldTextarea: (rows: number) => ({
    width: '100%',
    padding: '9px 12px',
    fontSize: '13px',
    border: `1px solid ${C.border}`,
    borderRadius: '6px',
    background: C.bg,
    color: C.text,
    fontFamily: SANS,
    outline: 'none',
    resize: 'vertical' as const,
    minHeight: `${rows * 22 + 18}px`,
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    boxSizing: 'border-box' as const,
    lineHeight: 1.5,
  }),

  fieldSelect: {
    width: '100%',
    padding: '9px 12px',
    fontSize: '13px',
    border: `1px solid ${C.border}`,
    borderRadius: '6px',
    background: C.bg,
    color: C.text,
    fontFamily: SANS,
    outline: 'none',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    boxSizing: 'border-box' as const,
    cursor: 'pointer',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='%235C6070'%3E%3Cpath d='M6 8L0 0h12z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: '32px',
  } as React.CSSProperties,

  fieldCheckbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 0',
    cursor: 'pointer',
  } as React.CSSProperties,

  fieldCheckboxInput: {
    width: '16px',
    height: '16px',
    accentColor: C.brand,
    cursor: 'pointer',
  } as React.CSSProperties,

  fieldHelp: {
    fontSize: '11px',
    color: C.textDim,
    marginTop: '4px',
    lineHeight: 1.45,
  } as React.CSSProperties,

  // Action bar
  actionBar: {
    position: 'fixed' as const,
    bottom: 0,
    left: '241px',
    right: 0,
    background: C.surface,
    borderTop: `1px solid ${C.rule}`,
    padding: '12px 28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap' as const,
    boxShadow: '0 -2px 12px rgba(15,23,42,0.06)',
    zIndex: 50,
  } as React.CSSProperties,

  actionBtnPrimary: {
    padding: '10px 22px',
    background: C.brand,
    color: '#fff',
    fontSize: '13px',
    fontWeight: 700,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: SANS,
    letterSpacing: '0.01em',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'background 0.12s ease, transform 0.1s ease',
  } as React.CSSProperties,

  actionBtnSecondary: {
    padding: '10px 22px',
    background: 'transparent',
    color: C.text,
    fontSize: '13px',
    fontWeight: 600,
    border: `1px solid ${C.border}`,
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: SANS,
    letterSpacing: '0.01em',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'border-color 0.12s ease, background 0.12s ease',
  } as React.CSSProperties,

  actionBtnLink: {
    padding: '10px 22px',
    background: 'transparent',
    color: C.brand,
    fontSize: '13px',
    fontWeight: 600,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: SANS,
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  } as React.CSSProperties,

  // No templates state
  emptyState: {
    padding: '60px 24px',
    background: C.surface,
    border: `1px dashed ${C.rule}`,
    borderRadius: '10px',
    textAlign: 'center' as const,
  } as React.CSSProperties,

  emptyIcon: {
    fontSize: '40px',
    marginBottom: '14px',
  } as React.CSSProperties,

  emptyTitle: {
    fontFamily: SERIF,
    fontSize: '20px',
    fontWeight: 600,
    color: C.text,
    margin: '0 0 8px',
  } as React.CSSProperties,

  emptyDesc: {
    fontSize: '14px',
    color: C.textMuted,
    lineHeight: 1.55,
    margin: '0 auto 20px',
    maxWidth: '420px',
  } as React.CSSProperties,

  emptyLink: {
    display: 'inline-block',
    padding: '10px 22px',
    background: C.text,
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    borderRadius: '6px',
    textDecoration: 'none',
  } as React.CSSProperties,

  // Loading
  loadingDots: {
    padding: '48px',
    textAlign: 'center' as const,
    color: C.textMuted,
    fontSize: '14px',
  } as React.CSSProperties,

  // Toast
  toast: {
    position: 'fixed' as const,
    top: '60px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: C.success,
    color: '#fff',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    boxShadow: '0 4px 16px rgba(26,107,69,0.25)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    animation: 'slideDown 0.25s ease',
  } as React.CSSProperties,

  // Section divider with "X fields" count
  fieldCount: {
    fontSize: '11px',
    color: C.textDim,
    fontWeight: 500,
  } as React.CSSProperties,
}

// ── Field Component ───────────────────────────────────────────────

function FormField({
  field,
  value,
  onChange,
  onAiSuggest,
  suggesting,
}: {
  field: ManifestField
  value: string | boolean
  onChange: (id: string, value: string | boolean) => void
  onAiSuggest?: (fieldId: string, fieldLabel: string) => void
  suggesting?: string | null
}) {
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)
  const [focused, setFocused] = React.useState(false)

  const handleFocus = () => setFocused(true)
  const handleBlur = () => setFocused(false)

  const inputStyle = {
    ...(field.type === 'multiline'
      ? styles.fieldTextarea(field.rows ?? 3)
      : field.type === 'select'
        ? styles.fieldSelect
        : styles.fieldInput),
    ...(focused ? {
      borderColor: C.borderFocus,
      boxShadow: '0 0 0 3px rgba(60,59,110,0.1)',
      background: '#FFFFFF',
    } : {}),
  }

  const renderInput = () => {
    switch (field.type) {
      case 'multiline':
        return (
          <textarea
            ref={inputRef as React.Ref<HTMLTextAreaElement>}
            value={value as string}
            onChange={(e) => onChange(field.id, e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={field.placeholder ?? ''}
            style={inputStyle}
            rows={field.rows ?? 3}
          />
        )

      case 'select':
        return (
          <select
            ref={inputRef as React.Ref<HTMLSelectElement>}
            value={value as string}
            onChange={(e) => onChange(field.id, e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={inputStyle}
          >
            <option value="">{field.placeholder ?? `Select ${field.label.toLowerCase()}…`}</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )

      case 'checkbox':
        return (
          <label style={styles.fieldCheckbox}>
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => onChange(field.id, e.target.checked)}
              style={styles.fieldCheckboxInput}
            />
            <span style={{ fontSize: '13px', color: C.textMuted }}>
              {field.placeholder || 'Check if applicable'}
            </span>
          </label>
        )

      case 'date':
        return (
          <input
            ref={inputRef as React.Ref<HTMLInputElement>}
            type="date"
            value={value as string}
            onChange={(e) => onChange(field.id, e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={inputStyle}
          />
        )

      case 'signature':
        return (
          <div>
            <input
              ref={inputRef as React.Ref<HTMLInputElement>}
              type="text"
              value={value as string}
              onChange={(e) => onChange(field.id, e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder={field.placeholder ?? 'Type your signature'}
              style={inputStyle}
            />
            <div style={{ fontSize: '11px', color: C.textDim, marginTop: '3px' }}>
              ✍️ Type your signature above. You will sign the printed PDF by hand.
            </div>
          </div>
        )

      default:
        return (
          <input
            ref={inputRef as React.Ref<HTMLInputElement>}
            type="text"
            value={value as string}
            onChange={(e) => onChange(field.id, e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={field.placeholder ?? ''}
            style={inputStyle}
          />
        )
    }
  }

  return (
    <div style={styles.fieldGroup}>              <label style={{ ...styles.fieldLabel, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>
          {field.label}
          {field.required && <span style={styles.fieldRequired}>*</span>}
        </span>
        <button
          type="button"
          onClick={() => onAiSuggest?.(field.id, field.label)}
          title="AI-suggest this field from your profile"
          disabled={suggesting === field.id}
          style={{
            background: 'none',
            border: '1px solid #DDD8CE',
            borderRadius: '4px',
            padding: '2px 6px',
            fontSize: '10px',
            fontWeight: 600,
            color: '#5C6070',
            cursor: 'pointer',
            fontFamily: SANS,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = '#9A7B3B'
            ;(e.currentTarget as HTMLElement).style.color = '#9A7B3B'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = '#DDD8CE'
            ;(e.currentTarget as HTMLElement).style.color = '#5C6070'
          }}
        >            {suggesting === field.id ? '⏳' : '✨'} {suggesting === field.id ? 'AI…' : 'AI'}
          </button>
        </label>
      {renderInput()}
      {field.help && <p style={styles.fieldHelp}>{field.help}</p>}
    </div>
  )
}

// ── Section Card Component ────────────────────────────────────────

function SectionCard({
  section,
  index,
  values,
  onFieldChange,
  onAiSuggest,
  suggesting,
  defaultOpen,
}: {
  section: ManifestSection
  index: number
  values: Record<string, string | boolean>
  onFieldChange: (id: string, value: string | boolean) => void
  onAiSuggest?: (fieldId: string, fieldLabel: string) => void
  suggesting?: string | null
  defaultOpen: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <div style={styles.sectionCard}>
      <div
        style={styles.sectionHeader(open)}
        onClick={() => setOpen(!open)}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = C.surfaceHover
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'transparent'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <h3 style={styles.sectionTitle}>{section.title}</h3>
          <span style={styles.fieldCount}>
            {section.fields.length} field{section.fields.length !== 1 ? 's' : ''}
          </span>
        </div>
        <span style={styles.chevron(open)}>▼</span>
      </div>

      {open && (
        <>
          {section.intro && <p style={styles.sectionIntro}>{section.intro}</p>}
          <div style={styles.sectionBody}>
            {section.fields.map((field) => (              <FormField
                  key={field.id}
                  field={field}
                  value={values[field.id] ?? (field.type === 'checkbox' ? false : '')}
                  onChange={onFieldChange}
                  onAiSuggest={onAiSuggest}
                  suggesting={suggesting}
                />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────

export default function StudentTemplateFiller({
  paidTemplates: propTemplates,
  autoSelectSlug,
}: {
  paidTemplates?: TemplateEntitlement[]
  autoSelectSlug?: string | null
}) {
  const [templates, setTemplates] = React.useState<TemplateEntitlement[]>(propTemplates ?? [])
  const [selectedSlug, setSelectedSlug] = React.useState<string | null>(
    autoSelectSlug || (propTemplates?.[0]?.slug ?? null),
  )
  const [sections, setSections] = React.useState<ManifestSection[]>([])
  const [values, setValues] = React.useState<Record<string, string | boolean>>({})
  const [loading, setLoading] = React.useState(!propTemplates)
  const [manifestLoading, setManifestLoading] = React.useState(false)
  const [generating, setGenerating] = React.useState<'filled' | 'blank' | null>(null)
  const [toast, setToast] = React.useState<string | null>(null)
  const [hoveredCard, setHoveredCard] = React.useState<string | null>(null)

  // ── Fill session state ─────────────────────────────────────────────
  const [fillSessionId, setFillSessionId] = React.useState<string | null>(null)
  const [suggesting, setSuggesting] = React.useState<string | null>(null)
  const [profileDataForAI, setProfileDataForAI] = React.useState('')

  // Fetch paid templates on mount (only if not passed as prop)
  React.useEffect(() => {
    if (propTemplates) {
      setLoading(false)
      return
    }
    fetch('/api/profile/template-downloads')
      .then((r) => r.json())
      .then((d) => {
        const items: TemplateEntitlement[] = d.data?.entitlements ?? []
        setTemplates(items)
        if (items.length > 0 && !selectedSlug) {
          setSelectedSlug(items[0].slug)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [propTemplates, selectedSlug])

  // Fetch profile data once for AI suggestions
  React.useEffect(() => {
    fetch('/api/student/home', { credentials: 'same-origin' })
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        if (d?.profile) {
          const p = d.profile
          setProfileDataForAI(
            `Full name: ${p.full_name || ''}\nEmail: ${p.email || ''}\nCountry: ${p.country_code || p.country || ''}\nPhone: ${p.phone || ''}`
          )
        }
      })
      .catch(() => {})
  }, [])

  // Fetch manifest when selected slug changes
  React.useEffect(() => {
    if (!selectedSlug) {
      setSections([])
      setValues({})
      setFillSessionId(null)
      return
    }
    setManifestLoading(true)
    fetch(`/api/student/templates/manifest/${encodeURIComponent(selectedSlug)}`)
      .then((r) => r.json())
      .then((d) => {
        const s = d.data?.sections ?? []
        setSections(s)
        // Reset form values when switching templates
        setValues({})
        setFillSessionId(null)
        setManifestLoading(false)
        // Auto-start a fill session
        if (s.length > 0) {
          const { slug: sessionSlug, fillData } = d.data
          if (fillData && Object.keys(fillData).length > 0) {
            setValues(fillData as Record<string, string | boolean>)
          }
          // Start a fill session via the API
          fetch('/api/templates/fill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'start',
              slug: selectedSlug,
            }),
          })
            .then((r) => r.json())
            .then((res) => {
              if (res?.data?.sessionId) {
                setFillSessionId(res.data.sessionId)
                if (res.data.fillData) {
                  setValues(res.data.fillData as Record<string, string | boolean>)
                }
              }
            })
            .catch(() => {})
        }
      })
      .catch(() => {
        setSections([])
        setManifestLoading(false)
      })
  }, [selectedSlug])

  // Auto-save draft on value changes (debounced 2s)
  const autoSaveRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    if (!fillSessionId || Object.keys(values).length === 0) return
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(() => {
      fetch('/api/templates/fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          sessionId: fillSessionId,
          fillData: Object.fromEntries(
            Object.entries(values).map(([k, v]) => [k, String(v)])
          ),
        }),
      }).catch(() => {})
    }, 2000)
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current)
    }
  }, [values, fillSessionId])

  const handleFieldChange = React.useCallback((id: string, val: string | boolean) => {
    setValues((prev) => ({ ...prev, [id]: val }))
  }, [])

  // AI suggestion for a specific field
  const handleAiSuggest = React.useCallback(async (fieldId: string, fieldLabel: string) => {
    if (suggesting) return
    setSuggesting(fieldId)
    try {
      const suggestion = await aiSuggest(
        selectedSlug!,
        fieldId,
        fieldLabel,
        String(values[fieldId] || ''),
        profileDataForAI,
      )
      if (suggestion) {
        setValues((prev) => ({ ...prev, [fieldId]: suggestion }))
        showToast('✨ AI suggestion applied')
      }
    } finally {
      setSuggesting(null)
    }
  }, [selectedSlug, values, profileDataForAI, suggesting])

  const selectedTemplate = templates.find((t) => t.slug === selectedSlug)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const handleDownload = async (mode: 'filled' | 'blank') => {
    if (!selectedSlug) return
    setGenerating(mode)

    try {
      const body: { slug: string; blank?: boolean; formValues?: Record<string, string> } = {
        slug: selectedSlug,
        blank: mode === 'blank',
      }
      if (mode === 'filled') {
        // Convert boolean values back to strings for the render endpoint
        body.formValues = Object.fromEntries(
          Object.entries(values).map(([k, v]) => [k, String(v)]),
        )
      }

      const res = await fetch('/api/student/templates/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: 'Download failed.' } }))
        throw new Error(err.error?.message || 'Download failed.')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = mode === 'blank'
        ? `${selectedSlug}-blank.pdf`
        : `${selectedSlug}-filled.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      showToast(mode === 'blank'
        ? '✅ Blank PDF downloaded — fill it by hand or in your PDF reader.'
        : '✅ Filled PDF downloaded — your entries have been embedded.')
    } catch (e) {
      showToast(`❌ ${e instanceof Error ? e.message : 'Download failed.'}`)
    } finally {
      setGenerating(null)
    }
  }

  // ── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingDots}>Loading your templates…</div>
      </div>
    )
  }

  const selected = templates.find((t) => t.slug === selectedSlug)

  return (
    <div style={styles.container}>
      {/* Toast notification */}
      {toast && (
        <div style={styles.toast}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={styles.headerBar}>
        <h1 style={styles.headerTitle}>
          Template Filler
        </h1>
        <p style={styles.headerSub}>
          {templates.length > 0
            ? `You have ${templates.length} template pack${templates.length !== 1 ? 's' : ''} to work with.`
            : 'Purchase a template pack to get started.'}
        </p>
      </div>

      <div style={styles.content}>
        {templates.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📂</div>
            <h2 style={styles.emptyTitle}>No template packs yet</h2>
            <p style={styles.emptyDesc}>
              Purchase a template pack to access fillable worksheets, checklists, and
              document organizers — pre-filled with your details or printed blank.
            </p>
            <a href="/marketplace/templates" style={styles.emptyLink}>
              Browse template packs →
            </a>
          </div>
        ) : (
          <>
            {/* Template selector */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ ...styles.fieldLabel, fontSize: '13px', marginBottom: '10px' }}>
                Select a template pack to fill
              </label>
              <div style={styles.selectorGrid}>
                {templates.map((t) => (
                  <div
                    key={t.slug}
                    style={{
                      ...styles.selectorCard(t.slug === selectedSlug),
                      ...(hoveredCard === t.slug && t.slug !== selectedSlug ? styles.selectorCardHover : {}),
                    }}
                    onClick={() => setSelectedSlug(t.slug)}
                    onMouseEnter={() => setHoveredCard(t.slug)}
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    <span style={styles.cardBadge(
                      t.category === 'US' || t.category === 'USA' ? '#E8E0F0' : '#EAF5EE',
                      t.category === 'US' || t.category === 'USA' ? '#3C2D6E' : '#1A6B45',
                    )}>
                      {t.category}
                    </span>
                    {t.slug === selectedSlug && (
                      <div style={styles.cardCheck}>✓</div>
                    )}
                    <h3 style={styles.cardName}>{t.name}</h3>
                    <p style={styles.cardDesc}>{t.short_description}</p>
                    <div style={styles.cardDate}>
                      Purchased {t.purchased_at ? new Date(t.purchased_at).toLocaleDateString() : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Manifest sections form */}
            {manifestLoading ? (
              <div style={styles.loadingDots}>Loading form…</div>
            ) : sections.length === 0 && selectedSlug ? (
              <div style={styles.emptyState}>
                <div style={{ fontSize: '28px', marginBottom: '10px' }}>📝</div>
                <h3 style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: 600, color: C.text, margin: '0 0 6px' }}>
                  No fillable form available
                </h3>
                <p style={{ fontSize: '13px', color: C.textMuted, margin: '0 0 16px' }}>
                  This template doesn&apos;t have a structured worksheet yet. You can still download the blank pack.
                </p>
                <a
                  href={selected?.downloadHref ?? '#'}
                  style={styles.emptyLink}
                >
                  ↓ Download pack
                </a>
              </div>
            ) : sections.length > 0 && selectedSlug ? (
              <>
                {/* Form sections */}
                {sections.map((section, i) => (                    <SectionCard
                      key={section.title}
                      section={section}
                      index={i}
                      values={values}
                      onFieldChange={handleFieldChange}
                      onAiSuggest={handleAiSuggest}
                      suggesting={suggesting}
                      defaultOpen={i < 2} // First 2 sections open by default
                  />
                ))}

                {/* Selected template info summary */}
                {selected && (
                  <details
                    style={{
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: '10px',
                      padding: '14px 20px',
                      marginTop: '20px',
                      fontSize: '13px',
                      color: C.textMuted,
                      lineHeight: 1.6,
                    }}
                  >
                    <summary style={{ cursor: 'pointer', fontWeight: 600, color: C.text, fontSize: '13px' }}>
                      About &ldquo;{selected.name}&rdquo;
                    </summary>
                    <div style={{ marginTop: '10px' }}>
                      <p style={{ margin: '0 0 8px' }}>{selected.short_description}</p>
                      {selected.includes.length > 0 && (
                        <>
                          <strong style={{ color: C.text, fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                            What&apos;s included ({selected.includes.length} items):
                          </strong>
                          <ul style={{ margin: 0, paddingLeft: '18px' }}>
                            {selected.includes.map((inc, i) => (
                              <li key={i} style={{ lineHeight: 1.6 }}>{inc}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </details>
                )}
              </>
            ) : null}
          </>
        )}
      </div>

      {/* Fixed action bar */}
      {selectedSlug && sections.length > 0 && (
        <div style={styles.actionBar}>
          <div style={{ fontSize: '13px', color: C.textMuted }}>
            <strong style={{ color: C.text }}>{selectedTemplate?.name || selectedSlug}</strong>
            {' · '}{sections.reduce((acc, s) => acc + s.fields.length, 0)} fields
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <a
              href={selectedTemplate?.downloadHref ?? '#'}
              style={styles.actionBtnLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              ↓ Download pack
            </a>
            <button
              onClick={() => handleDownload('blank')}
              disabled={generating !== null}
              style={{
                ...styles.actionBtnSecondary,
                opacity: generating !== null ? 0.6 : 1,
                cursor: generating !== null ? 'wait' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (generating === null) {
                  (e.currentTarget as HTMLElement).style.background = C.surfaceHover
                  ;(e.currentTarget as HTMLElement).style.borderColor = C.textMuted
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent'
                ;(e.currentTarget as HTMLElement).style.borderColor = C.border
              }}
            >
              {generating === 'blank' ? '⏳ Generating…' : '📄 Download blank PDF'}
            </button>
            <button
              onClick={() => handleDownload('filled')}
              disabled={generating !== null}
              style={{
                ...styles.actionBtnPrimary,
                opacity: generating !== null ? 0.7 : 1,
                cursor: generating !== null ? 'wait' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (generating === null) {
                  (e.currentTarget as HTMLElement).style.background = '#2D2B5C'
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = C.brand
              }}
            >
              {generating === 'filled' ? '⏳ Generating…' : '✨ Download filled PDF'}
            </button>
            {fillSessionId && (
              <button
                onClick={async () => {
                  try {
                    // Complete the fill session
                    const completeRes = await fetch('/api/templates/fill', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        action: 'complete',
                        sessionId: fillSessionId,
                      }),
                    })
                    const completeData = await completeRes.json()
                    if (!completeRes.ok) {
                      showToast(`❌ ${completeData?.error || 'Failed to complete form.'}`)
                      return
                    }
                    // Process checkout
                    const checkoutRes = await fetch(`/api/templates/fill/${fillSessionId}/checkout`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ paymentMethod: 'wallet' }),
                    })
                    const checkoutData = await checkoutRes.json()
                    if (checkoutData?.data?.needsTopUp) {
                      showToast(`⚠️ Insufficient wallet balance. Needs $${(checkoutData.data.requiredCents / 100).toFixed(2)}`)
                      return
                    }
                    if (!checkoutRes.ok) {
                      showToast(`❌ ${checkoutData?.error || 'Checkout failed.'}`)
                      return
                    }
                    // Success — redirect to download
                    showToast('✅ Template purchased! Redirecting to download…')
                    setTimeout(() => {
                      window.location.href = `/api/templates/download/${encodeURIComponent(selectedSlug!)}`
                    }, 1000)
                  } catch (e) {
                    showToast(`❌ ${e instanceof Error ? e.message : 'Checkout failed.'}`)
                  }
                }}
                style={{
                  ...styles.actionBtnPrimary,
                  background: C.success,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = '#0F5C36'
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = C.success
                }}
              >
                💳 Pay & Download
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

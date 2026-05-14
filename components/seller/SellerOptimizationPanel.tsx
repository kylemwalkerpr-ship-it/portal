'use client'

import { useEffect, useState } from 'react'

interface GigTier {
  tier: string
  title?: string
  price?: number
  delivery_days?: number
  is_active?: boolean
}

interface GigData {
  id: string
  title?: string
  pitch?: string
  tagline?: string
  description?: string
  category?: string
  tags?: string[]
  gallery_images?: unknown[]
  tiers?: GigTier[]
  faq?: unknown[]
  requirements?: string
  seo_title?: string
  avg_rating?: number
  content_score?: number
}

interface CheckItem {
  label: string
  passed: boolean
  fixKey: string
  section: string
}

interface Props {
  gigId: string
}

const serif = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"
const sans = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"

const FIX_SECTION_MAP: Record<string, string> = {
  title: 'overview',
  pitch: 'overview',
  description: 'description',
  category: 'overview',
  tags: 'overview',
  gallery: 'gallery',
  tiers: 'pricing',
  faq: 'faq',
  requirements: 'requirements',
  seo: 'seo',
}

function buildChecks(gig: GigData): CheckItem[] {
  const title = gig.title ?? ''
  const pitch = gig.pitch ?? gig.tagline ?? ''
  const description = gig.description ?? ''
  const tags = Array.isArray(gig.tags) ? gig.tags : []
  const gallery = Array.isArray(gig.gallery_images) ? gig.gallery_images : []
  const tiers = Array.isArray(gig.tiers) ? gig.tiers : []
  const faq = Array.isArray(gig.faq) ? gig.faq : []
  const requirements = gig.requirements ?? ''
  const seoTitle = gig.seo_title ?? ''

  const hasCompleteTier = tiers.some(
    (t) => t.is_active !== false && t.title && (t.price ?? 0) >= 100 && (t.delivery_days ?? 0) >= 1,
  )

  const raw = [
    { label: 'Title length (20–80 chars)', passed: title.length >= 20 && title.length <= 80, fixKey: 'title' },
    { label: 'Tagline / pitch (40–160 chars)', passed: pitch.length >= 40 && pitch.length <= 160, fixKey: 'pitch' },
    { label: 'Description (300+ chars)', passed: description.length >= 300, fixKey: 'description' },
    { label: 'Category set', passed: Boolean(gig.category), fixKey: 'category' },
    { label: 'Tags: 3–5 set', passed: tags.length >= 3 && tags.length <= 5, fixKey: 'tags' },
    { label: 'At least 1 gallery image', passed: gallery.length >= 1, fixKey: 'gallery' },
    { label: 'At least 1 complete tier', passed: hasCompleteTier, fixKey: 'tiers' },
    { label: 'FAQ section present', passed: faq.length >= 1, fixKey: 'faq' },
    { label: 'Requirements set', passed: requirements.length > 0, fixKey: 'requirements' },
    { label: 'SEO title set', passed: seoTitle.length > 0, fixKey: 'seo' },
  ]

  return raw.map((item) => ({ ...item, section: FIX_SECTION_MAP[item.fixKey] ?? 'overview' }))
}

// Grouped sections
const GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Content', keys: ['title', 'pitch', 'description', 'gallery'] },
  { label: 'Pricing & Delivery', keys: ['tiers', 'requirements'] },
  { label: 'Discoverability', keys: ['category', 'tags', 'faq', 'seo'] },
]

function ScoreRing({ score, size = 96 }: { score: number; size?: number }) {
  const radius = (size - 12) / 2
  const circumference = 2 * Math.PI * radius
  const filled = circumference * (score / 100)
  const dasharray = `${filled} ${circumference - filled}`
  const color = score >= 80 ? '#1A6B45' : score >= 50 ? '#8B5E0A' : '#8B1A1A'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#F2EFE9"
        strokeWidth="8"
      />
      {/* Fill */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={dasharray}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s' }}
      />
      {/* Score text */}
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize="18"
        fontWeight="700"
        fill="#1B2D4F"
        fontFamily="system-ui, sans-serif"
      >
        {score}%
      </text>
    </svg>
  )
}

export default function SellerOptimizationPanel({ gigId }: Props) {
  const [gig, setGig] = useState<GigData | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setErrorMsg(null)
    fetch(`/api/gigs/${gigId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.data?.gig) {
          setGig(json.data.gig)
        } else {
          setErrorMsg(json?.error?.message || 'Failed to load gig data.')
        }
      })
      .catch(() => setErrorMsg('Network error loading gig data.'))
      .finally(() => setLoading(false))
  }, [gigId])

  if (loading) {
    return (
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #DDD8CE',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(27,45,79,0.08), 0 1px 2px rgba(27,45,79,0.04)',
        fontFamily: sans,
      }}>
        <p style={{ color: '#9097A8', fontSize: '14px', margin: 0 }}>Loading optimization data…</p>
      </div>
    )
  }

  if (errorMsg || !gig) {
    return (
      <div style={{
        background: '#FAEAEA',
        border: '1px solid rgba(139,26,26,0.18)',
        borderRadius: '8px',
        padding: '20px',
        fontFamily: sans,
      }}>
        <p style={{ color: '#8B1A1A', fontSize: '13px', margin: 0 }}>{errorMsg ?? 'Gig not found.'}</p>
      </div>
    )
  }

  const checks = buildChecks(gig)
  const passedCount = checks.filter((c) => c.passed).length
  const totalCount = checks.length
  const scorePercent = Math.round((passedCount / totalCount) * 100)
  const contentScore = typeof gig.content_score === 'number' ? gig.content_score : null
  const avgRating = typeof gig.avg_rating === 'number' ? gig.avg_rating : null

  const editBase = `/seller/gigs/${gigId}/edit`

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #DDD8CE',
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(27,45,79,0.08), 0 1px 2px rgba(27,45,79,0.04)',
      overflow: 'hidden',
      fontFamily: sans,
    }}>
      {/* Header */}
      <div style={{ padding: '20px 22px', borderBottom: '1px solid #DDD8CE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h2 style={{
            fontFamily: serif,
            fontSize: '20px',
            fontWeight: 600,
            color: '#1B2D4F',
            letterSpacing: '-0.01em',
            margin: '0 0 4px',
          }}>
            Profile Strength
          </h2>
          <p style={{ color: '#9097A8', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
            Complete each item to improve visibility and conversions.
          </p>
        </div>

        {/* Score ring */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '4px' }}>
          <ScoreRing score={scorePercent} />
          <span style={{ fontSize: '11px', color: '#9097A8', letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
            {passedCount}/{totalCount} checks
          </span>
        </div>
      </div>

      {/* Content score + rating */}
      {(contentScore !== null || avgRating !== null) && (
        <div style={{ padding: '14px 22px', borderBottom: '1px solid #DDD8CE', display: 'flex', gap: '24px', flexWrap: 'wrap' as const }}>
          {contentScore !== null && (
            <div style={{ flex: '1 1 160px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: '#5C6070', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>Content Score</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#1A1F2E' }}>{contentScore}/100</span>
              </div>
              <div style={{ height: '5px', borderRadius: '2px', background: '#F2EFE9', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${contentScore}%`,
                  background: '#1B2D4F',
                  borderRadius: '2px',
                  transition: 'width 0.4s',
                }} />
              </div>
            </div>
          )}
          {avgRating !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontSize: '12px', color: '#5C6070', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>Avg. Rating</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#1A1F2E' }}>
                {avgRating > 0 ? `${avgRating.toFixed(2)} / 5.00` : 'No reviews yet'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Grouped checklist */}
      <div style={{ padding: '8px 0 16px' }}>
        {GROUPS.map((group) => {
          const groupChecks = checks.filter((c) => group.keys.includes(c.fixKey))
          return (
            <div key={group.label} style={{ marginBottom: '4px' }}>
              {/* Group header */}
              <div style={{
                padding: '10px 22px 6px',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase' as const,
                color: '#9097A8',
              }}>
                {group.label}
              </div>
              {/* Checks */}
              {groupChecks.map((item) => (
                <div
                  key={item.fixKey}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '8px 22px',
                    borderTop: '1px solid #F2EFE9',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <span style={{
                      flexShrink: 0,
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 800,
                      background: item.passed ? '#EAF5EE' : '#FAEAEA',
                      color: item.passed ? '#1A6B45' : '#8B1A1A',
                    }}>
                      {item.passed ? '✓' : '✗'}
                    </span>
                    <span style={{
                      fontSize: '13px',
                      color: item.passed ? '#5C6070' : '#1A1F2E',
                      fontWeight: item.passed ? 400 : 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap' as const,
                    }}>
                      {item.label}
                    </span>
                  </div>
                  {!item.passed && (
                    <a
                      href={`${editBase}?section=${item.section}`}
                      style={{
                        flexShrink: 0,
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#9A7B3B',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap' as const,
                        fontFamily: sans,
                      }}
                    >
                      Fix →
                    </a>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
}

interface Props {
  gigId: string
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

  return [
    {
      label: 'Title length (20–80 chars)',
      passed: title.length >= 20 && title.length <= 80,
      fixKey: 'title',
    },
    {
      label: 'Tagline/pitch (40–160 chars)',
      passed: pitch.length >= 40 && pitch.length <= 160,
      fixKey: 'pitch',
    },
    {
      label: 'Description (300+ chars)',
      passed: description.length >= 300,
      fixKey: 'description',
    },
    {
      label: 'Category set',
      passed: Boolean(gig.category),
      fixKey: 'category',
    },
    {
      label: 'Tags: 3–5 set',
      passed: tags.length >= 3 && tags.length <= 5,
      fixKey: 'tags',
    },
    {
      label: 'At least 1 gallery image',
      passed: gallery.length >= 1,
      fixKey: 'gallery',
    },
    {
      label: 'At least 1 complete tier',
      passed: hasCompleteTier,
      fixKey: 'tiers',
    },
    {
      label: 'FAQ section present',
      passed: faq.length >= 1,
      fixKey: 'faq',
    },
    {
      label: 'Requirements set',
      passed: requirements.length > 0,
      fixKey: 'requirements',
    },
    {
      label: 'SEO title set',
      passed: seoTitle.length > 0,
      fixKey: 'seo',
    },
  ]
}

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
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-neutral-500">Loading optimization data…</p>
      </div>
    )
  }

  if (errorMsg || !gig) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-600">{errorMsg ?? 'Gig not found.'}</p>
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
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-5">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Gig Optimization</h2>
        <p className="mt-0.5 text-sm text-neutral-500">
          Complete each item to improve your gig's visibility and conversions.
        </p>
      </div>

      {/* Overall score */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-neutral-700">Overall score</span>
          <span
            className={`font-semibold ${
              scorePercent >= 80
                ? 'text-green-600'
                : scorePercent >= 50
                ? 'text-amber-600'
                : 'text-red-600'
            }`}
          >
            {scorePercent}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              scorePercent >= 80
                ? 'bg-green-500'
                : scorePercent >= 50
                ? 'bg-amber-400'
                : 'bg-red-500'
            }`}
            style={{ width: `${scorePercent}%` }}
          />
        </div>
        <p className="text-xs text-neutral-400">
          {passedCount} of {totalCount} checks passed
        </p>
      </div>

      {/* Content score bar */}
      {contentScore !== null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-neutral-700">Content score</span>
            <span className="font-semibold text-neutral-700">{contentScore}/100</span>
          </div>
          <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${contentScore}%` }}
            />
          </div>
        </div>
      )}

      {/* Average rating */}
      {avgRating !== null && (
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-neutral-700">Average rating</span>
          <span className="text-neutral-800">
            {avgRating > 0 ? `${avgRating.toFixed(2)} / 5.00` : 'No reviews yet'}
          </span>
        </div>
      )}

      {/* Checklist */}
      <ul className="space-y-2">
        {checks.map((item) => (
          <li key={item.fixKey} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                  item.passed
                    ? 'bg-green-100 text-green-600'
                    : 'bg-red-100 text-red-600'
                }`}
              >
                {item.passed ? '✓' : '✗'}
              </span>
              <span
                className={`truncate text-sm ${
                  item.passed ? 'text-neutral-700' : 'text-neutral-900 font-medium'
                }`}
              >
                {item.label}
              </span>
            </div>
            {!item.passed && (
              <a
                href={`${editBase}?section=${FIX_SECTION_MAP[item.fixKey] ?? 'overview'}`}
                className="flex-shrink-0 rounded-md bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200 transition-colors"
              >
                Fix
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

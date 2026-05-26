'use client'

/**
 * GigSEOAnalytics — A dashboard page for providers that shows SEO scores
 * for all their gigs with suggestions for improvement.
 *
 * Displays:
 * - Overall SEO health summary (avg score, best/worst gig)
 * - Per-gig score cards with checklist + suggestions
 * - Quick-action buttons to jump to the gig editor
 */

import React from 'react'
import { C, Btn, Card, Badge, ProgressBar } from '../design/shared'
import { computeSEOScore, type SEOData, type SEOScoreResult } from '@/lib/seoUtils'

const INDIGO = '#3C3B6E'
const BRICK = '#B22234'
const INK = '#0F172A'
const INK_MID = '#334155'
const INK_SOFT = '#64748B'
const BORDER = '#E2E8F0'
const PAPER = '#F7F8FA'
const VELLUM = '#FFFFFF'
const SERIF = "var(--font-lora), Lora, Georgia, serif"
const SANS = "var(--font-inter), Inter, system-ui, sans-serif"
const GREEN = '#1A6B45'
const AMBER = '#D97706'

interface GigItem {
  id: string
  slug: string
  title: string
  pitch: string | null
  description: string | null
  tags: string[] | null
  category: string | null
  subcategory: string | null
  jurisdiction: string | null
  seo_title: string | null
  seo_description: string | null
  status: string
  content_score: number | null
  metrics?: {
    impressions?: number
    clicks?: number
    saves?: number
  } | null
}

function scoreColor(score: number): string {
  if (score >= 80) return GREEN
  if (score >= 50) return AMBER
  return BRICK
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Great'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Needs work'
  return 'Poor'
}

function ScoreRing({ score, size = 60 }: { score: number; size?: number }) {
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = scoreColor(score)

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={BORDER}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dy="0.35em"
        fontSize={size * 0.28}
        fontWeight={800}
        fill={color}
        fontFamily={SANS}
      >
        {score}
      </text>
    </svg>
  )
}

function GigScoreCard({ gig }: { gig: GigItem }) {
  const [expanded, setExpanded] = React.useState(false)

  const seoData: SEOData = {
    title: gig.title || '',
    pitch: gig.pitch || '',
    description: gig.description || '',
    tags: gig.tags || [],
    category: gig.category || '',
    jurisdiction: gig.jurisdiction || '',
    seo_title: gig.seo_title || '',
    seo_description: gig.seo_description || '',
  }

  const scoreResult = React.useMemo(() => computeSEOScore(seoData), [seoData.title, seoData.pitch, seoData.description, seoData.tags, seoData.category, seoData.jurisdiction, seoData.seo_title, seoData.seo_description])
  const failedChecks = scoreResult.checks.filter(c => !c.passed)
  const passedCount = scoreResult.checks.length - failedChecks.length
  const totalCount = scoreResult.checks.length

  return (
    <Card style={{
      padding: '18px 20px',
      border: `1px solid ${scoreResult.score >= 80 ? `${GREEN}33` : scoreResult.score >= 50 ? `${AMBER}33` : `${BRICK}33`}`,
      borderLeft: `4px solid ${scoreColor(scoreResult.score)}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
      >
        <ScoreRing score={scoreResult.score} size={52} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '14px', color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {gig.title}
            </span>
            <Badge color={gig.status === 'active' ? 'green' : 'orange'} style={{ fontSize: '10px' }}>
              {gig.status}
            </Badge>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '12px', color: INK_SOFT }}>
            <span>Score: {scoreResult.score}/100 · {scoreLabel(scoreResult.score)}</span>
            <span>·</span>
            <span>{passedCount}/{totalCount} checks passed</span>
            {gig.metrics && (
              <>
                <span>·</span>
                <span>{gig.metrics.impressions ?? 0} views</span>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <a href={`/dashboard/gigs/${gig.id}/edit`} style={{ textDecoration: 'none' }}>
            <Btn variant="secondary" size="sm">Edit</Btn>
          </a>
          <span style={{ color: INK_SOFT, fontSize: '12px', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            ▼
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${BORDER}` }}>
          {/* Score bar */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px', color: INK_SOFT }}>
              <span>SEO Optimization Score</span>
              <span style={{ fontWeight: 700, color: scoreColor(scoreResult.score) }}>{scoreResult.score}%</span>
            </div>
            <div style={{ height: '6px', background: BORDER, borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${scoreResult.score}%`,
                background: scoreColor(scoreResult.score),
                borderRadius: '3px',
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>

          {/* Checks */}
          {failedChecks.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: BRICK, marginBottom: '8px' }}>
                {failedChecks.length} check{failedChecks.length > 1 ? 's' : ''} to fix
              </div>
              {failedChecks.map((check, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'flex-start',
                    padding: '6px 8px',
                    background: `${BRICK}08`,
                    borderRadius: '6px',
                    marginBottom: '4px',
                    fontSize: '12px',
                  }}
                >
                  <span style={{ color: BRICK, marginTop: '1px' }}>✕</span>
                  <div>
                    <span style={{ color: INK, fontWeight: 600 }}>{check.label}</span>
                    <span style={{ color: INK_SOFT }}> — {check.hint}</span>
                    <span style={{ color: INK_SOFT, fontSize: '11px', marginLeft: '4px' }}>(+{check.weight} pts)</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Suggestions */}
          <div style={{ background: `${INDIGO}08`, borderRadius: '8px', padding: '10px 12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: INDIGO, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
              Optimization suggestions
            </div>
            {failedChecks.map((check, i) => (
              <div key={i} style={{ fontSize: '12px', color: INK_MID, lineHeight: 1.6, padding: '2px 0' }}>
                • {check.hint}
              </div>
            ))}
            {failedChecks.length === 0 && (
              <div style={{ fontSize: '12px', color: GREEN, fontWeight: 600 }}>
                ✓ All checks pass — your gig is well-optimized for search!
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

export default function GigSEOAnalytics() {
  const [gigs, setGigs] = React.useState<GigItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [sortBy, setSortBy] = React.useState<'score-asc' | 'score-desc' | 'title' | 'status'>('score-asc')

  React.useEffect(() => {
    let cancelled = false
    fetch('/api/gigs', { credentials: 'same-origin' })
      .then(async r => {
        const payload = await r.json().catch(() => ({}))
        const data = payload?.data ?? payload
        if (!cancelled) {
          setGigs((data?.gigs ?? []).filter((g: GigItem) => g.status !== 'deleted'))
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load gigs.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  // Compute scores and sort
  const scoredGigs = React.useMemo(() => {
    const scored = gigs.map(gig => {
      const seoData: SEOData = {
        title: gig.title || '',
        pitch: gig.pitch || '',
        description: gig.description || '',
        tags: gig.tags || [],
        category: gig.category || '',
        jurisdiction: gig.jurisdiction || '',
        seo_title: gig.seo_title || '',
        seo_description: gig.seo_description || '',
      }
      return { gig, score: computeSEOScore(seoData) }
    })

    scored.sort((a, b) => {
      switch (sortBy) {
        case 'score-desc': return b.score.score - a.score.score
        case 'title': return a.gig.title.localeCompare(b.gig.title)
        case 'status': {
          const order = { active: 0, draft: 1, suspended: 2, archived: 3 }
          return ((order as any)[a.gig.status] ?? 99) - ((order as any)[b.gig.status] ?? 99)
        }
        case 'score-asc':
        default: return a.score.score - b.score.score
      }
    })

    return scored
  }, [gigs, sortBy])

  const avgScore = scoredGigs.length > 0
    ? Math.round(scoredGigs.reduce((sum, s) => sum + s.score.score, 0) / scoredGigs.length)
    : 0

  const bestScore = scoredGigs.length > 0
    ? scoredGigs.reduce((best, s) => s.score.score > (best?.score?.score ?? 0) ? s : best, scoredGigs[0])
    : null

  const worstScore = scoredGigs.length > 0
    ? scoredGigs.reduce((worst, s) => s.score.score < (worst?.score?.score ?? 100) ? s : worst, scoredGigs[0])
    : null

  if (loading) {
    return (
      <div style={{ padding: '28px' }}>
        <div style={{ color: INK_SOFT, fontSize: '14px' }}>Loading SEO analytics…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '28px' }}>
        <div style={{ color: BRICK, fontSize: '14px' }}>Error: {error}</div>
        <Btn variant="secondary" size="sm" style={{ marginTop: '12px' }} onClick={() => window.location.reload()}>
          Retry
        </Btn>
      </div>
    )
  }

  if (gigs.length === 0) {
    return (
      <div style={{ padding: '28px' }}>
        <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px' }}>SEO Analytics</div>
        <Card style={{ padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: INK, marginBottom: '8px' }}>
            No services yet
          </div>
          <div style={{ color: INK_SOFT, fontSize: '13px', lineHeight: 1.6 }}>
            Create your first service to start tracking SEO performance.
            <br />
            <a href="/dashboard/gigs/new" style={{ color: INDIGO, fontWeight: 600, textDecoration: 'none' }}>
              Create a service →
            </a>
          </div>
        </Card>
      </div>
    )
  }

  const passedTotal = scoredGigs.reduce((sum, s) => sum + s.score.checks.filter(c => c.passed).reduce((w, c) => w + c.weight, 0), 0)
  const maxTotal = scoredGigs.length * 100

  return (
    <div style={{ padding: '28px', maxWidth: '1080px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: INK_SOFT, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: '4px' }}>
          Analytics
        </div>
        <h2 style={{ fontFamily: SERIF, fontSize: '30px', fontWeight: 500, color: INK, margin: '0 0 8px', letterSpacing: '-0.012em' }}>
          SEO Performance
        </h2>
        <p style={{ color: INK_SOFT, fontSize: '14px', margin: 0, lineHeight: 1.55 }}>
          Search optimization scores across all your services. Higher scores mean better visibility in marketplace search results.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <Card style={{ padding: '18px' }}>
          <div style={{ color: INK_SOFT, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Average Score
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
            <ScoreRing score={avgScore} size={44} />
            <div>
              <div style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: 600, color: INK }}>{avgScore}/100</div>
              <div style={{ fontSize: '12px', color: INK_SOFT, marginTop: '2px' }}>{scoredGigs.length} service{scoredGigs.length > 1 ? 's' : ''}</div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: '18px' }}>
          <div style={{ color: INK_SOFT, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Best Performing
          </div>
          {bestScore && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: 600, color: GREEN, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {bestScore.gig.title}
              </div>
              <div style={{ fontSize: '12px', color: INK_SOFT, marginTop: '2px' }}>
                Score: {bestScore.score.score}/100 — {scoreLabel(bestScore.score.score)}
              </div>
            </div>
          )}
        </Card>

        <Card style={{ padding: '18px' }}>
          <div style={{ color: INK_SOFT, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Needs Most Work
          </div>
          {worstScore && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: 600, color: BRICK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {worstScore.gig.title}
              </div>
              <div style={{ fontSize: '12px', color: INK_SOFT, marginTop: '2px' }}>
                Score: {worstScore.score.score}/100 — {scoreLabel(worstScore.score.score)}
              </div>
            </div>
          )}
        </Card>

        <Card style={{ padding: '18px' }}>
          <div style={{ color: INK_SOFT, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Overall Health
          </div>
          <div style={{ marginTop: '8px' }}>
            <div style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: 600, color: scoreColor(avgScore) }}>
              {maxTotal > 0 ? Math.round((passedTotal / maxTotal) * 100) : 0}%
            </div>
            <div style={{ height: '4px', background: BORDER, borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${maxTotal > 0 ? (passedTotal / maxTotal) * 100 : 0}%`,
                background: scoreColor(avgScore),
                borderRadius: '2px',
              }} />
            </div>
          </div>
        </Card>
      </div>

      {/* Sort controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontSize: '13px', color: INK_MID }}>
          {gigs.length} service{gigs.length > 1 ? 's' : ''} · Sort by:
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {([
            { value: 'score-asc', label: 'Worst first' },
            { value: 'score-desc', label: 'Best first' },
            { value: 'title', label: 'Title' },
            { value: 'status', label: 'Status' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              style={{
                padding: '5px 12px',
                borderRadius: '999px',
                border: `1px solid ${sortBy === opt.value ? INDIGO : BORDER}`,
                background: sortBy === opt.value ? `${INDIGO}12` : VELLUM,
                color: sortBy === opt.value ? INDIGO : INK_SOFT,
                fontSize: '12px',
                fontWeight: sortBy === opt.value ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Gig score cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {scoredGigs.map(({ gig, score }) => (
          <GigScoreCard key={gig.id} gig={gig} />
        ))}
      </div>
    </div>
  )
}

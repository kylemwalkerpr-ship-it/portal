'use client'

import React from 'react'
import Link from 'next/link'
import { computeSEOScore } from '@/lib/seoUtils'
import type { SEOData } from '@/lib/seoUtils'

interface GigMetrics {
  impressions: number
  clicks: number
  saves: number
}

interface Gig {
  id: string
  slug: string
  title: string
  status: string
  category: string | null
  pitch: string
  description?: string
  tags?: string[]
  seo_title?: string
  seo_description?: string
  jurisdiction?: string
  content_score: number
  metrics: GigMetrics | null
}

interface SellerGigCardProps {
  gig: Gig
  onStatusChange: (id: string, status: string) => void
  onPublish: (id: string) => void
}

const serif = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"
const sans = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; accent: string; dot: string; label: string }> = {
  active:         { bg: '#EAF5EE', text: '#1A6B45', border: 'rgba(26,107,69,0.22)',  accent: '#1A6B45', dot: '#1A6B45', label: 'Active' },
  draft:          { bg: '#F5EDD6', text: '#7A6030', border: 'rgba(154,123,59,0.28)', accent: '#9A7B3B', dot: '#9A7B3B', label: 'Draft' },
  paused:         { bg: '#E5EEF7', text: '#1F3A6B', border: 'rgba(31,58,107,0.22)', accent: '#1F3A6B', dot: '#1F3A6B', label: 'Paused' },
  suspended:      { bg: '#FEF5E4', text: '#7A4D08', border: 'rgba(139,94,10,0.25)',  accent: '#8B5E0A', dot: '#D97706', label: 'Suspended' },
  archived:       { bg: '#EDEAF7', text: '#3D2B6B', border: 'rgba(61,43,107,0.22)', accent: '#3D2B6B', dot: '#6B5AB0', label: 'Archived' },
  deleted:        { bg: '#FAEAEA', text: '#7A1A1A', border: 'rgba(139,26,26,0.22)', accent: '#8B1A1A', dot: '#8B1A1A', label: 'Deleted' },
  pending_review: { bg: '#E8F4F6', text: '#0E5563', border: 'rgba(14,124,142,0.25)', accent: '#0E7C8E', dot: '#0E7C8E', label: 'In Review' },
  denied:         { bg: '#FAEAEA', text: '#7A1A1A', border: 'rgba(139,26,26,0.22)', accent: '#8B1A1A', dot: '#8B1A1A', label: 'Denied' },
  appeal_pending: { bg: '#FEF5E4', text: '#7A4D08', border: 'rgba(139,94,10,0.25)',  accent: '#8B5E0A', dot: '#D97706', label: 'Appeal Pending' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '3px 9px 3px 7px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase' as const,
      background: cfg.bg,
      color: cfg.text,
      border: `1px solid ${cfg.border}`,
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: cfg.dot, display: 'inline-block', flexShrink: 0 }} />
      {cfg.label}
    </span>
  )
}

function MetricCell({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center' as const, padding: '14px 18px' }}>
      <div style={{ fontWeight: 700, fontSize: '20px', color: '#0F172A', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: '10px', color: '#9097A8', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginTop: '4px' }}>
        {label}
      </div>
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score))
  const color = clamped >= 75 ? '#1A6B45' : clamped >= 45 ? '#8B5E0A' : '#8B1A1A'
  const label = clamped >= 75 ? 'Strong' : clamped >= 45 ? 'Needs work' : 'Poor'
  return (
    <div style={{ padding: '12px 20px', borderTop: '1px solid #F2EFE9', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ position: 'relative', width: '32px', height: '32px', flexShrink: 0 }}>
        <svg width="32" height="32" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="13" fill="none" stroke="#F2EFE9" strokeWidth="3" />
          <circle
            cx="16" cy="16" r="13"
            fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${(clamped / 100) * 81.6} 81.6`}
            strokeDashoffset="20.4"
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', color: '#9097A8', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
            Content Score
          </span>
          <span style={{ fontSize: '11px', color, fontWeight: 700 }}>{label}</span>
        </div>
        <div style={{ height: '3px', borderRadius: '2px', background: '#F2EFE9', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${clamped}%`, background: color, borderRadius: '2px', transition: 'width 0.4s ease' }} />
        </div>
      </div>
      <span style={{ fontSize: '14px', color: '#1A1F2E', fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums', minWidth: '36px', textAlign: 'right' }}>
        {clamped}%
      </span>
    </div>
  )
}

function getCategoryKeywords(category: string | null): string[] {
  // Import categories lazily to avoid circular dependencies in the component.
  // Fall back to the default set if no category is provided or matched.
  const DEFAULT = ['visa', 'permit', 'application', 'review', 'legal', 'help', 'support', 'service', 'consulting', 'advice']

  // The category field can store either a parent category ID (e.g. 'immigration')
  // or a subcategory ID (e.g. 'study-permits'). Try matching against the
  // subcategory keywords first, then fall through to parent category.
  // Since we can't import CATEGORIES statically (the component is large and
  // we want to avoid pulling in the entire taxonomy), we use a subset map
  // of the most important category→keyword mappings.
  const CATEGORY_MAP: Record<string, string[]> = {
    'immigration': ['visa', 'permit', 'green card', 'sponsorship', 'application', 'lawyer', 'citizenship', 'residence', 'petition', 'document'],
    'education': ['university', 'college', 'admissions', 'essay', 'application', 'scholarship', 'test prep', 'ielts', 'toefl', 'phd'],
    'legal': ['attorney', 'lawyer', 'legal review', 'contract', 'consultation', 'document', 'compliance', 'filing', 'litigation', 'advice'],
    'settlement': ['housing', 'banking', 'healthcare', 'insurance', 'transportation', 'language', 'community', 'integration', 'essentials', 'setup'],
    'career': ['resume', 'cv', 'linkedin', 'job search', 'interview', 'coaching', 'professional', 'networking', 'career', 'mentorship'],
    'business': ['business plan', 'formation', 'llc', 'incorporation', 'marketing', 'strategy', 'consulting', 'tax', 'accounting', 'financial'],
    'credentials': ['credential', 'assessment', 'evaluation', 'verification', 'degree', 'license', 'certification', 'transcript', 'document', 'foreign'],
    'mentorship': ['mentorship', 'coaching', 'guidance', 'support', 'advice', 'personal development', 'career', 'growth', 'planning', 'goals'],
  }

  if (!category) return DEFAULT

  // Normalize: check direct match, then try to find a partial match
  const cat = category.toLowerCase().trim()
  if (CATEGORY_MAP[cat]) return CATEGORY_MAP[cat]

  for (const [key, keywords] of Object.entries(CATEGORY_MAP)) {
    if (cat.includes(key) || key.includes(cat)) return keywords
  }

  return DEFAULT
}

function KeywordScore({ gig }: { gig: Gig }) {
  const combined = `${gig.title} ${gig.pitch}`.toLowerCase()
  const keywords = getCategoryKeywords(gig.category)
  const CHECK_COUNT = 5
  const found = keywords.slice(0, CHECK_COUNT).filter(kw => combined.includes(kw)).length
  const kwColor = found >= 4 ? '#1A6B45' : found >= 2 ? '#8B5E0A' : '#8B1A1A'
  
  return (
    <div style={{ padding: '8px 20px', borderTop: '1px solid #F2EFE9', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span style={{ fontSize: '10px', color: '#9097A8', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' as const, flexShrink: 0 }}>
        Keywords
      </span>
      <div style={{ flex: 1, display: 'flex', gap: '4px', overflow: 'hidden' }}>
        {keywords.slice(0, CHECK_COUNT).map(kw => {
          const present = combined.includes(kw)
          return (
            <span
              key={kw}
              style={{
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '10px',
                fontWeight: present ? 600 : 400,
                background: present ? `${kwColor}12` : '#F7F5F0',
                color: present ? kwColor : '#B0A99A',
                border: `1px solid ${present ? `${kwColor}25` : '#DDD8CE'}`,
                whiteSpace: 'nowrap' as const,
              }}
            >
              {kw}
            </span>
          )
        })}
      </div>
      <span style={{ fontSize: '11px', color: '#9097A8', fontWeight: 600, flexShrink: 0 }}>
        {found}/{CHECK_COUNT}
      </span>
    </div>
  )
}

interface ActionBtnProps {
  onClick?: () => void
  href?: string
  target?: string
  rel?: string
  variant?: 'navy' | 'green' | 'purple' | 'red' | 'ghost'
  children: React.ReactNode
}

function ActionBtn({ onClick, href, target, rel, variant = 'ghost', children }: ActionBtnProps) {
  const colors = {
    navy:   { color: '#0F172A', border: '#0F172A', bg: 'transparent' },
    green:  { color: '#1A6B45', border: 'rgba(26,107,69,0.50)', bg: '#EAF5EE' },
    purple: { color: '#3D2B6B', border: 'rgba(61,43,107,0.45)', bg: '#EDEAF7' },
    red:    { color: '#8B1A1A', border: 'rgba(139,26,26,0.45)', bg: '#FAEAEA' },
    ghost:  { color: '#5C6070', border: '#DDD8CE', bg: 'transparent' },
  }
  const c = colors[variant]
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', padding: '5px 12px',
    borderRadius: '5px', fontSize: '12px', fontWeight: 600,
    color: c.color, border: `1px solid ${c.border}`, background: c.bg,
    cursor: 'pointer', textDecoration: 'none', fontFamily: sans,
    letterSpacing: '0.01em', whiteSpace: 'nowrap', transition: 'opacity 0.12s',
  }
  if (href) return <Link href={href} target={target} rel={rel} style={style}>{children}</Link>
  return <button type="button" onClick={onClick} style={style}>{children}</button>
}

export default function SellerGigCard({ gig, onStatusChange, onPublish }: SellerGigCardProps) {
  const [confirming, setConfirming] = React.useState(false)
  const [hovered, setHovered] = React.useState(false)
  const metrics = gig.metrics
  const cfg = STATUS_CONFIG[gig.status] ?? STATUS_CONFIG.draft

  // Live SEO score computed from the gig's actual content
  const seoScore = React.useMemo(() => {
    const seoData: SEOData = {
      title: gig.title || '',
      pitch: gig.pitch || '',
      description: gig.description || '',
      tags: gig.tags || [],
      seo_title: gig.seo_title || '',
      seo_description: gig.seo_description || '',
      category: gig.category || '',
      jurisdiction: gig.jurisdiction || '',
    }
    return computeSEOScore(seoData)
  }, [gig.title, gig.pitch, gig.description, gig.tags, gig.seo_title, gig.seo_description, gig.category, gig.jurisdiction])

  const canPublish  = ['draft', 'suspended'].includes(gig.status)
  const canPause    = gig.status === 'active'
  const canResume   = gig.status === 'paused'
  const canArchive  = ['active', 'draft', 'paused', 'suspended'].includes(gig.status)
  const canRestore  = gig.status === 'archived'
  const canRepublish = ['paused', 'archived'].includes(gig.status)
  const canDelete   = gig.status !== 'deleted'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirming(false) }}
      style={{
        background: '#FFFFFF',
        border: `1px solid ${hovered ? '#C8C2B6' : '#DDD8CE'}`,
        borderLeft: `4px solid ${cfg.accent}`,
        borderRadius: '8px',
        boxShadow: hovered
          ? '0 4px 16px rgba(27,45,79,0.12), 0 2px 6px rgba(27,45,79,0.07)'
          : '0 1px 3px rgba(27,45,79,0.06), 0 1px 2px rgba(27,45,79,0.04)',
        opacity: gig.status === 'deleted' ? 0.50 : 1,
        overflow: 'hidden',
        fontFamily: sans,
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      }}
    >
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>

        {/* Left: info */}
        <div style={{ flex: '1 1 0', minWidth: 0, padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const, marginBottom: '8px' }}>
            <StatusBadge status={gig.status} />
            {gig.category && (
              <span style={{
                fontSize: '11px', color: '#5C6070',
                background: '#F7F5F0', border: '1px solid #DDD8CE',
                padding: '2px 8px', borderRadius: '4px', fontWeight: 500,
                letterSpacing: '0.02em',
              }}>
                {gig.category}
              </span>
            )}
          </div>

          <h3 style={{
            fontFamily: serif, fontWeight: 600, fontSize: '19px',
            color: '#0F172A', lineHeight: 1.25, margin: '0 0 6px',
            letterSpacing: '-0.01em',
          }}>
            {gig.title}
          </h3>

          {gig.pitch && (
            <p style={{
              color: '#5C6070', fontSize: '13px', lineHeight: 1.6, margin: 0,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
            }}>
              {gig.pitch}
            </p>
          )}
        </div>

        {/* Center: metrics — only shown when data exists */}
        {metrics && (
          <div style={{
            display: 'flex', alignItems: 'stretch',
            borderLeft: '1px solid #F2EFE9', borderRight: '1px solid #F2EFE9',
            flexShrink: 0,
          }}>
            {[
              ['Impressions', metrics.impressions],
              ['Clicks', metrics.clicks],
              ['Saves', metrics.saves],
            ].map(([label, val], i) => (
              <div key={String(label)} style={{ borderRight: i < 2 ? '1px solid #F2EFE9' : 'none' }}>
                <MetricCell label={String(label)} value={Number(val)} />
              </div>
            ))}
          </div>
        )}

        {/* Right: actions */}
        <div style={{
          display: 'flex', flexDirection: 'column' as const,
          alignItems: 'flex-start', justifyContent: 'center',
          gap: '6px', padding: '16px 20px', flexShrink: 0,
          borderLeft: '1px solid #F2EFE9', minWidth: '140px',
        }}>
          <ActionBtn href={`/dashboard/gigs/${gig.id}/edit`} variant="navy">Edit</ActionBtn>
          <ActionBtn href={`/marketplace/gigs/${gig.slug}`} target="_blank" rel="noreferrer" variant="ghost">Preview ↗</ActionBtn>
          {canPublish && <ActionBtn onClick={() => onPublish(gig.id)} variant="green">Publish</ActionBtn>}
          {canRepublish && <ActionBtn onClick={() => onPublish(gig.id)} variant="green">Re-publish</ActionBtn>}
          {canPause && <ActionBtn onClick={() => onStatusChange(gig.id, 'paused')} variant="ghost">Pause</ActionBtn>}
          {canResume && <ActionBtn onClick={() => onPublish(gig.id)} variant="green">Resume</ActionBtn>}
          {canRestore && <ActionBtn onClick={() => onStatusChange(gig.id, 'draft')} variant="navy">Restore</ActionBtn>}
          {canArchive && <ActionBtn onClick={() => onStatusChange(gig.id, 'archived')} variant="purple">Archive</ActionBtn>}
          {canDelete && (
            <ActionBtn
              onClick={() => {
                if (!confirming) { setConfirming(true); return }
                onStatusChange(gig.id, 'deleted')
              }}
              variant="red"
            >
              {confirming ? 'Confirm?' : 'Delete'}
            </ActionBtn>
          )}
        </div>
      </div>

      {/* Live SEO content score + keyword analysis */}
      <ScoreBar score={seoScore.score} />
      <KeywordScore gig={gig} />

      {/* Thin SEO check count — quick signal of optimization depth */}
      <div style={{
        padding: '4px 20px',
        background: seoScore.score >= 80 ? '#EAF5EE' : seoScore.score >= 50 ? '#FFF8E7' : '#FAEAEA',
        fontSize: '10px',
        fontWeight: 600,
        color: seoScore.score >= 80 ? '#1A6B45' : seoScore.score >= 50 ? '#7A6030' : '#7A1A1A',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}>
        <span>SEO: {seoScore.checks.filter(c => c.passed).length}/{seoScore.checks.length} checks passed</span>
        {seoScore.score >= 80 && <span>✓ Ready to rank</span>}
        {seoScore.score < 50 && <span>— Open in wizard to improve</span>}
      </div>
    </div>
  )
}

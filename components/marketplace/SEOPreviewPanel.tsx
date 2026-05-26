// @ts-nocheck
'use client'

import React from 'react'
import { T, F } from './tokens'
import { computeSEOScore, getKeywordsForCategory, SEOData } from '@/lib/seoUtils'

interface SEOPreviewPanelProps {
  gigData: SEOData
  gigSlug?: string
  gigId?: string
  // When provided, "Suggested keywords" chips become clickable — a click
  // on an un-used chip adds it to the gig's tags. The wizard wires this
  // through to gigData.tags so a single click registers the keyword for
  // the gig (no copy-paste, no manual retyping).
  onAddTag?: (tag: string) => void
}

const SERP_PREVIEW_STYLE: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  padding: '16px',
  fontFamily: 'Arial, sans-serif',
}

export default function SEOPreviewPanel({ gigData, gigSlug, onAddTag }: SEOPreviewPanelProps) {
  // Normalize data to match SEOData interface, providing defaults for optional fields
  const normalizedData: SEOData = {
    title: gigData.title || '',
    pitch: gigData.pitch || '',
    description: gigData.description || '',
    tags: Array.isArray(gigData.tags) ? gigData.tags : [],
    seo_title: gigData.seo_title || '',
    seo_description: gigData.seo_description || '',
    category: gigData.category || '',
    jurisdiction: gigData.jurisdiction || '',
  }

  const { score, checks } = React.useMemo(() => computeSEOScore(normalizedData), [normalizedData])

  const finalTitle = normalizedData.seo_title || normalizedData.title || 'Your Gig Title'
  const metaDesc = normalizedData.seo_description || normalizedData.pitch || ''
  const displayUrl = `marketplace.yousafeconsultancy.com/marketplace/gigs/${gigSlug || 'your-gig'}`
  const passedCount = checks.filter((c) => c.passed).length
  const totalCount = checks.length

  const scoreColor = score >= 80 ? T.moss : score >= 50 ? '#8B5E0A' : T.brick
  const scoreBg = score >= 80 ? `${T.moss}12` : score >= 50 ? '#FFF8E7' : `${T.brick}10`

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {/* Score ring + summary */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        padding: '16px',
        background: scoreBg,
        borderRadius: '12px',
        border: `1px solid ${scoreColor}25`,
      }}>
        <div style={{ position: 'relative', width: '68px', height: '68px', flexShrink: 0 }}>
          <svg width="68" height="68" viewBox="0 0 68 68">
            <circle cx="34" cy="34" r="28" fill="none" stroke="#E2E8F0" strokeWidth="5" />
            <circle
              cx="34" cy="34" r="28"
              fill="none"
              stroke={scoreColor}
              strokeWidth="5"
              strokeDasharray={`${(score / 100) * 176} 176`}
              strokeDashoffset="44"
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
            <text x="34" y="34" textAnchor="middle" dominantBaseline="central"
              fill={T.ink} fontSize="16" fontWeight="700" fontFamily="system-ui, sans-serif">
              {score}%
            </text>
          </svg>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: T.ink }}>
            SEO Optimization Score
          </div>
          <div style={{ fontSize: '13px', color: T.inkMid, marginTop: '2px' }}>
            {passedCount}/{totalCount} checks passed
            {score >= 80 ? ' · Great! Ready to rank.' : score >= 50 ? ' · Improving — follow suggestions below.' : ' · Needs work for good visibility.'}
          </div>
        </div>
      </div>

      {/* Google-style SERP preview */}
      <div style={SERP_PREVIEW_STYLE}>
        <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
          Google Search Preview
        </div>
        <div style={{ fontSize: '12px', color: '#4B5563', marginBottom: '4px' }}>
          {displayUrl}
          <span style={{ fontSize: '10px', color: '#34A853', marginLeft: '6px' }}>✓</span>
        </div>
        <div style={{
          fontSize: '20px',
          color: '#1a0dab',
          fontWeight: 400,
          lineHeight: 1.3,
          marginBottom: '3px',
          cursor: 'pointer',
          textDecoration: 'none',
          display: 'block',
          maxWidth: '600px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {finalTitle.length > 60 ? `${finalTitle.slice(0, 60)}…` : finalTitle}
        </div>
        <div style={{ fontSize: '13px', color: '#4B5563', lineHeight: 1.58, maxWidth: '600px', marginTop: '2px' }}>
          {metaDesc.length > 160 ? `${metaDesc.slice(0, 157)}…` : metaDesc || 'A short description will appear here — write a compelling meta description to improve click-through.'}
        </div>
        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px', display: 'flex', gap: '12px' }}>
          <span>★ {normalizedData.tags.length}/5 tags</span>
          <span>{normalizedData.description.length}/2500 chars</span>
        </div>
      </div>

      {/* Checklist */}
      <div>
        <div style={{
          fontSize: '11px',
          fontWeight: 700,
          color: T.inkMuted,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: '8px',
          padding: '0 2px',
        }}>
          Optimization Checklist
        </div>
        <div style={{ display: 'grid', gap: '2px' }}>
          {checks.map((check) => (
            <div
              key={check.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                borderRadius: '8px',
                background: check.passed ? `${T.moss}06` : `${T.brick}06`,
                transition: 'background 200ms',
              }}
            >
              <span style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 700,
                background: check.passed ? `${T.moss}20` : `${T.brick}15`,
                color: check.passed ? T.moss : T.brick,
              }}>
                {check.passed ? '✓' : '!'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '13px',
                  color: T.ink,
                  fontWeight: check.passed ? 500 : 600,
                }}>
                  {check.label}
                </div>
                {!check.passed && (
                  <div style={{ fontSize: '11px', color: T.inkMuted, marginTop: '2px' }}>
                    {check.hint}
                  </div>
                )}
              </div>
              <div style={{
                fontSize: '10px',
                fontWeight: 700,
                color: check.passed ? T.moss : T.inkMuted,
                flexShrink: 0,
              }}>
                +{check.weight}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Category-based keyword suggestions */}
      <div style={{
        padding: '12px 16px',
        background: `${T.indigo}06`,
        borderRadius: '10px',
        border: `1px solid ${T.indigo}15`,
      }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 700,
          color: T.inkMuted,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: '6px',
        }}>
          Suggested Keywords
        </div>
        <div style={{ fontSize: '12px', color: T.inkMid, marginBottom: '8px' }}>
          {onAddTag
            ? 'Curated from real legal/immigration search terms in this category. Click a chip to add it to your tags.'
            : 'Try incorporating these into your title, pitch, and description for better search ranking:'}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {getKeywordsForCategory(normalizedData.category).map((kw) => {
            const inTitle = normalizedData.title.toLowerCase().includes(kw.toLowerCase())
            const inDesc = normalizedData.description.toLowerCase().includes(kw.toLowerCase())
            const inTags = normalizedData.tags.some((t) => t.toLowerCase() === kw.toLowerCase())
            const used = inTitle || inDesc || inTags
            const tagsFull = normalizedData.tags.length >= 5 && !inTags
            const clickable = !!onAddTag && !inTags && !tagsFull
            const chipStyle: React.CSSProperties = {
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              background: used ? `${T.moss}15` : T.paper2,
              color: used ? T.moss : T.inkMid,
              border: `1px solid ${used ? `${T.moss}30` : T.rule}`,
              cursor: clickable ? 'pointer' : (tagsFull ? 'not-allowed' : 'default'),
              opacity: tagsFull ? 0.55 : 1,
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'background 0.12s, border-color 0.12s, transform 0.08s',
            }
            const hover = (e: React.MouseEvent<HTMLElement>, on: boolean) => {
              if (!clickable) return
              const el = e.currentTarget as HTMLElement
              el.style.background = on ? `${T.indigo}10` : T.paper2
              el.style.borderColor = on ? `${T.indigo}50` : T.rule
              el.style.color = on ? T.indigo : T.inkMid
            }
            const content = (
              <>
                {kw}
                {inTags ? (
                  <span aria-label="Already in tags">✓</span>
                ) : used ? (
                  <span aria-label="Already in title or description" style={{ fontSize: '10px' }}>✓</span>
                ) : clickable ? (
                  <span aria-hidden style={{ fontSize: '12px', lineHeight: 1, fontWeight: 700 }}>+</span>
                ) : tagsFull ? (
                  <span aria-label="Tag limit reached" style={{ fontSize: '10px', color: T.inkSoft }}>5/5</span>
                ) : null}
              </>
            )
            if (clickable) {
              return (
                <button
                  key={kw}
                  type="button"
                  aria-label={`Add "${kw}" to tags`}
                  onClick={() => onAddTag!(kw)}
                  onMouseEnter={(e) => hover(e, true)}
                  onMouseLeave={(e) => hover(e, false)}
                  style={chipStyle}
                >
                  {content}
                </button>
              )
            }
            return (
              <span
                key={kw}
                title={tagsFull ? 'Remove a tag first — limit is 5.' : undefined}
                style={chipStyle}
              >
                {content}
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

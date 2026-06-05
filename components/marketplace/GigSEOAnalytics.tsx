'use client'

/**
 * GigSEOAnalytics — dashboard view of every gig as ONE search-engine
 * artifact, not a field-by-field checklist.
 *
 * Top strip: 4 KPI tiles (overall score, primary cluster, intent
 * coverage, snippet readiness). Each gig expands into nine sections
 * that mirror the ten ranking-factor categories the audit grades:
 *
 *   1. SERP preview (the way Google would crawl + render the gig)
 *   2. Cluster coverage map (covered / missing / cannibalized)
 *   3. Intent diversity (7 buckets)
 *   4. Snippet engineering (live title + meta editor)
 *   5. Schema readiness (FAQPage / Service / Offer / HowTo / Breadcrumb)
 *   6. E-E-A-T trust surfacing
 *   7. Live Search Console alignment (skipped gracefully if no GSC)
 *   8. Voice / AI-tell hygiene
 *   9. Holistic re-pitch action (rewrite the whole artifact)
 *
 * The "Apply AI fix" buttons call the existing /api/gigs/[id]/seo-suggest
 * endpoint via the inline editor. We never add new AI endpoints.
 */

import React from 'react'
import { Btn, Card, Badge } from '../design/shared'
import { T, F } from './tokens'
import GigSEOInlineEditor, { type EditableField } from './GigSEOInlineEditor'
import type { AuditResult, SectionFinding, SectionId, IntentBucket } from '@/lib/seoAudit'

// ---------------------------------------------------------------------
// Types

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
  metrics?: { impressions?: number; clicks?: number; saves?: number } | null
}

interface AuditPayload {
  audit: AuditResult
  role: 'attorney' | 'consultant'
  gigSummary: { id: string; title: string; slug: string; status: string }
}

interface EditorState {
  field: EditableField
  prefillHint?: string
  autoDraft?: boolean
}

// ---------------------------------------------------------------------
// Tokens + score helpers

const NAVY = T.indigo
const NAVY_DEEP = T.indigoDeep
const PAPER = T.paper
const VELLUM = T.vellum
const SERIF = "'Cormorant Garamond', 'Garamond', Georgia, serif"

function scoreColor(score: number): string {
  if (score >= 80) return T.moss
  if (score >= 50) return '#D97706'
  return T.brick
}
function scoreLabel(score: number): string {
  if (score >= 80) return 'Great'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Needs work'
  return 'Poor'
}

const INTENT_LABELS: Record<IntentBucket, string> = {
  transactional: 'Transactional',
  informational: 'Informational',
  long_tail: 'Long-tail',
  comparison: 'Comparison',
  study_abroad: 'Study-Abroad',
  trust: 'Trust',
  cross_appeal: 'Cross-Appeal',
}

// ---------------------------------------------------------------------
// Subcomponents

function ScoreRing({ score, size = 60 }: { score: number; size?: number }) {
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = scoreColor(score)
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={T.rule} strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fontSize={size * 0.28} fontWeight={700} fill={color} fontFamily={F.ui}>
        {score}
      </text>
    </svg>
  )
}

function KpiTile({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <div style={{
      padding: '16px 18px',
      background: VELLUM,
      border: `1px solid ${T.rule}`,
      borderRadius: 12,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: color ?? T.ink, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: T.inkSoft }}>{sub}</div>}
    </div>
  )
}

function SerpPreview({ audit, slug, jurisdiction }: { audit: AuditResult; slug: string; jurisdiction: string | null }) {
  // Mock Google SERP card. Title truncates at 60 chars, URL shows the
  // marketplace breadcrumb, meta truncates at 160.
  const jx = jurisdiction || 'us'
  const url = `yousafeconsultancy.com › marketplace › ${jx} › ${slug}`
  const title = audit.snippet.finalTitle.length > 60
    ? audit.snippet.finalTitle.slice(0, 57) + '…'
    : audit.snippet.finalTitle
  const meta = audit.snippet.finalMeta.length > 160
    ? audit.snippet.finalMeta.slice(0, 157) + '…'
    : audit.snippet.finalMeta

  return (
    <div style={{
      padding: '14px 18px',
      background: '#FFFFFF',
      border: `1px solid ${T.rule}`,
      borderRadius: 10,
      fontFamily: 'Arial, sans-serif',
    }}>
      <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 4 }}>{url}</div>
      <div style={{ fontSize: 19, color: '#1a0dab', fontWeight: 400, lineHeight: 1.3, marginBottom: 4, cursor: 'pointer' }}>{title || '(no title set)'}</div>
      <div style={{ fontSize: 13, color: '#4d5156', lineHeight: 1.5 }}>{meta || '(no meta description — Google will improvise from your description)'}</div>
    </div>
  )
}

function SchemaBadgeRow({ audit }: { audit: AuditResult }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {audit.schemaChecks.map((c) => (
        <span key={c.schema}
          title={c.eligible ? `${c.schema} rich-result eligible` : c.missing.join('. ')}
          style={{
            padding: '4px 10px', borderRadius: 999,
            background: c.eligible ? `${T.moss}18` : `${T.rule}`,
            color: c.eligible ? T.moss : T.inkSoft,
            fontSize: 11, fontWeight: 700,
            border: `1px solid ${c.eligible ? `${T.moss}44` : T.rule}`,
          }}>
          {c.eligible ? '✓ ' : ''}{c.schema}
        </span>
      ))}
    </div>
  )
}

function FindingRow({
  finding, onApplyFix,
}: { finding: SectionFinding; onApplyFix: (e: EditorState) => void }) {
  const icon = finding.kind === 'ok' ? '✓' : finding.kind === 'warn' ? '!' : '✕'
  const color = finding.kind === 'ok' ? T.moss : finding.kind === 'warn' ? '#D97706' : T.brick
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      padding: '9px 12px',
      borderRadius: 6,
      background: finding.kind === 'ok' ? `${T.moss}08` : finding.kind === 'warn' ? '#FEF5E4' : `${T.brick}08`,
      marginBottom: 6,
    }}>
      <span style={{ color, fontWeight: 800, marginTop: 1, fontSize: 12, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.5 }}>
        <div style={{ color: T.ink, fontWeight: 600 }}>{finding.label}</div>
        {finding.detail && <div style={{ color: T.inkSoft, marginTop: 2 }}>{finding.detail}</div>}
      </div>
      {finding.fix && (
        <button
          type="button"
          onClick={() => onApplyFix({ field: finding.fix!.field as EditableField, prefillHint: finding.fix!.hint, autoDraft: true })}
          style={{
            flexShrink: 0, padding: '5px 10px', fontSize: 11, fontWeight: 700,
            background: NAVY, color: '#FFFFFF',
            border: 'none', borderRadius: 6, cursor: 'pointer',
            fontFamily: F.ui, whiteSpace: 'nowrap',
          }}>
          Apply AI fix
        </button>
      )}
    </div>
  )
}

function SectionCard({
  title, score, weight, summary, expanded, onToggle, children,
}: {
  title: string; score: number; weight: number; summary: string;
  expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const color = scoreColor(score)
  return (
    <div style={{
      border: `1px solid ${T.rule}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 8,
      background: VELLUM,
      marginBottom: 10,
    }}>
      <button type="button" onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px', background: 'transparent', border: 'none',
        cursor: 'pointer', fontFamily: F.ui, textAlign: 'left',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: `${color}18`, color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 13, flexShrink: 0,
        }}>{score}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: T.ink, fontFamily: SERIF }}>{title}</div>
          <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>{summary}</div>
        </div>
        <div style={{ fontSize: 11, color: T.inkSoft, fontWeight: 700 }}>{weight}% weight</div>
        <div style={{ color: T.inkSoft, fontSize: 11, marginLeft: 6, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</div>
      </button>
      {expanded && (
        <div style={{ padding: '4px 14px 14px', borderTop: `1px solid ${T.ruleSoft}` }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Cluster coverage map (Section 2)

function ClusterCoverageMap({
  audit, onApplyFix,
}: { audit: AuditResult; onApplyFix: (e: EditorState) => void }) {
  const entry = audit.clusterCoverage[0]
  if (!entry) {
    return (
      <div style={{ fontSize: 12, color: T.inkSoft, padding: '8px 0' }}>
        No primary cluster matched. Set category + subcategory + jurisdiction so the SEO knowledge base can target a keyword cluster for this gig.
      </div>
    )
  }
  const total = entry.covered.length + entry.missing.length
  const pct = total > 0 ? Math.round((entry.covered.length / total) * 100) : 0
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.inkSoft, marginBottom: 6 }}>
          <span>Primary cluster: <strong style={{ color: T.ink }}>{entry.cluster}</strong></span>
          <span style={{ fontWeight: 700, color: scoreColor(pct) }}>{pct}% coverage</span>
        </div>
        <div style={{ height: 8, background: T.rule, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: scoreColor(pct), transition: 'width 0.4s' }} />
        </div>
      </div>

      {entry.covered.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.moss, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Covered ({entry.covered.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {entry.covered.slice(0, 12).map((kw) => (
              <span key={kw} style={{
                padding: '4px 10px', borderRadius: 999,
                background: `${T.moss}14`, color: T.moss,
                fontSize: 11, fontWeight: 600,
                border: `1px solid ${T.moss}33`,
              }}>{kw}</span>
            ))}
          </div>
        </div>
      )}

      {entry.missing.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Missing — high value to add
          </div>
          {entry.missing.map((kw) => (
            <div key={kw} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 10px', marginBottom: 4,
              background: '#FEF5E4', border: '1px solid #F0E2C0', borderRadius: 6,
              fontSize: 12, color: T.ink,
            }}>
              <span style={{ fontWeight: 600 }}>{kw}</span>
              <button type="button"
                onClick={() => onApplyFix({ field: 'description', prefillHint: `Weave the keyword "${kw}" into the description prose naturally.`, autoDraft: true })}
                style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: 700,
                  background: NAVY, color: '#FFFFFF',
                  border: 'none', borderRadius: 5, cursor: 'pointer', fontFamily: F.ui,
                }}>
                Apply AI fix
              </button>
            </div>
          ))}
        </div>
      )}

      {entry.cannibalized.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.brick, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Cannibalized — splits ranking with your other gigs
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {entry.cannibalized.map((kw) => (
              <span key={kw} style={{
                padding: '4px 10px', borderRadius: 999,
                background: `${T.brick}14`, color: T.brick,
                fontSize: 11, fontWeight: 600,
                border: `1px solid ${T.brick}44`,
              }}>{kw}</span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: T.inkSoft, lineHeight: 1.5 }}>
            These primary keywords also appear in other gigs of yours, which splits Google's ranking signal between competing pages. Differentiate each gig's title + meta so only one targets each phrase.
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Intent diversity chips (Section 3)

function IntentDiversityGrid({
  audit, onApplyFix,
}: { audit: AuditResult; onApplyFix: (e: EditorState) => void }) {
  const buckets = Object.keys(audit.intent.buckets) as IntentBucket[]
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {buckets.map((b) => {
          const present = audit.intent.buckets[b].length > 0
          return (
            <span key={b}
              title={present
                ? `Represented by: ${audit.intent.buckets[b].slice(0, 4).join(', ')}`
                : 'No keyword in this intent bucket'}
              style={{
                padding: '5px 12px', borderRadius: 999,
                background: present ? `${NAVY}14` : 'transparent',
                color: present ? NAVY : T.inkSoft,
                border: `1px solid ${present ? `${NAVY}44` : T.rule}`,
                fontSize: 11, fontWeight: 700,
              }}>
              {present ? '✓ ' : '○ '}{INTENT_LABELS[b]}
            </span>
          )
        })}
      </div>
      <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 8 }}>
        {audit.intent.covered}/7 buckets covered. Diverse intent coverage means Google can rank this gig for the buyer's research, comparison, and trust queries — not just the obvious transactional one.
      </div>
      {audit.intent.covered < 5 && (
        <button type="button"
          onClick={() => onApplyFix({ field: 'description', prefillHint: 'Broaden the intent surface — add an informational, comparison, or long-tail keyword to the description.', autoDraft: true })}
          style={{
            padding: '6px 12px', fontSize: 11, fontWeight: 700,
            background: NAVY, color: '#FFFFFF',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: F.ui,
          }}>
          Apply AI fix — broaden intent coverage
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Snippet engineering live editor (Section 4)

function SnippetEditor({
  gig, onSaved,
}: { gig: GigItem; onSaved: () => void }) {
  const [seoTitle, setSeoTitle] = React.useState(gig.seo_title || gig.title || '')
  const [seoDesc, setSeoDesc] = React.useState(gig.seo_description || gig.pitch || '')
  const [saving, setSaving] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  const save = async () => {
    setSaving(true); setErr(null)
    try {
      const res = await fetch(`/api/gigs/${gig.id}`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seo_title: seoTitle, seo_description: seoDesc }),
      })
      if (!res.ok) {
        const p = await res.json().catch(() => ({}))
        throw new Error(p?.error?.message || `Save failed (${res.status})`)
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const titleColor = seoTitle.length > 60 ? T.brick : seoTitle.length >= 50 ? T.moss : '#D97706'
  const descColor = seoDesc.length > 160 ? T.brick : seoDesc.length >= 120 ? T.moss : '#D97706'

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>SEO title</label>
          <span style={{ fontSize: 11, fontWeight: 700, color: titleColor, fontVariantNumeric: 'tabular-nums' }}>{seoTitle.length}/60</span>
        </div>
        <input type="text" value={seoTitle} maxLength={70}
          onChange={(e) => setSeoTitle(e.target.value)}
          style={{
            width: '100%', padding: '8px 10px',
            border: `1px solid ${T.rule}`, borderRadius: 6,
            fontSize: 13, fontFamily: F.ui, color: T.ink,
          }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Meta description</label>
          <span style={{ fontSize: 11, fontWeight: 700, color: descColor, fontVariantNumeric: 'tabular-nums' }}>{seoDesc.length}/160</span>
        </div>
        <textarea value={seoDesc} rows={3} maxLength={200}
          onChange={(e) => setSeoDesc(e.target.value)}
          style={{
            width: '100%', padding: '8px 10px',
            border: `1px solid ${T.rule}`, borderRadius: 6,
            fontSize: 13, fontFamily: F.ui, color: T.ink, resize: 'vertical' as const,
          }} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
          Live SERP preview
        </div>
        <SerpPreview audit={{
          snippet: { finalTitle: seoTitle, finalMeta: seoDesc, titleLen: seoTitle.length, metaLen: seoDesc.length, primaryKeyword: null, leadsWithPrimary: false, hasCtaVerb: false, firstParaSnippet: '' },
        } as AuditResult} slug={gig.slug} jurisdiction={gig.jurisdiction} />
      </div>

      {err && <div style={{ color: T.brick, fontSize: 12, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={save} disabled={saving}
          style={{
            padding: '7px 16px', fontSize: 12, fontWeight: 700,
            background: saving ? T.rule : T.ink, color: '#FFFFFF',
            border: 'none', borderRadius: 6, cursor: saving ? 'wait' : 'pointer', fontFamily: F.ui,
          }}>
          {saving ? 'Saving…' : 'Save snippet'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Holistic re-pitch action (Section 9)

interface RepitchResult {
  field: string
  status: 'pending' | 'ok' | 'fail'
  value?: string
  error?: string
}

function HolisticRepitchPanel({
  gigId, onSaved,
}: { gigId: string; onSaved: () => void }) {
  const FIELDS_TO_REWRITE: Array<{ field: string; label: string }> = [
    { field: 'title',           label: 'Service title' },
    { field: 'seo_title',       label: 'SEO title' },
    { field: 'pitch',           label: 'Pitch / tagline' },
    { field: 'seo_description', label: 'Meta description' },
    { field: 'description',     label: 'Long description (first pass)' },
  ]
  const [results, setResults] = React.useState<RepitchResult[]>([])
  const [running, setRunning] = React.useState(false)
  const [committing, setCommitting] = React.useState(false)
  const [provider, setProvider] = React.useState<string>('')
  const [done, setDone] = React.useState(false)

  const run = async () => {
    setRunning(true); setDone(false)
    setResults(FIELDS_TO_REWRITE.map((f) => ({ field: f.field, status: 'pending' as const })))
    // Fire in parallel — the AI suggest endpoint is stateless per field
    // and the chain can take 2-15s sequentially. Parallel keeps the
    // spinner short and prevents one slow field from blocking the rest.
    const promises = FIELDS_TO_REWRITE.map(async (f) => {
      try {
        const res = await fetch(`/api/gigs/${gigId}/seo-suggest`, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: f.field, hint: 'Rewrite as part of a coordinated single-artifact pass — title + SEO title + pitch + meta + first paragraph should read as one coherent crawl-friendly target. Match jurisdiction. Lead with the primary cluster keyword.' }),
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          return { field: f.field, status: 'fail' as const, error: payload?.error?.message || `Failed (${res.status})` }
        }
        const data = payload?.data ?? payload
        const v = (data as { value: unknown }).value
        return { field: f.field, status: 'ok' as const, value: typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : '' }
      } catch (e) {
        return { field: f.field, status: 'fail' as const, error: e instanceof Error ? e.message : 'Failed' }
      }
    })
    // Update incrementally as each resolves so the user sees progress.
    let i = 0
    for (const p of promises) {
      const r = await p
      setResults((prev) => {
        const next = [...prev]
        next[i] = r
        return next
      })
      i += 1
    }
    setRunning(false)
    setDone(true)
    if (!provider) setProvider('AI suggest provider')
  }

  const commit = async () => {
    setCommitting(true)
    try {
      const patchBody: Record<string, string> = {}
      for (const r of results) if (r.status === 'ok' && typeof r.value === 'string') patchBody[r.field] = r.value
      const res = await fetch(`/api/gigs/${gigId}`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })
      if (!res.ok) {
        const p = await res.json().catch(() => ({}))
        throw new Error(p?.error?.message || `Save failed (${res.status})`)
      }
      onSaved()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.55, marginTop: 0 }}>
        Rewrites the title, SEO title, pitch, meta description, and first paragraph of the long description in one coordinated pass. Each field still respects its own length + voice rules — but they're written to read as ONE crawl-friendly artifact. Review the diff below, then commit when you're happy.
      </p>
      {results.length === 0 && (
        <button type="button" onClick={run}
          style={{
            padding: '9px 16px', fontSize: 12, fontWeight: 700,
            background: NAVY, color: '#FFFFFF',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: F.ui,
          }}>
          Rewrite this gig as one search-engine artifact
        </button>
      )}
      {results.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {running && (
            <div style={{ fontSize: 11, color: T.inkSoft, marginBottom: 8, fontStyle: 'italic' }}>
              Drafting via {provider || 'AI provider'}… this typically takes 2–15s per field. Running in parallel.
            </div>
          )}
          {results.map((r) => {
            const meta = FIELDS_TO_REWRITE.find((f) => f.field === r.field)
            return (
              <div key={r.field} style={{
                padding: '10px 12px', marginBottom: 6,
                background: r.status === 'ok' ? `${T.moss}08` : r.status === 'fail' ? `${T.brick}08` : '#FEF5E4',
                border: `1px solid ${r.status === 'ok' ? `${T.moss}33` : r.status === 'fail' ? `${T.brick}33` : '#F0E2C0'}`,
                borderRadius: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <strong style={{ fontSize: 12, color: T.ink }}>{meta?.label}</strong>
                  <span style={{ fontSize: 11, fontWeight: 700, color: r.status === 'ok' ? T.moss : r.status === 'fail' ? T.brick : '#B45309' }}>
                    {r.status === 'ok' ? '✓ Drafted' : r.status === 'fail' ? '✕ Failed' : '⏳ Drafting…'}
                  </span>
                </div>
                {r.status === 'ok' && r.value && (
                  <div style={{ fontSize: 12, color: T.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.value}</div>
                )}
                {r.status === 'fail' && (
                  <div style={{ fontSize: 11, color: T.brick }}>{r.error}</div>
                )}
              </div>
            )
          })}
          {done && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => setResults([])}
                style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 600,
                  background: 'transparent', color: T.inkSoft,
                  border: `1px solid ${T.rule}`, borderRadius: 6, cursor: 'pointer', fontFamily: F.ui,
                }}>Discard</button>
              <button type="button" onClick={commit} disabled={committing}
                style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 700,
                  background: committing ? T.rule : T.ink, color: '#FFFFFF',
                  border: 'none', borderRadius: 6, cursor: committing ? 'wait' : 'pointer', fontFamily: F.ui,
                }}>
                {committing ? 'Saving…' : 'Commit all to gig'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Per-gig holistic audit card (the expanded surface)

function GigAuditDetail({ gig, onSaved }: { gig: GigItem; onSaved: () => void }) {
  const [payload, setPayload] = React.useState<AuditPayload | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [expandedSections, setExpandedSections] = React.useState<Set<SectionId>>(new Set(['cluster_coverage']))
  const [editor, setEditor] = React.useState<EditorState | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/gigs/${gig.id}/seo-audit`, { credentials: 'same-origin' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error?.message || `Audit failed (${res.status})`)
      setPayload((json?.data ?? json) as AuditPayload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Audit failed')
    } finally {
      setLoading(false)
    }
  }, [gig.id])

  React.useEffect(() => { load() }, [load])

  const handleSavedInner = async () => {
    setEditor(null)
    await load()
    onSaved()
  }

  if (loading && !payload) return <div style={{ padding: 12, fontSize: 12, color: T.inkSoft }}>Loading holistic audit…</div>
  if (error && !payload) return (
    <div style={{ padding: 12, fontSize: 12, color: T.brick }}>
      {error}
      <button type="button" onClick={load} style={{ marginLeft: 12, padding: '4px 10px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 4, background: NAVY, color: '#FFFFFF', cursor: 'pointer' }}>Retry</button>
    </div>
  )
  if (!payload) return null

  const audit = payload.audit
  const toggle = (id: SectionId) => setExpandedSections((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const section = (id: SectionId) => audit.sections.find((s) => s.id === id)

  return (
    <div style={{ padding: '14px 16px 18px', background: PAPER, borderTop: `1px solid ${T.rule}` }}>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 18 }}>
        <KpiTile label="Overall score" value={`${audit.overall}/100`} sub={scoreLabel(audit.overall)} color={scoreColor(audit.overall)} />
        <KpiTile
          label="Primary cluster"
          value={audit.primaryCluster ?? '—'}
          sub={audit.clusterCoverage[0]
            ? `${audit.clusterCoverage[0].covered.length}/${audit.clusterCoverage[0].covered.length + audit.clusterCoverage[0].missing.length} keywords covered`
            : 'No cluster matched'}
        />
        <KpiTile
          label="Intent coverage"
          value={`${audit.intent.covered}/7`}
          sub={audit.intent.covered >= 5 ? 'Diverse intent surface' : 'Add more intent variety'}
          color={audit.intent.covered >= 5 ? T.moss : '#D97706'}
        />
        <KpiTile
          label="Snippet readiness"
          value={section('snippet_engineering')?.score ?? 0}
          sub={`${audit.snippet.titleLen}/60 title · ${audit.snippet.metaLen}/160 meta`}
          color={scoreColor(section('snippet_engineering')?.score ?? 0)}
        />
      </div>

      {/* Section 1 — Search artifact preview */}
      <div style={{ marginBottom: 18 }}>
        <h4 style={{ fontFamily: SERIF, fontSize: 16, color: T.ink, margin: '0 0 8px', fontWeight: 600 }}>
          How Google sees this gig
        </h4>
        <SerpPreview audit={audit} slug={gig.slug} jurisdiction={gig.jurisdiction} />
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
            Rich result eligibility
          </div>
          <SchemaBadgeRow audit={audit} />
        </div>
      </div>

      {/* Sections — collapsible */}
      <SectionCard title="Keyword cluster coverage" score={section('cluster_coverage')?.score ?? 0}
        weight={section('cluster_coverage')?.weight ?? 0}
        summary={section('cluster_coverage')?.summary ?? ''}
        expanded={expandedSections.has('cluster_coverage')}
        onToggle={() => toggle('cluster_coverage')}>
        <ClusterCoverageMap audit={audit} onApplyFix={setEditor} />
      </SectionCard>

      <SectionCard title="Intent diversity" score={section('intent_diversity')?.score ?? 0}
        weight={section('intent_diversity')?.weight ?? 0}
        summary={section('intent_diversity')?.summary ?? ''}
        expanded={expandedSections.has('intent_diversity')}
        onToggle={() => toggle('intent_diversity')}>
        <IntentDiversityGrid audit={audit} onApplyFix={setEditor} />
      </SectionCard>

      <SectionCard title="Snippet engineering" score={section('snippet_engineering')?.score ?? 0}
        weight={section('snippet_engineering')?.weight ?? 0}
        summary={section('snippet_engineering')?.summary ?? ''}
        expanded={expandedSections.has('snippet_engineering')}
        onToggle={() => toggle('snippet_engineering')}>
        <SnippetEditor gig={gig} onSaved={handleSavedInner} />
        <div style={{ marginTop: 14 }}>
          {(section('snippet_engineering')?.findings ?? []).map((f, i) => (
            <FindingRow key={i} finding={f} onApplyFix={setEditor} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Jurisdiction alignment" score={section('jurisdiction_alignment')?.score ?? 0}
        weight={section('jurisdiction_alignment')?.weight ?? 0}
        summary={section('jurisdiction_alignment')?.summary ?? ''}
        expanded={expandedSections.has('jurisdiction_alignment')}
        onToggle={() => toggle('jurisdiction_alignment')}>
        {(section('jurisdiction_alignment')?.findings ?? []).map((f, i) => (
          <FindingRow key={i} finding={f} onApplyFix={setEditor} />
        ))}
      </SectionCard>

      <SectionCard title="Schema.org readiness" score={section('schema_readiness')?.score ?? 0}
        weight={section('schema_readiness')?.weight ?? 0}
        summary={section('schema_readiness')?.summary ?? ''}
        expanded={expandedSections.has('schema_readiness')}
        onToggle={() => toggle('schema_readiness')}>
        {audit.schemaChecks.map((c) => (
          <div key={c.schema} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            padding: '9px 12px', marginBottom: 6,
            background: c.eligible ? `${T.moss}08` : `${T.rule}66`,
            border: `1px solid ${c.eligible ? `${T.moss}33` : T.rule}`,
            borderRadius: 6,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 2 }}>
                {c.eligible ? '✓ ' : '○ '}{c.schema}
              </div>
              {!c.eligible && c.missing.length > 0 && (
                <div style={{ fontSize: 11, color: T.inkSoft, lineHeight: 1.5 }}>
                  {c.missing.join('. ')}.
                </div>
              )}
            </div>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="E-E-A-T trust surfacing" score={section('eeat_surfacing')?.score ?? 0}
        weight={section('eeat_surfacing')?.weight ?? 0}
        summary={section('eeat_surfacing')?.summary ?? ''}
        expanded={expandedSections.has('eeat_surfacing')}
        onToggle={() => toggle('eeat_surfacing')}>
        {(section('eeat_surfacing')?.findings ?? []).map((f, i) => (
          <FindingRow key={i} finding={f} onApplyFix={setEditor} />
        ))}
      </SectionCard>

      <SectionCard title="Internal-link surface" score={section('internal_link_surface')?.score ?? 0}
        weight={section('internal_link_surface')?.weight ?? 0}
        summary={section('internal_link_surface')?.summary ?? ''}
        expanded={expandedSections.has('internal_link_surface')}
        onToggle={() => toggle('internal_link_surface')}>
        {(section('internal_link_surface')?.findings ?? []).map((f, i) => (
          <FindingRow key={i} finding={f} onApplyFix={setEditor} />
        ))}
      </SectionCard>

      {audit.gscEnabled && (
        <SectionCard title="Live Search Console alignment" score={section('gsc_alignment')?.score ?? 0}
          weight={section('gsc_alignment')?.weight ?? 0}
          summary={section('gsc_alignment')?.summary ?? ''}
          expanded={expandedSections.has('gsc_alignment')}
          onToggle={() => toggle('gsc_alignment')}>
          {(section('gsc_alignment')?.findings ?? []).map((f, i) => (
            <FindingRow key={i} finding={f} onApplyFix={setEditor} />
          ))}
        </SectionCard>
      )}

      <SectionCard title="Voice / AI-tell hygiene" score={section('voice_hygiene')?.score ?? 0}
        weight={section('voice_hygiene')?.weight ?? 0}
        summary={section('voice_hygiene')?.summary ?? ''}
        expanded={expandedSections.has('voice_hygiene')}
        onToggle={() => toggle('voice_hygiene')}>
        {(section('voice_hygiene')?.findings ?? []).map((f, i) => (
          <FindingRow key={i} finding={f} onApplyFix={setEditor} />
        ))}
        {audit.bannedPhrasesFound.length > 0 && (
          <div style={{ marginTop: 8, padding: '10px 12px', background: `${T.brick}08`, border: `1px solid ${T.brick}33`, borderRadius: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.brick, marginBottom: 4 }}>AI tells detected</div>
            <div style={{ fontSize: 12, color: T.ink, lineHeight: 1.5 }}>
              {audit.bannedPhrasesFound.map((p) => <code key={p} style={{ background: T.rule, padding: '1px 6px', borderRadius: 3, marginRight: 4, fontSize: 11 }}>{p}</code>)}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Cannibalization callout */}
      {audit.cannibalizationWarnings.length > 0 && (
        <div style={{
          marginTop: 12, padding: '12px 14px',
          background: `${T.brick}08`, border: `1px solid ${T.brick}33`, borderRadius: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.brick, marginBottom: 6 }}>
            Keyword cannibalization across your gigs
          </div>
          <div style={{ fontSize: 12, color: T.ink, lineHeight: 1.55, marginBottom: 8 }}>
            These primary keywords appear in multiple of your active gigs, which splits ranking signals between competing pages:
          </div>
          {audit.cannibalizationWarnings.map((w) => (
            <div key={w.keyword} style={{ fontSize: 12, color: T.ink, marginBottom: 4 }}>
              · <strong>{w.keyword}</strong> — also in: {w.otherGigs.map((g) => g.title).join(', ')}
            </div>
          ))}
        </div>
      )}

      {/* Holistic re-pitch */}
      <div style={{
        marginTop: 18, padding: '14px 16px',
        background: VELLUM, border: `1px solid ${NAVY}33`, borderRadius: 10,
      }}>
        <div style={{ fontFamily: SERIF, fontSize: 16, color: T.ink, fontWeight: 600, marginBottom: 4 }}>
          Holistic re-pitch
        </div>
        <HolisticRepitchPanel gigId={gig.id} onSaved={handleSavedInner} />
      </div>

      {/* Inline editor overlay — used by every "Apply AI fix" button */}
      {editor && (
        <div style={{ marginTop: 14 }}>
          <GigSEOInlineEditor
            gigId={gig.id}
            field={editor.field}
            initialValue={initialValueForField(gig, editor.field)}
            prefillHint={editor.prefillHint}
            autoDraft={editor.autoDraft}
            onSaved={handleSavedInner}
            onCancel={() => setEditor(null)}
          />
        </div>
      )}
    </div>
  )
}

function initialValueForField(gig: GigItem, field: EditableField): string | string[] {
  switch (field) {
    case 'title':           return gig.title || ''
    case 'seo_title':       return gig.seo_title || ''
    case 'seo_description': return gig.seo_description || ''
    case 'pitch':           return gig.pitch || ''
    case 'description':     return gig.description || ''
    case 'tags':            return Array.isArray(gig.tags) ? gig.tags : []
    case 'category':        return gig.category || ''
    case 'jurisdiction':    return gig.jurisdiction || ''
  }
}

// ---------------------------------------------------------------------
// Per-gig list card (collapsed header)

function GigScoreCard({ gig, onSaved }: { gig: GigItem; onSaved: () => void }) {
  const [expanded, setExpanded] = React.useState(false)
  // Lazy quick-score: avoid hitting /seo-audit for every gig on first load.
  // Once expanded, the GigAuditDetail child fetches the holistic audit.
  // For the collapsed header we estimate via raw field signals so the
  // user has *something* to sort by — but the source of truth lives in
  // the holistic audit shown on expand.
  const quickScore = React.useMemo(() => quickHeaderScore(gig), [gig.id, gig.title, gig.seo_title, gig.seo_description, gig.pitch, gig.description, gig.tags, gig.category, gig.jurisdiction, gig.subcategory])
  const color = scoreColor(quickScore)

  return (
    <Card style={{
      padding: 0,
      border: `1px solid ${quickScore >= 80 ? `${T.moss}33` : quickScore >= 50 ? '#D9770633' : `${T.brick}33`}`,
      borderLeft: `4px solid ${color}`,
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
        role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}>
        <ScoreRing score={quickScore} size={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: SERIF }}>
              {gig.title}
            </span>
            <Badge color={gig.status === 'active' ? 'green' : 'orange'} style={{ fontSize: 10 }}>{gig.status}</Badge>
            {gig.category && <span style={{ fontSize: 11, color: T.inkSoft }}>· {gig.category}</span>}
            {gig.jurisdiction && <span style={{ fontSize: 11, color: T.inkSoft, textTransform: 'uppercase' }}>· {gig.jurisdiction}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 12, color: T.inkSoft }}>
            <span>Quick score: {quickScore}/100 · {scoreLabel(quickScore)}</span>
            {gig.metrics?.impressions && <span>· {gig.metrics.impressions} views</span>}
            <span>· Expand for holistic audit</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <a href={`/dashboard/gigs/${gig.id}/edit`} style={{ textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>
            <Btn variant="secondary" size="sm">Edit gig</Btn>
          </a>
          <span style={{ color: T.inkSoft, fontSize: 12, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
      </div>
      {expanded && <GigAuditDetail gig={gig} onSaved={onSaved} />}
    </Card>
  )
}

// Quick header-only score so the list view stays performant. The
// authoritative score lives in the holistic audit (/seo-audit). This
// is a cheap proxy: title presence + length, meta presence + length,
// category/jurisdiction set, tags between 3 and 5. We deliberately
// avoid duplicating the full audit logic client-side.
function quickHeaderScore(gig: GigItem): number {
  let s = 0
  const finalTitle = gig.seo_title || gig.title || ''
  const finalMeta = gig.seo_description || gig.pitch || ''
  if (finalTitle.length >= 20 && finalTitle.length <= 60) s += 20
  if (finalMeta.length >= 120 && finalMeta.length <= 160) s += 20
  if ((gig.description || '').length >= 300) s += 15
  if (gig.category) s += 10
  if (gig.subcategory) s += 5
  if (gig.jurisdiction) s += 10
  if (Array.isArray(gig.tags) && gig.tags.length >= 3 && gig.tags.length <= 5) s += 10
  if (gig.seo_title && gig.seo_title !== gig.title) s += 5
  if (gig.seo_description) s += 5
  return Math.min(100, s)
}

// ---------------------------------------------------------------------
// Top-level dashboard

export default function GigSEOAnalytics() {
  const [gigs, setGigs] = React.useState<GigItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [sortBy, setSortBy] = React.useState<'score-asc' | 'score-desc' | 'title' | 'status'>('score-asc')

  const loadGigs = React.useCallback(async () => {
    setError(null)
    try {
      const r = await fetch('/api/gigs', { credentials: 'same-origin' })
      const payload = await r.json().catch(() => ({}))
      const data = payload?.data ?? payload
      setGigs((data?.gigs ?? []).filter((g: GigItem) => g.status !== 'deleted'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load gigs.')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { loadGigs() }, [loadGigs])

  const sorted = React.useMemo(() => {
    const scored = gigs.map((gig) => ({ gig, score: quickHeaderScore(gig) }))
    scored.sort((a, b) => {
      switch (sortBy) {
        case 'score-desc': return b.score - a.score
        case 'title':      return a.gig.title.localeCompare(b.gig.title)
        case 'status': {
          const order = { active: 0, draft: 1, suspended: 2, archived: 3 }
          return ((order as Record<string, number>)[a.gig.status] ?? 99) - ((order as Record<string, number>)[b.gig.status] ?? 99)
        }
        case 'score-asc': default: return a.score - b.score
      }
    })
    return scored
  }, [gigs, sortBy])

  const avg = sorted.length > 0 ? Math.round(sorted.reduce((sum, s) => sum + s.score, 0) / sorted.length) : 0

  if (loading) return <div style={{ color: T.inkSoft, fontSize: 14 }}>Loading SEO analytics…</div>
  if (error) return (
    <div>
      <div style={{ color: T.brick, fontSize: 14 }}>Error: {error}</div>
      <Btn variant="secondary" size="sm" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>Retry</Btn>
    </div>
  )
  if (gigs.length === 0) return (
    <Card style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: T.ink, marginBottom: 8, fontFamily: SERIF }}>No services yet</div>
      <div style={{ color: T.inkSoft, fontSize: 13, lineHeight: 1.6 }}>
        Create your first service to start tracking SEO performance.<br />
        <a href="/dashboard/gigs/new" style={{ color: NAVY, fontWeight: 600, textDecoration: 'none' }}>Create a service →</a>
      </div>
    </Card>
  )

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Headline summary — keep simple here; per-gig holistic is the star */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ color: T.inkSoft, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Average quick score</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <ScoreRing score={avg} size={44} />
            <div>
              <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: T.ink }}>{avg}/100</div>
              <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>{sorted.length} service{sorted.length > 1 ? 's' : ''}</div>
            </div>
          </div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ color: T.inkSoft, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>How this works</div>
          <div style={{ marginTop: 8, fontSize: 12, color: T.inkSoft, lineHeight: 1.55 }}>
            The list score is a quick proxy. Expand a gig to run the holistic audit — keyword cluster coverage, intent diversity, schema readiness, E-E-A-T, live Search Console signals, and voice hygiene.
          </div>
        </Card>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
        padding: '12px 16px', background: VELLUM,
        border: `1px solid ${T.rule}`, borderRadius: 12,
      }}>
        <div style={{ fontSize: 13, color: T.inkMid }}>{gigs.length} service{gigs.length > 1 ? 's' : ''} · Sort by:</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {([
            { value: 'score-asc',  label: 'Worst first' },
            { value: 'score-desc', label: 'Best first' },
            { value: 'title',      label: 'Title' },
            { value: 'status',     label: 'Status' },
          ] as const).map((opt) => (
            <button key={opt.value} onClick={() => setSortBy(opt.value)}
              style={{
                padding: '5px 12px', borderRadius: 999,
                border: `1px solid ${sortBy === opt.value ? NAVY : T.rule}`,
                background: sortBy === opt.value ? `${NAVY}12` : VELLUM,
                color: sortBy === opt.value ? NAVY : T.inkSoft,
                fontSize: 12, fontWeight: sortBy === opt.value ? 700 : 500,
                cursor: 'pointer', fontFamily: F.ui,
              }}>{opt.label}</button>
          ))}
        </div>
      </div>

      {/* Gig score cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map(({ gig }) => (
          <GigScoreCard key={gig.id} gig={gig} onSaved={loadGigs} />
        ))}
      </div>

      {/* Silence unused warning on NAVY_DEEP — kept as a token for future
          gradient accents on the score ring. */}
      <span style={{ display: 'none' }}>{NAVY_DEEP}</span>
    </div>
  )
}

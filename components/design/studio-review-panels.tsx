'use client'

import React from 'react'
import { studioTokens as E } from './studio-tokens'
import { shipGateFromResponse, type ShipGate } from '@/lib/seoFactory/currentGate'
import {
  shipGateFromAuditPayload,
  shipGateIsCleared,
  CardHeader,
  formatDate,
  gateBadge,
  statusBadge,
  type ContentJob,
  type JobStatus,
} from './studio-ui-shared'

const C = E


// ── REVIEW · DRAFTS VAULT ──
// The single review pane. Every drafted / pending / pr_created job appears
// here with its gate score, warnings, and blockers visible inline. Click a
// document to open the full AI editor (AdminInlineEditor) for re-audit,
// fix-all, per-issue fix, save, and approval. No separate DefendPanel.
function topicKey(value: string | null | undefined): string {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function ReviewDraftsPanel({
  jobs, gateByJob, selectedJobId, onOpenJob,
  reviewAuditResult, setActionNotice,
  shipGateByJob,
  activeTopic,
  inFlightJobId,
}: {
  jobs: ContentJob[]
  gateByJob: Map<string, { score: number | null; passed: boolean | null }>
  selectedJobId: string | null
  onOpenJob: (j: ContentJob) => void
  reviewAuditResult?: {
    score: number; ok: boolean; blockers: number; warnings: number
    summary: string; annotations?: Array<{ code: string; severity: string; message: string; fix: string }>
    shipReady?: boolean | null
    depthGate?: { ok: boolean; message: string } | null
  } | null
  setActionNotice?: (msg: string) => void
  /** Canonical ship-gate snapshots keyed by job id (from the studio desk). */
  shipGateByJob?: ReadonlyMap<string, ShipGate> | null
  /** In-flight brief topic — Review lists this brief's job, not the whole queue. */
  activeTopic?: string | null
  /** Generate-stream job id when a draft is in flight. */
  inFlightJobId?: string | null
}) {
  const queueDrafts = jobs.filter((j) => ['pending', 'drafting', 'publishing', 'pr_created'].includes(j.status))
  const focusId = selectedJobId || inFlightJobId || null
  const briefKey = topicKey(activeTopic)
  const hasActiveWork = Boolean(focusId || briefKey)
  const drafts = hasActiveWork
    ? queueDrafts.filter((j) => {
        if (focusId && j.id === focusId) return true
        if (!briefKey) return false
        return topicKey(j.topic) === briefKey
          || topicKey(j.title) === briefKey
          || topicKey(j.primary_keyword) === briefKey
      })
    : []
  const STATUS_LABEL: Record<string, { label: string; fg: string; bg: string }> = {
    pending: { label: 'Pending', fg: E.amber, bg: E.amberSoft },
    drafting: { label: 'Drafting', fg: E.ember, bg: E.amberSoft },
    publishing: { label: 'Publishing', fg: E.blue, bg: E.blueSoft },
    pr_created: { label: 'PR open', fg: E.green, bg: E.greenSoft },
  }

  if (drafts.length === 0) {
    return (
      <div data-testid="studio-review-drafts" style={{ padding: '40px 32px', background: E.paper, border: `1px solid ${E.hairline}`, borderRadius: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
        <div style={{ fontFamily: C.serif, fontSize: 20, color: E.ink, marginBottom: 8 }}>
          {hasActiveWork ? 'No job for this brief yet' : 'Document Vault'}
        </div>
        <p style={{ color: E.inkMuted, fontFamily: C.serif, fontStyle: 'italic', margin: '0 auto', maxWidth: 440 }} data-testid="studio-review-empty-brief">
          {hasActiveWork
            ? 'Review is scoped to the selected job and in-flight brief. Generate a draft for this topic before audit — unrelated queue documents stay in Draft operations, not here.'
            : 'Every draft from the pipeline lands here. Open any document to revise it with the AI editor, run gate checks, and clear blockers before approval.'}
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          <span style={{ padding: '4px 10px', fontSize: 9, fontFamily: C.mono, color: E.inkDim, border: `1px solid ${E.hairline}` }}>
            {hasActiveWork ? 'No job for the current brief' : 'No pending drafts'}
          </span>
          {!hasActiveWork && (
            <>
              <span style={{ padding: '4px 10px', fontSize: 9, fontFamily: C.mono, color: E.inkDim, border: `1px solid ${E.hairline}` }}>No drafting jobs</span>
              <span style={{ padding: '4px 10px', fontSize: 9, fontFamily: C.mono, color: E.inkDim, border: `1px solid ${E.hairline}` }}>No PRs ready</span>
            </>
          )}
        </div>
      </div>
    )
  }

  // Aggregate stats
  const totalWarnings = drafts.reduce((sum, j) => {
    const audit = j.audit_json as any
    return sum + (audit?.warnings?.length || 0)
  }, 0)
  // A document is "gate cleared" ONLY when the canonical ship-gate snapshot
  // exists and passes (shipReady === true && blockers === 0). The score —
  // no matter how high — and a mere finished draft are never a pass. The live
  // re-audit of the selected job supersedes persisted evidence; unknown states
  // fall through to "awaiting audit" (never counted as cleared).
  const resolveGate = (j: ContentJob): ShipGate => {
    if (selectedJobId === j.id && reviewAuditResult) {
      if (reviewAuditResult.shipReady == null) return null
      return shipGateFromResponse({
        shipReady: reviewAuditResult.shipReady,
        blockers: reviewAuditResult.blockers,
      })
    }
    const fromBook = shipGateByJob?.get(j.id)
    if (fromBook !== undefined) return fromBook
    return shipGateFromAuditPayload(j.audit_json ?? null)
  }
  const clearedCount = drafts.filter((j) => shipGateIsCleared(resolveGate(j))).length
  const awaitingAuditCount = drafts.filter((j) => resolveGate(j) === null).length

  return (
    <div data-testid="studio-review-drafts" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ── Vault stats header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px',
        background: E.paper, border: `1px solid ${E.hairline}`,
        flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700 }}>
          THIS BRIEF · {drafts.length} DOCUMENT{drafts.length === 1 ? '' : 'S'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginLeft: 'auto' }}>
          <span style={{ fontSize: 10, fontFamily: C.mono, color: E.inkMuted }}>
            {clearedCount} gate{clearedCount === 1 ? '' : 's'} cleared
          </span>
          {awaitingAuditCount > 0 && (
            <span style={{ fontSize: 10, fontFamily: C.mono, color: C.orange }}>
              {awaitingAuditCount} awaiting audit
            </span>
          )}
          <span style={{ fontSize: 10, fontFamily: C.mono, color: totalWarnings > 0 ? C.orange : E.mossGreen }}>
            {totalWarnings} warning{totalWarnings === 1 ? '' : 's'}
          </span>
          <span style={{ fontSize: 10, fontFamily: C.mono, color: E.inkMuted }}>
            click to open editor
          </span>
        </div>
      </div>

      {/* ── Draft document list ── */}
      {drafts.map((j) => {
        const g = gateByJob.get(j.id)
        const score = g?.score ?? j.seo_score ?? null
        const gate = resolveGate(j)
        const cleared = shipGateIsCleared(gate)
        // Badge honesty: green is earned ONLY by a canonical ship gate that is
        // actually cleared (shipReady === true && blockers === 0). A high score
        // with no gate evidence stays neutral; a known-blocked gate stays red.
        const badgeColor = cleared
          ? { bg: E.greenSoft, fg: E.green, bd: '#BBF7D0' }
          : gate !== null
            ? { bg: E.redSoft, fg: E.red, bd: E.redBorder }
            : { bg: E.parchment, fg: E.inkMuted, bd: E.hairline }
        const st = STATUS_LABEL[j.status] || { label: j.status, fg: E.inkMuted, bg: E.parchment }
        const active = selectedJobId === j.id
        const audit = j.audit_json as any
        const warnings = audit?.warnings || []
        const blockers = audit?.blockers || []
        const words = j.word_count ?? (audit?.wordCount ?? 0)

        return (
          <div
            key={j.id}
            data-testid={`studio-review-draft-${j.id}`}
            style={{
              background: active ? '#FFFBEB' : E.ivory,
              border: `1px solid ${active ? E.gold : E.hairline}`,
              borderRadius: 0, overflow: 'hidden',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            {/* Row: title + meta + actions */}
            <div
              onClick={() => onOpenJob(j)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
                cursor: 'pointer',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: C.serif, fontSize: 15, color: E.ink, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {j.title}
                </div>
                <div style={{ fontSize: 10.5, color: E.inkMuted, fontFamily: C.mono, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>{j.region}</span>
                  <span>{(j.content_type || '').toUpperCase()}</span>
                  <span>{words} words</span>
                  <span>{new Date(j.updated_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Gate score badge */}
              {score != null && (
                <div style={{
                  width: 40, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: C.mono, fontWeight: 800, fontSize: 13, flexShrink: 0,
                  background: badgeColor.bg,
                  color: badgeColor.fg,
                  border: `1px solid ${badgeColor.bd}`,
                }}>
                  {score}
                </div>
              )}

              {/* Warnings chip */}
              {warnings.length > 0 && (
                <span style={{
                  padding: '3px 8px', fontSize: 9, fontWeight: 700, fontFamily: C.mono,
                  background: '#FEF3C7', color: '#92400E', borderRadius: 0,
                }}>
                  {warnings.length} warning{warnings.length === 1 ? '' : 's'}
                </span>
              )}

              {/* Blockers chip */}
              {blockers.length > 0 && (
                <span style={{
                  padding: '3px 8px', fontSize: 9, fontWeight: 700, fontFamily: C.mono,
                  background: '#FEE2E2', color: '#991B1B', borderRadius: 0,
                }}>
                  {blockers.length} blocker{blockers.length === 1 ? '' : 's'}
                </span>
              )}

              <span style={{ padding: '3px 8px', fontSize: 9.5, fontWeight: 700, fontFamily: C.mono, background: st.bg, color: st.fg, whiteSpace: 'nowrap' }}>{st.label}</span>

              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenJob(j) }}
                style={{ padding: '7px 14px', background: E.gold, color: E.ivory, border: 'none', borderRadius: 0, cursor: 'pointer', fontFamily: C.serif, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
              >
                Open in editor →
              </button>
            </div>

            {/* Inline expand: show warnings when active */}
            {active && warnings.length > 0 && (
              <div style={{
                padding: '10px 16px', borderTop: `1px solid ${E.hairline}`,
                background: '#FFFBEB',
              }}>
                <div style={{ fontSize: 10, fontFamily: C.mono, color: '#B45309', fontWeight: 700, marginBottom: 6 }}>
                  {warnings.length} WARNING{warnings.length === 1 ? '' : 'S'} — OPEN EDITOR TO FIX
                </div>
                {warnings.slice(0, 5).map((w: any, i: number) => (
                  <div key={i} style={{ fontSize: 10, color: '#92400E', fontFamily: C.serif, marginBottom: 3 }}>
                    • {w.message || w.code || String(w)}
                  </div>
                ))}
                {warnings.length > 5 && (
                  <div style={{ fontSize: 10, color: E.inkDim, fontFamily: C.mono }}>
                    + {warnings.length - 5} more warnings
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}


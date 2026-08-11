'use client'

import React from 'react'
import { studioTokens as E } from './studio-tokens'
import {
  CardHeader,
  formatDate,
  gateBadge,
  statusBadge,
  type ContentJob,
  type JobStatus,
} from './studio-ui-shared'

const C = E


// ── STAGE INTRO ──
// Editorial spread that opens each stage card. Mirrors a research
// workflow header: roman numeral, serif title, scope chips, and a "next
// stage" affordance to drive linearity. Also renders the seven-stage
// compass rail so the admin never loses place.
// ── VI · DEFEND PANEL ──
// Surfaces the gate state for the selected job and lists blockers with
// remediation guidance. Renders inline-editor / re-audit actions.
export function DefendPanel({
  selectedJob, gateFor, jobs, gateByJob, onOpenJob, setActionNotice,
  reviewAuditResult, onApprove,
}: {
  selectedJob: ContentJob | null
  gateFor: { score: number | null; passed: boolean | null } | null | undefined
  jobs: ContentJob[]
  gateByJob: Map<string, { score: number | null; passed: boolean | null }>
  onOpenJob: (j: ContentJob) => void
  setActionNotice?: (msg: string) => void
  reviewAuditResult?: {
    score: number; ok: boolean; blockers: number; warnings: number
    summary: string; annotations?: Array<{ code: string; severity: string; message: string; fix: string }>
    shipReady?: boolean | null
    depthGate?: { ok: boolean; message: string } | null
  } | null
  onApprove?: () => void
}) {
  const empty = !selectedJob
  const score = (gateFor?.score ?? null) as number | null
  const passed = (gateFor?.passed ?? null) as boolean | null
  const ok = passed === true || (score != null && score >= 90)
  const blockers = (reviewAuditResult?.annotations || [])
    .filter(a => a.severity === 'blocker')
    .map(a => ({ code: a.code, reason: a.message }))
  return (
    <div data-testid="studio-defend-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {empty && (
        <div style={{
          padding: '40px 32px', background: E.paper,
          border: `1px solid ${E.hairline}`, borderRadius: 0, textAlign: 'center',
        }}>
          <div style={{ fontFamily: C.serif, fontSize: 22, color: E.ink, marginBottom: 8 }}>No draft selected</div>
          <p style={{ color: E.inkMuted, fontFamily: C.serif, fontStyle: 'italic', margin: 0 }}>
            Open a job from chapter IV · Draft to defend it here. The defense surfaces each gate blocker with the exact remediation guidance.
          </p>
        </div>
      )}
      {selectedJob && (
        <>
          <div style={{ padding: 18, background: E.paper, border: `1px solid ${E.hairline}`, borderRadius: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700 }}>
                  STAGE IV · REVIEW
                </div>
                <h3 style={{ margin: '4px 0 0', fontFamily: C.serif, fontSize: 22, color: E.ink }}>
                  {selectedJob.title}
                </h3>
              </div>
              <div style={{
                padding: '6px 14px', borderRadius: 0, fontFamily: C.serif, fontSize: 14, fontWeight: 700,
                background: ok ? '#0f7a3a' : (score != null && score >= 70 ? '#b87a00' : '#a32525'),
                color: E.ivory,
              }}>
                {ok ? '✓ GATE CLEARED' : score != null ? `Score ${score}/100` : 'No gate yet'}
              </div>
            </div>
            <div style={{ fontSize: 12, color: E.inkMuted, fontFamily: C.mono }}>
              {selectedJob.region} · {(selectedJob.content_type || '').toUpperCase()} · slug <b>{selectedJob.slug || '—'}</b>
            </div>
          </div>
          {reviewAuditResult && (reviewAuditResult.warnings > 0 || reviewAuditResult.shipReady === false) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '11px 16px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 0 }}>
              {reviewAuditResult.shipReady === false && (
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#B45309' }}>
                  {reviewAuditResult.depthGate && !reviewAuditResult.depthGate.ok
                    ? `Ship gate blocked — ${reviewAuditResult.depthGate.message}`
                    : 'Ship gate blocked — resolve remaining blockers in the editor'}
                </div>
              )}
              {reviewAuditResult.warnings > 0 && (
                <div style={{ fontSize: 11, color: '#92400E' }}>
                  {reviewAuditResult.warnings} warning{reviewAuditResult.warnings === 1 ? '' : 's'} (quality + indexability) — do not block shipping; fix them in the editor below for best reader engagement and AI-overview eligibility.
                </div>
              )}
            </div>
          )}
          {blockers.length === 0 ? (
            <div style={{
              padding: 18, background: '#e9f7ee', border: '1px solid #0f7a3a', borderRadius: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ fontFamily: C.serif, color: '#0a4d24', fontSize: 14 }}>
                ✓ All quality blockers cleared. Ready to advance to V · Approve.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onOpenJob(selectedJob)}
                  style={{
                    padding: '8px 18px', background: 'transparent', color: '#0f7a3a',
                    border: '1px solid #0f7a3a', borderRadius: 0, cursor: 'pointer',
                    fontFamily: C.serif, fontSize: 13, fontWeight: 600,
                  }}
                >
                  Review in editor →
                </button>
                {onApprove && (
                  <button
                    type="button"
                    onClick={onApprove}
                    style={{
                      padding: '8px 18px', background: E.gold, color: E.ivory,
                      border: 'none', borderRadius: 0, cursor: 'pointer',
                      fontFamily: C.serif, fontSize: 13, fontWeight: 700,
                    }}
                  >
                    Next: Approve →
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {blockers.map((b, i) => (
                <div key={i} style={{
                  padding: 14, background: '#fff5f0', borderLeft: '4px solid #a32525',
                }}>
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: '#a32525', fontWeight: 700, letterSpacing: '0.14em' }}>
                    BLOCKER · {(b.code || 'unknown').toUpperCase()}
                  </div>
                  <p style={{ margin: '4px 0', fontFamily: C.serif, color: '#3a0a0a', fontSize: 14 }}>{b.reason || 'No reason recorded.'}</p>

                </div>
              ))}
              <button
                onClick={() => onOpenJob(selectedJob)}
                style={{
                  alignSelf: 'flex-start',
                  padding: '10px 20px',
                  background: E.gold, color: E.ivory,
                  fontFamily: C.serif, fontSize: 14, fontWeight: 600,
                  border: 'none', borderRadius: 0, cursor: 'pointer',
                }}
              >
                Open in inline editor →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}


// ── REVIEW · DRAFTS DOCUMENT LIST ──
// Every drafted job appears here as a document the admin can open and revise
// with the full AI editor (Re-audit · Fix all · Fix per issue · Fix warnings ·
// Save · Draft history). Drafts graduate to V · Approve only after gates clear.
export function ReviewDraftsPanel({
  jobs, gateByJob, selectedJobId, onOpenJob,
}: {
  jobs: ContentJob[]
  gateByJob: Map<string, { score: number | null; passed: boolean | null }>
  selectedJobId: string | null
  onOpenJob: (j: ContentJob) => void
}) {
  const drafts = jobs.filter((j) => j.content && ['pending', 'drafting', 'publishing', 'pr_created'].includes(j.status))
  const STATUS_LABEL: Record<string, { label: string; fg: string; bg: string }> = {
    pending: { label: 'Pending', fg: '#92400E', bg: '#FEF3C7' },
    drafting: { label: 'Drafting', fg: '#B45309', bg: '#FEF3C7' },
    publishing: { label: 'Publishing', fg: '#1D4ED8', bg: '#DBEAFE' },
    pr_created: { label: 'PR open', fg: '#166534', bg: '#DCFCE7' },
  }
  if (drafts.length === 0) {
    return (
      <div data-testid="studio-review-drafts" style={{ padding: '28px 24px', background: E.paper, border: `1px solid ${E.hairline}`, borderRadius: 0, textAlign: 'center' }}>
        <div style={{ fontFamily: C.serif, fontSize: 18, color: E.ink, marginBottom: 6 }}>No drafted documents yet</div>
        <p style={{ color: E.inkMuted, fontFamily: C.serif, fontStyle: 'italic', margin: 0 }}>
          Drafts from IV · Draft land here as documents you can read, revise, and re-audit before approval.
        </p>
      </div>
    )
  }
  return (
    <div data-testid="studio-review-drafts" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 2 }}>
        <div style={{ fontSize: 10, color: E.gold, fontFamily: C.mono, letterSpacing: '0.16em', fontWeight: 700 }}>
          DRAFTS · {drafts.length} DOCUMENT{drafts.length === 1 ? '' : 'S'}
        </div>
        <div style={{ fontSize: 10, color: E.inkMuted, fontFamily: C.mono }}>click a document to open the AI editor</div>
      </div>
      {drafts.map((j) => {
        const g = gateByJob.get(j.id)
        const score = g?.score ?? j.seo_score ?? null
        const st = STATUS_LABEL[j.status] || { label: j.status, fg: E.inkMuted, bg: E.parchment }
        const active = selectedJobId === j.id
        return (
          <div
            key={j.id}
            data-testid={`studio-review-draft-${j.id}`}
            onClick={() => onOpenJob(j)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
              background: active ? '#FFFBEB' : E.ivory, border: `1px solid ${active ? E.gold : E.hairline}`,
              borderRadius: 0, cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: C.serif, fontSize: 15, color: E.ink, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {j.title}
              </div>
              <div style={{ fontSize: 10.5, color: E.inkMuted, fontFamily: C.mono, marginTop: 2 }}>
                {j.region} · {(j.content_type || '').toUpperCase()} · {j.word_count ?? 0} words · {new Date(j.updated_at).toLocaleString()}
              </div>
            </div>
            {score != null && (
              <div style={{ width: 40, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: C.mono, fontWeight: 800, fontSize: 13, flexShrink: 0,
                background: score >= 90 ? '#F0FDF4' : score >= 70 ? '#FFFBEB' : '#FEF2F2',
                color: score >= 90 ? '#166534' : score >= 70 ? '#B45309' : '#B91C1C',
                border: `1px solid ${score >= 90 ? '#BBF7D0' : score >= 70 ? '#FDE68A' : '#FECACA'}` }}>
                {score}
              </div>
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
        )
      })}
    </div>
  )
}


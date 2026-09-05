'use client'

import React from 'react'
import { studioTokens as E } from './studio-tokens'
import { lastUpdatedJobs } from '@/lib/studioDraftVault'
import { statusBadge, type ContentJob } from './studio-ui-shared'

function fmtUpdated(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  try {
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ')
  }
}

/**
 * Drafting-stage document vault — last 10 content jobs by updated_at.
 * Clicking a row opens the job in the existing JobDetail editor path.
 */
export function DraftingFileVault({
  jobs,
  selectedJobId,
  onOpenJob,
  limit = 10,
}: {
  jobs: ContentJob[]
  selectedJobId?: string | null
  onOpenJob: (j: ContentJob) => void
  limit?: number
}) {
  const files = React.useMemo(() => lastUpdatedJobs(jobs, limit), [jobs, limit])

  return (
    <section
      data-testid="studio-drafting-file-vault"
      aria-label="Drafting file vault"
      style={{
        background: E.paper,
        border: `1px solid ${E.hairline}`,
        boxShadow: E.paperShadow,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: 0, left: 18, right: 18, height: 2,
          borderRadius: E.radiusFull, background: E.goldRule, opacity: 0.8,
        }}
      />
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: E.mono, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: E.gold, textTransform: 'uppercase' }}>
            Document vault
          </div>
          <div style={{ fontFamily: E.serif, fontSize: 18, color: E.inkBlack, marginTop: 2 }}>
            Last {limit} written jobs
          </div>
        </div>
        <div style={{ fontFamily: E.mono, fontSize: 10, color: E.inkDim }}>
          {files.length} file{files.length === 1 ? '' : 's'} · open to edit
        </div>
      </div>

      {files.length === 0 ? (
        <div
          data-testid="studio-drafting-file-vault-empty"
          style={{ padding: '28px 18px 32px', textAlign: 'center' }}
        >
          <div style={{ fontFamily: E.serif, fontSize: 16, color: E.inkMuted, fontStyle: 'italic' }}>
            No draft files yet
          </div>
          <p style={{ margin: '8px auto 0', maxWidth: 420, color: E.inkDim, fontFamily: E.serif, fontSize: 13 }}>
            Generate a draft from Research, or wait for a pipeline job to land — recent documents will appear here as openable files.
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: '0 0 8px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {files.map((j) => {
            const active = selectedJobId === j.id
            const words = Number(j.word_count) || 0
            const badge = statusBadge(j.status)
            return (
              <li key={j.id} style={{ borderTop: `1px solid ${E.hairlineSoft || E.hairline}` }}>
                <button
                  type="button"
                  data-testid={`studio-drafting-file-${j.id}`}
                  onClick={() => onOpenJob(j)}
                  aria-pressed={active}
                  title={`Open “${j.title}” in the document editor`}
                  style={{
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px',
                    background: active ? E.goldSoft : 'transparent',
                    border: 'none',
                    borderLeft: active ? `3px solid ${E.gold}` : '3px solid transparent',
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 16, flexShrink: 0 }}>📄</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block', fontFamily: E.serif, fontSize: 15, fontWeight: 600, color: E.inkBlack,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {j.title || 'Untitled draft'}
                    </span>
                    <span style={{
                      display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3,
                      fontFamily: E.mono, fontSize: 10, color: E.inkMuted,
                    }}>
                      <span>{(j.content_type || '').replace(/_/g, ' ') || 'document'}</span>
                      <span>{words.toLocaleString()} words</span>
                      <span>updated {fmtUpdated(j.updated_at)}</span>
                    </span>
                  </span>
                  <span style={{
                    padding: '3px 8px', fontSize: 9.5, fontWeight: 700, fontFamily: E.mono,
                    background: badge.bg, color: badge.fg, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {badge.label}
                  </span>
                  <span style={{
                    padding: '6px 12px', background: E.gold, color: E.ivory,
                    fontFamily: E.serif, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    Open →
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

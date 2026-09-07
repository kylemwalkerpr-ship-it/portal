'use client'
/**
 * Content Studio — Portable SEO Playbook panel.
 *
 * Surfaces the playbook (6 sprint weeks + P0–P12 prompt pack) from the SSOT
 * manifest served by GET /api/content-studio/portable-playbook. Minimal
 * surface — mirrors the Specialist Intel panel's editorial design tokens.
 *
 * SSOT: docs/CONTENT_STUDIO_PORTABLE_SEO_PLAYBOOK.md
 */
import React from 'react'
import { studioTokens as E } from './studio-tokens'
import { SPECIALIST_ROLE_LABEL } from '@/lib/seoFactory/specialistFeeds'
import type { PortablePlaybookManifest, PortableSeoPrompt, PortableSeoWeek } from '@/lib/seoFactory/portableSeoPlaybook'

const kickerStyle: React.CSSProperties = { ...E.kicker }
const panelCard: React.CSSProperties = {
  padding: 18, background: E.paper, border: `1px solid ${E.hairline}`, boxShadow: E.paperShadow,
}

const MASTER_EDITORIAL_LINK =
  'https://github.com/kylemwalkerpr-ship-it/portal/blob/main/docs/CONTENT_STUDIO_PORTABLE_SEO_PLAYBOOK.md'

interface PlaybookApiResponse {
  ok?: boolean
  manifest?: PortablePlaybookManifest
  highlightedWeek?: PortableSeoWeek | null
  error?: string
}

export default function AdminPortablePlaybook() {
  const [manifest, setManifest] = React.useState<PortablePlaybookManifest | null>(null)
  const [highlightedWeek, setHighlightedWeek] = React.useState<PortableSeoWeek | null>(null)
  const [week, setWeek] = React.useState(1)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = React.useState<string | null>(null)

  const load = React.useCallback(async (targetWeek: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/content-studio/portable-playbook?week=${targetWeek}`, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`playbook ${res.status}`)
      const json = (await res.json()) as PlaybookApiResponse
      if (!json.ok || !json.manifest) throw new Error(json.error || 'empty manifest')
      setManifest(json.manifest)
      setHighlightedWeek(json.highlightedWeek ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load portable SEO playbook')
      setManifest(null)
      setHighlightedWeek(null)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load(week)
  }, [week, load])

  const togglePrompt = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setCopiedId(null)
  }, [])

  const copyPrompt = React.useCallback(async (p: PortableSeoPrompt) => {
    try {
      await navigator.clipboard.writeText(
        `[${p.id}] ${p.title}${p.wasAstra ? ` (was: ${p.wasAstra})` : ''}\n\n${p.body}`,
      )
      setCopiedId(p.id)
    } catch {
      setCopiedId(null)
    }
  }, [])

  const selectedWeek = highlightedWeek ?? manifest?.weeks.find((w) => w.week === week) ?? null

  return (
    <section style={panelCard}>
      <div style={{ ...kickerStyle, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>📗</span>PORTABLE SEO PLAYBOOK
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {manifest && (
            <span style={{ fontFamily: E.mono, fontSize: 9, fontWeight: 700, color: E.gold, letterSpacing: '0.08em' }}>
              v{manifest.version}
            </span>
          )}
          <select
            aria-label="Playbook week picker"
            value={week}
            onChange={(ev) => setWeek(Number(ev.target.value))}
            style={{
              fontFamily: E.mono, fontSize: 10, padding: '4px 8px', borderRadius: 0,
              border: `1px solid ${E.hairline}`, background: E.paper, color: E.ink,
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>Week {n}</option>
            ))}
          </select>
        </span>
      </div>

      <div style={{ fontFamily: E.mono, fontSize: 9, color: E.inkDim, marginBottom: 10 }}>
        Adapted from the Astra local-SEO prompt pack · <a
          href={MASTER_EDITORIAL_LINK}
          target="_blank"
          rel="noreferrer"
          style={{ color: E.gold, textDecoration: 'underline', cursor: 'pointer' }}
        >
          docs/CONTENT_STUDIO_PORTABLE_SEO_PLAYBOOK.md
        </a> · not a GBP / Map Pack playbook
      </div>

      {error && (
        <div style={{ fontSize: 11, color: E.red, fontFamily: E.mono, marginBottom: 10 }}>
          {error}
        </div>
      )}

      {loading && !manifest ? (
        <div style={{ fontFamily: E.serif, fontSize: 13, color: E.inkMuted, fontStyle: 'italic' }}>
          Loading portable SEO playbook…
        </div>
      ) : (
        <>
          {selectedWeek && (
            <div style={{
              padding: '12px 14px', marginBottom: 12,
              border: `1px solid ${E.goldSoft}`, background: E.cream,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: E.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  padding: '2px 7px', background: E.goldSoft, color: E.goldDeep,
                }}>
                  WEEK {selectedWeek.week}
                </span>
                <span style={{ fontFamily: E.serif, fontSize: 13, fontWeight: 600, color: E.ink }}>
                  {selectedWeek.title}
                </span>
              </div>
              <div style={{ fontSize: 12, color: E.inkSoft, lineHeight: 1.45, marginTop: 6 }}>
                {selectedWeek.focus}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: E.mono, fontSize: 9, color: E.inkMuted }}>
                  Stages: {selectedWeek.stages.join(' → ')}
                </span>
                <span style={{ fontFamily: E.mono, fontSize: 9, color: E.inkMuted }}>
                  Prefer: {(selectedWeek.preferredSignals || []).map((r) => SPECIALIST_ROLE_LABEL[r] ?? r).join(' · ')}
                </span>
              </div>
              <div style={{ fontSize: 11, color: E.mossGreen, fontFamily: E.mono, marginTop: 6 }}>
                ✓ Done when: {selectedWeek.doneWhen}
              </div>
            </div>
          )}

          <div style={{ fontSize: 10, color: E.inkDim, fontFamily: E.mono, marginBottom: 6 }}>
            {manifest ? `${manifest.prompts.length} prompts (${manifest.prompts[0]?.id}–${manifest.prompts[manifest.prompts.length - 1]?.id}) · click to expand · copy into Studio / OpenCode briefs` : ''}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(manifest?.prompts ?? []).map((p) => {
              const isOpen = expanded.has(p.id)
              return (
                <div
                  key={p.id}
                  style={{
                    border: `1px solid ${E.hairlineSoft}`,
                    background: isOpen ? E.cream : E.ivory,
                  }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => togglePrompt(p.id)}
                    onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); togglePrompt(p.id) } }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', flexWrap: 'wrap' }}
                  >
                    <span style={{ fontFamily: E.mono, fontSize: 12, fontWeight: 700, color: E.goldDeep, width: 26 }}>
                      {p.id}
                    </span>
                    <span style={{ fontFamily: E.serif, fontSize: 12.5, fontWeight: 600, color: E.ink }}>
                      {p.title}
                    </span>
                    {p.wasAstra && (
                      <span style={{
                        fontFamily: E.mono, fontSize: 8.5, letterSpacing: '0.06em',
                        padding: '1px 6px', background: E.surface2, color: E.inkMuted,
                      }}>
                        was: {p.wasAstra}
                      </span>
                    )}
                    <span style={{ fontFamily: E.mono, fontSize: 8.5, color: E.inkDim }}>
                      {p.studioStages.join(' → ')}
                    </span>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button
                        onClick={(ev) => { ev.stopPropagation(); void copyPrompt(p) }}
                        style={{
                          fontFamily: E.mono, fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: 0,
                          border: `1px solid ${E.gold}`, background: 'transparent', color: E.gold,
                          cursor: 'pointer', letterSpacing: '0.06em',
                        }}
                      >
                        {copiedId === p.id ? '✓ COPIED' : 'COPY'}
                      </button>
                      <span style={{ fontFamily: E.mono, fontSize: 9, color: E.inkDim }}>
                        {isOpen ? '▾' : '▸'}
                      </span>
                    </span>
                  </div>
                  {isOpen && (
                    <pre style={{
                      margin: '0 10px 10px', padding: '10px 12px', whiteSpace: 'pre-wrap',
                      fontFamily: E.mono, fontSize: 11, lineHeight: 1.5, color: E.inkSoft,
                      background: E.paper, border: `1px solid ${E.hairlineSoft}`,
                    }}>
                      {p.body}
                    </pre>
                  )}
                </div>
              )
            })}
          </div>

          {manifest && (
            <div style={{ fontSize: 9, color: E.inkDim, fontFamily: E.mono, marginTop: 10 }}>
              Non-goals: {manifest.nonGoals.join(' · ')} · no auto-post · ship only through Approve gates
            </div>
          )}
        </>
      )}
    </section>
  )
}
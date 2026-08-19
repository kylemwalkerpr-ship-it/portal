'use client'

import React from 'react'
import { studioTokens as E } from './studio-tokens'
import type { CitationRemediation } from '@/lib/seoEngine/citationRemediation'

export function AeoRemediationQueue({
  items,
  onOpen,
  autoOpenedQuery,
}: {
  items: CitationRemediation[]
  onOpen: (item: CitationRemediation) => void
  autoOpenedQuery?: string | null
}) {
  if (!items.length) return null
  return (
    <section
      data-testid="aeo-remediation-queue"
      aria-label="LLM citation losses"
      style={{ margin: '10px 16px 0', padding: 12, background: E.paper, border: `1px solid ${E.hairline}` }}
    >
      <div style={{ fontFamily: E.mono, fontSize: 9, letterSpacing: '0.14em', color: E.gold, fontWeight: 700, textTransform: 'uppercase' }}>
        AEO retrofit · {items.length} uncited quer{items.length === 1 ? 'y' : 'ies'}
      </div>
      <div style={{ marginTop: 4, fontFamily: E.serif, fontSize: 14, color: E.inkBlack, fontWeight: 700 }}>
        Open the matching live URL and apply the four citation actions. Do not ship a sibling page.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {items.slice(0, 8).map((item) => {
          const active = autoOpenedQuery === item.query
          return (
            <div key={item.query} style={{ padding: '8px 10px', border: `1px solid ${active ? E.gold : E.hairline}`, background: E.ivory }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: E.serif, fontSize: 13, color: E.inkBlack, fontWeight: 700 }}>{item.query}</div>
                  <div style={{ fontFamily: E.mono, fontSize: 9, color: E.inkMuted, marginTop: 3 }}>
                    {item.match.mode === 'expand' && item.match.url
                      ? `expand · ${item.match.url}`
                      : 'new canonical — no live URL matched'}
                    {item.topCompetitor ? ` · beat ${item.topCompetitor}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  style={{
                    padding: '5px 10px', border: `1px solid ${E.gold}`, background: E.cream, color: E.goldDeep,
                    fontFamily: E.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  {item.match.jobId ? 'Open page + actions' : 'Prefill brief'}
                </button>
              </div>
              <ol style={{ margin: '8px 0 0', paddingLeft: 18, color: E.inkSoft, fontSize: 11, lineHeight: 1.45 }}>
                {item.actions.slice(0, 4).map((act) => (
                  <li key={act.action}>{act.action}</li>
                ))}
              </ol>
            </div>
          )
        })}
      </div>
    </section>
  )
}

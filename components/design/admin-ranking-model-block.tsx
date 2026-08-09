'use client'
/**
 * RANKING MODEL BLOCK — shared presentational surface.
 *
 * One rendering of the seo-ranking-model-v1 output (total · confidence ·
 * recommended actions · 30/60/90 forecast) used by BOTH the command-center
 * launch composer and the content-studio Quick Create composer, so the two
 * surfaces can never drift apart. Styling is self-contained with defaults
 * matching the portal token set; callers may override a handful of colors.
 */
import type { LeanRanking } from '@/lib/seoEngine/rankingModel'

function fmtN(n: number | undefined | null): string {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(Math.round(v))
}

export interface RankingModelBlockTokens {
  gold?: string
  goldBorder?: string
  textDim?: string
  textMuted?: string
  orange?: string
  surface?: string
  border2?: string
  navy?: string
}

const DEFAULT_TOKENS: RankingModelBlockTokens = {
  gold: '#9A7B3B',
  goldBorder: '#FDE68A',
  textDim: '#9CA3AF',
  textMuted: '#6B7280',
  orange: '#9A3412',
  surface: '#FFFFFF',
  border2: 'rgba(0,0,0,0.05)',
  navy: '#0F172A',
}

export function RankingModelBlock({
  ranking,
  tokens,
}: {
  ranking: LeanRanking
  tokens?: RankingModelBlockTokens
}) {
  const t = { ...DEFAULT_TOKENS, ...tokens }
  const mono = "var(--portal-font-mono, 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace)"
  return (
    <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${t.goldBorder}`, background: '#FFFBEB', boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: t.gold, fontFamily: mono, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          🧠 RANKING MODEL · <span style={{ fontFamily: mono, fontSize: 13 }}>{Math.round(ranking.total)}/100</span>
        </span>
        <span style={{ fontSize: 9, color: t.textDim, fontFamily: mono }}>
          confidence {Math.round((ranking.confidence || 0) * 100)}% · deterministic · seo-ranking-model-v1
        </span>
      </div>
      {Array.isArray(ranking.recommendedActions) && ranking.recommendedActions.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {ranking.recommendedActions.slice(0, 4).map((a, i) => (
            <div key={i} style={{ fontSize: 10, color: t.orange, fontFamily: mono, lineHeight: 1.6 }}>→ {a}</div>
          ))}
        </div>
      )}
      {ranking.forecast?.points?.length === 3 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ranking.forecast.points.map((p) => (
            <div key={p.horizonDays} style={{ flex: 1, minWidth: 92, padding: '7px 9px', borderRadius: 6, background: t.surface, border: `1px solid ${t.border2}` }}>
              <div style={{ fontSize: 8, color: t.textDim, fontFamily: mono, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p.horizonDays}d forecast</div>
              <div style={{ fontSize: 15, fontWeight: 800, fontFamily: mono, color: t.navy }}>#{Math.round(p.projectedPosition)}</div>
              <div style={{ fontSize: 9, color: t.textMuted, fontFamily: mono }}>{fmtN(p.projectedImpressions)} imp · P(top10) {Math.round(p.probabilityOfTop10 * 100)}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

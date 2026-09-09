import { contentFingerprint } from './currentGate'
import type { EditorialResult } from '../editorialSupervisor'

export type EditorialReport = {
  status: 'pending' | 'cleared' | 'held'
  fingerprint: string
  supervisor: 'harper-editorial-v1'
  grammar: number | null
  grammarErrors: number | null
  grammarSuggestions: number | null
  seo: number
  voice: number
  flesch: number
  fleschTarget: number
  reason: string
}
export function editorialReport(result: EditorialResult): EditorialReport {
  const s = result.snapshot
  return {
    status: result.status,
    fingerprint: s.fingerprint,
    supervisor: 'harper-editorial-v1',
    grammar: s.grammar?.score ?? null,
    grammarErrors: s.grammar?.errors ?? null,
    grammarSuggestions: s.grammar?.suggestions ?? null,
    seo: s.metrics.seo.score,
    voice: s.voice,
    flesch: s.metrics.readability.score,
    fleschTarget: s.metrics.readability.target,
    reason: result.reason,
  }
}
export function editorialReportReady(value: unknown, content?: string): boolean {
  if (!value || typeof value !== 'object') return false
  const r = value as EditorialReport
  return r.status === 'cleared' && r.supervisor === 'harper-editorial-v1'
    && typeof r.fingerprint === 'string'
    && (content === undefined || r.fingerprint === contentFingerprint(content))
    && r.grammar === 100 && r.grammarErrors === 0 && r.grammarSuggestions === 0
    && r.seo === 100 && r.voice === 100
    && Number.isFinite(r.flesch) && Number.isFinite(r.fleschTarget)
    && r.fleschTarget >= 50 && r.flesch >= r.fleschTarget
}

/** An admin-browser attestation supplements, never replaces, server audits. */
export function applyEditorialHold(response: {
  shipReady?: boolean; blockers?: number; blockersData?: Array<{ code: string; message: string; fix?: string }>
}, content: string, report: unknown): void {
  if (!report || editorialReportReady(report, content)) return
  response.shipReady = false
  response.blockers = (response.blockers ?? 0) + 1
  response.blockersData = [...(response.blockersData || []), {
    code: 'editorial_review_pending', message: 'Harper editorial supervision has not cleared this exact draft across grammar, SEO, AI-write/human voice and Flesch.',
    fix: 'Run Audit & Fix. The review model must execute fresh Harper instructions, then the supervisor remeasures the exact final text.',
  }]
}

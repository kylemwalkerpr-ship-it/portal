/**
 * lib/seoFactory/interlinkVerification.ts
 *
 * P6 foundation — durable interlink verification truth.
 *
 * The old ship loop wrote `seo_interlinks.status = 'applied'` from an
 * in-memory body substring immediately after a Git commit/merge, before any
 * production live proof. That claim is unverifiable and untrue: the source
 * page may not be live yet, the target may 404, and a bare URL sitting in a
 * code fence, JSON blob or plain text is not an anchor.
 *
 * This module replaces that behavior with three non-negotiable steps:
 *
 *   1. STAGE  (`stageEngineInterlinksForVerification`)
 *      After a successful commit/merge, a planned row whose exact target URL
 *      is structurally embedded in the shipped draft records
 *      `source_url = <plan canonicalUrl>` and stays `planned` — no applied
 *      status, no applied_at, no verification verdict. Planner slugs locate
 *      candidate rows; the canonicalUrl is the only source identity.
 *
 *   2. FINALIZE (`finalizeStagedInterlinksForLiveSource`)
 *      Only after `verifyLiveUrl` has actually established ok=true. Staged
 *      rows for that exact source_url are checked against the LIVE source HTML
 *      and live target HTTP status:
 *        · exact, normalized `<a href>` match + live target → applied with the
 *          full durable proof (source_url, verification_state='present',
 *          verified_at, verification_evidence, applied_at);
 *        · live source, href missing → verification_state='absent' (planned);
 *        · target not live → verification_state='target_not_live' (planned);
 *        · source failure → never applied (source_not_live / unverifiable).
 *
 *   3. PROOF (`exactAnchorHrefMatch`)
 *      Only real anchor href attributes count. A target URL that appears in
 *      plain text, a `<script>` body or JSON is NOT proof. Trailing slashes
 *      normalize safely; queries and fragments are compared strictly.
 *
 * Idempotent by construction: only `status = 'planned'` rows are ever
 * selected or updated, so a verified applied row can never be downgraded by a
 * transient fetch/verifier failure.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { classifyLiveStatus, verifyUrlsLive } from '@/lib/seoFactory/linkAudit'

/** Closed verification vocabulary (mirrors the migration CHECK constraint). */
export const INTERLINK_VERIFICATION_STATES = [
  'present',
  'absent',
  'source_not_live',
  'target_not_live',
  'unverifiable',
] as const

export type InterlinkVerificationState = (typeof INTERLINK_VERIFICATION_STATES)[number]

/** The only proof kind that may finalize a row to `applied`. */
export const INTERLINK_LIVE_EXACT_HREF_PROOF = 'live_exact_href'

const INTERLINK_VERIFY_USER_AGENT = 'YouSafeInterlinkVerify/1.0'
const SOURCE_FETCH_TIMEOUT_MS = 12_000
const CONTEXT_WINDOW = 120
const CONTEXT_MAX = 360

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

/**
 * Extract `href` values from real `<a …>` tags only.
 *
 * Deliberately narrow: no bare-URL extraction, no markdown, no scanning of
 * text/script/JSON. A URL printed in prose or serialized in a JSON payload is
 * not an anchor and must never finalize an interlink.
 */
export function extractAnchorHrefs(html: string): string[] {
  if (!html) return []
  const out: string[] = []
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const href = decodeHtmlEntities(String(match[1] ?? match[2] ?? match[3] ?? '').trim())
    if (href) out.push(href)
  }
  return out
}

/**
 * Structural anchors in a SHIPPED DRAFT (markdown links + HTML anchors) used
 * only to decide which planned rows are worth staging. This is a locator, not
 * proof: presence here never sets an applied status.
 */
export function extractDraftAnchorHrefs(content: string): string[] {
  const out = [...extractAnchorHrefs(content)]
  const md = /\[[^\]]*\]\(\s*([^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g
  let match: RegExpExecArray | null
  while ((match = md.exec(content))) {
    const raw = String(match[1] || '').trim().replace(/^<|>$/g, '')
    const href = decodeHtmlEntities(raw)
    if (href) out.push(href)
  }
  return out
}

/**
 * Canonical comparison form: lowercase host, drop fragment, strip trailing
 * slashes (root preserved), keep query strictly. Never invents a target.
 */
export function normalizeInterlinkProofUrl(url: string): string {
  const raw = String(url || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      let out = raw.split('#')[0]
      if (out.length > 1) out = out.replace(/\/+$/, '')
      return out.toLowerCase()
    }
    const host = parsed.host.toLowerCase()
    const path = (parsed.pathname || '/').replace(/\/+$/, '') || '/'
    return `${parsed.protocol}//${host}${path}${parsed.search}`
  } catch {
    let out = raw.split('#')[0]
    if (out.length > 1) out = out.replace(/\/+$/, '')
    return out
  }
}

function anchorContext(html: string, href: string): string | null {
  const idx = html.indexOf(href)
  if (idx < 0) return null
  const start = Math.max(0, idx - CONTEXT_WINDOW)
  const end = Math.min(html.length, idx + href.length + CONTEXT_WINDOW)
  const context = html.slice(start, end).replace(/\s+/g, ' ').trim()
  return context ? context.slice(0, CONTEXT_MAX) : null
}

export interface ExactAnchorHrefProof {
  present: boolean
  observedHref: string | null
  context: string | null
}

/**
 * Exact live-source anchor proof: the normalized target must appear as the
 * href of a real anchor. Plain text / script / JSON substrings are rejected.
 */
export function exactAnchorHrefMatch(html: string, targetUrl: string): ExactAnchorHrefProof {
  const target = normalizeInterlinkProofUrl(targetUrl)
  if (!target) return { present: false, observedHref: null, context: null }
  for (const href of extractAnchorHrefs(html)) {
    if (normalizeInterlinkProofUrl(href) === target) {
      return { present: true, observedHref: href, context: anchorContext(html, href) }
    }
  }
  return { present: false, observedHref: null, context: null }
}

interface InterlinkDbRow {
  id?: string | number
  target_url?: string | null
  status?: string | null
  source_url?: string | null
}

export interface StageEngineInterlinksInput {
  /** The plan's canonicalUrl — the ONLY source URL authority. */
  canonicalUrl: string
  /** Used (with the planner cell) to locate candidate planner rows only. */
  primaryKeyword: string
  /** The exact shipped draft body. */
  body: string
}

export interface StageEngineInterlinksResult {
  staged: number
  candidates: number
  sourceUrl: string | null
  error?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error')
}

/**
 * Stage planner rows for later live verification. Called after a successful
 * Git direct-main write or merge. Never throws (a staging failure must not
 * fail a ship), never writes an applied status, never touches applied_at or a
 * verification verdict.
 */
export async function stageEngineInterlinksForVerification(
  input: StageEngineInterlinksInput,
): Promise<StageEngineInterlinksResult> {
  const sourceUrl = String(input.canonicalUrl || '').trim()
  if (!/^https?:\/\//i.test(sourceUrl)) {
    return { staged: 0, candidates: 0, sourceUrl: null, error: 'a plan canonicalUrl is required to stage interlinks' }
  }
  try {
    const { bestCellForTerm, MIN_CELL_MATCH_SCORE, plannerClusterId } = await import('@/lib/seoEngine/planner')
    const cell = bestCellForTerm(input.primaryKeyword || '')
    if (!cell || cell.score < MIN_CELL_MATCH_SCORE) return { staged: 0, candidates: 0, sourceUrl }
    const slug = plannerClusterId(cell.country, cell.stage, input.primaryKeyword)

    const draftHrefs = new Set(
      extractDraftAnchorHrefs(input.body || '')
        .map(normalizeInterlinkProofUrl)
        .filter(Boolean),
    )
    if (!draftHrefs.size) return { staged: 0, candidates: 0, sourceUrl }

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('seo_interlinks')
      .select('id,target_url,status,source_url')
      .eq('source_slug', slug)
      .eq('status', 'planned')
    if (error) return { staged: 0, candidates: 0, sourceUrl, error: error.message.slice(0, 300) }
    const rows = (data as InterlinkDbRow[] | null) || []
    if (!rows.length) return { staged: 0, candidates: 0, sourceUrl }

    const sourceKey = normalizeInterlinkProofUrl(sourceUrl)
    let staged = 0
    for (const row of rows) {
      const target = normalizeInterlinkProofUrl(String(row.target_url || ''))
      if (!target || !draftHrefs.has(target)) continue
      const existingSource = String(row.source_url || '').trim()
      // Never overwrite a different durable source identity.
      if (existingSource && normalizeInterlinkProofUrl(existingSource) !== sourceKey) continue
      if (existingSource && normalizeInterlinkProofUrl(existingSource) === sourceKey) {
        // Already staged for this source — idempotent no-op.
        staged += 1
        continue
      }
      const { error: updateError } = await supabase
        .from('seo_interlinks')
        .update({ source_url: sourceUrl })
        .eq('id', row.id)
        .eq('status', 'planned')
      if (!updateError) staged += 1
    }
    return { staged, candidates: rows.length, sourceUrl }
  } catch (error) {
    return { staged: 0, candidates: 0, sourceUrl, error: errorMessage(error).slice(0, 300) }
  }
}

export interface FinalizeStagedInterlinksInput {
  /** The verified live canonicalUrl (same identity `verifyLiveUrl` proved). */
  canonicalUrl: string
  /** Optional already-fetched live source HTML (one bounded refetch otherwise). */
  sourceHtml?: string
}

export interface FinalizeStagedInterlinksResult {
  sourceUrl: string | null
  checked: number
  applied: number
  absent: number
  targetNotLive: number
  unverifiable: number
  sourceNotLive: number
  sourceFetchOk: boolean
  error?: string
}

function emptyFinalize(sourceUrl: string | null, error?: string): FinalizeStagedInterlinksResult {
  return {
    sourceUrl,
    checked: 0,
    applied: 0,
    absent: 0,
    targetNotLive: 0,
    unverifiable: 0,
    sourceNotLive: 0,
    sourceFetchOk: false,
    ...(error ? { error } : {}),
  }
}

interface FetchSourceResult {
  html: string | null
  status: number | null
  error: string | null
}

async function fetchLiveSource(sourceUrl: string): Promise<FetchSourceResult> {
  try {
    const res = await fetch(sourceUrl, {
      headers: { 'User-Agent': INTERLINK_VERIFY_USER_AGENT },
      signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      return { html: null, status: res.status, error: `live source responded HTTP ${res.status}` }
    }
    return { html: await res.text(), status: res.status, error: null }
  } catch (error) {
    return { html: null, status: null, error: errorMessage(error).slice(0, 300) }
  }
}

/**
 * Finalize staged/planned rows for the exact live source. MUST only be called
 * after `verifyLiveUrl(input).ok === true`. Never throws; the caller's
 * content verification is never weakened by an interlink failure.
 */
export async function finalizeStagedInterlinksForLiveSource(
  input: FinalizeStagedInterlinksInput,
): Promise<FinalizeStagedInterlinksResult> {
  const rawSource = String(input.canonicalUrl || '').trim()
  const sourceUrl = normalizeInterlinkProofUrl(rawSource)
  if (!/^https?:\/\//i.test(sourceUrl)) {
    return emptyFinalize(null, 'canonicalUrl must be an absolute http(s) URL')
  }
  try {
    const supabase = createSupabaseAdminClient()
    const sourceVariants = [
      ...new Set([rawSource, sourceUrl, rawSource.replace(/\/+$/, ''), sourceUrl.replace(/\/+$/, '')].filter(Boolean)),
    ]
    const { data, error } = await supabase
      .from('seo_interlinks')
      .select('id,target_url,status,source_url')
      .in('source_url', sourceVariants)
      .eq('status', 'planned')
    if (error) return emptyFinalize(sourceUrl, error.message.slice(0, 300))
    const rows = (data as InterlinkDbRow[] | null) || []
    if (!rows.length) return emptyFinalize(sourceUrl)

    const source =
      typeof input.sourceHtml === 'string'
        ? { html: input.sourceHtml, status: 200, error: null as string | null }
        : await fetchLiveSource(sourceUrl)

    const now = new Date().toISOString()

    if (source.html == null) {
      const state: InterlinkVerificationState =
        source.status != null && source.status >= 400 && source.status < 500
          ? 'source_not_live'
          : 'unverifiable'
      let written = 0
      for (const row of rows) {
        written += await writeVerdict(supabase, row, {
          sourceUrl,
          state,
          now,
          evidence: {
            source: sourceUrl,
            target: String(row.target_url || ''),
            proof: 'live_source_fetch',
            sourceHttpStatus: source.status,
            error: source.error,
            verifiedAt: now,
          },
        })
      }
      return {
        sourceUrl,
        checked: rows.length,
        applied: 0,
        absent: 0,
        targetNotLive: 0,
        unverifiable: state === 'unverifiable' ? written : 0,
        sourceNotLive: state === 'source_not_live' ? written : 0,
        sourceFetchOk: false,
        ...(source.error ? { error: source.error } : {}),
      }
    }

    const html = source.html
    const targets = [...new Set(rows.map((row) => String(row.target_url || '')).filter(Boolean))]
    const targetResults = new Map<string, { ok: boolean; status: number }>()
    let targetVerifierError: string | null = null
    try {
      const live = await verifyUrlsLive(targets)
      for (const target of targets) {
        const result = live.get(target)
        if (!result) continue
        const classified = classifyLiveStatus(target, result.status)
        targetResults.set(target, { ok: classified.ok, status: result.status })
      }
    } catch (error) {
      targetVerifierError = errorMessage(error).slice(0, 300)
    }

    const result: FinalizeStagedInterlinksResult = {
      sourceUrl,
      checked: rows.length,
      applied: 0,
      absent: 0,
      targetNotLive: 0,
      unverifiable: 0,
      sourceNotLive: 0,
      sourceFetchOk: true,
      ...(targetVerifierError ? { error: targetVerifierError } : {}),
    }

    for (const row of rows) {
      const target = String(row.target_url || '')
      const observation = targetResults.get(target)

      if (!observation) {
        result.unverifiable += await writeVerdict(supabase, row, {
          sourceUrl,
          state: 'unverifiable',
          now,
          evidence: {
            source: sourceUrl,
            target,
            proof: 'target_liveness',
            error: targetVerifierError || 'target liveness was not observed',
            verifiedAt: now,
          },
        })
        continue
      }
      if (!observation.ok) {
        const state: InterlinkVerificationState =
          observation.status === 0 || observation.status >= 500 ? 'unverifiable' : 'target_not_live'
        const written = await writeVerdict(supabase, row, {
          sourceUrl,
          state,
          now,
          evidence: {
            source: sourceUrl,
            target,
            proof: 'target_liveness',
            targetHttpStatus: observation.status,
            verifiedAt: now,
          },
        })
        if (state === 'target_not_live') result.targetNotLive += written
        else result.unverifiable += written
        continue
      }

      const proof = exactAnchorHrefMatch(html, target)
      if (!proof.present) {
        result.absent += await writeVerdict(supabase, row, {
          sourceUrl,
          state: 'absent',
          now,
          evidence: {
            source: sourceUrl,
            target,
            proof: 'live_exact_href',
            observedHref: null,
            sourceContext: null,
            sourceHttpStatus: source.status,
            targetHttpStatus: observation.status,
            anchorsExamined: extractAnchorHrefs(html).length,
            verifiedAt: now,
          },
        })
        continue
      }

      const { error: appliedError } = await supabase
        .from('seo_interlinks')
        .update({
          status: 'applied',
          applied_at: now,
          source_url: String(row.source_url || sourceUrl),
          verification_state: 'present',
          verified_at: now,
          verification_evidence: {
            source: sourceUrl,
            target,
            proof: INTERLINK_LIVE_EXACT_HREF_PROOF,
            observedHref: proof.observedHref,
            sourceContext: proof.context,
            sourceHttpStatus: source.status,
            targetHttpStatus: observation.status,
            verifiedAt: now,
          },
        })
        .eq('id', row.id)
        .eq('status', 'planned')
      if (!appliedError) result.applied += 1
    }

    return result
  } catch (error) {
    return emptyFinalize(sourceUrl, errorMessage(error).slice(0, 300))
  }
}

interface VerdictInput {
  sourceUrl: string
  state: InterlinkVerificationState
  now: string
  evidence: Record<string, unknown>
}

/**
 * Write a non-applied verdict. Only `status = 'planned'` rows are touched —
 * an applied row can never be downgraded by a transient failure.
 */
async function writeVerdict(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: InterlinkDbRow,
  verdict: VerdictInput,
): Promise<number> {
  const { error } = await supabase
    .from('seo_interlinks')
    .update({
      source_url: String(row.source_url || verdict.sourceUrl),
      verification_state: verdict.state,
      verified_at: verdict.now,
      verification_evidence: verdict.evidence,
    })
    .eq('id', row.id)
    .eq('status', 'planned')
  return error ? 0 : 1
}

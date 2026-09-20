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
 *      A RE-ship of the same canonical rebinds an already-staged planned row
 *      to the new exact ship job (null/different → rebind; same → idempotent
 *      no-op that never resets the revision stamp), while a jobless caller can
 *      never clear an existing source_job_id and a different durable source_url
 *      stays untouchable. First staging and every rebind write the durable
 *      nullable `staged_at` revision timestamp in the same planned-only update
 *      (never when job identity / the column is unavailable).
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
 *      plain text, an HTML comment, a `<script>`/`<style>`/`<template>` body,
 *      a serialized string or JSON is NOT proof — those payloads are skipped
 *      structurally before any anchor is read. Root-relative / same-site
 *      hrefs are resolved against the verified source canonical and refused
 *      when they would leave that host. Trailing slashes normalize safely;
 *      queries and fragments are compared strictly.
 *
 * Idempotent by construction: only `status = 'planned'` rows are ever
 * selected or updated, so a verified applied row can never be downgraded by a
 * transient fetch/verifier failure. Every job-bound verdict/applied write is a
 * compare-and-set on the exact selected subject (id + planned + source_job_id +
 * source_url), so a concurrent reship rebind to another job yields zero
 * affected rows (counted skipped) instead of being overwritten by the old
 * revision's verdict.
 *
 * Attempts that do NOT finalize (deployment not observable yet, or an ok=true
 * verdict without positive deployment-lineage proof) are bounded by the
 * additive `verification_attempted_at` marker written by
 * `markInterlinkVerificationAttempt` — a non-proof column that never carries a
 * verdict and can never be mistaken for verification truth.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { classifyLiveStatus, verifyUrlsLive } from '@/lib/seoFactory/linkAudit'
import { normalizeSourceJobId } from './sourceJobIdentity'

export { normalizeSourceJobId }

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
 * Raw-text / non-rendered elements whose contents are DATA, not markup.
 * Anchors (or literal `<a href=…>` text) inside them must never count as
 * proof, exactly as a browser would not render them.
 */
const RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'template',
  'textarea',
  'title',
  'xmp',
  'noembed',
  'noframes',
])

/**
 * HTML tokenizer: comments, CDATA, tags. A quoted attribute value may contain
 * `<`/`>` (e.g. a serialized HTML string), so the attribute tail explicitly
 * consumes quoted values before the closing `>` — a `<a href=…>` living inside
 * an attribute/JSON string is never seen as a standalone tag.
 */
const HTML_TOKEN_RE =
  /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<(\/?)([a-zA-Z][a-zA-Z0-9:_-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
const HTML_ATTR_RE = /([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

/** Read the (decoded) href attribute of an already-tokenized `<a …>` tag. */
function anchorHrefFromTag(tag: string): string | null {
  const attrs = tag.replace(/^<\s*a\b/i, '')
  HTML_ATTR_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = HTML_ATTR_RE.exec(attrs))) {
    if (String(match[1] || '').toLowerCase() !== 'href') continue
    const raw = String(match[2] ?? match[3] ?? match[4] ?? '').trim()
    return raw ? decodeHtmlEntities(raw) : null
  }
  return null
}

/**
 * Walk open tags only, structurally skipping HTML comments, CDATA and every
 * raw-text element body. Serialized payloads therefore never reach the
 * anchor reader.
 */
function forEachOpenTag(html: string, visit: (name: string, tag: string) => void): void {
  const source = String(html || '')
  if (!source) return
  const lower = source.toLowerCase()
  HTML_TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = HTML_TOKEN_RE.exec(source))) {
    const name = String(match[2] || '').toLowerCase()
    if (!name) continue // comment / CDATA
    const closing = match[1] === '/'
    if (!closing && RAW_TEXT_ELEMENTS.has(name)) {
      const close = lower.indexOf(`</${name}`, HTML_TOKEN_RE.lastIndex)
      if (close < 0) {
        HTML_TOKEN_RE.lastIndex = source.length
        continue
      }
      HTML_TOKEN_RE.lastIndex = close
      continue
    }
    if (closing) continue
    visit(name, match[0])
  }
}

/**
 * Remove non-rendered payloads (comments, CDATA, raw-text element bodies) from
 * a string, leaving everything a reader could actually see. Used only for the
 * draft-locator markdown scan; proof paths use the tokenizer directly.
 */
function stripNonRenderedPayloads(source: string): string {
  const src = String(source || '')
  if (!src) return ''
  const lower = src.toLowerCase()
  let out = ''
  let cursor = 0
  HTML_TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = HTML_TOKEN_RE.exec(src))) {
    const name = String(match[2] || '').toLowerCase()
    if (!name) {
      // comment / CDATA
      out += src.slice(cursor, match.index)
      cursor = match.index + match[0].length
      continue
    }
    if (match[1] === '/' || !RAW_TEXT_ELEMENTS.has(name)) continue
    const close = lower.indexOf(`</${name}`, HTML_TOKEN_RE.lastIndex)
    const closeBracket = close < 0 ? -1 : src.indexOf('>', close)
    const end = closeBracket < 0 ? src.length : closeBracket + 1
    out += src.slice(cursor, match.index)
    cursor = end
    HTML_TOKEN_RE.lastIndex = cursor
  }
  out += src.slice(cursor)
  return out
}

/**
 * Extract `href` values from real `<a …>` tags only.
 *
 * Deliberately narrow: no bare-URL extraction, no markdown, no scanning of
 * text/comment/script/style/template/JSON payloads. A URL printed in prose,
 * commented out, or serialized in a script/JSON payload is not an anchor and
 * must never finalize an interlink.
 */
export function extractAnchorHrefs(html: string): string[] {
  const out: string[] = []
  forEachOpenTag(html, (name, tag) => {
    if (name !== 'a') return
    const href = anchorHrefFromTag(tag)
    if (href) out.push(href)
  })
  return out
}

/**
 * Structural anchors in a SHIPPED DRAFT (markdown links + HTML anchors) used
 * only to decide which planned rows are worth staging. This is a locator, not
 * proof: presence here never sets an applied status. Comments and
 * script/style/template payloads are stripped first so a commented-out or
 * serialized draft link can never even be staged.
 */
export function extractDraftAnchorHrefs(content: string): string[] {
  const out = [...extractAnchorHrefs(content)]
  const rendered = stripNonRenderedPayloads(content)
  const md = /\[[^\]]*\]\(\s*([^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g
  let match: RegExpExecArray | null
  while ((match = md.exec(rendered))) {
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

export interface ExactAnchorHrefOptions {
  /**
   * The verified source canonical. Used ONLY to resolve root-relative /
   * same-site hrefs; relative hrefs are refused unless they resolve back to
   * exactly this host, so a cross-host or invented target can never match.
   */
  sourceCanonicalUrl?: string | null
}

/**
 * Resolve an anchor href to its canonical comparison form.
 *
 * · absolute http(s) href → normalized as-is (targets legitimately cross hosts);
 * · non-http scheme (mailto:, javascript:, data:, tel:) → null, never proof;
 * · root-relative / relative / protocol-relative href → resolved against the
 *   verified source canonical and refused unless the resolved host is EXACTLY
 *   that host (a `//evil.example` href can never match a same-site target);
 * · no source canonical available → null for relative hrefs (fail closed).
 */
export function resolveSameSiteAnchorHref(
  href: string,
  sourceCanonicalUrl?: string | null,
): string | null {
  const raw = decodeHtmlEntities(String(href || '').trim())
  if (!raw) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return /^https?:/i.test(raw) ? normalizeInterlinkProofUrl(raw) : null
  }
  const base = String(sourceCanonicalUrl || '').trim()
  if (!/^https?:\/\//i.test(base)) return null
  try {
    const parsedBase = new URL(base)
    const resolved = new URL(raw, parsedBase)
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null
    if (resolved.host.toLowerCase() !== parsedBase.host.toLowerCase()) return null
    return normalizeInterlinkProofUrl(resolved.toString())
  } catch {
    return null
  }
}

/**
 * Exact live-source anchor proof: the normalized target must appear as the
 * href of a real anchor. Plain text, commented-out markup and
 * script/style/template/JSON payloads are rejected structurally, and
 * relative hrefs are only admitted after safe same-site resolution.
 */
export function exactAnchorHrefMatch(
  html: string,
  targetUrl: string,
  opts: ExactAnchorHrefOptions = {},
): ExactAnchorHrefProof {
  const target = normalizeInterlinkProofUrl(targetUrl)
  if (!target) return { present: false, observedHref: null, context: null }
  for (const href of extractAnchorHrefs(html)) {
    const resolved = resolveSameSiteAnchorHref(href, opts.sourceCanonicalUrl)
    const candidate = resolved || normalizeInterlinkProofUrl(href)
    if (candidate && candidate === target) {
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
  source_job_id?: string | null
}

export interface StageEngineInterlinksInput {
  /** The plan's canonicalUrl — the ONLY source URL authority. */
  canonicalUrl: string
  /**
   * The EXACT content_jobs.id of the ship job that produced this draft.
   * Recorded as `source_job_id` so the scheduled contracted reconciler can
   * prove the official deployment lineage for that exact job before any
   * automatic finalization. Optional for legacy/admin callers: when absent
   * the row is staged without job identity and is therefore never
   * auto-finalized (historical/backlog rows stay unresolved/manual).
   */
  jobId?: string | null
  /** Used (with the planner cell) to locate candidate planner rows only. */
  primaryKeyword: string
  /** The exact shipped draft body. */
  body: string
}

export interface StageEngineInterlinksResult {
  /** Rows now durably staged for this source (written or already staged). */
  staged: number
  /**
   * Planned rows already staged for this canonical under a different (or
   * missing) job identity that were REBOUND to the new exact ship job. Only
   * present when > 0 so the legacy result shape stays intact.
   */
  rebounded?: number
  candidates: number
  /** Planned rows deliberately NOT staged (different source identity). */
  skipped: number
  /** Staging writes that failed or matched zero rows on the DB side. */
  failed: number
  sourceUrl: string | null
  /**
   * Non-fatal degradation (e.g. the pre-migration schema without
   * `source_job_id`): staging fell back to the legacy column set. Observable
   * so a missing migration column can never look like a zero-candidate no-op.
   */
  warning?: string
  error?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error')
}

/**
 * Stage planner rows for later live verification. Called after a successful
 * Git direct-main write or merge. Never throws (a staging failure must not
 * fail a ship), never writes an applied status, never touches applied_at or a
 * verification verdict. A DB failure is reported truthfully (failed count +
 * error) instead of looking like a zero-op.
 */
export async function stageEngineInterlinksForVerification(
  input: StageEngineInterlinksInput,
): Promise<StageEngineInterlinksResult> {
  const sourceUrl = String(input.canonicalUrl || '').trim()
  // A malformed job id is NOT job identity: it is dropped (never written),
  // which leaves the row jobless/unresolved instead of poisoning the
  // scheduled reconciler's exact-subject contract.
  const sourceJobId = normalizeSourceJobId(input.jobId)
  if (!/^https?:\/\//i.test(sourceUrl)) {
    return {
      staged: 0,
      candidates: 0,
      skipped: 0,
      failed: 0,
      sourceUrl: null,
      error: 'a plan canonicalUrl is required to stage interlinks',
    }
  }
  try {
    const { bestCellForTerm, MIN_CELL_MATCH_SCORE, plannerClusterId } = await import('@/lib/seoEngine/planner')
    const cell = bestCellForTerm(input.primaryKeyword || '')
    if (!cell || cell.score < MIN_CELL_MATCH_SCORE) return { staged: 0, candidates: 0, skipped: 0, failed: 0, sourceUrl }
    const slug = plannerClusterId(cell.country, cell.stage, input.primaryKeyword)

    // Draft hrefs are located structurally (markdown link / real anchor only)
    // and same-site relative hrefs are resolved against this plan's canonical
    // so a root-relative draft link can still locate its planned target.
    const draftHrefs = new Set(
      extractDraftAnchorHrefs(input.body || '')
        .map((href) => resolveSameSiteAnchorHref(href, sourceUrl) || normalizeInterlinkProofUrl(href))
        .filter(Boolean),
    )
    if (!draftHrefs.size) return { staged: 0, candidates: 0, skipped: 0, failed: 0, sourceUrl }

    const supabase = createSupabaseAdminClient()
    let warning: string | null = null
    const readRows = (columns: string) =>
      supabase
        .from('seo_interlinks')
        .select(columns)
        .eq('source_slug', slug)
        .eq('status', 'planned')
    let { data, error } = await readRows('id,target_url,status,source_url,source_job_id')
    let jobIdentityAvailable = true
    // Pre-migration compatibility: the additive P6 column may not exist yet.
    // Fall back to the legacy column set — staging then stays jobless (it must
    // NOT attempt to write a column the database does not have) and says so
    // explicitly instead of looking like a zero-candidate no-op.
    if (error && /source_job_id/i.test(String(error.message || ''))) {
      const message = String(error.message || 'source_job_id unavailable')
      console.warn(
        '[interlinkVerification] staging without job identity — source_job_id column unavailable (P6 migration not applied yet):',
        message,
      )
      warning = `source_job_id column unavailable (P6 migration not applied yet): ${message}`.slice(0, 300)
      jobIdentityAvailable = false
      const legacy = await readRows('id,target_url,status,source_url')
      data = legacy.data
      error = legacy.error
    }
    if (error) {
      return { staged: 0, candidates: 0, skipped: 0, failed: 0, sourceUrl, error: error.message.slice(0, 300) }
    }
    const rows = (data as InterlinkDbRow[] | null) || []
    if (!rows.length) return { staged: 0, candidates: 0, skipped: 0, failed: 0, sourceUrl }

    const sourceKey = normalizeInterlinkProofUrl(sourceUrl)
    // When the column is unavailable the write must omit it entirely: staging
    // stays jobless (unresolved/manual) rather than failing on a column that
    // does not exist.
    const writeJobId = jobIdentityAvailable ? sourceJobId : null
    // Durable STAGING/REVISION timestamp (M1). Written in the same planned-only
    // update that first stages the revision or rebinds it to a new exact job,
    // so the scheduled reconciler can tell whether a verdict/attempt timestamp
    // belongs to the CURRENT revision without relying on `updated_at` (the
    // BEFORE UPDATE trigger always pushes that to now(), which made the
    // cooldown structurally dead). It is not proof, never part of the applied
    // constraint, and is withheld entirely when the exact job identity (or the
    // column itself) is unavailable — the revision identity cannot exist
    // without its exact job, so the stamp must never be invented.
    const stagedAt = writeJobId ? new Date().toISOString() : null
    let stagedAtAvailable = Boolean(stagedAt)
    const withStagedAt = (patch: Record<string, unknown>): Record<string, unknown> =>
      stagedAt && stagedAtAvailable ? { ...patch, staged_at: stagedAt } : patch
    /**
     * Planned-row write with a narrow partial-migration fallback: if the
     * additive `staged_at` column itself is not deployed (while source_job_id
     * is), the write must not fail and must not invent a timestamp — it retries
     * without the stamp and says so, exactly like the source_job_id fallback.
     */
    const writePlanned = async (
      row: InterlinkDbRow,
      patch: Record<string, unknown>,
    ): Promise<PlannedRowWrite> => {
      const attempt = await writePlannedRowPatch(supabase, row, patch)
      if (!attempt.error || patch.staged_at === undefined || !/staged_at/i.test(attempt.error)) {
        return attempt
      }
      stagedAtAvailable = false
      const fallbackPatch = { ...patch }
      delete fallbackPatch.staged_at
      const retry = await writePlannedRowPatch(supabase, row, fallbackPatch)
      if (!retry.error) {
        const note = 'staged_at column unavailable (P6 migration not fully applied yet); revision stamp withheld'
        warning = warning ? `${warning} | ${note}` : note
      }
      return retry
    }
    let staged = 0
    let rebounded = 0
    let skipped = 0
    let failed = 0
    let lastWriteError: string | null = null
    for (const row of rows) {
      const target = normalizeInterlinkProofUrl(String(row.target_url || ''))
      if (!target || !draftHrefs.has(target)) {
        skipped += 1
        continue
      }
      const existingSource = String(row.source_url || '').trim()
      // Never overwrite a different durable source identity.
      if (existingSource && normalizeInterlinkProofUrl(existingSource) !== sourceKey) {
        skipped += 1
        continue
      }
      if (existingSource && normalizeInterlinkProofUrl(existingSource) === sourceKey) {
        // Already staged for this canonical. The row must now carry the EXACT
        // ship job that owns the current revision:
        //   · same job            → idempotent no-op (no write);
        //   · null / different job→ rebound to the new exact job so the
        //     scheduled reconciler's per-job subject is the current revision;
        //   · jobless caller      → NEVER clears an existing source_job_id
        //     (a legacy ship must not silently un-bind a durable job identity);
        //   · invalid job id      → withheld above (normalizeSourceJobId).
        const existingJobId = String(row.source_job_id || '').trim()
        if (writeJobId && existingJobId !== writeJobId) {
          // A rebind to a new exact job IS a new revision: it writes the new
          // job id AND a fresh staged_at in the same update. A same-job call
          // never reaches this branch (idempotent no-op — the stamp is not
          // reset).
          const rebind = await writePlanned(row, withStagedAt({ source_job_id: writeJobId }))
          if (rebind.error) {
            failed += 1
            lastWriteError = rebind.error
            continue
          }
          if (rebind.written === 0) {
            skipped += 1
            continue
          }
          rebounded += 1
        }
        staged += 1
        continue
      }
      // Stage the EXACT job identity alongside the source URL. The job id is
      // never guessed from the slug or canonical; when it is absent the row is
      // still staged for legacy compatibility but carries no job identity, so
      // the scheduled reconciler refuses to auto-finalize it.
      const write = await writePlanned(
        row,
        withStagedAt({
          source_url: sourceUrl,
          ...(writeJobId ? { source_job_id: writeJobId } : {}),
        }),
      )
      if (write.error) {
        failed += 1
        lastWriteError = write.error
        continue
      }
      // A zero-match update is a lost concurrency race, never a staged row.
      if (write.written === 0) {
        skipped += 1
        continue
      }
      staged += 1
    }
    return {
      staged,
      candidates: rows.length,
      skipped,
      failed,
      sourceUrl,
      ...(rebounded ? { rebounded } : {}),
      ...(warning ? { warning } : {}),
      ...(failed
        ? {
            error: `${failed} staging write(s) failed${
              lastWriteError ? `: ${lastWriteError}` : ''
            }`.slice(0, 300),
          }
        : {}),
    }
  } catch (error) {
    return {
      staged: 0,
      candidates: 0,
      skipped: 0,
      failed: 1,
      sourceUrl,
      error: errorMessage(error).slice(0, 300),
    }
  }
}

export interface FinalizeStagedInterlinksInput {
  /** The verified live canonicalUrl (same identity `verifyLiveUrl` proved). */
  canonicalUrl: string
  /**
   * When present, finalization is job-bound: only rows staged by this exact
   * content_jobs.id are eligible. The scheduled reconciler always passes the
   * exact staged job id; legacy/admin callers that omit it keep the previous
   * source-url-only behavior. A nonblank id that is NOT an exact UUID fails
   * closed with an explicit error — it is never silently downgraded to the
   * legacy source-url-only path.
   */
  sourceJobId?: string | null
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
  /** Planned rows a verdict update raced away from (zero rows affected). */
  skipped: number
  /** Verdict/applied DB writes that failed (never silently counted as truth). */
  dbErrors: number
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
    skipped: 0,
    dbErrors: 0,
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
  // L1: the finalizer is the authority for job identity. A nonblank id that is
  // not an exact content_jobs UUID must fail closed — silently degrading it to
  // source-url-only legacy finalization would let a malformed admin/body jobId
  // finalize rows it has no identity for. An OMITTED id keeps the documented
  // legacy source-url-only behavior (there is no identity to bind to).
  const rawJobId = input.sourceJobId == null ? '' : String(input.sourceJobId).trim()
  let sourceJobId = ''
  if (rawJobId) {
    const normalizedJobId = normalizeSourceJobId(rawJobId)
    if (!normalizedJobId) {
      return emptyFinalize(
        sourceUrl,
        `sourceJobId must be an exact content_jobs UUID (got "${rawJobId.slice(0, 64)}")`,
      )
    }
    sourceJobId = normalizedJobId
  }
  try {
    const supabase = createSupabaseAdminClient()
    const sourceVariants = [
      ...new Set([rawSource, sourceUrl, rawSource.replace(/\/+$/, ''), sourceUrl.replace(/\/+$/, '')].filter(Boolean)),
    ]
    let query = supabase
      .from('seo_interlinks')
      .select('id,target_url,status,source_url')
      .in('source_url', sourceVariants)
      .eq('status', 'planned')
    // Job-bound finalization: never finalize a row staged by a different ship
    // job for the same canonical (or a jobless legacy row) when an exact job
    // identity is available.
    if (sourceJobId) query = query.eq('source_job_id', sourceJobId)
    const { data, error } = await query
    if (error) return emptyFinalize(sourceUrl, error.message.slice(0, 300))
    const rows = (data as InterlinkDbRow[] | null) || []
    if (!rows.length) return emptyFinalize(sourceUrl)

    const source =
      typeof input.sourceHtml === 'string'
        ? { html: input.sourceHtml, status: 200, error: null as string | null }
        : await fetchLiveSource(sourceUrl)

    const now = new Date().toISOString()
    // M2: when finalization is job-bound, EVERY verdict/applied write is a
    // compare-and-set on the EXACT selected subject (source_job_id + the
    // row's exact source_url) in addition to id + planned. A concurrent
    // reship rebind to another job must yield zero affected rows (counted
    // skipped) instead of stamping the old job back / applying over the new
    // revision. Jobless legacy finalization keeps the documented
    // source-url-only behavior.
    const fenceFor = (row: InterlinkDbRow): PlannedRowFence | undefined =>
      sourceJobId
        ? { sourceJobId, sourceUrl: String(row.source_url || '').trim() || sourceUrl }
        : undefined

    if (source.html == null) {
      const state: InterlinkVerificationState =
        source.status != null && source.status >= 400 && source.status < 500
          ? 'source_not_live'
          : 'unverifiable'
      const outcome = { written: 0, skipped: 0, dbErrors: 0, lastError: null as string | null }
      for (const row of rows) {
        const write = await writeVerdict(supabase, row, {
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
        }, fenceFor(row))
        tallyWrite(outcome, write)
      }
      return {
        sourceUrl,
        checked: rows.length,
        applied: 0,
        absent: 0,
        targetNotLive: 0,
        unverifiable: state === 'unverifiable' ? outcome.written : 0,
        sourceNotLive: state === 'source_not_live' ? outcome.written : 0,
        skipped: outcome.skipped,
        dbErrors: outcome.dbErrors,
        sourceFetchOk: false,
        ...(source.error || outcome.lastError
          ? { error: [source.error, outcome.lastError].filter(Boolean).join(' | ').slice(0, 300) }
          : {}),
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
      skipped: 0,
      dbErrors: 0,
      sourceFetchOk: true,
      ...(targetVerifierError ? { error: targetVerifierError } : {}),
    }
    const writeErrors: string[] = targetVerifierError ? [targetVerifierError] : []
    const tally = (
      write: { written: number; skipped: number; error: string | null },
      bucket: 'absent' | 'targetNotLive' | 'unverifiable' | 'sourceNotLive' | null,
    ) => {
      if (write.skipped) result.skipped += 1
      if (write.error) {
        result.dbErrors += 1
        if (writeErrors.length < 3) writeErrors.push(write.error)
      }
      if (bucket && write.written > 0) result[bucket] += write.written
    }

    for (const row of rows) {
      const target = String(row.target_url || '')
      const observation = targetResults.get(target)
      const writeFence = fenceFor(row)

      if (!observation) {
        tally(await writeVerdict(supabase, row, {
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
        }, writeFence), 'unverifiable')
        continue
      }
      if (!observation.ok) {
        const state: InterlinkVerificationState =
          observation.status === 0 || observation.status >= 500 ? 'unverifiable' : 'target_not_live'
        tally(await writeVerdict(supabase, row, {
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
        }, writeFence), state === 'target_not_live' ? 'targetNotLive' : 'unverifiable')
        continue
      }

      const proof = exactAnchorHrefMatch(html, target, { sourceCanonicalUrl: rawSource })
      if (!proof.present) {
        tally(await writeVerdict(supabase, row, {
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
        }, writeFence), 'absent')
        continue
      }

      const applied = await writePlannedRowPatch(supabase, row, {
          status: 'applied',
          applied_at: now,
          source_url: String(row.source_url || sourceUrl),
          // Bind the applied proof to the exact ship job when one is known
          // (the row was already filtered to it above).
          ...(sourceJobId ? { source_job_id: sourceJobId } : {}),
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
        }, writeFence)
      if (applied.error) {
        result.dbErrors += 1
        if (writeErrors.length < 3) writeErrors.push(applied.error)
      } else if (applied.written === 0) {
        result.skipped += 1
      } else {
        result.applied += applied.written
      }
    }

    if (writeErrors.length) {
      const summary = `${result.dbErrors ? `${result.dbErrors} interlink write(s) failed: ` : ''}${writeErrors.join(' | ')}`
      result.error = summary.slice(0, 300)
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

export interface InterlinkVerificationAttemptInput {
  /** Exact durable source identity the verification attempt targeted. */
  sourceUrl: string
  /** Exact ship job identity the attempt targeted. */
  sourceJobId: string
  /** Attempt timestamp (defaults to now). */
  now?: string
}

export interface InterlinkVerificationAttemptResult {
  /** Planned rows of the exact tuple stamped with the attempt marker. */
  updated: number
  error?: string
}

/**
 * Durable bounded-retry marker for a NON-finalizing verification attempt.
 *
 * A repeated `ok=false` (deployment not observable yet, or the legacy
 * uncontracted health path) must not hammer the same source every run, but it
 * must also not fabricate verification truth. This writes ONLY the additive
 * nullable `verification_attempted_at` marker on the exact planned tuple —
 * never `status`, `applied_at`, `verified_at`, `verification_state` or
 * `verification_evidence` — so it can never be mistaken for a proof/verdict.
 * The attempted-row count is returned truthfully (0 = nothing matched).
 */
export async function markInterlinkVerificationAttempt(
  input: InterlinkVerificationAttemptInput,
): Promise<InterlinkVerificationAttemptResult> {
  const rawSource = String(input.sourceUrl || '').trim()
  const sourceJobId = normalizeSourceJobId(input.sourceJobId)
  if (!rawSource || !sourceJobId) {
    return { updated: 0, error: 'an exact sourceUrl and sourceJobId are required to mark an attempt' }
  }
  const sourceUrl = normalizeInterlinkProofUrl(rawSource)
  const sourceVariants = [
    ...new Set([rawSource, sourceUrl, rawSource.replace(/\/+$/, ''), sourceUrl.replace(/\/+$/, '')].filter(Boolean)),
  ]
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = (await supabase
      .from('seo_interlinks')
      .update({ verification_attempted_at: input.now || new Date().toISOString() })
      .in('source_url', sourceVariants)
      .eq('source_job_id', sourceJobId)
      .eq('status', 'planned')
      .select('id')) as unknown as {
      data: Array<Record<string, unknown>> | null
      error: { message?: string } | null
    }
    if (error) return { updated: 0, error: String(error.message || 'attempt marker write failed').slice(0, 300) }
    return { updated: Array.isArray(data) ? data.length : 0 }
  } catch (error) {
    return { updated: 0, error: errorMessage(error).slice(0, 300) }
  }
}

interface PlannedRowWrite {
  /** Actual rows affected by the update (0 = lost concurrency race, no write). */
  written: number
  skipped: number
  error: string | null
}

/**
 * Optional compare-and-set subject fence. When present, the planned-only
 * update must additionally match the EXACT subject (job identity + selected
 * source_url) or it affects zero rows — so a concurrent rebind/reship can
 * never be overwritten by a verdict/applied write aimed at the old revision.
 */
interface PlannedRowFence {
  sourceJobId?: string
  sourceUrl?: string
}

/**
 * Guarded single-row write: only `status = 'planned'` rows can ever be
 * touched, and the REAL affected-row count is returned so a zero-match
 * concurrency race is never counted as a write. A DB error is returned
 * truthfully instead of looking like a benign no-op.
 */
async function writePlannedRowPatch(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: InterlinkDbRow,
  patch: Record<string, unknown>,
  fence?: PlannedRowFence,
): Promise<PlannedRowWrite> {
  let query = supabase
    .from('seo_interlinks')
    .update(patch)
    .eq('id', row.id)
    .eq('status', 'planned')
  if (fence?.sourceJobId) query = query.eq('source_job_id', fence.sourceJobId)
  if (fence?.sourceUrl) query = query.eq('source_url', fence.sourceUrl)
  const { data, error } = (await query.select('id')) as unknown as {
    data: Array<Record<string, unknown>> | null
    error: { message?: string } | null
  }
  if (error) return { written: 0, skipped: 0, error: String(error.message || 'interlink write failed').slice(0, 300) }
  const written = Array.isArray(data) ? data.length : 0
  return { written, skipped: written === 0 ? 1 : 0, error: null }
}

function tallyWrite(
  outcome: { written: number; skipped: number; dbErrors: number; lastError: string | null },
  write: PlannedRowWrite,
): void {
  if (write.error) {
    outcome.dbErrors += 1
    if (!outcome.lastError) outcome.lastError = write.error
    return
  }
  if (write.written === 0) {
    outcome.skipped += 1
    return
  }
  outcome.written += write.written
}

/**
 * Write a non-applied verdict. Only `status = 'planned'` rows are touched —
 * an applied row can never be downgraded by a transient failure.
 */
async function writeVerdict(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: InterlinkDbRow,
  verdict: VerdictInput,
  fence?: PlannedRowFence,
): Promise<PlannedRowWrite> {
  return writePlannedRowPatch(supabase, row, {
    source_url: String(row.source_url || verdict.sourceUrl),
    verification_state: verdict.state,
    verified_at: verdict.now,
    verification_evidence: verdict.evidence,
  }, fence)
}

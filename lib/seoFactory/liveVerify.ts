/**
 * portal-patch/lib/seoFactory/liveVerify.ts — P0-1 Ship → Live Verification (portal/Supabase)
 * Copy of lib/seoFactory/liveVerify.ts with identical semantics — purge CDN → sitemap ping → IndexNow → fetch live → re-audit.
 * Every step is best-effort; never throws to ship caller.
 * This file lives in portal-patch so it ships to kylemwalkerpr-ship-it/portal on next Cloudflare build
 * via `cp -r portal-patch/* ./` before next build.
 */
import { createClient } from '@supabase/supabase-js'
import { submitUrlsToIndexNow } from '@/lib/indexNow'
import { auditContent } from './audit'
import { evaluateContentQuality } from './contentQualityGate'
import { countBodyWords } from './contentDepth'

export interface LiveVerifyInput {
  canonicalUrl: string
  title?: string
  primaryKeyword?: string
  contentType?: string
  jobId?: string | null
  commitSha?: string | null
  host?: string | null
  repo?: string | null
  /** Brief-supplied short keywords (≤3 words). Optional — quality gate will skip coverage check when absent. */
  requiredShortKeywords?: string[]
  /** Brief-supplied long-tail keywords (≥4 words). */
  requiredLongTailKeywords?: string[]
}
export interface LiveVerifyResult {
  ok: boolean
  liveUrl: string
  httpStatus: number | null
  verifiedAt: string
  wordCount: number | null
  auditScore: number | null
  humanScore: number | null
  hasNoIndex: boolean | null
  canonicalHref: string | null
  hasCanonical: boolean | null
  purgeStatus: string | null
  sitemapStatus: string | null
  indexNowStatus: string | null
  error?: string | null
}

/**
 * Extract the canonical <link rel="canonical" href="..."> from raw HTML.
 * Returns the href exactly as declared (no normalization) so the caller can
 * decide whether it matches the requested canonicalUrl.
 */
export function extractCanonicalHref(html: string): string | null {
  if (!html) return null
  // Both attribute orders are valid HTML; capture href in either order.
  const m = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*?>/i)
  if (!m) return null
  const tag = m[0]
  const href = tag.match(/href=["']([^"']+)["']/i)
  return href && href[1] ? href[1] : null
}

/**
 * Compare a target canonical URL to a candidate canonical href, ignoring
 * trivial differences (case, trailing slash, protocol casing) so we don't
 * trip on Cloudflare's normalizations.
 */
export function canonicalHrefMatches(target: string, candidate: string | null): boolean {
  if (!candidate) return false
  const norm = (u: string) => {
    try {
      const p = new URL(u)
      const path = p.pathname.replace(/\/+$/, '') || '/'
      return (p.host.toLowerCase() + path).toLowerCase()
    } catch {
      return u.replace(/\/+$/, '').toLowerCase()
    }
  }
  return norm(target) === norm(candidate)
}
function dbc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}
async function appendLog(jobId: string, e: { level: 'info'|'warn'|'error'|'success'; source: string; message: string; detail?: string }) {
  try {
    const db = dbc()
    const { data } = await db.from('content_jobs').select('event_log').eq('id', jobId).single()
    const log = Array.isArray((data as any)?.event_log) ? (data as any).event_log : []
    const next = [...log, { id: `log_${Date.now().toString(36)}`, ts: new Date().toISOString(), ...e }]
    await (db as any).from('content_jobs').update({ event_log: next }).eq('id', jobId)
  } catch {}
}
async function purgeCdn(urls: string[]): Promise<string> {
  const env: any = process.env as any
  const zid = (env['CLOUDFLARE_ZONE_ID'] || env['CF_ZONE_ID'] || '').trim()
  const tok = (env['CLOUDFLARE_API_TOKEN'] || env['CF_API_TOKEN'] || '').trim()
  if (!zid || !tok) return 'skipped: CDN zone/token not set'
  if (!urls.length) return 'skipped: no urls'
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zid}/purge_cache`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: urls.slice(0, 30) }),
      signal: AbortSignal.timeout(12000),
    })
    const body: any = await res.json().catch(() => ({}))
    return res.ok && body.success !== false ? `purged ${urls.length} url(s)` : `purge failed: ${res.status} ${JSON.stringify(body).slice(0, 300)}`
  } catch (ex: any) { return `purge error: ${String(ex?.message || ex).slice(0, 300)}` }
}
async function pingSitemap(canonicalUrl: string): Promise<string> {
  try {
    const host = new URL(canonicalUrl).host
    const sm = `https://${host}/sitemap.xml`
    const res = await fetch(sm, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
    return `sitemap ${sm}: ${res.status}`
  } catch (ex: any) { return `sitemap error: ${String(ex?.message||ex).slice(0, 250)}` }
}
export async function verifyLiveUrl(input: LiveVerifyInput): Promise<LiveVerifyResult> {
  const url = input.canonicalUrl
  const verifiedAt = new Date().toISOString()
  const [purgeStatus, sitemapStatus, indexNowRes] = await Promise.all([
    purgeCdn([url]),
    pingSitemap(url),
    (async () => { try { const r: any = await submitUrlsToIndexNow([url]); return `${r.host||'indexnow'}: ${r.status}` } catch (ex: any){ return `indexnow error: ${String(ex?.message||ex).slice(0,200)}` }})(),
  ])
  let httpStatus: number | null = null
  let bodyText: string | null = null
  let fetchError: string | null = null
  for (let a=0; a<3; a++) {
    if (a>0) await new Promise(r=>setTimeout(r,2500*a))
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'YouSafeLiveVerify/1.0' }, signal: AbortSignal.timeout(12000) })
      httpStatus = res.status
      if (res.ok) { bodyText = await res.text(); break }
      if (res.status>=500) continue
      bodyText = await res.text().catch(()=>null)
      break
    } catch (ex: any){ fetchError = String(ex?.message||ex).slice(0,400); if (a===2) break }
  }
  if (!bodyText) {
    const result: LiveVerifyResult = { ok:false, liveUrl:url, httpStatus, verifiedAt, wordCount:null, auditScore:null, humanScore:null, hasNoIndex:null, canonicalHref:null, hasCanonical:null, purgeStatus, sitemapStatus, indexNowStatus:indexNowRes, error: fetchError || `fetch failed: ${httpStatus}` }
    if (input.jobId) await appendLog(input.jobId, { level:'warn', source:'liveVerify', message:`Live verify: ${result.error} on ${url} (HTTP ${httpStatus})`, detail: JSON.stringify({ purgeStatus, sitemapStatus, indexNowStatus:indexNowRes }, null,2) })
    return result
  }
  const wc = countBodyWords(bodyText)
  const hasNoIndex = /<meta[^>]*robots[^>]*noindex/i.test(bodyText)
  // Canonical tag check — assert the <link rel="canonical" href="…"> matches
  // the canonicalUrl we asked about. CDNs occasionally rewrite to the
  // www/non-www form or strip trailing slashes, so normalize both sides.
  const canonicalHref = extractCanonicalHref(bodyText)
  const hasCanonical = canonicalHrefMatches(url, canonicalHref)
  let auditScore: number | null = null
  let humanScore: number | null = null
  let auditError: string | null = null
  try {
    if (!input.requiredShortKeywords && !input.requiredLongTailKeywords && input.jobId) {
      try {
        const { data: jobRow } = await dbc()
          .from('content_jobs')
          .select('required_short_keywords,required_long_tail_keywords')
          .eq('id', input.jobId)
          .maybeSingle()
        if (jobRow) {
          input.requiredShortKeywords = Array.isArray(jobRow.required_short_keywords) ? jobRow.required_short_keywords : []
          input.requiredLongTailKeywords = Array.isArray(jobRow.required_long_tail_keywords) ? jobRow.required_long_tail_keywords : []
        }
      } catch { /* best-effort */ }
    }
    const audit = auditContent({ content: bodyText, contentType: input.contentType||'legal_guide', primaryKeyword: input.primaryKeyword||input.title||url, indexable:true, ownershipBlockers: [] })
    auditScore = audit.score
    const q = evaluateContentQuality({
      content: bodyText,
      contentType: input.contentType || 'legal_guide',
      primaryKeyword: input.primaryKeyword || input.title || url,
      indexable: true,
      requiredShortKeywords: input.requiredShortKeywords,
      requiredLongTailKeywords: input.requiredLongTailKeywords,
    })
    humanScore = q.humanScore
  } catch(ex:any){ auditError = String(ex?.message||ex).slice(0,400) }
  const ok = httpStatus===200 && !hasNoIndex && hasCanonical===true && (auditScore??0)>=30 && wc>=200
  if (input.jobId) {
    try {
      const liveStatus = ok
        ? 'verified'
        : hasNoIndex
          ? 'noindex'
          : (canonicalHref && !hasCanonical)
            ? 'canonical_mismatch'
            : (httpStatus !== 200)
              ? 'fetch_failed'
              : 'needs_review'
      const db = dbc()
      await (db as any).from('content_jobs').update({
        live_verified_at: verifiedAt,
        live_status: liveStatus,
        live_http_status: httpStatus,
        live_word_count: wc,
        live_audit_score: auditScore,
        live_human_score: humanScore,
        live_has_noindex: hasNoIndex,
        live_canonical_href: canonicalHref,
        live_has_canonical: hasCanonical,
      }).eq('id', input.jobId)
    } catch {}
    await appendLog(input.jobId, { level: ok?'success':'warn', source:'liveVerify', message: ok?`Live verified: ${url} — ${wc}w · score ${auditScore}/100 · human ${humanScore} · HTTP ${httpStatus} · canonical=${hasCanonical}`:`Live needs review: ${url} — ${auditError||`HTTP ${httpStatus} · ${wc}w · noindex=${hasNoIndex} · canonical=${hasCanonical} · score ${auditScore}`}`, detail: JSON.stringify({ purgeStatus, sitemapStatus, indexNowStatus:indexNowRes, httpStatus, wordCount:wc, auditScore, humanScore, hasNoIndex, canonicalHref, hasCanonical }, null,2) })
  }
  return { ok, liveUrl:url, httpStatus, verifiedAt, wordCount:wc, auditScore, humanScore, hasNoIndex, canonicalHref, hasCanonical, purgeStatus, sitemapStatus, indexNowStatus:indexNowRes, error:auditError }
}
export function verifyLiveInBackground(input: LiveVerifyInput) { verifyLiveUrl(input).catch(e=>console.warn('[liveVerify] background failed',e)) }

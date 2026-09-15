import { createClient } from '@supabase/supabase-js'
import { submitUrlsToIndexNow } from '@/lib/indexNow'
import { auditLiveHtml } from './liveAudit'
import { countBodyWords } from './contentDepth'
import { reconcilePublicationDeployment } from './publicationMonitor'
import {
  extractRevisionMarkerFromHtml,
  withPublicationManifest,
} from './publicationProof'
import { evaluateLiveArtifact } from './publicationStates'

export interface LiveVerifyInput {
  canonicalUrl: string
  title?: string
  primaryKeyword?: string
  contentType?: string
  jobId?: string | null
  commitSha?: string | null
  host?: string | null
  repo?: string | null
  requiredShortKeywords?: string[]
  requiredLongTailKeywords?: string[]
}
export interface LiveVerifyResult {
  ok: boolean
  liveUrl: string
  responseUrl?: string | null
  responseUrlMatches?: boolean | null
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
  expectedMarker?: string | null
  liveMarker?: string | null
  publicationPhase?: string | null
  lineageVerified?: boolean | null
  error?: string | null
}

export function extractCanonicalHref(html: string): string | null {
  if (!html) return null
  const m = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*?>/i)
  if (!m) return null
  const href = m[0].match(/href=["']([^"']+)["']/i)
  return href?.[1] || null
}

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
      method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: urls.slice(0, 30) }), signal: AbortSignal.timeout(12000),
    })
    const body: any = await res.json().catch(() => ({}))
    return res.ok && body.success !== false ? `purged ${urls.length} url(s)` : `purge failed: ${res.status}`
  } catch (ex: any) { return `purge error: ${String(ex?.message || ex).slice(0, 300)}` }
}
async function pingSitemap(canonicalUrl: string): Promise<string> {
  try {
    const sm = `https://${new URL(canonicalUrl).host}/sitemap.xml`
    const res = await fetch(sm, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
    return `sitemap ${sm}: ${res.status}`
  } catch (ex: any) { return `sitemap error: ${String(ex?.message||ex).slice(0, 250)}` }
}

export async function verifyLiveUrl(input: LiveVerifyInput): Promise<LiveVerifyResult> {
  const url = input.canonicalUrl
  const verifiedAt = new Date().toISOString()
  const db = dbc()
  let contracted = false
  if (input.jobId) {
    const { data } = await db.from('content_jobs').select('contract_id').eq('id', input.jobId).maybeSingle()
    contracted = Boolean((data as any)?.contract_id)
  }
  const deployment = contracted && input.jobId
    ? await reconcilePublicationDeployment(input.jobId)
    : null

  const [purgeStatus, sitemapStatus, indexNowRes] = await Promise.all([
    purgeCdn([url]), pingSitemap(url),
    (async () => { try { const r: any = await submitUrlsToIndexNow([url]); return `${r.host||'indexnow'}: ${r.status}` } catch (ex: any){ return `indexnow error: ${String(ex?.message||ex).slice(0,200)}` }})(),
  ])
  let httpStatus: number | null = null
  let bodyText: string | null = null
  let fetchError: string | null = null
  let responseUrl: string | null = null
  let xRobotsTag: string | null = null
  for (let a=0; a<3; a++) {
    if (a>0) await new Promise(r=>setTimeout(r,2500*a))
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'YouSafeLiveVerify/2.0' }, signal: AbortSignal.timeout(12000) })
      httpStatus = res.status
      responseUrl = String((res as any).url || url)
      xRobotsTag = res.headers?.get?.('x-robots-tag') || null
      bodyText = await res.text().catch(()=>null)
      if (res.ok || res.status < 500) break
    } catch (ex: any){ fetchError = String(ex?.message||ex).slice(0,400) }
  }
  const responseUrlMatches = responseUrl ? canonicalHrefMatches(url, responseUrl) : null
  if (!bodyText) {
    const error = fetchError || `fetch failed: ${httpStatus}`
    if (input.jobId) {
      await db.from('content_jobs').update({
        live_verified_at: verifiedAt, live_status: 'fetch_failed', live_http_status: httpStatus,
        live_error: error, ...(contracted ? { publication_phase: deployment?.phase || 'verification_failed' } : {}),
      }).eq('id', input.jobId)
      await appendLog(input.jobId, { level:'warn', source:'liveVerify', message:`Live verify: ${error}` })
    }
    return {
      ok:false, liveUrl:url, responseUrl, responseUrlMatches, httpStatus, verifiedAt,
      wordCount:null, auditScore:null, humanScore:null, hasNoIndex:null, canonicalHref:null, hasCanonical:null,
      purgeStatus, sitemapStatus, indexNowStatus:indexNowRes, publicationPhase: deployment?.phase || null, error,
    }
  }

  const missing = httpStatus === 404 || httpStatus === 410
  const metaNoIndex = /<meta[^>]*robots[^>]*content=["'][^"']*\bnoindex\b/i.test(bodyText)
    || /<meta[^>]*content=["'][^"']*\bnoindex\b[^"']*["'][^>]*robots/i.test(bodyText)
  const headerNoIndex = /\bnoindex\b/i.test(String(xRobotsTag || ''))
  const hasNoIndex = missing ? false : metaNoIndex || headerNoIndex
  const canonicalHref = extractCanonicalHref(bodyText)
  const canonicalTagMatches = canonicalHrefMatches(url, canonicalHref)
  const hasCanonical = canonicalTagMatches && responseUrlMatches !== false
  const liveMarker = extractRevisionMarkerFromHtml(bodyText)
  let auditScore: number | null = null
  let humanScore: number | null = null
  let auditError: string | null = null
  let wc: number | null = null
  try {
    const live = auditLiveHtml({ html: bodyText, contentType: input.contentType || 'legal_guide', primaryKeyword: input.primaryKeyword || input.title || url })
    auditScore = live.score; humanScore = live.humanScore; wc = live.wordCount
  } catch (ex: any) {
    auditError = String(ex?.message || ex).slice(0, 400)
    wc = countBodyWords(bodyText)
  }

  let ok = false
  let proofReason = auditError || ''
  let publicationPhase: string | null = null
  const proof = deployment?.proof || null
  if (contracted) {
    publicationPhase = deployment?.phase || 'verification_failed'
    if (deployment?.ok && proof) {
      const evaluated = evaluateLiveArtifact({
        httpStatus, html: bodyText, canonicalMatches: canonicalTagMatches, hasNoIndex, responseUrlMatches,
        expectedMarker: proof.expectedMarker || undefined, liveMarker, title: input.title,
        approvedHeadSha: proof.approvedHeadSha, mergeSha: proof.mergeSha,
        deploymentCommitSha: proof.deploymentCommitSha, lineageVerified: proof.lineageVerified,
      })
      ok = evaluated.ok
      publicationPhase = evaluated.phase
      proofReason = evaluated.reason
    } else {
      proofReason = deployment?.reason || 'durable publication proof unavailable'
    }
  } else {
    ok = httpStatus===200 && !hasNoIndex && canonicalTagMatches===true && responseUrlMatches!==false && (auditScore??0)>=30 && (wc??0)>=200
    proofReason = auditError || (ok ? 'legacy live health checks passed' : 'legacy live health checks failed')
  }

  if (input.jobId) {
    const liveStatus = ok ? 'verified' : missing ? 'fetch_failed' : hasNoIndex ? 'noindex' : responseUrlMatches === false ? 'needs_review' : httpStatus !== 200 ? 'fetch_failed' : 'needs_review'
    const patch: Record<string, unknown> = {
      live_verified_at: verifiedAt,
      live_status: liveStatus,
      live_http_status: httpStatus,
      live_word_count: wc,
      live_audit_score: auditScore,
      live_human_score: humanScore,
      live_has_noindex: hasNoIndex,
      live_canonical_url: canonicalHref,
      live_purge_status: purgeStatus,
      live_sitemap_status: sitemapStatus,
      live_indexnow_status: indexNowRes,
      live_error: ok ? null : proofReason,
    }
    if (contracted) {
      patch.publication_phase = ok ? 'live_verified' : publicationPhase
      patch.execution_stage = ok ? 'live_verified' : publicationPhase === 'deployment_pending' ? 'deploying' : 'verification_failed'
      if (ok && proof) {
        const latest = await db.from('content_jobs').select('audit_json').eq('id', input.jobId).maybeSingle()
        patch.audit_json = withPublicationManifest(latest.data?.audit_json, { ...proof, liveVerifiedAt: verifiedAt })
      }
    }
    await db.from('content_jobs').update(patch).eq('id', input.jobId)
    await appendLog(input.jobId, {
      level: ok?'success':'warn', source:'liveVerify',
      message: ok ? `Article verified live: marker, canonical, indexability and deployment lineage match` : `Live proof held: ${proofReason}`,
      detail: JSON.stringify({ httpStatus, responseUrl, responseUrlMatches, wordCount:wc, auditScore, hasNoIndex, canonicalHref, liveMarker, publicationPhase }, null, 2),
    })
  }
  return {
    ok, liveUrl:url, responseUrl, responseUrlMatches, httpStatus, verifiedAt, wordCount:wc, auditScore, humanScore,
    hasNoIndex, canonicalHref, hasCanonical, purgeStatus, sitemapStatus, indexNowStatus:indexNowRes,
    expectedMarker: proof?.expectedMarker || null, liveMarker,
    publicationPhase, lineageVerified: proof?.lineageVerified ?? null,
    error: ok ? null : proofReason,
  }
}

export function verifyLiveInBackground(input: LiveVerifyInput) {
  verifyLiveUrl(input).catch(e=>console.warn('[liveVerify] background failed',e))
}

/**
 * Publication is not one boolean. Merge, deploy, and live proof are separate.
 */

export type PublicationPhase =
  | 'pr_open'
  | 'checks_pending'
  | 'checks_passed'
  | 'merged'
  | 'deployment_pending'
  | 'deployed'
  | 'verifying_article'
  | 'live_verified'
  | 'verification_failed'
  | 'deployment_failed'
  | 'ci_failed'

export type PublicationManifest = {
  jobId: string
  opportunityId?: string
  contractId?: string
  contractHash?: string
  revisionHash?: string
  repoOwner: string
  repoName: string
  host: string
  path: string
  canonical: string
  expectedMarker?: string
  prNumber?: number
  approvedHeadSha?: string
  mergeSha?: string
  deploymentRunId?: string
  deploymentCommitSha?: string
  phase: PublicationPhase
}

export function operatorPublicationLabel(phase: PublicationPhase): string {
  switch (phase) {
    case 'pr_open': return 'PR open'
    case 'checks_pending': return 'checks pending'
    case 'checks_passed': return 'checks passed'
    case 'merged': return 'merged'
    case 'deployment_pending': return 'deployment pending'
    case 'deployed':
    case 'verifying_article': return 'deployed; verifying article'
    case 'live_verified': return 'article verified live'
    case 'verification_failed': return 'verification failed'
    case 'deployment_failed': return 'deployment failed'
    case 'ci_failed': return 'checks failed'
    default: return phase
  }
}

export function mergedIsNotLive(phase: PublicationPhase): boolean {
  return phase === 'merged' || phase === 'deployment_pending' || phase === 'deployed' || phase === 'verifying_article'
}

function normalizedSha(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function lineageMatches(input: {
  approvedHeadSha?: string | null
  mergeSha?: string | null
  deploymentCommitSha?: string | null
}): boolean {
  const approved = normalizedSha(input.approvedHeadSha)
  const merge = normalizedSha(input.mergeSha)
  const deployed = normalizedSha(input.deploymentCommitSha)
  if (!approved || !merge || !deployed) return false
  // A deployment must identify the merge commit that contains the approved
  // head. We cannot infer ancestry from timestamps inside this pure helper, so
  // callers must supply the exact included merge SHA after GitHub reconciliation.
  return deployed === merge
}

export function canClaimLiveSuccess(input: {
  phase: PublicationPhase
  expectedMarker?: string
  liveMarker?: string | null
  httpStatus?: number | null
  hasNoIndex?: boolean | null
  canonicalMatches?: boolean | null
  articleBody?: string | null
  approvedHeadSha?: string | null
  mergeSha?: string | null
  deploymentCommitSha?: string | null
}): boolean {
  if (input.phase !== 'live_verified') return false
  if (input.httpStatus !== 200) return false
  if (input.hasNoIndex !== false) return false
  if (input.canonicalMatches !== true) return false

  const expectedMarker = String(input.expectedMarker || '').trim()
  const liveMarker = String(input.liveMarker || '').trim()
  if (!expectedMarker || !liveMarker || expectedMarker !== liveMarker) return false

  const body = String(input.articleBody || '').replace(/\s+/g, ' ').trim()
  if (body.length < 80) return false
  if (!lineageMatches(input)) return false
  return true
}

export function extractArticleBody(htmlInput: string | null | undefined): string {
  const html = String(htmlInput || '')
  if (!html.trim()) return ''
  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ')
  const article = withoutNoise.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || withoutNoise.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || ''
  return article
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function evaluateLiveArtifact(input: {
  httpStatus: number | null
  html?: string | null
  canonicalMatches?: boolean | null
  hasNoIndex?: boolean | null
  expectedMarker?: string
  liveMarker?: string | null
  title?: string
  approvedHeadSha?: string | null
  mergeSha?: string | null
  deploymentCommitSha?: string | null
}): { ok: boolean; phase: PublicationPhase; reason: string; articleBody: string } {
  const articleBody = extractArticleBody(input.html)
  const fail = (reason: string) => ({ ok: false as const, phase: 'verification_failed' as const, reason, articleBody })

  if (input.httpStatus === 404 || input.httpStatus === 410) return fail('soft-missing or HTTP missing page')
  if (input.httpStatus !== 200) return fail(`HTTP ${input.httpStatus}`)
  if (input.hasNoIndex == null) return fail('indexability assessment missing')
  if (input.hasNoIndex) return fail('noindex on live document')
  if (input.canonicalMatches == null) return fail('canonical assessment missing')
  if (input.canonicalMatches !== true) return fail('canonical mismatch')

  const html = String(input.html || '')
  if (/page not found|n(?:o|')t found/i.test(html) && html.length < 1500) return fail('soft 404 shell')

  const expectedMarker = String(input.expectedMarker || '').trim()
  if (!expectedMarker) return fail('expected revision marker missing from manifest')
  const liveMarker = String(input.liveMarker || '').trim() || (html.includes(expectedMarker) ? expectedMarker : '')
  if (!liveMarker || liveMarker !== expectedMarker) return fail('expected revision marker missing')
  if (articleBody.length < 80) return fail('expected article body missing or too small')

  const title = String(input.title || '').trim()
  if (title && !articleBody.toLowerCase().includes(title.toLowerCase().slice(0, 24))) {
    return fail('wrong article title')
  }
  if (!lineageMatches(input)) return fail('publication lineage incomplete or deployment commit mismatch')

  return { ok: true, phase: 'live_verified', reason: 'artifact, canonical, indexability, marker and deployment lineage match', articleBody }
}

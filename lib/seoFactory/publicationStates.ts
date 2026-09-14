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
  phase: PublicationPhase
}

export function operatorPublicationLabel(phase: PublicationPhase): string {
  switch (phase) {
    case 'pr_open':
      return 'PR open'
    case 'checks_pending':
      return 'checks pending'
    case 'checks_passed':
      return 'checks passed'
    case 'merged':
      return 'merged'
    case 'deployment_pending':
      return 'deployment pending'
    case 'deployed':
      return 'deployed; verifying article'
    case 'verifying_article':
      return 'deployed; verifying article'
    case 'live_verified':
      return 'article verified live'
    case 'verification_failed':
      return 'verification failed'
    case 'deployment_failed':
      return 'deployment failed'
    case 'ci_failed':
      return 'checks failed'
    default:
      return phase
  }
}

export function mergedIsNotLive(phase: PublicationPhase): boolean {
  return phase === 'merged' || phase === 'deployment_pending' || phase === 'deployed' || phase === 'verifying_article'
}

export function canClaimLiveSuccess(input: {
  phase: PublicationPhase
  expectedMarker?: string
  liveMarker?: string | null
  httpStatus?: number | null
  hasNoIndex?: boolean | null
  canonicalMatches?: boolean | null
}): boolean {
  if (input.phase !== 'live_verified' && input.phase !== 'verifying_article' && input.phase !== 'deployed') {
    return false
  }
  if (input.httpStatus !== 200) return false
  if (input.hasNoIndex) return false
  if (input.canonicalMatches === false) return false
  if (input.expectedMarker && input.liveMarker && input.expectedMarker !== input.liveMarker) return false
  if (input.expectedMarker && !input.liveMarker) return false
  return input.phase === 'live_verified'
}

export function evaluateLiveArtifact(input: {
  httpStatus: number | null
  html?: string | null
  canonicalMatches: boolean
  hasNoIndex: boolean
  expectedMarker?: string
  title?: string
}): { ok: boolean; phase: PublicationPhase; reason: string } {
  if (input.httpStatus === 404 || input.httpStatus === 410) {
    return { ok: false, phase: 'verification_failed', reason: 'soft-missing or HTTP missing page' }
  }
  if (input.httpStatus !== 200) {
    return { ok: false, phase: 'verification_failed', reason: `HTTP ${input.httpStatus}` }
  }
  if (input.hasNoIndex) {
    return { ok: false, phase: 'verification_failed', reason: 'noindex on live document' }
  }
  if (!input.canonicalMatches) {
    return { ok: false, phase: 'verification_failed', reason: 'canonical mismatch' }
  }
  const html = input.html || ''
  if (/page not found|n(?:o|')t found/i.test(html) && html.length < 1500) {
    return { ok: false, phase: 'verification_failed', reason: 'soft 404 shell' }
  }
  if (input.expectedMarker && !html.includes(input.expectedMarker)) {
    return { ok: false, phase: 'verification_failed', reason: 'expected revision marker missing' }
  }
  if (input.title && html && !html.toLowerCase().includes(input.title.toLowerCase().slice(0, 24))) {
    return { ok: false, phase: 'verification_failed', reason: 'wrong article title' }
  }
  return { ok: true, phase: 'live_verified', reason: 'artifact and canonical match' }
}

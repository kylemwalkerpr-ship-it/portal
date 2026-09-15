import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'

export type PublicationMarkerIdentity = {
  contractId: string
  contractHash: string
  opportunityId?: string | null
}

export type PersistedPublicationManifest = {
  schemaVersion: 1
  jobId: string
  contractId: string | null
  contractHash: string | null
  opportunityId: string | null
  repoOwner: string
  repoName: string
  path: string
  canonical: string
  expectedMarker: string | null
  approvedContentHash: string
  approvedAt: string
  approvalActor: string | null
  prNumber: number | null
  approvedHeadSha: string | null
  mergeSha: string | null
  deploymentRunId: string | null
  deploymentCommitSha: string | null
  deploymentWorkflowId: number | null
  deploymentWorkflowPath: string | null
  deploymentJobId: string | null
  deploymentEnvironment: string | null
  lineageVerified: boolean
  liveVerifiedAt: string | null
}

type PublicationContext = {
  identity: PublicationMarkerIdentity | null
  fixedMarker: string | null
  lastMarker: string | null
  lastContentHash: string | null
  lastContent: string | null
  active: boolean
}
const publicationStorage = new AsyncLocalStorage<PublicationContext>()

function normalizedBody(content: string): string {
  return String(content || '').replace(/\r\n/g, '\n').trim()
}

export function artifactContentHash(content: string): string {
  return createHash('sha256').update(normalizedBody(content)).digest('hex')
}

export function buildExpectedRevisionMarker(input: PublicationMarkerIdentity & { content: string }): string {
  const digest = createHash('sha256')
    .update(`${input.contractId}|${input.contractHash}|${normalizedBody(input.content)}`)
    .digest('hex')
  return `csrev_${digest.slice(0, 32)}`
}

export function buildPublicationApprovalManifest(input: {
  jobId: string
  contractId?: string | null
  contractHash?: string | null
  opportunityId?: string | null
  repoOwner: string
  repoName: string
  path: string
  canonical: string
  expectedMarker?: string | null
  content: string
  approvedContentHash?: string | null
  approvalActor?: string | null
  prNumber?: number | null
  approvedHeadSha?: string | null
}): PersistedPublicationManifest {
  const contractId = String(input.contractId || '').trim()
  const contractHash = String(input.contractHash || '').trim()
  const expectedMarker = String(input.expectedMarker || '').trim()
  const approvedContentHash = String(input.approvedContentHash || '').trim()
  const content = String(input.content || '')

  if (!contractId || !contractHash) {
    throw new Error('publication manifest requires contract identity')
  }
  if (!content.trim()) {
    throw new Error('publication manifest requires the exact rendered body')
  }
  if (!approvedContentHash) {
    throw new Error('approved content hash is required from the exact renderer body')
  }
  const calculatedHash = artifactContentHash(content)
  if (approvedContentHash !== calculatedHash) {
    throw new Error('approved content hash does not match the exact renderer body')
  }
  if (!expectedMarker) {
    throw new Error('publication manifest requires the exact revision marker')
  }
  const calculatedMarker = buildExpectedRevisionMarker({ contractId, contractHash, opportunityId: input.opportunityId, content })
  if (expectedMarker !== calculatedMarker) {
    throw new Error('revision marker does not match the exact renderer body')
  }

  return {
    schemaVersion: 1,
    jobId: String(input.jobId),
    contractId,
    contractHash,
    opportunityId: String(input.opportunityId || '').trim() || null,
    repoOwner: String(input.repoOwner || '').trim(),
    repoName: String(input.repoName || '').trim(),
    path: String(input.path || '').trim(),
    canonical: String(input.canonical || '').trim(),
    expectedMarker,
    approvedContentHash,
    approvedAt: new Date().toISOString(),
    approvalActor: String(input.approvalActor || '').trim() || null,
    prNumber: input.prNumber ? Number(input.prNumber) : null,
    approvedHeadSha: String(input.approvedHeadSha || '').trim() || null,
    mergeSha: null,
    deploymentRunId: null,
    deploymentCommitSha: null,
    deploymentWorkflowId: null,
    deploymentWorkflowPath: null,
    deploymentJobId: null,
    deploymentEnvironment: null,
    lineageVerified: false,
    liveVerifiedAt: null,
  }
}

export function publicationManifestFromAudit(auditJson: unknown): PersistedPublicationManifest | null {
  if (!auditJson || typeof auditJson !== 'object') return null
  const raw = (auditJson as Record<string, unknown>).publicationManifest
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (Number(m.schemaVersion) !== 1 || !String(m.jobId || '').trim()) return null
  return m as unknown as PersistedPublicationManifest
}

export function withPublicationManifest(auditJson: unknown, manifest: PersistedPublicationManifest): Record<string, unknown> {
  const base = auditJson && typeof auditJson === 'object' ? auditJson as Record<string, unknown> : {}
  return { ...base, publicationManifest: manifest }
}

export async function runWithPublicationIdentity<T>(
  identity: PublicationMarkerIdentity,
  fn: () => Promise<T>,
): Promise<{ result: T; marker: string | null; contentHash: string | null; content: string | null }> {
  const ctx: PublicationContext = {
    identity,
    fixedMarker: null,
    lastMarker: null,
    lastContentHash: null,
    lastContent: null,
    active: true,
  }
  try {
    const result = await publicationStorage.run(ctx, fn)
    return { result, marker: ctx.lastMarker, contentHash: ctx.lastContentHash, content: ctx.lastContent }
  } finally {
    ctx.active = false
  }
}

export async function runWithPublicationMarker<T>(marker: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  const value = String(marker || '').trim()
  if (!value) return fn()
  const ctx: PublicationContext = {
    identity: null,
    fixedMarker: value,
    lastMarker: null,
    lastContentHash: null,
    lastContent: null,
    active: true,
  }
  try {
    return await publicationStorage.run(ctx, fn)
  } finally {
    ctx.active = false
  }
}

export function publicationMarkerForContent(content: string): string | null {
  const ctx = publicationStorage.getStore()
  if (!ctx?.active) return null
  const marker = ctx.fixedMarker || (ctx.identity ? buildExpectedRevisionMarker({ ...ctx.identity, content }) : null)
  if (marker) {
    ctx.lastMarker = marker
    ctx.lastContentHash = artifactContentHash(content)
    ctx.lastContent = String(content || '')
  }
  return marker
}

export function currentPublicationMarker(): string | null {
  const ctx = publicationStorage.getStore()
  return ctx?.active ? ctx.fixedMarker || ctx.lastMarker : null
}

export function injectRevisionMarkerIntoRenderedFile(fileContent: string, marker: string | null | undefined): string {
  const value = String(marker || '').trim()
  if (!value) return fileContent
  if (fileContent.includes(value)) return fileContent
  const metadataNeedles = ['export const metadata: Metadata = {', 'export const metadata = {']
  for (const needle of metadataNeedles) {
    if (fileContent.includes(needle)) {
      return fileContent.replace(needle, `${needle}\n  other: { "content-studio-revision": ${JSON.stringify(value)} },`)
    }
  }
  if (fileContent.startsWith('---\n')) {
    const withFrontmatter = fileContent.replace(/^---\n/, `---\ncontentStudioRevision: ${JSON.stringify(value)}\n`)
    const closing = withFrontmatter.indexOf('\n---\n', 4)
    if (closing >= 0) {
      return withFrontmatter.slice(0, closing + 5)
        + `<span hidden data-content-studio-revision=${JSON.stringify(value)}></span>\n`
        + withFrontmatter.slice(closing + 5)
    }
  }
  throw new Error('Refusing ship: could not inject content-studio revision marker into rendered artifact')
}

export function extractRevisionMarkerFromHtml(html: string | null | undefined): string | null {
  const source = String(html || '')
  if (!source) return null
  const meta = source.match(/<meta\b[^>]*name=["']content-studio-revision["'][^>]*>/i)?.[0]
  if (meta) {
    const content = meta.match(/content=["']([^"']+)["']/i)?.[1]
    if (content) return content.trim()
  }
  const data = source.match(/data-content-studio-revision=["']([^"']+)["']/i)?.[1]
  return data ? data.trim() : null
}

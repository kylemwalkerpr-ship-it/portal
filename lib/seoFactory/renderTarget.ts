import * as core from './renderTargetCore'
import {
  buildExpectedRevisionMarker,
  injectRevisionMarkerIntoRenderedFile,
  publicationMarkerForContent,
  recordPublicationRenderedArtifact,
} from './publicationProof'
import {
  assertStrictOwnerTarget,
  assertStrictShipContent,
  currentContentStudioExecution,
  recordPublicationMarker,
  recordStrictPublicationDigests,
} from './contentStudioExecutionContext'

export type BlogPostEntry = core.BlogPostEntry
export const buildBlogPostEntry = core.buildBlogPostEntry
export const insertBlogPostIntoData = core.insertBlogPostIntoData

/**
 * Single renderer facade. This is the last content/ownership boundary before
 * ship.ts writes GitHub. Strict jobs must still be the exact accepted revision
 * and must still target the immutable owner plan; deterministic mutation after
 * acceptance is therefore rejected rather than silently shipped.
 */
export function renderTargetFile(
  opts: Parameters<typeof core.renderTargetFile>[0],
): ReturnType<typeof core.renderTargetFile> {
  const execution = currentContentStudioExecution()
  if (execution?.strict) {
    assertStrictShipContent(opts.content)
    assertStrictOwnerTarget({
      host: opts.plan.host,
      repo: opts.plan.repo,
      filePath: opts.plan.filePath,
      canonicalUrl: opts.plan.canonicalUrl,
    })
  }
  const rendered = core.renderTargetFile(opts)
  let marker: string | null = null
  if (execution?.strict && execution.contractId && execution.contractHash) {
    marker = buildExpectedRevisionMarker({ contractId: execution.contractId, contractHash: execution.contractHash, content: opts.content })
    recordPublicationMarker(marker, opts.content)
  } else {
    marker = publicationMarkerForContent(opts.content)
  }
  if (!marker) return rendered
  const fileContent = injectRevisionMarkerIntoRenderedFile(rendered.fileContent, marker)
  const proof = recordPublicationRenderedArtifact(fileContent, opts.content)
  if (execution?.strict) recordStrictPublicationDigests(proof)
  return { ...rendered, fileContent }
}

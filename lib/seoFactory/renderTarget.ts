import * as core from './renderTargetCore'
import {
  buildExpectedRevisionMarker,
  injectRevisionMarkerIntoRenderedFile,
  publicationMarkerForContent,
  recordPublicationRenderedArtifact,
} from './publicationProof'
import {
  currentContentStudioExecution,
  recordPublicationMarker,
  recordStrictPublicationDigests,
} from './contentStudioExecutionContext'

export type BlogPostEntry = core.BlogPostEntry
export const buildBlogPostEntry = core.buildBlogPostEntry
export const insertBlogPostIntoData = core.insertBlogPostIntoData

/**
 * Single renderer facade. Contracted shipping records proof from the actual
 * marked file returned by the renderer, not from an earlier draft. This is the
 * authoritative point at which source body, revision marker and Git artifact
 * all coexist.
 */
export function renderTargetFile(
  opts: Parameters<typeof core.renderTargetFile>[0],
): ReturnType<typeof core.renderTargetFile> {
  const rendered = core.renderTargetFile(opts)
  const execution = currentContentStudioExecution()
  let marker: string | null = null
  if (execution?.strict && execution.contractId && execution.contractHash) {
    marker = buildExpectedRevisionMarker({
      contractId: execution.contractId,
      contractHash: execution.contractHash,
      content: opts.content,
    })
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

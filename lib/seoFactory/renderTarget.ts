import * as core from './renderTargetCore'
import { currentPublicationMarker, injectRevisionMarkerIntoRenderedFile } from './publicationProof'

export type BlogPostEntry = core.BlogPostEntry
export const buildBlogPostEntry = core.buildBlogPostEntry
export const insertBlogPostIntoData = core.insertBlogPostIntoData

/**
 * Single renderer facade. All layout/format behavior stays in renderTargetCore;
 * contracted shipping adds only the durable revision marker to the rendered
 * artifact. No marker context means byte-for-byte legacy rendering.
 */
export function renderTargetFile(
  opts: Parameters<typeof core.renderTargetFile>[0],
): ReturnType<typeof core.renderTargetFile> {
  const rendered = core.renderTargetFile(opts)
  const marker = currentPublicationMarker()
  if (!marker) return rendered
  return {
    ...rendered,
    fileContent: injectRevisionMarkerIntoRenderedFile(rendered.fileContent, marker),
  }
}

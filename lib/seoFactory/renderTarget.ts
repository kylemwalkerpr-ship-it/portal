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
 * The consultancy blog renderer intentionally adds publication apparatus inside
 * <article> (date/byline, CTA and BlogDepthSection). Publication proof must hash
 * the authored renderer output, not that site-owned apparatus. Move the authored
 * intro out of the header and wrap the intro + rendered Markdown body in one
 * explicit boundary that survives React rendering as a data attribute.
 */
function markConsultancyBlogSubstantiveBody(
  fileContent: string,
  opts: Parameters<typeof core.renderTargetFile>[0],
): string {
  if (
    opts.plan.repo !== 'yousafe-consultancy' ||
    !/app\/blog\/[^/]+\/page\.tsx$/.test(opts.plan.filePath)
  ) return fileContent
  if (fileContent.includes('data-content-studio-body="true"')) return fileContent

  const introPattern = /\n(\s*<p className="mt-6 text-xl leading-relaxed text-muted-foreground">[\s\S]*?<\/p>)(?=\n\s*<\/header>)/
  const introMatch = fileContent.match(introPattern)
  if (!introMatch || introMatch.index == null) {
    throw new Error('Refusing ship: consultancy blog renderer substantive intro boundary not found')
  }
  const introBlock = introMatch[1]
  const withoutIntro = fileContent.slice(0, introMatch.index) + fileContent.slice(introMatch.index + introMatch[0].length)
  const headerCloseAt = withoutIntro.indexOf('</header>', introMatch.index)
  if (headerCloseAt < 0) throw new Error('Refusing ship: consultancy blog renderer header boundary not found')
  const headerCloseEnd = headerCloseAt + '</header>'.length
  const ctaNeedle = '<section className="mt-10 rounded-lg border border-border bg-secondary/30 p-6">'
  const ctaAt = withoutIntro.indexOf(ctaNeedle, headerCloseEnd)
  if (ctaAt < 0) throw new Error('Refusing ship: consultancy blog renderer CTA boundary not found')

  const authoredBody = withoutIntro.slice(headerCloseEnd, ctaAt).trim()
  const boundary = [introBlock.trim(), authoredBody].filter(Boolean).join('\n\n')
  return withoutIntro.slice(0, headerCloseEnd)
    + `\n\n        <div data-content-studio-body="true">\n${boundary}\n        </div>\n\n        `
    + withoutIntro.slice(ctaAt)
}

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
    // Manual publication nests its proof context inside strict execution.
    // Populate both consumers from the same renderer input.
    const contextualMarker = publicationMarkerForContent(opts.content)
    if (contextualMarker && contextualMarker !== marker) {
      throw new Error('Refusing ship: publication context differs from the execution contract')
    }
    recordPublicationMarker(marker, opts.content)
  } else {
    marker = publicationMarkerForContent(opts.content)
  }
  if (!marker) return rendered
  const boundedFileContent = markConsultancyBlogSubstantiveBody(rendered.fileContent, opts)
  const fileContent = injectRevisionMarkerIntoRenderedFile(boundedFileContent, marker)
  const proof = recordPublicationRenderedArtifact(fileContent, opts.content)
  if (execution?.strict) recordStrictPublicationDigests(proof)
  return { ...rendered, fileContent }
}
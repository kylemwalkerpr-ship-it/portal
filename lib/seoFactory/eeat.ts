/**
 * portal-patch/lib/seoFactory/eeat.ts — P2-1 E-E-A-T frontmatter → JSON-LD (portal/Next)
 * Same contract as src/convex/eeat.ts — buildEeatJsonLd() + preview helper.
 *
 * YMYL pages must not silently default the JSON-LD author to
 * "YouSafe Editorial Team" when an AuthorPack is present, or when the
 * caller sets `requireRealAuthor`.
 */
import type { AuthorPack } from './authorPack'

const DEFAULT_AUTHOR = 'YouSafe Editorial Team'

/**
 * Resolve a real author display name. AuthorPack.name wins. YMYL with no
 * name returns null so callers do not emit a fake Editorial Team byline.
 */
export function eeatAuthorName(input: {
  authorName?: string
  authorPack?: AuthorPack | null
  ymyl?: boolean
}): string | null {
  const packName = typeof input.authorPack?.name === 'string' ? input.authorPack.name.trim() : ''
  if (packName) return packName
  const given = typeof input.authorName === 'string' ? input.authorName.trim() : ''
  if (given) return given
  return null
}

export function buildEeatJsonLd(input: {
  title: string
  canonicalUrl: string
  datePublished: string
  dateModified?: string
  authorName?: string
  authorUrl?: string
  reviewedBy?: string
  publisherName?: string
  publisherLogo?: string
  aboutKeywords?: string[]
  wordCount?: number
  authorPack?: AuthorPack | null
  ymyl?: boolean
  requireRealAuthor?: boolean
}): string {
  const realName = eeatAuthorName({
    authorName: input.authorName,
    authorPack: input.authorPack,
    ymyl: input.ymyl,
  })
  let author: { '@type': 'Person'; name?: string; url?: string } | undefined
  if (realName) {
    author = {
      '@type': 'Person',
      name: realName,
      url: input.authorUrl || input.authorPack?.marketplaceUrl,
    }
  } else if (input.requireRealAuthor) {
    // Explicit opt-in: never emit a fake Editorial Team on YMYL.
    author = undefined
  } else if (input.authorName === '') {
    author = { '@type': 'Person', name: '', url: input.authorUrl }
  } else {
    author = { '@type': 'Person', name: input.authorName ?? DEFAULT_AUTHOR, url: input.authorUrl }
  }
  const reviewedName = input.reviewedBy || input.authorPack?.reviewedBy
  const graph: unknown[] = [{
    '@type': 'Article',
    headline: input.title,
    url: input.canonicalUrl,
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    wordCount: input.wordCount,
    keywords: input.aboutKeywords?.join(', '),
    author,
    reviewedBy: reviewedName ? { '@type': 'Person', name: reviewedName } : undefined,
    publisher: {
      '@type': 'Organization',
      name: input.publisherName ?? 'YouSafe Consultancy',
      logo: input.publisherLogo ? { '@type': 'ImageObject', url: input.publisherLogo } : undefined,
    },
    mainEntityOfPage: input.canonicalUrl,
  }]
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)
}
export function previewEeat(opts: {
  title: string
  slug: string
  authorName?: string
  reviewedBy?: string
  keywords?: string[]
  authorPack?: AuthorPack | null
  ymyl?: boolean
  requireRealAuthor?: boolean
}): string {
  const canonical = `https://portal.yousafeconsultancy.com/${opts.slug}`
  const today = new Date().toISOString().slice(0, 10)
  return buildEeatJsonLd({
    title: opts.title,
    canonicalUrl: canonical,
    datePublished: today,
    authorName: opts.authorName,
    reviewedBy: opts.reviewedBy,
    aboutKeywords: opts.keywords,
    authorPack: opts.authorPack,
    ymyl: opts.ymyl,
    requireRealAuthor: opts.requireRealAuthor,
  })
}

/**
 * Ship-time route-subtype guard — refuse to deploy when the resolved canonical
 * path already hosts a page whose visa/immigration route subtype differs from
 * the article being shipped.
 *
 * Root cause of the 2026-08 overwrite incident: the ownership resolver matched
 * "uk graduate visa requirements" onto the spouse-visa-document-checklist page
 * and shipped, silently overwriting live spouse-visa content. The resolver
 * fallback is now fixed (intentMismatchPenalty), but this guard is the last
 * line of defence at the Git-write door: even if routing ever mis-resolves
 * again, we refuse to overwrite an existing page that is clearly about a
 * different route subtype (spouse / child / graduate / student / …).
 *
 * Fail-closed on ambiguity is NOT desired here (parse failures must not block
 * legitimate new-page ships), so the guard only blocks when BOTH sides carry a
 * recognizable route subtype AND the sets are disjoint. A missing existing file
 * (new page) or an unparseable existing subject passes.
 */

import { getRepoFileContent } from '@/lib/githubContents'
import { extractRouteSubtypes } from './ownership'

export interface RouteSubtypeConflict {
  conflict: boolean
  article?: string[]
  existing?: string[]
}

/**
 * Umbrella route subtypes that do NOT disambiguate a page on their own.
 * "family" covers spouse + child + parent + partner routes, so a shared
 * "family" token must not mask a real spouse-vs-child / partner-vs-parent
 * conflict. These are dropped before comparing, so the conflict decision
 * rests on the more specific route tokens only.
 */
const UMBRELLA_SUBTYPES = new Set(['family'])

/** True when two subjects carry disjoint route subtypes (e.g. graduate vs spouse). */
export function routeSubtypeConflict(
  articleSubject: string,
  existingSubject: string,
): RouteSubtypeConflict {
  const a = extractRouteSubtypes(articleSubject).filter((x) => !UMBRELLA_SUBTYPES.has(x))
  const b = extractRouteSubtypes(existingSubject).filter((x) => !UMBRELLA_SUBTYPES.has(x))
  if (!a.length || !b.length) return { conflict: false }
  const overlap = a.filter((x) => b.includes(x))
  if (overlap.length === 0) return { conflict: true, article: a, existing: b }
  return { conflict: false }
}

/**
 * Pull the "subject" (primary keyword / title) out of an existing shipped file
 * so we can compare its route subtype against the incoming article.
 */
export function extractExistingPageSubject(fileContent: string, filePath: string): string {
  const content = fileContent || ''
  if (filePath.endsWith('page.tsx')) {
    // caseworks ArticleLayout pages carry ArticleMeta in source
    const pk = content.match(/primaryKeyword:\s*["']([^"']+)["']/)
    if (pk?.[1]) return pk[1]
    const title = content.match(/title:\s*["']([^"']+)["']/)
    if (title?.[1]) return title[1]
    const slug = content.match(/slug:\s*["']([^"']+)["']/)
    if (slug?.[1]) return slug[1]
    return ''
  }
  // Markdown / MDX front matter (yousafe-consultancy + portal catalogue)
  const fm = content.slice(0, 1200)
  const pk = fm.match(/primaryKeyword:\s*["']?([^"'\n]+)/)
  if (pk?.[1]) return pk[1]
  const title = fm.match(/title:\s*["']?([^"'\n]+)/)
  if (title?.[1]) return title[1]
  return ''
}

/**
 * Throw if the target path already hosts a page whose route subtype differs from
 * the incoming article's. Called immediately before any GitHub write.
 */
export async function assertNoRouteSubtypeConflict(opts: {
  owner: string
  repo: string
  filePath: string
  primaryKeyword: string
  branch?: string
}): Promise<void> {
  const branch = opts.branch ?? 'main'
  const existing = await getRepoFileContent(opts.owner, opts.repo, opts.filePath, branch)
  if (!existing) return // new page — nothing to conflict with

  const subject = extractExistingPageSubject(existing, opts.filePath)
  if (!subject) return // can't determine existing subject — do not block

  const c = routeSubtypeConflict(opts.primaryKeyword, subject)
  if (c.conflict) {
    throw new Error(
      `Ship refused — route-subtype conflict: "${opts.primaryKeyword}" resolves to ${opts.filePath}, ` +
        `but that path already hosts "${subject}" (route subtypes [${(c.article || []).join(', ')}] vs ` +
        `[${(c.existing || []).join(', ')}]). This would overwrite unrelated content. ` +
        `Re-plan the keyword/slug or merge the two pages intentionally before shipping.`,
    )
  }
}

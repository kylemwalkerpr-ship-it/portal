/**
 * Ship-time overwrite guard — refuse to deploy when the resolved canonical
 * path already hosts a page that the incoming article must not overwrite:
 *
 *   1. ROUTE-SUBTYPE CONFLICT — a different visa/immigration route subtype
 *      (spouse / child / graduate / student / …), e.g. the 2026-08 incident
 *      where "uk graduate visa requirements" shipped onto the
 *      spouse-visa-document-checklist page.
 *   2. GEO-SCOPE CONFLICT — a city/university-specific article (e.g. "boulder
 *      student visas") shipped onto a generic route/hub page of the SAME route
 *      subtype, or a generic article overwriting a geo-specific page.
 *
 * Geo detection uses a curated list (cities / universities / states /
 * provinces) — a modifier not yet in the list is not detected on the article
 * side. The resolver's standing-rules fallback is the primary defence for
 * those; add the token to GEO_UNIVERSITY_TOKENS when a new city/university
 * ships so both the resolver and this guard cover it.
 *
 * Fail-closed on ambiguity is NOT desired here (parse failures must not block
 * legitimate new-page ships), so the guard only blocks when a conflict is
 * clearly detectable. A missing existing file (new page) used to pass even
 * when the TARGET SLUG already named a different route (2026-08-19: ASU
 * visa requirements created /uk/.../uk-dependent-visa-child-requirements-2026/).
 * New pages are now checked against the path slug itself.
 */

import { getRepoFileContent } from '@/lib/githubContents'
import { extractGeoModifiers, extractRouteSubtypes } from './ownership'

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

/** Last path segment of a caseworks/regional file path, spaces not hyphens. */
export function slugSubjectFromFilePath(filePath: string): string {
  const cleaned = String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/\/page\.tsx$/i, '')
    .replace(/\/+$/, '')
  const slug = cleaned.split('/').filter(Boolean).pop() || ''
  return slug.replace(/[-_]+/g, ' ')
}

/**
 * Keyword vs TARGET PATH — runs even when the file does not exist yet.
 * If the slug names a specific visa route (dependent/child/spouse/graduate/…)
 * and the incoming keyword never mentions that route, refuse the ship.
 */
export function pathSlugConflict(
  articleSubject: string,
  filePath: string,
): RouteSubtypeConflict {
  const slugSubject = slugSubjectFromFilePath(filePath)
  const slugRoutes = extractRouteSubtypes(slugSubject).filter((x) => !UMBRELLA_SUBTYPES.has(x))
  const kwRoutes = extractRouteSubtypes(articleSubject).filter((x) => !UMBRELLA_SUBTYPES.has(x))
  if (!slugRoutes.length) return { conflict: false }
  if (kwRoutes.some((r) => slugRoutes.includes(r))) return { conflict: false }
  return { conflict: true, article: kwRoutes, existing: slugRoutes }
}

/**
 * Subject vs TARGET PATH geo scope. Unlike geoScopeConflict this also runs for
 * a brand-new file, so a generic draft cannot be committed to a university or
 * city slug before there is existing page content to compare against.
 */
export function pathGeoScopeConflict(
  articleSubject: string,
  filePath: string,
): GeoScopeConflict {
  const specific = (subject: string) =>
    extractGeoModifiers(subject).filter((token) => token !== 'university')
  const article = specific(articleSubject)
  const slug = specific(slugSubjectFromFilePath(filePath))
  // A generic slug may intentionally host a geo-specific page whose existing
  // metadata is checked below. The dangerous new-file case is the reverse: a
  // slug explicitly names a place while the incoming subject is generic.
  if (!slug.length) return { conflict: false }
  if (!article.length) return { conflict: true, article, existing: slug }
  if (!article.some((token) => slug.includes(token))) {
    return { conflict: true, article, existing: slug }
  }
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
 * True when the article and existing page sit at different geo/university
 * scopes. Catches the 2026-08 companion incident: "boulder student visas" and
 * the generic "us student visas hub" share the "student" route subtype, so the
 * route-subtype check alone passes — but a city-specific article must never
 * overwrite a generic hub, and a generic article must never overwrite a
 * city/university-specific page.
 *
 * Fails open when neither side carries a geo/university modifier.
 */
export function geoScopeConflict(
  articleSubject: string,
  existingSubject: string,
): GeoScopeConflict {
  const a = extractGeoModifiers(articleSubject)
  const b = extractGeoModifiers(existingSubject)
  if (a.length && !b.length) return { conflict: true, article: a, existing: [] }
  if (!a.length && b.length) return { conflict: true, article: [], existing: b }
  if (a.length && b.length) {
    const shared = a.some((x) => b.includes(x))
    if (!shared) return { conflict: true, article: a, existing: b }
  }
  return { conflict: false }
}

export interface GeoScopeConflict {
  conflict: boolean
  article?: string[]
  existing?: string[]
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
  /** Reader-facing title must independently agree with the route. */
  title?: string
  branch?: string
}): Promise<void> {
  const branch = opts.branch ?? 'main'
  const subjects = [...new Set([opts.primaryKeyword, opts.title].map((value) => String(value || '').trim()).filter(Boolean))]
  for (const subject of subjects) {
    const slug = pathSlugConflict(subject, opts.filePath)
    if (slug.conflict) {
      throw new Error(
        `Ship refused — path/slug conflict: "${subject}" resolves to ${opts.filePath}, ` +
          `but that slug names route [${(slug.existing || []).join(', ')}] which the subject never mentions` +
          (slug.article?.length ? ` (subject routes: [${slug.article.join(', ')}])` : '') +
          `. This would create a subject-mismatch page. Re-plan the keyword/slug before shipping.`,
      )
    }
    const pathGeo = pathGeoScopeConflict(subject, opts.filePath)
    if (pathGeo.conflict) {
      throw new Error(
        `Ship refused — path geo-scope conflict: "${subject}" resolves to ${opts.filePath}, ` +
          `but subject scope [${(pathGeo.article || []).join(', ') || 'generic'}] does not match ` +
          `slug scope [${(pathGeo.existing || []).join(', ') || 'generic'}]. ` +
          `This is the same mismatch the target repository build rejects. Re-plan before shipping.`,
      )
    }
  }

  const existing = await getRepoFileContent(opts.owner, opts.repo, opts.filePath, branch)
  if (!existing) return // new page — slug already checked above

  const subject = extractExistingPageSubject(existing, opts.filePath)
  if (!subject) return // can't determine existing subject — do not block

  for (const incomingSubject of subjects) {
    const c = routeSubtypeConflict(incomingSubject, subject)
    if (c.conflict) {
    throw new Error(
      `Ship refused — route-subtype conflict: "${incomingSubject}" resolves to ${opts.filePath}, ` +
        `but that path already hosts "${subject}" (route subtypes [${(c.article || []).join(', ')}] vs ` +
        `[${(c.existing || []).join(', ')}]). This would overwrite unrelated content. ` +
        `Re-plan the keyword/slug or merge the two pages intentionally before shipping.`,
    )
    }

    const g = geoScopeConflict(incomingSubject, subject)
    if (g.conflict) {
    const a = (g.article || []).join(', ')
    const b = (g.existing || []).join(', ')
    const why = a && b
      ? `different geo/university scopes (article [${a}] vs existing [${b}])`
      : a
        ? `the article is ${a}-specific but the existing page is a generic route/hub page`
        : `the existing page is ${b}-specific but the article is generic`
    throw new Error(
      `Ship refused — geo-scope conflict: "${incomingSubject}" resolves to ${opts.filePath}, ` +
        `but that path already hosts "${subject}" (${why}). A city/university-specific article must ` +
        `never overwrite a generic hub and vice versa. Re-plan the keyword/slug or merge intentionally.`,
    )
    }
  }
}

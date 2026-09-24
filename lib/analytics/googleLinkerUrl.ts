/** Return the same URL without GA's cross-domain linker parameter, or null if already clean. */
export function cleanGoogleLinkerHref(href: string): string | null {
  try {
    const url = new URL(href)
    if (!url.searchParams.has('_gl')) return null
    url.searchParams.delete('_gl')
    return `${url.origin}${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

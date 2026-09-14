import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'

export type PublicationMarkerIdentity = {
  contractId: string
  contractHash: string
  opportunityId?: string | null
}

const markerStorage = new AsyncLocalStorage<string>()

function normalizedBody(content: string): string {
  return String(content || '').replace(/\r\n/g, '\n').trim()
}

export function buildExpectedRevisionMarker(input: PublicationMarkerIdentity & { content: string }): string {
  const digest = createHash('sha256')
    .update(`${input.contractId}|${input.contractHash}|${normalizedBody(input.content)}`)
    .digest('hex')
  return `csrev_${digest.slice(0, 32)}`
}

export async function runWithPublicationMarker<T>(marker: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  const value = String(marker || '').trim()
  if (!value) return fn()
  return markerStorage.run(value, fn)
}

export function currentPublicationMarker(): string | null {
  return markerStorage.getStore() || null
}

export function injectRevisionMarkerIntoRenderedFile(fileContent: string, marker: string | null | undefined): string {
  const value = String(marker || '').trim()
  if (!value) return fileContent
  if (fileContent.includes(value)) return fileContent

  // Next.js static TSX: metadata.other renders a live <meta name=… content=…>.
  const metadataNeedles = [
    'export const metadata: Metadata = {',
    'export const metadata = {',
  ]
  for (const needle of metadataNeedles) {
    if (fileContent.includes(needle)) {
      return fileContent.replace(
        needle,
        `${needle}\n  other: { "content-studio-revision": ${JSON.stringify(value)} },`,
      )
    }
  }

  // Markdown/MDX: persist in YAML front matter where the site renderer can
  // surface it. liveVerify also accepts an explicit data/meta marker from HTML.
  if (fileContent.startsWith('---\n')) {
    return fileContent.replace(/^---\n/, `---\ncontentStudioRevision: ${JSON.stringify(value)}\n`)
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

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'

/**
 * POST /api/seo-factory/llms/preview
 * Body: { title, canonicalUrl, summary, primaryKeyword?, host? }
 * Returns markdown chunks suitable for llms.txt / llms-full.txt
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const title = String(body.title || 'Untitled')
    const url = String(body.canonicalUrl || body.url || '')
    const summary = String(body.summary || body.tldr || '')
    const keyword = String(body.primaryKeyword || '')
    const host = String(body.host || 'legal')

    if (!url) {
      return NextResponse.json({ error: 'canonicalUrl required' }, { status: 400 })
    }

    const shortLine = `- [${title}](${url})${keyword ? ` — ${keyword}` : ''}`
    const fullBlock = [
      `## ${title}`,
      '',
      summary || 'Practical immigration guidance. Verify against official government sources.',
      '',
      `URL: ${url}`,
      keyword ? `Primary keyword: ${keyword}` : '',
      `Host: ${host}`,
      '',
    ]
      .filter(Boolean)
      .join('\n')

    return NextResponse.json({
      host,
      llmsTxtLine: shortLine,
      llmsFullSection: fullBlock,
      recommendedPath:
        host === 'legal'
          ? 'caseworks app/llms.txt + app/llms-full.txt routes'
          : `${host} regional llms surface if present`,
      notes: [
        'Only include indexable, high-quality pages in llms.txt',
        'llms-full can hold longer summaries for AI crawlers',
        'Ship hook can open a follow-up PR to append these lines',
      ],
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    )
  }
}

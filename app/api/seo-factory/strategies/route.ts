import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  loadStrategiesIndex,
  loadStrategyDocument,
  loadStrategyPromptPack,
  loadOwnershipRegistry,
} from '@/lib/seoDataLoaders'

/**
 * GET /api/seo-factory/strategies
 *   ?pack=index|prompt-pack|ownership|doc&path=/seo-data/strategies/documents/...
 *
 * Lists and serves the SEO strategies corpus synced from
 * Documents/GitHub/SEO strategies → public/seo-data/strategies.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const pack = (request.nextUrl.searchParams.get('pack') || 'index').toLowerCase()
    const path = request.nextUrl.searchParams.get('path') || ''

    if (pack === 'index') {
      const index = await loadStrategiesIndex()
      return NextResponse.json({ ok: true, index })
    }

    if (pack === 'prompt-pack') {
      const promptPack = await loadStrategyPromptPack()
      return NextResponse.json({ ok: true, promptPack })
    }

    if (pack === 'ownership') {
      const registry = await loadOwnershipRegistry()
      return NextResponse.json({
        ok: true,
        ownership: {
          updatedAt: registry.updatedAt,
          source: registry.source,
          count: registry.rows?.length ?? 0,
          hosts: tally(registry.rows || [], 'owner_host'),
          actions: tally(registry.rows || [], 'action'),
          rows: (registry.rows || []).slice(0, 100),
        },
      })
    }

    if (pack === 'doc') {
      if (!path) {
        return NextResponse.json({ error: 'path required for pack=doc' }, { status: 400 })
      }
      const text = await loadStrategyDocument(path)
      if (!text) {
        return NextResponse.json({ error: 'Document not found or path not allowed' }, { status: 404 })
      }
      return NextResponse.json({
        ok: true,
        path,
        bytes: text.length,
        content: text.slice(0, 200_000),
      })
    }

    return NextResponse.json({ error: 'Unknown pack' }, { status: 400 })
  } catch (err) {
    console.error('[seo-factory/strategies]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    )
  }
}

function tally(
  rows: Array<Record<string, unknown>>,
  key: string,
): Array<{ key: string; count: number }> {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = String(r[key] || 'unknown')
    m.set(k, (m.get(k) || 0) + 1)
  }
  return [...m.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count)
}

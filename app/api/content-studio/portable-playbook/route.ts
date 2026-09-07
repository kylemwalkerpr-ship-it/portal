/**
 * Content Studio — Portable SEO Playbook API.
 *
 * SSOT: docs/CONTENT_STUDIO_PORTABLE_SEO_PLAYBOOK.md
 *
 * The playbook (6 sprint weeks + P0–P12 prompt pack) is a first-class studio
 * capability: the Configure panel and the Master Engine feed both read the
 * same TS manifest through this door. No fs reads at runtime — the markdown
 * stays the human SSOT, the structure ships in the bundle.
 *
 *   GET /api/content-studio/portable-playbook?week=N  (admin)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { getPlaybookManifest, getPortableWeek } from '@/lib/seoFactory/portableSeoPlaybook'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const manifest = getPlaybookManifest()
    const { searchParams } = new URL(request.url)
    const rawWeek = searchParams.get('week')
    const week = rawWeek && /^[1-6]$/.test(rawWeek) ? Number(rawWeek) : null
    const highlightedWeek = week != null ? getPortableWeek(week) : null
    return NextResponse.json(
      {
        ok: true,
        manifest,
        week: week ?? null,
        highlightedWeek,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch (err) {
    console.error('[content-studio/portable-playbook GET]', err)
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
  }
}
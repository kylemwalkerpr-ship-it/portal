import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { latestReviewSnapshot, listReviewSnapshots, persistReviewSnapshot } from '@/lib/seoFactory/reviewSnapshots'

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const jobId = new URL(request.url).searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })
  const latestOnly = new URL(request.url).searchParams.get('latest') === '1'
  if (latestOnly) {
    const latest = await latestReviewSnapshot(jobId)
    return NextResponse.json({ drafts: latest ? [latest] : [], latest: latest || null })
  }
  const rows = await listReviewSnapshots(jobId, 20)
  const drafts = rows.map((d, i) => {
    const prev = i > 0 ? rows[i - 1] : null
    let diffSummary = ''
    if (prev) {
      const a = Math.max(0, d.content.length - prev.content.length)
      const r = Math.max(0, prev.content.length - d.content.length)
      diffSummary = a > 0 && r === 0 ? `+${a} chars` : r > 0 ? `-${r} chars` : `${a - r > 0 ? '+' : ''}${a - r} chars`
    }
    return {
      id: d.id,
      jobId: d.jobId,
      content: d.content,
      createdAt: d.createdAt,
      wordCount: d.wordCount,
      diffSummary,
      source: d.source,
    }
  })
  return NextResponse.json({
    drafts: latestOnly ? drafts.slice(-1) : drafts,
    latest: drafts[drafts.length - 1] || null,
  })
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { jobId, content, source } = await request.json() as { jobId: string; content: string; source?: string }
    if (!jobId || !content) {
      return NextResponse.json({ error: 'jobId and content required' }, { status: 400 })
    }

    const origin = source === 'manual' || source === 'restore' || source === 'fix' || source === 'reaudit'
      ? source
      : 'autosave'
    const { snapshot, persisted, error } = await persistReviewSnapshot({
      jobId,
      content,
      source: origin,
    })
    if (!persisted) {
      return NextResponse.json(
        { error: error || 'Failed to persist review snapshot', draft: snapshot, persisted: false },
        { status: 503 },
      )
    }
    return NextResponse.json({ draft: snapshot, persisted: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Save failed' }, { status: 500 })
  }
}

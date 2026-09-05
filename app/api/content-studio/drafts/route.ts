import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { latestGateReviewSnapshot, latestReviewSnapshot, listReviewSnapshots, persistReviewSnapshot } from '@/lib/seoFactory/reviewSnapshots'

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const jobId = new URL(request.url).searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })
  const latestOnly = new URL(request.url).searchParams.get('latest') === '1'
  if (latestOnly) {
    const [latest, gate] = await Promise.all([latestReviewSnapshot(jobId), latestGateReviewSnapshot(jobId)])
    return NextResponse.json({ drafts: latest ? [latest] : [], latest: latest || null, gate })
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

    const body = await request.json() as {
      jobId?: string; content: string; source?: string; qualityOk?: boolean | null; shipReady?: boolean | null
      blockers?: unknown; warnings?: unknown; appliedRepairs?: string[]
      title?: string; topic?: string; contentType?: string; region?: string
    }
    const content = String(body.content || '')
    if (!content.trim()) {
      return NextResponse.json({ error: 'content required' }, { status: 400 })
    }
    let jobId = String(body.jobId || '').trim()
    if (!jobId) {
      const { createSupabaseAdminClient } = await import('@/lib/supabase')
      const { defaultJobTargetRepo, normalizeJobContentType } = await import('@/lib/seoFactory/jobContentType')
      const { countBodyWords } = await import('@/lib/seoFactory/contentDepth')
      const db = createSupabaseAdminClient()
      const title = String(body.title || body.topic || 'Untitled draft').slice(0, 200)
      const contentType = normalizeJobContentType(body.contentType || 'blog_post')
      const region = String(body.region || 'US').slice(0, 8) || 'US'
      const insert = await db.from('content_jobs').insert({
        user_id: 'admin',
        title,
        topic: String(body.topic || title).slice(0, 200),
        content_type: contentType,
        status: 'drafting',
        content,
        word_count: countBodyWords(content),
        region,
        target_repo: defaultJobTargetRepo(contentType, region) || 'caseworks',
        ship_mode: 'pr',
        indexable: true,
      }).select('id').single()
      if (insert.error && /target_repo/i.test(insert.error.message || '')) {
        const retry = await db.from('content_jobs').insert({
          user_id: 'admin',
          title,
          topic: String(body.topic || title).slice(0, 200),
          content_type: contentType,
          status: 'drafting',
          content,
          word_count: countBodyWords(content),
          region,
          target_repo: 'caseworks',
        }).select('id').single()
        if (retry.data?.id) {
          jobId = String(retry.data.id)
        } else {
          return NextResponse.json({ error: retry.error?.message || insert.error.message }, { status: 503 })
        }
      } else if (insert.error || !insert.data?.id) {
        return NextResponse.json({ error: insert.error?.message || 'Could not create a draft job' }, { status: 503 })
      } else {
        jobId = String(insert.data.id)
      }
    }
    const { source, qualityOk, shipReady, blockers, warnings, appliedRepairs } = body

    const origin = source === 'manual' || source === 'restore' || source === 'fix' || source === 'reaudit'
      ? source
      : 'autosave'
    const { snapshot, persisted, error } = await persistReviewSnapshot({
      jobId,
      content,
      source: origin,
      qualityOk,
      shipReady,
      blockers,
      warnings,
      appliedRepairs,
    })
    if (!persisted) {
      return NextResponse.json(
        { error: error || 'Failed to persist review snapshot', draft: snapshot, persisted: false, jobId },
        { status: 503 },
      )
    }
    // P0-SHIP-1: when the editor Save/drafts path carries an explicit shipReady,
    // stamp it onto content_jobs.audit_json so Approve gate survives Save
    // (review snapshot alone is not enough for jobPassesShipGate).
    if (typeof shipReady === 'boolean') {
      try {
        const { createSupabaseAdminClient } = await import('@/lib/supabase')
        const { mergeAuditJsonPreservingGate } = await import('@/lib/seoFactory/jobShipGate')
        const db = createSupabaseAdminClient()
        const { data: row } = await db
          .from('content_jobs')
          .select('audit_json')
          .eq('id', jobId)
          .maybeSingle()
        const prior = (row as { audit_json?: unknown } | null)?.audit_json
        const blockersArr = Array.isArray(blockers) ? blockers : []
        const audit_json = mergeAuditJsonPreservingGate(prior, {
          shipReady,
          blockers: blockersArr,
          blockersCount: blockersArr.length,
          ...(typeof qualityOk === 'boolean' ? { qualityOk } : {}),
        })
        await db.from('content_jobs').update({ audit_json }).eq('id', jobId)
      } catch {
        /* snapshot already persisted; gate stamp best-effort */
      }
    }
    return NextResponse.json({ draft: snapshot, persisted: true, jobId })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Save failed' }, { status: 500 })
  }
}

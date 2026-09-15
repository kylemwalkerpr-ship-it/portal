import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { runStoredContentJob, type StoredContentJob } from '@/lib/seoFactory/storedJobExecution'
import { GET as legacyGET, POST as legacyPOST, PATCH as legacyPATCH } from './legacy'

export async function GET(request: NextRequest) {
  return legacyGET(request)
}

export async function PATCH(request: NextRequest) {
  return legacyPATCH(request)
}

/**
 * Queue action boundary. Only rerun/resume is intercepted because it authors
 * content; all non-authoring queue operations remain in the established route.
 * A stored contract is reconstructed server-side before the pipeline runs.
 */
export async function POST(request: NextRequest) {
  const body = await request.clone().json().catch(() => ({})) as Record<string, any>
  if (String(body.action || '').trim() !== 'rerun_resume') return legacyPOST(request)

  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const ids = Array.isArray(body.ids)
    ? body.ids.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 10)
    : []
  if (!ids.length) return NextResponse.json({ error: 'rerun_resume requires ids[]' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const results: Array<{ id: string; ok: boolean; error?: string; newJobId?: string }> = []

  for (const id of ids) {
    try {
      const { data: job, error } = await supabase.from('content_jobs').select('*').eq('id', id).single()
      if (error || !job) {
        results.push({ id, ok: false, error: error?.message || 'not found' })
        continue
      }
      const result = await runStoredContentJob(job as unknown as StoredContentJob, {
        dryRun: Boolean(body.dryRun),
        minAuditScore: body.minAuditScore != null ? Number(body.minAuditScore) : 55,
        maxRefine: body.maxRefine != null ? Math.min(2, Number(body.maxRefine) || 2) : 2,
        regenerationMode: 'refresh',
      })
      results.push({
        id,
        ok: result.ok,
        newJobId: result.jobId || undefined,
        error: result.error || result.shipError || undefined,
      })
    } catch (error) {
      results.push({ id, ok: false, error: error instanceof Error ? error.message : 'regenerate failed' })
    }
  }

  const succeeded = results.filter((result) => result.ok).length
  return NextResponse.json({
    ok: succeeded === results.length,
    action: 'rerun_resume',
    processed: results.length,
    succeeded,
    failed: results.length - succeeded,
    results,
  })
}

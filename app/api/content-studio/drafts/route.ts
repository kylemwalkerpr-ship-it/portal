import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { countBodyWords } from '@/lib/seoFactory/contentDepth'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// In-memory version history for the GET endpoint (draft revision timeline).
// The canonical draft lives in content_jobs.content — this store keeps a
// rolling window of snapshots so the admin can diff or roll back.
const store = new Map<string, Array<{ id: string; jobId: string; content: string;
  createdAt: string; wordCount: number }>>()

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const jobId = new URL(request.url).searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })
  const drafts = (store.get(jobId) || []).map((d, i) => {
    const prev = i > 0 ? (store.get(jobId) || [])[i - 1] : null
    let diff = ''
    if (prev) {
      const a = Math.max(0, d.content.length - prev.content.length)
      const r = Math.max(0, prev.content.length - d.content.length)
      diff = a > 0 && r === 0 ? `+${a} chars` : r > 0 ? `-${r} chars` : `${a - r > 0 ? '+' : ''}${a - r} chars`
    }
    return { ...d, diffSummary: diff }
  })
  return NextResponse.json({ drafts })
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { jobId, content } = await request.json() as { jobId: string; content: string }
    if (!jobId || !content) {
      return NextResponse.json({ error: 'jobId and content required' }, { status: 400 })
    }

    const words = countBodyWords(content)
    const entry = {
      id: `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      jobId, content, createdAt: new Date().toISOString(),
      wordCount: words,
    }

    // In-memory version history (rollback / diff)
    const existing = store.get(jobId) || []
    existing.push(entry)
    if (existing.length > 20) existing.shift()
    store.set(jobId, existing)

    // Persist to content_jobs so the draft survives deploys and is visible
    // in the Review stage / AdminInlineEditor.
    const supabase = sb()
    const { error: upErr } = await supabase
      .from('content_jobs')
      .update({
        content,
        word_count: words,
        error_message: null,
      })
      .eq('id', jobId)

    if (upErr) {
      console.error('[drafts/save] Supabase update failed:', upErr.message)
      // Don't fail the save — the in-memory version is still available
    }

    return NextResponse.json({
      draft: entry,
      versionCount: existing.length,
      persisted: !upErr,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Save failed' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'

const store = new Map<string, Array<{ id: string; jobId: string; content: string;
  createdAt: string; wordCount: number }>>()

export async function GET(request: NextRequest) {
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
    const { jobId, content } = await request.json() as { jobId: string; content: string }
    if (!jobId || !content) {
      return NextResponse.json({ error: 'jobId and content required' }, { status: 400 })
    }
    const entry = {
      id: `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      jobId, content, createdAt: new Date().toISOString(),
      wordCount: content.split(/\s+/).filter(Boolean).length,
    }
    const existing = store.get(jobId) || []
    existing.push(entry)
    if (existing.length > 20) existing.shift()
    store.set(jobId, existing)
    return NextResponse.json({ draft: entry, versionCount: existing.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Save failed' }, { status: 500 })
  }
}

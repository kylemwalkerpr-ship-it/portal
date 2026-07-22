import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { Buffer } from "node:buffer"

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const provided = signatureHeader.slice('sha256='.length)
  const computed = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(computed, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const event = request.headers.get('x-github-event') ?? ''
    const signature = request.headers.get('x-hub-signature-256')

    // Ping: GitHub sends unsigned pings to confirm the endpoint is reachable
    if (event === 'ping') {
      return NextResponse.json({ ok: true, event: 'ping' })
    }

    // Only handle pull_request events
    if (event !== 'pull_request') {
      return NextResponse.json({ ok: true, event, ignored: true })
    }

    // Verify HMAC
    const secret = process.env.GITHUB_WEBHOOK_SECRET
    if (!secret) {
      return NextResponse.json({ error: 'GITHUB_WEBHOOK_SECRET not configured' }, { status: 500 })
    }
    if (!verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload = JSON.parse(rawBody)
    const action = payload.action

    // Only act on closed PRs
    if (action !== 'closed') {
      return NextResponse.json({ ok: true, action, ignored: true })
    }

    const repo = payload.repository
    const pr = payload.pull_request
    const prNumber = pr?.number

    if (!prNumber) {
      return NextResponse.json({ error: 'Missing PR number' }, { status: 400 })
    }

    // Look up the job
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: job, error } = await supabase
      .from('content_jobs')
      .select('*')
      .eq('pr_number', prNumber)
      .eq('target_repo', repo?.name)
      .single()

    if (error || !job) {
      // 404 triggers GitHub retry — handles race where webhook arrives before DB write
      return NextResponse.json({ error: 'No matching content job' }, { status: 404 })
    }

    // Idempotency: don't overwrite terminal states
    if (['merged', 'closed', 'failed'].includes(job.status)) {
      return NextResponse.json({ ok: true, job_id: job.id, status: job.status })
    }

    const now = new Date().toISOString()

    if (pr?.merged === true) {
      await supabase
        .from('content_jobs')
        .update({ status: 'merged', merged_at: now, pr_url: pr.html_url ?? job.pr_url, updated_at: now })
        .eq('id', job.id)
      return NextResponse.json({ ok: true, job_id: job.id, new_status: 'merged' })
    }

    await supabase
      .from('content_jobs')
      .update({ status: 'closed', closed_at: now, updated_at: now })
      .eq('id', job.id)

    return NextResponse.json({ ok: true, job_id: job.id, new_status: 'closed' })

  } catch (err) {
    console.error('[content-studio/webhook]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

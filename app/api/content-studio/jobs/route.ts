import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const region = searchParams.get('region')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)

    let query = supabase
      .from('content_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) query = query.eq('status', status)
    if (region) query = query.eq('region', region)

    const { data, error } = await query

    if (error) throw new Error(`Supabase query failed: ${error.message}`)

    return NextResponse.json({ jobs: data ?? [] })
  } catch (err) {
    console.error('[content-studio/jobs]', err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Internal error',
      },
      { status: 500 },
    )
  }
}

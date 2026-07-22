import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'

/**
 * GET /api/content-studio/gsc/status
 * Returns whether GSC is connected and the associated Google email.
 */
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

    const { data, error } = await supabase
      .from('gsc_tokens')
      .select('google_email, expires_at, updated_at')
      .eq('id', 'default')
      .single()

    if (error || !data) {
      return NextResponse.json({ connected: false })
    }

    return NextResponse.json({
      connected: true,
      email: data.google_email,
      expiresAt: data.expires_at,
      updatedAt: data.updated_at,
    })
  } catch {
    return NextResponse.json({ connected: false })
  }
}

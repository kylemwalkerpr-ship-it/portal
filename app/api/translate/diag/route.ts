import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase'

// TEMPORARY diagnostic endpoint for the translation pipeline audit.
// Reports the raw MyMemory response + a test cache write, so we can see
// exactly where the chain breaks from inside the deployed worker.
// DELETE THIS FILE once the audit is complete.

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')
  if (key !== 'audit-2026-06-11') {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const out: Record<string, unknown> = {}

  // 1. Raw MyMemory call, no timeout abort, capture everything
  try {
    const url = new URL('https://api.mymemory.translated.net/get')
    url.searchParams.set('q', 'Hello world, this is a translation pipeline test.')
    url.searchParams.set('langpair', 'en|es')
    url.searchParams.set('de', 'info@yousafeconsultancy.com')
    const started = Date.now()
    const res = await fetch(url.toString())
    out.mymemory_http_status = res.status
    out.mymemory_ms = Date.now() - started
    const body: any = await res.json().catch(() => null)
    out.mymemory_response_status = body?.responseStatus
    out.mymemory_translated = body?.responseData?.translatedText ?? null
    out.mymemory_details = body?.responseDetails ?? null
  } catch (e: any) {
    out.mymemory_error = String(e?.message || e)
  }

  // 2. Test Supabase cache write with service role
  try {
    const db = createSupabaseAdminClient()
    const { error } = await db.from('translations').upsert({
      text_hash: 'diag0001',
      target_lang: 'zz',
      source_lang: 'en',
      source_text: 'diagnostic probe',
      translated: 'diagnostic probe',
      provider: 'diag',
      updated_at: new Date().toISOString(),
    })
    out.supabase_write_error = error ? error.message : null
    out.supabase_write_ok = !error
  } catch (e: any) {
    out.supabase_write_error = String(e?.message || e)
  }

  return NextResponse.json(out)
}
